//! Studio console operational surface (`/v1/admin/ops/*`).
//!
//! The studio authenticates with an admin *session* token, which the
//! data-plane endpoints (`/v1/stats`, `/v1/memories`, `/v1/recall`, jobs,
//! maintenance) do not accept — they want a per-database token or the
//! cluster master token. These handlers are the session-authed (RBAC)
//! equivalents the console needs: a server overview, a read-only memory
//! browser, a recall query console, the jobs queue and a maintenance run.
//! Reads need `readonly`; anything that mutates or exposes internals of the
//! work queue needs `admin`.
//!
//! # Never block the console on the engine
//!
//! A console that goes blank because one engine call is slow is worse than
//! one that says "busy". A long maintenance cycle holds engine locks for
//! minutes, so every engine touch here follows three rules:
//!
//! 1. **Off the async workers.** Anything that can take a lock runs in
//!    `spawn_blocking`, never inline on a runtime worker.
//! 2. **Bounded wait.** The caller waits a fixed time, then gets an honest
//!    "busy" answer (stale data for the overview, `504` for user actions).
//! 3. **Single-flight.** At most one engine probe per database is ever in
//!    flight; polling clients cannot pile up blocked threads behind a stuck
//!    lock.
//!
//! Maintenance runs are a background job (`202` + status in the overview),
//! not a request that stays open for the length of the cycle.

use super::*;
use std::collections::{HashMap, HashSet, VecDeque};
use std::time::{Duration, Instant};

// ── sampled history ────────────────────────────────────

/// One sampled point of the server's vital signs. The sampler keeps ~1h at
/// 5s resolution so charts are populated the moment the console opens.
#[derive(Clone, serde::Serialize)]
struct Sample {
    t: i64,
    requests: u64,
    inflight: u32,
    p95_ms: f64,
    p99_ms: f64,
}

const SAMPLE_EVERY: Duration = Duration::from_secs(5);
const SAMPLE_CAP: usize = 720;

static HISTORY: std::sync::OnceLock<parking_lot::Mutex<VecDeque<Sample>>> = std::sync::OnceLock::new();
static SAMPLER: std::sync::Once = std::sync::Once::new();
static STARTED: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

fn history() -> &'static parking_lot::Mutex<VecDeque<Sample>> {
    HISTORY.get_or_init(Default::default)
}

pub(super) fn mark_start() {
    STARTED.get_or_init(Instant::now);
}

fn take_sample(inflight: u32) -> Sample {
    let hs = crate::metrics::global().handler_stats();
    Sample {
        t: chrono::Utc::now().timestamp(),
        requests: hs.iter().map(|h| h.count).sum(),
        inflight,
        p95_ms: hs.iter().map(|h| h.p95).fold(0.0, f64::max) * 1000.0,
        p99_ms: hs.iter().map(|h| h.p99).fold(0.0, f64::max) * 1000.0,
    }
}

/// Start the sampler once. Needs a tokio runtime; a no-op without one (unit
/// tests build the router outside a runtime) — the first overview request
/// retries, so history still starts.
pub(super) fn ensure_sampler(state: &Arc<AppState>) {
    let Ok(rt) = tokio::runtime::Handle::try_current() else {
        return;
    };
    SAMPLER.call_once(|| {
        let state = state.clone();
        rt.spawn(async move {
            let mut tick = tokio::time::interval(SAMPLE_EVERY);
            loop {
                tick.tick().await;
                let s = take_sample(state.inflight.load(std::sync::atomic::Ordering::Relaxed));
                let mut h = history().lock();
                if h.len() >= SAMPLE_CAP {
                    h.pop_front();
                }
                h.push_back(s);
            }
        });
    });
}

// ── bounded engine access ──────────────────────────────

/// How long a user-triggered engine action waits before answering "busy".
const ENGINE_WAIT: Duration = Duration::from_secs(20);
/// Recall can legitimately take longer (embedding + rerank), but is still bounded.
const RECALL_WAIT: Duration = Duration::from_secs(45);
/// How long the overview waits for a fresh per-database probe.
const DB_PROBE_WAIT: Duration = Duration::from_millis(1500);
/// A probe younger than this is served from cache without touching the engine.
const DB_PROBE_TTL: Duration = Duration::from_secs(10);

fn busy_error() -> AppError {
    app_error(
        StatusCode::GATEWAY_TIMEOUT,
        "the database engine is busy with a long-running operation (for example a maintenance cycle); try again shortly",
    )
}

fn join_error(e: tokio::task::JoinError) -> AppError {
    app_error(StatusCode::INTERNAL_SERVER_ERROR, format!("worker failed: {e}"))
}

fn db_by_id(state: &AppState, id: i64) -> Result<crate::control::DatabaseRecord, AppError> {
    state
        .control
        .lock()
        .get_database_by_id(id)
        .map_err(|e| app_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| app_error(StatusCode::NOT_FOUND, format!("database {id} not found")))
}

/// Resolve a database and its engine without ever blocking an async worker,
/// and without waiting forever on a pool or control lock.
async fn engine_for(
    state: &Arc<AppState>,
    id: i64,
) -> Result<(crate::control::DatabaseRecord, Arc<yantrikdb::YantrikDB>), AppError> {
    let st = state.clone();
    let lookup = tokio::task::spawn_blocking(move || -> Result<_, AppError> {
        let rec = db_by_id(&st, id)?;
        let engine = st
            .pool
            .get_engine(&rec)
            .map_err(|e| app_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        Ok((rec, engine))
    });
    match tokio::time::timeout(ENGINE_WAIT, lookup).await {
        Ok(joined) => joined.map_err(join_error)?,
        Err(_) => Err(busy_error()),
    }
}

/// Run blocking engine work with a bounded wait.
async fn bounded<T: Send + 'static>(
    wait: Duration,
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, AppError> {
    match tokio::time::timeout(wait, tokio::task::spawn_blocking(work)).await {
        Ok(joined) => joined.map_err(join_error),
        Err(_) => Err(busy_error()),
    }
}

// ── per-database probe: cached, single-flight ──────────

struct Probe {
    at: Instant,
    value: Value,
}

static PROBE_CACHE: std::sync::OnceLock<parking_lot::Mutex<HashMap<i64, Probe>>> = std::sync::OnceLock::new();
static PROBE_BUSY: std::sync::OnceLock<parking_lot::Mutex<HashSet<i64>>> = std::sync::OnceLock::new();

fn probe_cache() -> &'static parking_lot::Mutex<HashMap<i64, Probe>> {
    PROBE_CACHE.get_or_init(Default::default)
}
fn probe_busy() -> &'static parking_lot::Mutex<HashSet<i64>> {
    PROBE_BUSY.get_or_init(Default::default)
}

/// Releases the single-flight slot even if the probe panics.
struct Slot(i64);
impl Drop for Slot {
    fn drop(&mut self) {
        probe_busy().lock().remove(&self.0);
    }
}

fn dir_size(path: &std::path::Path, depth: u8) -> u64 {
    if depth > 6 {
        return 0;
    }
    let Ok(rd) = std::fs::read_dir(path) else {
        return 0;
    };
    rd.flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_size(&e.path(), depth + 1),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

/// Blocking: touches the engine. Only ever called from a single-flight slot.
fn probe_database(state: &AppState, rec: &crate::control::DatabaseRecord) -> Value {
    let storage_bytes = dir_size(&state.pool.data_dir().join(&rec.path), 0);
    let stats = state
        .pool
        .get_engine(rec)
        .map_err(|e| e.to_string())
        .and_then(|eng| eng.stats(None).map_err(|e| e.to_string()));
    match stats {
        Ok(s) => json!({
            "id": rec.id, "name": rec.name, "created_at": rec.created_at,
            "storage_bytes": storage_bytes,
            "active_memories": s.active_memories,
            "consolidated_memories": s.consolidated_memories,
            "tombstoned_memories": s.tombstoned_memories,
            "edges": s.edges, "entities": s.entities,
            "operations": s.operations,
            "open_conflicts": s.open_conflicts,
            "pending_triggers": s.pending_triggers,
        }),
        Err(e) => json!({
            "id": rec.id, "name": rec.name, "created_at": rec.created_at,
            "storage_bytes": storage_bytes, "error": e,
        }),
    }
}

/// Fresh cache → cached. Otherwise start (at most one) probe and wait briefly;
/// if the engine is busy, answer with the last known numbers marked stale, or
/// an explicit `busy` marker — never hang.
async fn database_snapshot(state: &Arc<AppState>, rec: crate::control::DatabaseRecord) -> Value {
    let cached = probe_cache().lock().get(&rec.id).map(|p| (p.at, p.value.clone()));
    if let Some((at, value)) = &cached {
        if at.elapsed() < DB_PROBE_TTL {
            return value.clone();
        }
    }

    let claimed = probe_busy().lock().insert(rec.id);
    if claimed {
        let st = state.clone();
        let r = rec.clone();
        let task = tokio::task::spawn_blocking(move || {
            let _slot = Slot(r.id);
            let value = probe_database(&st, &r);
            probe_cache().lock().insert(r.id, Probe { at: Instant::now(), value: value.clone() });
            value
        });
        if let Ok(Ok(value)) = tokio::time::timeout(DB_PROBE_WAIT, task).await {
            return value;
        }
    }

    match cached {
        Some((at, mut value)) => {
            value["stale"] = json!(true);
            value["age_secs"] = json!(at.elapsed().as_secs());
            value
        }
        None => json!({ "id": rec.id, "name": rec.name, "created_at": rec.created_at, "busy": true }),
    }
}

// ── maintenance as a background job ────────────────────

#[derive(Clone, Default, serde::Serialize)]
struct MaintRun {
    running: bool,
    tenant: Option<String>,
    started_at: Option<String>,
    finished_at: Option<String>,
    started_by: Option<String>,
    ok: Option<bool>,
    error: Option<String>,
    results: Option<Value>,
}

static MAINT: std::sync::OnceLock<parking_lot::Mutex<MaintRun>> = std::sync::OnceLock::new();
fn maint() -> &'static parking_lot::Mutex<MaintRun> {
    MAINT.get_or_init(Default::default)
}

fn error_message(body: &Value) -> String {
    body.pointer("/error/message")
        .or_else(|| body.get("message"))
        .or_else(|| body.get("error"))
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| body.to_string())
}

// ── handlers ───────────────────────────────────────────

/// GET /v1/admin/ops/overview — everything the dashboard polls, in one call.
/// Always answers promptly: per-database numbers degrade to stale/busy rather
/// than blocking when the engine is occupied.
pub(super) async fn overview(State(state): State<Arc<AppState>>, headers: axum::http::HeaderMap) -> AppResult {
    require_role(&state, &headers, Role::Readonly).await?;
    ensure_sampler(&state);

    let st = state.clone();
    let records = bounded(Duration::from_secs(3), move || st.control.lock().list_databases().unwrap_or_default())
        .await
        .map_err(|_| app_error(StatusCode::SERVICE_UNAVAILABLE, "control database is busy; retry shortly"))?;
    let dbs: Vec<Value> = futures::future::join_all(records.into_iter().map(|rec| database_snapshot(&state, rec))).await;

    let cluster = cluster_state_view(&state).map(|v| {
        json!({
            "node_id": v.node_id, "role": v.role, "term": v.term, "leader": v.leader,
            "leader_addr": v.leader_addr, "healthy": v.healthy, "raft_mode": v.raft_mode,
            "last_applied_index": v.last_applied_index,
            "replication_lag": v.replication_lag_log_entries,
        })
    });

    let mut handlers = crate::metrics::global().handler_stats();
    handlers.sort_by(|a, b| b.count.cmp(&a.count));
    let handlers: Vec<Value> = handlers
        .into_iter()
        .map(|h| {
            json!({
                "handler": h.handler, "count": h.count,
                "avg_ms": if h.count > 0 { h.sum_secs * 1000.0 / h.count as f64 } else { 0.0 },
                "p50_ms": h.p50 * 1000.0, "p95_ms": h.p95 * 1000.0, "p99_ms": h.p99 * 1000.0,
            })
        })
        .collect();
    let requests_total: u64 = handlers.iter().map(|h| h["count"].as_u64().unwrap_or(0)).sum();

    let maintenance: Vec<Value> = crate::metrics::maintenance_aggs_snapshot()
        .into_iter()
        .map(|(db, a)| {
            json!({
                "database": db, "runs": a.runs, "failures": a.failures,
                "consolidations": a.consolidations,
                "conflicts_resolved": a.conflicts_resolved,
                "triggers_pruned": a.triggers_pruned,
                "entities_linked": a.entities_linked,
                "relations_upserted": a.relations_upserted,
                "last_duration_ms": a.last_duration_ms,
            })
        })
        .collect();

    Ok(Json(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_secs": STARTED.get().map(|t| t.elapsed().as_secs()).unwrap_or(0),
        "mode": cluster.as_ref().map(|c| c["raft_mode"].clone()).unwrap_or(json!("single-node")),
        "accepts_writes": node_accepts_writes(&state),
        "cluster": cluster,
        "control_stale": crate::server::control_auth_stale(&state),
        "quarantine": state.yrp.as_ref().and_then(|y| y.quarantine_reasons()),
        "engines_loaded": state.pool.loaded_count(),
        "workers": state.workers.active_count(),
        "inflight": state.inflight.load(std::sync::atomic::Ordering::Relaxed),
        "max_inflight": crate::server::MAX_INFLIGHT,
        "requests_total": requests_total,
        "handlers": handlers,
        "maintenance": maintenance,
        "maintenance_run": maint().lock().clone(),
        "databases": dbs,
        "history": history().lock().iter().cloned().collect::<Vec<_>>(),
        "sample_secs": SAMPLE_EVERY.as_secs(),
        "at": chrono::Utc::now().to_rfc3339(),
    })))
}

#[derive(serde::Deserialize)]
pub(super) struct MemQuery {
    limit: Option<usize>,
    offset: Option<usize>,
    sort: Option<String>,
    memory_type: Option<String>,
    domain: Option<String>,
}

/// GET /v1/admin/ops/databases/{id}/memories — paged, read-only browse.
pub(super) async fn memories(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    AxumPath(id): AxumPath<i64>,
    axum::extract::Query(q): axum::extract::Query<MemQuery>,
) -> AppResult {
    require_role(&state, &headers, Role::Readonly).await?;
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let offset = q.offset.unwrap_or(0);
    let sort = match q.sort.as_deref() {
        Some(s) if MEMORIES_SUPPORTED_SORTS.contains(&s) => s.to_string(),
        None | Some("") => "created_at".to_string(),
        Some(other) => {
            return Err(app_error(
                StatusCode::BAD_REQUEST,
                format!("sort must be one of {MEMORIES_SUPPORTED_SORTS:?}, got `{other}`"),
            ))
        }
    };
    let (memory_type, domain) = (q.memory_type.filter(|s| !s.is_empty()), q.domain.filter(|s| !s.is_empty()));
    let (rec, engine) = engine_for(&state, id).await?;
    let (rows, total) = bounded(ENGINE_WAIT, move || {
        engine.list_memories(limit, offset, domain.as_deref(), memory_type.as_deref(), None, &sort)
    })
    .await?
    .map_err(|e| app_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(json!({
        "database": rec.name, "total": total, "limit": limit, "offset": offset,
        "items": rows.iter().map(memory_to_dashboard_row).collect::<Vec<_>>(),
    })))
}

/// POST /v1/admin/ops/databases/{id}/recall — the query console. Never
/// reinforces (`skip_reinforce`): browsing must not perturb the tuning signal.
pub(super) async fn recall(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    AxumPath(id): AxumPath<i64>,
    Json(body): Json<Value>,
) -> AppResult {
    require_role(&state, &headers, Role::Readonly).await?;
    let query = body
        .get("query")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| app_error(StatusCode::BAD_REQUEST, "missing 'query'"))?
        .to_string();
    let top_k = body.get("top_k").and_then(|v| v.as_u64()).unwrap_or(10) as usize;
    if let Err(reason) = crate::admission::check_top_k(top_k, state.admission.cfg.hard_top_k_cap) {
        return Err(app_error(
            StatusCode::from_u16(reason.http_status()).unwrap_or(StatusCode::BAD_REQUEST),
            reason.message(),
        ));
    }
    let opt = |k: &str| body.get(k).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
    let (_rec, engine) = engine_for(&state, id).await?;
    let cmd = Command::Recall {
        query,
        top_k,
        memory_type: opt("memory_type"),
        include_consolidated: false,
        expand_entities: body.get("expand_entities").and_then(|v| v.as_bool()).unwrap_or(false),
        namespace: opt("namespace"),
        domain: opt("domain"),
        source: None,
        query_embedding: None,
        include_superseded: body.get("include_superseded").and_then(|v| v.as_bool()).unwrap_or(false),
        certainty_min: None,
        skip_reinforce: true,
    };
    let start = Instant::now();
    let Json(mut out) = tokio::time::timeout(RECALL_WAIT, execute_cmd(engine, cmd, state.control.clone(), &state.inflight))
        .await
        .map_err(|_| busy_error())??;
    if let Some(o) = out.as_object_mut() {
        o.insert("elapsed_ms".into(), json!(start.elapsed().as_secs_f64() * 1000.0));
    }
    Ok(Json(out))
}

/// GET /v1/admin/ops/databases/{id}/conflicts?status= — read-only view of the
/// contradiction queue (resolving stays on the data-plane API).
pub(super) async fn conflicts(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    AxumPath(id): AxumPath<i64>,
    axum::extract::Query(q): axum::extract::Query<HashMap<String, String>>,
) -> AppResult {
    require_role(&state, &headers, Role::Readonly).await?;
    let (_rec, engine) = engine_for(&state, id).await?;
    let cmd = Command::Conflicts {
        status: q.get("status").filter(|s| !s.is_empty()).cloned(),
        conflict_type: None,
        entity: None,
        namespace: None,
        limit: q.get("limit").and_then(|v| v.parse().ok()).unwrap_or(100),
    };
    tokio::time::timeout(ENGINE_WAIT, execute_cmd(engine, cmd, state.control.clone(), &state.inflight))
        .await
        .map_err(|_| busy_error())?
}

#[derive(serde::Deserialize)]
pub(super) struct JobsQuery {
    state: Option<String>,
    limit: Option<usize>,
}

/// GET /v1/admin/ops/jobs — the durable background-job queue. admin.
pub(super) async fn jobs(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    axum::extract::Query(q): axum::extract::Query<JobsQuery>,
) -> AppResult {
    require_role(&state, &headers, Role::Admin).await?;
    let state_filter = q.state.as_deref().and_then(crate::jobs::JobState::from_str);
    let limit = q.limit.unwrap_or(100).min(MAX_JOBS_LIST_LIMIT);
    let records = tokio::time::timeout(ENGINE_WAIT, state.jobs.list(None, state_filter, limit))
        .await
        .map_err(|_| busy_error())?
        .map_err(|e| app_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(json!({ "jobs": serde_json::to_value(records).unwrap_or(Value::Null) })))
}

#[derive(serde::Deserialize, Default)]
pub(super) struct MaintQuery {
    tenant: Option<String>,
}

/// POST /v1/admin/ops/maintenance/run?tenant= — admin. Starts a maintenance
/// cycle **in the background** and answers `202` at once; progress and the
/// outcome appear as `maintenance_run` in the overview. One run at a time per
/// node (`409` otherwise). Same cluster rule as the master-token route:
/// refused on followers.
pub(super) async fn maintenance_run(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    axum::extract::Query(q): axum::extract::Query<MaintQuery>,
    body: Option<Json<MaintenanceRunBody>>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let actor = require_role(&state, &headers, Role::Admin).await?;
    if !node_accepts_writes(&state) {
        return Err(app_error(
            StatusCode::CONFLICT,
            "this node does not accept writes (follower/learner); run maintenance on the leader",
        ));
    }
    {
        let mut run = maint().lock();
        if run.running {
            return Err(app_error(StatusCode::CONFLICT, "a maintenance run is already in progress on this node"));
        }
        *run = MaintRun {
            running: true,
            tenant: q.tenant.clone(),
            started_at: Some(chrono::Utc::now().to_rfc3339()),
            started_by: Some(actor.name.clone()),
            ..Default::default()
        };
    }
    tracing::info!(actor = %actor.name, tenant = ?q.tenant, "studio: maintenance run started (background)");

    let opts = body.map(|b| b.0).unwrap_or_default();
    let tenant = q.tenant.clone();
    tokio::spawn(async move {
        let outcome = run_maintenance_inner(&state, tenant.as_deref(), opts).await;
        let mut run = maint().lock();
        run.running = false;
        run.finished_at = Some(chrono::Utc::now().to_rfc3339());
        match outcome {
            Ok(Json(v)) => {
                run.ok = Some(true);
                run.results = v.get("results").cloned();
            }
            Err((_, Json(v))) => {
                run.ok = Some(false);
                run.error = Some(error_message(&v));
            }
        }
        tracing::info!(ok = ?run.ok, "studio: maintenance run finished");
    });

    Ok((StatusCode::ACCEPTED, Json(json!({ "started": true, "tenant": q.tenant }))))
}
