/** Command palette contents and the keyboard-help dialog. */

import { html } from '../core/html.js';
import { openPalette } from '../ui/palette.js';
import { openModal } from '../ui/overlay.js';
import { toggleTheme } from '../ui/theme.js';
import { databases } from './state.js';
import { navTargets, paintChrome } from './shell.js';
import { navigate } from './nav.js';
import { logout } from './lifecycle.js';

export function showPalette() {
  const items = [
    ...navTargets().map((n) => ({ title: n.label, hint: 'go to', icon: n.icon, run: () => navigate(n.to) })),
    ...databases().flatMap((d) => [
      { title: `Browse ${d.name}`, hint: 'database', icon: 'db', run: () => navigate(`db/${d.id}/browse`) },
      { title: `Query ${d.name}`, hint: 'database', icon: 'search', run: () => navigate(`db/${d.id}/query`) },
      { title: `Conflicts in ${d.name}`, hint: 'database', icon: 'warn', run: () => navigate(`db/${d.id}/conflicts`) },
    ]),
    { title: 'Toggle theme', hint: 'action', icon: 'sun', run: () => { toggleTheme(); paintChrome(); } },
    { title: 'Keyboard shortcuts', hint: 'help', icon: 'help', run: showHelp },
    { title: 'Sign out', hint: 'action', icon: 'out', run: logout },
  ];
  openPalette(items);
}

const SHORTCUTS = [
  [['Ctrl', 'K'], 'Command palette'],
  [['g', 'd'], 'Go to dashboard'],
  [['g', 'c'], 'Go to cluster'],
  [['/'], 'Focus filter / query box'],
  [['Ctrl', '↵'], 'Run query'],
  [['Esc'], 'Close dialogs & drawers'],
  [['?'], 'This help'],
];

export function showHelp() {
  openModal(html`<div class="modal" role="dialog" aria-label="Keyboard shortcuts"><h3>Keyboard shortcuts</h3>
    <dl class="rows" style="font-size:.84rem;gap:.5rem 1rem">${SHORTCUTS.map(([keys, label]) => html`<dt>${keys.map((k) => html`<kbd>${k}</kbd> `)}</dt><dd style="font-family:var(--sans)">${label}</dd>`)}</dl>
    <div class="acts"><button class="btn ghost" data-action="modal.cancel">Close</button></div></div>`);
}
