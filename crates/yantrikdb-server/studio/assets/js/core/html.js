/**
 * Safe HTML templating.
 *
 * `html` is a tagged template that HTML-escapes every interpolated value
 * unless it is itself the product of `html` (or `raw`). Escaping is the
 * default, so a forgotten `esc()` call — the classic XSS bug in string-built
 * UIs — is not possible: untrusted data (memory text, usernames, audit
 * targets) can only reach the DOM escaped.
 */

class SafeHtml {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Escape a value for HTML text or a quoted attribute. */
export function escape(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ENTITIES[c]);
}

function render(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.s;
  if (Array.isArray(value)) return value.map(render).join('');
  return escape(value);
}

/** Tagged template: escapes interpolations, passes nested `html` through. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Mark a trusted string (e.g. a static SVG path) as already-safe HTML. */
export function raw(s) {
  return new SafeHtml(String(s));
}

/** Join a list of SafeHtml/strings with a separator. */
export function join(list, sep = '') {
  return new SafeHtml(list.map(render).join(sep));
}

export function toString(value) {
  return render(value);
}

export { SafeHtml };
