/**
 * SVG charts — no dependencies.
 *
 * `areaChart` draws gridlines, labelled axes and gradient areas; hover
 * tooltips are attached once by `installChartHover` using delegation and a
 * registry of the charts currently on screen (reset on every view render).
 */

import { html } from '../core/html.js';
import { niceMax, hhmm, hhmmss } from '../core/format.js';

const registry = new Map();
let seq = 0;

export function resetCharts() {
  registry.clear();
}

const W = 420;
const PAD = { l: 38, r: 8, t: 8, b: 18 };

/**
 * @param {{series:{name:string,color:string,data:{t:number,v:number}[]}[], h?:number, min?:number,
 *          fmt?:(v:number)=>string, fmt2?:(v:number)=>string}} o
 */
export function areaChart(o) {
  const lead = o.series[0].data;
  if (lead.length < 2) return html`<div class="empty" style="padding:2rem">Collecting samples…</div>`;
  const id = `c${++seq}`;
  registry.set(id, o);

  const H = o.h || 150;
  const max = niceMax(Math.max(...o.series.flatMap((s) => s.data.map((d) => d.v)), o.min || 0));
  const t0 = lead[0].t;
  const t1 = lead[lead.length - 1].t;
  const x = (t) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const fmt = o.fmt || ((v) => v);

  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4;
    const yy = y(v);
    grid.push(
      html`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-dasharray="${i ? '3 4' : ''}"/><text x="${PAD.l - 6}" y="${yy + 3.5}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(v)}</text>`,
    );
  }
  for (let i = 0; i <= 3; i++) {
    const t = t0 + ((t1 - t0) * i) / 3;
    grid.push(
      html`<text x="${x(t)}" y="${H - 3}" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}" font-size="11" fill="var(--muted)">${hhmm(t)}</text>`,
    );
  }

  const layers = o.series.map((s, k) => {
    const line = s.data.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)} ${y(d.v).toFixed(1)}`).join(' ');
    const gid = `${id}g${k}`;
    return html`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".32"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>
      ${k === 0 ? html`<path d="${line} L${x(t1)} ${H - PAD.b} L${x(t0)} ${H - PAD.b} Z" fill="url(#${gid})"/>` : ''}
      <path d="${line}" fill="none" stroke="${s.color}" stroke-width="1.8" stroke-linejoin="round"/>`;
  });
  const heads = o.series.map((s) => {
    const d = s.data[s.data.length - 1];
    return html`<circle cx="${x(d.t)}" cy="${y(d.v)}" r="3" fill="${s.color}"/>`;
  });

  return html`<div class="chartbox" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}">${grid}${layers}${heads}</svg><div class="cross"></div><div class="tip"></div></div>
    ${o.series.length > 1 ? html`<div class="legend">${o.series.map((s) => html`<span><i style="background:${s.color}"></i>${s.name}</span>`)}</div>` : ''}`;
}

/** Tiny trend line for tiles. */
export function sparkline(values, color) {
  if (values.length < 2) return '';
  const w = 200;
  const h = 34;
  const max = Math.max(...values, 1e-9);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return html`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:100%"><path d="${line} L${w} ${h} L0 ${h} Z" fill="${color}" opacity=".16"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

/** Donut. `segments` = [{v, c}]; `center` is trusted HTML shown in the hole. */
export function ring(segments, size, thick, center = '') {
  const r = (size - thick) / 2;
  const C = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.v, 0) || 1;
  let offset = 0;
  const arcs = segments
    .filter((s) => s.v > 0)
    .map((s) => {
      const len = (s.v / total) * C;
      const arc = html`<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.c}" stroke-width="${thick}" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-offset}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      offset += len;
      return arc;
    });
  return html`<div class="ringwrap" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${thick}"/>${arcs}</svg>${center ? html`<div class="c"><div>${center}</div></div>` : ''}</div>`;
}

/** Attach the shared hover handler (idempotent). */
let hoverInstalled = false;
export function installChartHover() {
  if (hoverInstalled) return;
  hoverInstalled = true;
  document.addEventListener('mousemove', (e) => {
    const box = e.target.closest?.('.chartbox');
    document.querySelectorAll('.chartbox .cross, .chartbox .tip').forEach((el) => {
      if (!box || !box.contains(el)) el.style.display = 'none';
    });
    if (!box) return;
    const o = registry.get(box.dataset.chart);
    if (!o) return;
    const rect = box.getBoundingClientRect();
    const pts = o.series[0].data;
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const t = t0 + ((sx - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0);
    let best = 0;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.t - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const cx = ((PAD.l + ((pts[best].t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r)) / W) * 100;
    const cross = box.querySelector('.cross');
    const tip = box.querySelector('.tip');
    const f = o.fmt2 || o.fmt || ((v) => v);
    cross.style.display = 'block';
    cross.style.left = cx + '%';
    tip.innerHTML = html`<b>${hhmmss(pts[best].t)}</b>${o.series.map((s) => html`<div><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:.4rem"></i>${s.name}: <b style="display:inline;color:var(--ink)">${f(s.data[best].v)}</b></div>`)}`.toString();
    tip.style.display = 'block';
    tip.style.left = cx > 60 ? 'auto' : cx + 1 + '%';
    tip.style.right = cx > 60 ? 100 - cx + 1 + '%' : 'auto';
  });
}

