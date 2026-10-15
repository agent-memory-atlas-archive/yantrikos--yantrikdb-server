/** Navigation primitive shared by views (kept separate from routes to avoid import cycles). */

import { actions } from '../core/actions.js';

export function navigate(path) {
  location.hash = '#/' + path;
  document.getElementById('shell')?.classList.remove('open');
}

// <a data-action="nav" data-to="db/1/browse">
actions({ nav: (el) => navigate(el.dataset.to) });
