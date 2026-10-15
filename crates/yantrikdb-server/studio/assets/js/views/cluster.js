/** Cluster: replication topology graph and per-node cards. */

import { html } from '../core/html.js';
import { publicGet } from '../core/api.js';
import { overview } from '../app/state.js';
import { pageHead, tile, panel } from '../ui/components.js';

const num = (v) => (v == null ? '—' : v);

function roleColor(node) {
  if (node.reachable === false) return 'var(--bad)';
  switch (node.role) {
    case 'leader': return 'var(--accent)';
    case 'witness': return 'var(--warn)';
    case 'quarantined':
    case 'candidate': return 'var(--bad)';
    default: return 'var(--accent3)';
  }
}

/** Nodes on an ellipse, leader links animated. */
function topologySvg(nodes) {
  const W = 560, H = 300, cx = W / 2, cy = H / 2;
  const R = Math.min(110, 60 + nodes.length * 12);
  const pos = nodes.map((n, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
    return { n, x: cx + (nodes.length === 1 ? 0 : R * 1.5 * Math.cos(a)), y: cy + (nodes.length === 1 ? 0 : R * Math.sin(a)) };
  });
  const leader = pos.find((p) => p.n.role === 'leader');
  const mesh = pos.flatMap((a, i) => pos.slice(i + 1).map((b) => html`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--line)"/>`));
  const flows = leader
    ? pos.filter((p) => p !== leader && p.n.reachable !== false).map((p) => html`<line class="flow" x1="${leader.x}" y1="${leader.y}" x2="${p.x}" y2="${p.y}" stroke="var(--accent)" stroke-width="2" opacity=".8"/>`)
    : [];
  const bubbles = pos.map(({ n, x, y }) => {
    const col = roleColor(n);
    const reach = n.reachable !== false;
    return html`<g>${n.role === 'leader' ? html`<circle cx="${x}" cy="${y}" r="34" fill="${col}" opacity=".15"/>` : ''}
      <circle cx="${x}" cy="${y}" r="24" fill="var(--panel-solid)" stroke="${col}" stroke-width="2.5"/>
      <text x="${x}" y="${y + 4.5}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)">${num(n.node_id)}</text>
      <text x="${x}" y="${y + 44}" text-anchor="middle" font-size="10" fill="var(--muted)">${reach ? n.role || 'unknown' : 'unreachable'}${n.self ? ' · you' : ''}</text></g>`;
  });
  return html`<svg class="topo" viewBox="0 0 ${W} ${H}">${mesh}${flows}${bubbles}</svg>`;
}

function nodeCard(n) {
  const role = String(n.role || (n.reachable ? 'unknown' : 'unreachable'));
  const reach = n.reachable !== false;
  const tone = role === 'leader' ? 'accent' : role === 'quarantined' || role === 'candidate' || !reach ? 'bad' : role === 'witness' ? 'warn' : '';
  return html`<div class="ncard rise ${role === 'leader' ? 'leader' : ''}">
    <div class="top"><b class="mono">node ${num(n.node_id)}</b><span class="badge ${tone}">${reach ? role : 'unreachable'}</span><span class="spacer"></span><span class="dot ${!reach ? 'bad' : n.healthy === true ? 'ok' : 'warn'}"></span></div>
    <div class="mono muted" style="font-size:.72rem;word-break:break-all">${n.addr || ''}${n.self ? ' · this node' : ''}</div>
    <dl class="rows"><dt>term</dt><dd>${num(n.term)}</dd><dt>applied index</dt><dd>${num(n.last_applied_index)}</dd><dt>replication lag</dt><dd>${num(n.replication_lag)}</dd></dl></div>`;
}

export default {
  async render() {
    const d = await publicGet('/v1/cluster/topology');
    const nodes = (d && d.nodes) || [];
    const head = pageHead({ crumb: 'Server', title: 'Cluster', sub: 'topology & replication' });

    if (!d || d.raft_mode !== 'yrp') {
      const mode = (overview() || {}).mode || '—';
      return html`${head}${panel('Standalone node', html`<p class="muted" style="margin:0">This server is not running in cluster (yrp) mode, so there is no replication topology to show. Mode: <b>${mode}</b>.</p>`, { glyph: 'cluster' })}`;
    }

    const leader = nodes.find((n) => n.role === 'leader');
    const reachable = nodes.filter((n) => n.reachable !== false).length;
    return html`${head}
      <div class="tiles">
        ${tile({ label: 'Cluster', glyph: 'cluster', value: html`<span style="font-size:1.2rem">${d.cluster_id ?? '—'}</span>`, sub: `viewed from node ${num(d.viewed_from)}` })}
        ${tile({ label: 'Leader', glyph: 'flag', value: leader ? `node ${leader.node_id}` : 'none', sub: `term ${num(leader && leader.term)}`, tone: leader ? '' : 'bad' })}
        ${tile({ label: 'Reachable', glyph: 'check', value: `${reachable}/${nodes.length}`, sub: 'members' })}
      </div>
      ${panel('Replication topology', topologySvg(nodes), { glyph: 'cluster', right: 'animated links show leader → follower replication' })}
      <div class="ncards">${nodes.map(nodeCard)}</div>`;
  },
};

