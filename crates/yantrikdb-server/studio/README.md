# YantrikDB Studio

The control console served by every YantrikDB server at **`/admin`**.

Studio is a real application — modular, tested, and typed by convention — that ships *inside* the server binary. There is **no bundler, no Node toolchain in the Rust build, and no runtime dependency**: native ES modules and plain CSS, embedded at compile time by [`build.rs`](../build.rs). It works air-gapped and cannot drift from the server version it ships with.

## Run it

Start any server and open `http://<host>:<http_port>/admin`. First-time setup creates the owner account with the cluster master token; afterwards sign in with the account.

Edit files under `studio/` and rebuild the server (`cargo build -p yantrikdb-server`) — `build.rs` re-embeds on change. Assets are served with `Cache-Control: no-cache`, so a refresh always picks up the new build.

## Test it

```sh
cd crates/yantrikdb-server/studio
npm test          # = node --test ; Node ≥ 20, zero dependencies
```

| Suite | Guards |
|---|---|
| `html`, `highlight` | output escaping — untrusted data can only reach the DOM escaped |
| `format`, `series`, `health`, `csv`, `router`, `audit` | pure logic |
| `integrity` | every import resolves, every `data-action` has a handler, every route's view exists and exports `render`, no inline handlers/scripts (strict CSP) |

The server side has matching Rust tests (`studio_embed_tests`) asserting the shell and entry points are embedded and `index.html` only references embedded assets.

## Layout

```
studio/
  index.html                 static shell (chrome containers, no inline script)
  assets/
    css/                     tokens → base → layout → components → charts → views → responsive
    js/
      main.js                entry: wires layers together, no business logic
      core/                  framework-free utilities (no DOM assumptions in most)
        html.js              escape-by-default tagged template  ← the XSS boundary
        api.js               fetch client, session token, 401 → `unauthorized`
        actions.js           declarative event delegation (data-action / data-on-*)
        router.js            pure hash router
        store.js poller.js   observable store; visibility-aware interval
        format.js storage.js pure formatters; guarded Web Storage
      ui/                    presentational toolkit
        components.js charts.js overlay.js palette.js icons.js theme.js csv.js …
      app/                   application layer
        state.js             session / overview / prefs stores, role checks
        routes.js            route table (lazy views, role gates, live flags)
        host.js              renders the current view; keeps scroll & focus stable
        shell.js lifecycle.js commands.js shortcuts.js overview.js series.js health.js
      views/                 one module per screen, loaded on demand
        dashboard cluster databases browse query conflicts
        tokens users audit packs maintenance jobs login
  test/                      node:test suites (not embedded in the binary)
```

Dependencies point **downward only**: `views → app → ui → core`. Views never import each other; shared view fragments are prefixed `_` (`_data.js`, `_memory-drawer.js`).

## Conventions

**Templating.** Always use the `html` tag. Every interpolation is escaped unless it is itself `html`/`raw`. Never concatenate strings into markup.

```js
html`<td>${memory.text}</td>`            // escaped
html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`   // nested html passes through
```

**Events.** Markup declares intent; modules register handlers by name. No inline `onclick`, no globals.

```js
html`<button data-action="token.revoke" data-hash="${t.hash}">Revoke</button>`
actions({ 'token.revoke': async (el) => { await api.post(…, { hash: el.dataset.hash }); reload(); } });
```
`data-on-input`, `data-on-change`, `data-on-enter`, `data-on-ctrl-enter` cover the rest.

**Views.** A view is `export default { async render({ params, quiet, fetch }) → html }`.
Keep local UI state (filters, page) in module scope. After a *local* change call `refresh()` (repaint, no refetch); after a *server* change call `reload()` (refetch + repaint). Both keep scroll position and the focused input.

**Adding a screen.**
1. `assets/js/views/<name>.js` exporting `default { render }` (+ `actions({...})` for its handlers).
2. One line in `app/routes.js` (`min:` for a role gate, `live: true` to repaint on every poll).
3. A sidebar entry in `app/shell.js` if it is navigable.
4. `npm test` — `integrity` fails if a handler or import is missing.

## Security model

- **Strict CSP** on every asset: `script-src 'self'`, no framing, `connect-src 'self'`. The app emits no inline scripts or handlers, which the `integrity` suite enforces.
- **Escape-by-default** templating (`html.js`) — user data (memory text, usernames, audit targets) cannot become markup.
- The session token lives in `sessionStorage` (cleared with the tab), is sent only as a `Bearer` header to same-origin APIs, and any 401 clears it and returns to sign-in.
- Plaintext secrets (a freshly minted token) are held in module memory only and are never written to storage.
- Every privileged action is enforced **server-side** by role (`readonly` < `admin` < `owner`); the UI's role checks only hide controls.

## Backend surface

Session-authed, role-gated endpoints for the console live in `src/admin/ops.rs` (`/v1/admin/ops/*`): overview (with a one-hour in-memory metrics history), memories, recall, conflicts, jobs, maintenance run. Control-plane CRUD reuses `/v1/admin/*`.
