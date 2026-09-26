"use strict";

// Plan drawing helpers: line-icon devices, cable views (focus / all / bundled),
// the cable legend with type toggles, and the cable list tab.
// Loaded before app.js; only called after boot.

const CABLE_GROUPS = [
  { id: "video", name: "Video", types: ["sdi", "hdmi"] },
  { id: "audio", name: "Audio & comms", types: ["xlr", "trs", "mini", "com"] },
  { id: "data", name: "Data", types: ["eth", "usb"] },
  { id: "power", name: "Power", types: ["power"] }
];
const baseType = kind => kind.split(">")[0];
const groupOf = kind => CABLE_GROUPS.find(g => g.types.includes(baseType(kind))).id;

let hoverCable = null;       // cable highlighted by hovering the cable list
let legendOpen = !window.matchMedia("(max-width: 900px)").matches;

// ---------- Device icons -------------------------------------------------------------
// Drawn in metres around the device centre, pointing along +x (the rotation).
// Strokes are 1.5px regardless of zoom; the shapes scale with the plan.

const COMPUTERS = ["vmix_pc", "stream_pc", "gfx_laptop", "slides_laptop"];
const AUDIO_DESKS = ["mixer_digital", "mixer_analog", "headphones_amp"];
const DISPLAYS = ["monitor_mv", "monitor_field", "tv_confidence"];

function iconKind(it) {
  const d = def(it);
  if (d.camera) return it.type.startsWith("cam_ptz") ? "ptz" : "camera";
  if (COMPUTERS.includes(it.type)) return "computer";
  if (AUDIO_DESKS.includes(it.type)) return "audiomixer";
  if (d.cat === "switch") return "switcher";
  if (it.type === "projector") return "projector";
  if (DISPLAYS.includes(it.type)) return "display";
  if (d.cat === "power") return "power";
  return "generic";
}

function itemIcon(it) {
  const d = def(it);
  const c = CAT[d.cat].color;
  const st = `stroke="${c}" fill="${c}1a"`;   // ~10% tint behind the outline
  const ln = `stroke="${c}"`;
  const dot = (x, y, r = 0.035) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="none"></circle>`;
  switch (iconKind(it)) {
    case "camera":
      return `<rect x="-0.36" y="-0.2" width="0.46" height="0.4" rx="0.04" ${st}></rect><circle cx="0.24" cy="0" r="0.13" ${st}></circle>`;
    case "ptz":
      return `<circle r="0.33" fill="none" ${ln} stroke-dasharray="2 3"></circle><rect x="-0.2" y="-0.18" width="0.3" height="0.36" rx="0.04" ${st}></rect><circle cx="0.2" cy="0" r="0.1" ${st}></circle>`;
    case "switcher": {
      let h = `<rect x="-0.42" y="-0.22" width="0.84" height="0.44" rx="0.04" ${st}></rect>`;
      for (const y of [-0.11, 0, 0.11]) h += `<line x1="-0.42" y1="${y}" x2="-0.33" y2="${y}" ${ln}></line><line x1="0.33" y1="${y}" x2="0.42" y2="${y}" ${ln}></line>`;
      for (const x of [-0.18, -0.06, 0.06, 0.18]) h += dot(x, 0.08, 0.03);
      return h;
    }
    case "audiomixer": {
      let h = `<rect x="-0.42" y="-0.24" width="0.84" height="0.48" rx="0.04" ${st}></rect>`;
      [-0.27, -0.15, -0.03, 0.09, 0.21].forEach((x, i) => {
        h += `<line x1="${x}" y1="-0.15" x2="${x}" y2="0.15" ${ln}></line>`;
        h += `<rect x="${x - 0.035}" y="${[-0.06, 0.04, -0.1, 0.07, -0.02][i]}" width="0.07" height="0.05" fill="${c}" stroke="none"></rect>`;
      });
      return h;
    }
    case "computer":
      return `<rect x="-0.36" y="-0.26" width="0.72" height="0.52" rx="0.05" ${st}></rect><rect x="-0.27" y="-0.17" width="0.54" height="0.3" fill="none" ${ln}></rect>`;
    case "display":
      return `<rect x="-0.4" y="-0.24" width="0.8" height="0.38" rx="0.03" ${st}></rect><line x1="0" y1="0.14" x2="0" y2="0.24" ${ln}></line><line x1="-0.13" y1="0.24" x2="0.13" y2="0.24" ${ln}></line>`;
    case "projector":
      return `<path d="M-0.3 -0.12 L0.3 -0.26 L0.3 0.26 L-0.3 0.12 Z" ${st}></path><circle cx="-0.16" cy="0" r="0.06" fill="none" ${ln}></circle>`;
    case "power": {
      const n = Math.min(4, itemPorts(it).filter(p => p.type === "power" && p.dir === "out").length) || 1;
      let h = `<rect x="-0.34" y="-0.14" width="0.68" height="0.28" rx="0.05" ${st}></rect>`;
      for (let i = 0; i < n; i++) h += `<circle cx="${(i - (n - 1) / 2) * 0.15}" cy="0" r="0.045" fill="none" ${ln}></circle>`;
      return h;
    }
    default:
      return `<rect x="-0.36" y="-0.22" width="0.72" height="0.44" rx="0.04" ${st}></rect>${dot(-0.28, -0.14)}${dot(0.28, -0.14)}${dot(-0.28, 0.14)}${dot(0.28, 0.14)}`;
  }
}

// ---------- Cables -------------------------------------------------------------------

function highlightedCables() {
  const set = new Set();
  if (hoverCable) set.add(hoverCable);
  if (sel?.k === "cable") set.add(sel.id);
  if (sel?.k === "item") for (const c of project.cables) if (c.from.item === sel.id || c.to.item === sel.id) set.add(c.id);
  return set;
}

function buildCables(opts, fs, halo) {
  const P = project;
  const view = opts.print ? (P.cableView === "bundle" ? "bundle" : "all") : P.cableView;
  const hl = opts.print ? new Set() : highlightedCables();
  const visible = P.cables.filter(c => A.cable[c.id] && P.cableShow[groupOf(A.cable[c.id].kind)] !== false);
  // Highlighted runs are drawn last so they sit on top.
  visible.sort((a, b) => hl.has(a.id) - hl.has(b.id));
  let out = "";
  if (view === "bundle") out += bundleLayer(visible.filter(c => !hl.has(c.id)), fs, halo);

  for (const c of visible) {
    const info = A.cable[c.id];
    const on = hl.has(c.id);
    const base = baseType(info.kind);
    const off = view === "bundle" ? 0 : A.offset[c.id] || 0;
    const pts = cablePath(c).map(p => ({ x: p.x + off, y: p.y + off }));
    const d = "M" + pts.map(p => `${r2(p.x)} ${r2(p.y)}`).join(" L");
    const bundled = view === "bundle" && !on;
    const dim = view === "focus" && !on;
    const isSel = !opts.print && sel?.k === "cable" && sel.id === c.id;
    out += `<g class="cable k-${base} st-${info.status}${dim ? " dim" : ""}${on ? " on" : ""}${isSel ? " sel" : ""}" data-k="cable" data-id="${c.id}">
      <path class="c-hit" d="${d}"></path>
      ${bundled ? "" : `${on && !opts.print ? `<path class="c-glow" d="${d}"></path>` : ""}<path class="c-line" d="${d}" stroke="${info.info.color}"></path>`}</g>`;
    const showLabel = P.showCableLabels && !bundled && (view === "all" || on);
    if (showLabel) {
      const m = pointAlong(pts, 0.5);
      out += `<text class="c-lbl k-${base}" ${halo} x="${m.x}" y="${m.y - fs * 0.3}" font-size="${fs * 0.75}" text-anchor="middle" fill="${info.info.color}">${esc(c.label)} · ${info.stock ? info.stock + "m" : r1(info.planned) + "m"}</text>`;
    }
  }
  return out;
}

// Merges runs that share the same straight stretch into one line whose width grows
// with the number of cables in it. Horizontal and vertical stretches are merged
// (that's how cable is dressed along walls); diagonal runs are drawn as they are.
// Each cable group is its own bundle, laid side by side - mains is kept apart from
// signal on site anyway, and it keeps the type colours readable.
const GROUP_OFFSET = { video: 0, audio: 0.13, data: -0.13, power: 0.26 };
function bundleLayer(cables, fs, halo) {
  const lines = {};
  let out = "";
  for (const c of cables) {
    const kind = A.cable[c.id].kind;
    const g = groupOf(kind);
    const pts = cablePath(c);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6) {
        (lines[g + "h" + r2(a.y)] ??= { h: true, at: a.y + GROUP_OFFSET[g], spans: [] }).spans.push({ lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), c, kind });
      } else if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6) {
        (lines[g + "v" + r2(a.x)] ??= { h: false, at: a.x + GROUP_OFFSET[g], spans: [] }).spans.push({ lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), c, kind });
      } else if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-6) {
        out += `<line class="b-line k-${baseType(kind)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${kindInfo(kind).color}" style="stroke-width:2px"></line>`;
      }
    }
  }
  for (const line of Object.values(lines)) {
    const cuts = [...new Set(line.spans.flatMap(s => [s.lo, s.hi]))].sort((a, b) => a - b);
    // Pieces between consecutive cut points, each with the set of cables covering it;
    // adjacent pieces with the same cables are joined back together.
    const pieces = [];
    for (let i = 1; i < cuts.length; i++) {
      const lo = cuts[i - 1], hi = cuts[i];
      const members = line.spans.filter(s => s.lo <= lo + 1e-6 && s.hi >= hi - 1e-6);
      if (!members.length) continue;
      const key = members.map(m => m.c.id).sort().join(",");
      const last = pieces[pieces.length - 1];
      if (last && last.key === key && Math.abs(last.hi - lo) < 1e-6) last.hi = hi;
      else pieces.push({ lo, hi, key, members });
    }
    for (const p of pieces) {
      const n = p.members.length;
      // Colour of the most common type in the bundle (e.g. mostly SDI with one HDMI).
      const tally = {};
      p.members.forEach(m => { const t = baseType(m.kind); tally[t] = (tally[t] || 0) + 1; });
      const kinds = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
      const color = CABLE_TYPES[kinds[0]].color;
      const w = n === 1 ? 2.5 : Math.min(3 + n * 1.6, 16);
      const [x1, y1, x2, y2] = line.h ? [p.lo, line.at, p.hi, line.at] : [line.at, p.lo, line.at, p.hi];
      out += `<line class="b-line k-${kinds[0]}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" style="stroke-width:${w}px"></line>`;
      if (n > 1 && p.hi - p.lo > 1.5) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        out += `<text class="b-count" ${halo} x="${mx}" y="${my}" font-size="${fs * 0.75}" text-anchor="middle" dominant-baseline="central"${line.h ? "" : ` transform="rotate(-90 ${mx} ${my})"`}>×${n}</text>`;
      }
    }
  }
  return out;
}

// ---------- Legend (on the plan) -----------------------------------------------------

function renderLegend() {
  const el = $("#cableLegend");
  if (!el) return;
  const P = project;
  const counts = {};
  for (const c of P.cables) if (A.cable[c.id]) { const g = groupOf(A.cable[c.id].kind); counts[g] = (counts[g] || 0) + 1; }
  if (!legendOpen) {
    el.innerHTML = `<button class="lg-toggle" data-act="legend-toggle">Cables ▸</button>`;
    return;
  }
  el.innerHTML = `<div class="lg-head"><span>Cables</span><button class="lg-toggle" data-act="legend-toggle" title="Hide">▾</button></div>
    <div class="seg">${[["focus", "Focus"], ["all", "All"], ["bundle", "Bundled"]].map(([v, n]) =>
      `<button class="${P.cableView === v ? "on" : ""}" data-act="cable-view" data-v="${v}" title="${v === "focus" ? "Dim cables until you select a device or cable" : v === "all" ? "Show every run" : "Merge shared runs into one line"}">${n}</button>`).join("")}</div>
    <div data-scope="project">${CABLE_GROUPS.map(g => `<label class="lg-row">
      <input type="checkbox" data-f="cableShow.${g.id}" data-t="bool"${P.cableShow[g.id] !== false ? " checked" : ""}>
      <span class="sw-set">${g.types.map(t => `<i class="k-${t}" style="background:${CABLE_TYPES[t].color}"></i>`).join("")}</span>
      <span>${g.name}</span><em>${counts[g.id] || 0}</em></label>`).join("")}</div>`;
}

// ---------- Cable list (left panel tab) ----------------------------------------------

function renderCablesTab(q) {
  const needle = q.trim().toLowerCase();
  let h = `<input type="search" id="cableSearch" class="search" placeholder="Search cables or devices…" value="${esc(q)}">
    <p class="muted small">Hover to highlight a run, click to select it.</p>`;
  const icon = st => (st === "error" ? `<span class="stat bad" title="Problem">⛔</span>` : st === "warn" ? `<span class="stat warn" title="Check">⚠</span>` : `<span class="stat ok" title="OK">✓</span>`);
  for (const g of CABLE_GROUPS) {
    const rows = project.cables.filter(c => A.cable[c.id] && groupOf(A.cable[c.id].kind) === g.id).map(c => {
      const a = itemById(c.from.item), b = itemById(c.to.item), i = A.cable[c.id];
      return { c, a, b, i, text: `${c.label} ${a.label} ${b.label} ${i.info.name}`.toLowerCase() };
    }).filter(r => !needle || r.text.includes(needle))
      .sort((x, y) => x.c.label.localeCompare(y.c.label, undefined, { numeric: true }));
    if (!rows.length) continue;
    const hidden = project.cableShow[g.id] === false;
    h += `<h4 class="cat-h">${g.name} <span class="muted">(${rows.length})</span>${hidden ? ` <span class="muted small">hidden on plan</span>` : ""}</h4><ul class="clist${hidden ? " hidden-group" : ""}">`;
    for (const { c, a, b, i } of rows) {
      const len = !i.needsCable ? "lead" : i.stock ? `${i.stock}m` : `${Math.ceil(i.planned)}m*`;
      const selCls = sel?.k === "cable" && sel.id === c.id ? " on" : "";
      h += `<li class="crow${selCls}" data-act="goto" data-k="cable" data-id="${c.id}" data-hover="${c.id}">
        ${icon(i.status)}${portChip(baseType(i.kind))}
        <div class="c-main"><b>${esc(c.label)}</b><span>${esc(a.label)} → ${esc(b.label)}</span></div>
        <span class="c-len">${len}</span></li>`;
    }
    h += `</ul>`;
  }
  if (!project.cables.length) h += `<p class="muted">No cables yet - use Cable mode (C) to run one.</p>`;
  return h;
}
