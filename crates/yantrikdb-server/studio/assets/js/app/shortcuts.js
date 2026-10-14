/** Global keyboard shortcuts. */

import { dismissTop } from '../ui/overlay.js';
import { auth } from '../core/api.js';
import { navigate } from './nav.js';
import { showPalette, showHelp } from './commands.js';

let gPressedAt = 0;

export function installShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (!auth.token) return;
    const tag = (document.activeElement || {}).tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      showPalette();
      return;
    }
    if (e.key === 'Escape') {
      dismissTop();
      return;
    }
    if (typing) return;

    if (e.key === '?') showHelp();
    else if (e.key === '/') {
      const target = document.getElementById('browse-filter') || document.getElementById('query-text') || document.getElementById('audit-filter');
      if (target) {
        e.preventDefault();
        target.focus();
      }
    } else if (e.key === 'g') gPressedAt = Date.now();
    else if (Date.now() - gPressedAt < 900) {
      if (e.key === 'd') navigate('dashboard');
      else if (e.key === 'c') navigate('cluster');
      gPressedAt = 0;
    }
  });
}
