/**
 * Hash router. Routes are declared as patterns (`db/:db/browse`); matching is
 * pure so it can be unit-tested without a DOM.
 */

/** Compile a pattern into a matcher. Returns params or null. */
export function compile(pattern) {
  const parts = pattern.split('/');
  return (segments) => {
    if (segments.length !== parts.length) return null;
    const params = {};
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
      else if (parts[i] !== segments[i]) return null;
    }
    return params;
  };
}

export function parseHash(hash) {
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

/** Resolve a hash against a route table; unknown paths fall back to the first route. */
export function resolve(routes, hash) {
  const segments = parseHash(hash);
  if (segments.length === 0) segments.push(routes[0].path);
  for (const route of routes) {
    const params = route.match(segments);
    if (params) return { route, params };
  }
  return { route: routes[0], params: {} };
}

export function createRouter(routeDefs) {
  const routes = routeDefs.map((r) => ({ ...r, match: compile(r.path) }));
  const listeners = new Set();
  let listening = false;
  const current = () => resolve(routes, location.hash);
  return {
    routes,
    current,
    navigate(path) {
      location.hash = '#/' + path;
    },
    /** The window listener is attached on first subscription, keeping import side-effect free. */
    onChange(fn) {
      if (!listening) {
        listening = true;
        window.addEventListener('hashchange', () => listeners.forEach((cb) => cb(current())));
      }
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
