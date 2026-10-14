/**
 * HTTP client for the YantrikDB control plane.
 *
 * Owns the session token and normalises errors. A 401 anywhere clears the
 * session and emits `unauthorized`, so views never handle expiry themselves.
 *
 * Every request is bounded: a server that is busy (a long maintenance cycle,
 * a stuck lock) must surface as an error the UI can show, never as a request
 * that hangs forever and leaves a blank page.
 */

import { session } from './storage.js';

const TOKEN_KEY = 'ydb_sess';

/** Default per-request budget. Callers with a known-long operation pass more. */
export const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(message, status, { timeout = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.timeout = timeout;
  }
}

export const auth = {
  get token() {
    return session.get(TOKEN_KEY) || '';
  },
  set(token) {
    session.set(TOKEN_KEY, token);
  },
  clear() {
    session.remove(TOKEN_KEY);
  },
};

/** Fires `unauthorized` when the server rejects the session. */
export const authEvents = new EventTarget();

/** Pull the most specific human message out of the server's error shapes. */
export function errorMessage(body, status) {
  return (
    (body && body.error && body.error.message) ||
    (body && body.message) ||
    (body && typeof body.error === 'string' && body.error) ||
    `HTTP ${status}`
  );
}

async function request(path, { method = 'GET', body, headers = {}, rawBody, token = auth.token, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (rawBody !== undefined) {
    payload = rawBody;
  } else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(path, { method, headers: h, body: payload, cache: 'no-store', signal: controller.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new ApiError(`No answer from the server after ${Math.round(timeoutMs / 1000)}s — it may be busy with a long-running operation`, 0, { timeout: true });
    }
    throw new ApiError('Cannot reach the server', 0);
  } finally {
    clearTimeout(timer);
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (res.status === 401 && token === auth.token && token) {
    auth.clear();
    authEvents.dispatchEvent(new Event('unauthorized'));
    throw new ApiError('Session expired — sign in again', 401);
  }
  if (!res.ok) throw new ApiError(errorMessage(data, res.status), res.status);
  return data;
}

/** @param {{timeoutMs?:number}} [opt] */
export const api = {
  get: (path, opt) => request(path, opt),
  post: (path, body = {}, opt) => request(path, { method: 'POST', body, ...opt }),
  put: (path, body = {}, opt) => request(path, { method: 'PUT', body, ...opt }),
  del: (path, opt) => request(path, { method: 'DELETE', ...opt }),
  /** Binary upload (pack files): large bodies get a generous budget. */
  upload: (path, buffer) =>
    request(path, { method: 'POST', rawBody: buffer, headers: { 'Content-Type': 'application/octet-stream' }, timeoutMs: 120_000 }),
  /** Call with an explicit credential (first-time owner bootstrap). */
  withToken: (token) => ({
    post: (path, body = {}) => request(path, { method: 'POST', body, token }),
  }),
};

/** Unauthenticated read (cluster topology is public, like /v1/health). */
export async function publicGet(path, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, { cache: 'no-store', signal: controller.signal });
    return await res.json();
  } catch (e) {
    throw new ApiError(e && e.name === 'AbortError' ? 'The node did not answer in time' : 'Cannot reach the server', 0, { timeout: e && e.name === 'AbortError' });
  } finally {
    clearTimeout(timer);
  }
}
