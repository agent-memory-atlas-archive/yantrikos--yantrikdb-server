/** Health derivation from an overview payload. Pure — unit-tested in Node. */

import { nf } from '../core/format.js';

/** @returns {['bad'|'warn', string, string][]} severity, title, detail */
export function computeAlerts(o) {
  const alerts = [];
  const dbs = o.databases || [];
  if (o.quarantine) alerts.push(['bad', 'Node quarantined', (o.quarantine || []).join('; ')]);
  if (o.control_stale) alerts.push(['bad', 'Control plane behind', o.control_stale]);
  if (o.cluster && !o.cluster.healthy) alerts.push(['bad', 'Cluster unhealthy', 'No leader visible from this node.']);
  if (o.cluster && o.cluster.replication_lag > 100) alerts.push(['warn', 'Replication lag', `${nf(o.cluster.replication_lag)} entries behind commit.`]);
  if (o.inflight > o.max_inflight * 0.75) alerts.push(['warn', 'Load shedding near', `${o.inflight}/${o.max_inflight} operations in flight.`]);
  dbs.filter((d) => d.error).forEach((d) => alerts.push(['bad', `Database “${d.name}” failed to load`, d.error]));
  dbs.filter((d) => d.open_conflicts > 0).forEach((d) => alerts.push(['warn', `${d.open_conflicts} open conflict(s) in “${d.name}”`, 'Unresolved contradictions awaiting review.']));
  (o.maintenance || []).filter((m) => m.failures > 0).forEach((m) => alerts.push(['warn', `Maintenance failures in “${m.database}”`, `${m.failures} failed run(s).`]));
  if (!o.accepts_writes) alerts.push(['warn', 'This node does not accept writes', 'Follower/learner — writes route to the leader.']);
  return alerts;
}

/** 0–100: each critical alert costs 40, each warning 12. */
export function healthScore(alerts) {
  const crit = alerts.filter((a) => a[0] === 'bad').length;
  return Math.max(0, 100 - crit * 40 - (alerts.length - crit) * 12);
}
