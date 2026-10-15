/**
 * YantrikDB Studio — entry point.
 *
 * Wires the app together; contains no business logic. Layers, low → high:
 *   core/  framework-free utilities (html, api, router, store, actions, format)
 *   ui/    presentational toolkit (icons, charts, overlays, components)
 *   app/   state, routing, shell, lifecycle
 *   views/ one module per screen, lazy-loaded by the route table
 */

import { installActionDispatcher, actions } from './core/actions.js';
import { auth } from './core/api.js';
import { initTheme, toggleTheme } from './ui/theme.js';
import { installChartHover } from './ui/charts.js';
import { installOverlayDismiss, closeDrawer } from './ui/overlay.js';
import { prefsStore } from './app/state.js';
import { initShell, paintChrome } from './app/shell.js';
import { installShortcuts } from './app/shortcuts.js';
import { showPalette, showHelp } from './app/commands.js';
import { boot, showLogin, logout, setRefresh, retryOverview } from './app/lifecycle.js';
import { renderRoute } from './app/host.js';
import { router } from './app/routes.js';
import './app/nav.js';

initTheme();
installActionDispatcher();
installChartHover();
installOverlayDismiss();
installShortcuts();
initShell();

actions({
  'app.palette': showPalette,
  'app.help': showHelp,
  'app.logout': logout,
  'app.theme': () => {
    toggleTheme();
    paintChrome();
    renderRoute({ quiet: true, fetch: false });
  },
  'app.sidebar': () => prefsStore.set({ collapsed: !prefsStore.get().collapsed }),
  'app.menu': () => document.getElementById('shell').classList.toggle('open'),
  'app.refresh': (el) => setRefresh(Number(el.value)),
  'app.retry': retryOverview,
});

router.onChange(() => {
  if (!auth.token) return;
  closeDrawer();
  renderRoute();
});

if (auth.token) boot();
else showLogin();
