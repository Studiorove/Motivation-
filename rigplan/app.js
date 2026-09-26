"use strict";

// Rig Plan - venue diagrams, cable runs, power and crew for livestream shows.
// Everything is stored in localStorage; world units are metres throughout.

// ---------- Utilities ---------------------------------------------------------

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r1 = n => Math.round(n * 10) / 10;
const r2 = n => Math.round(n * 100) / 100;
const RAD = Math.PI / 180;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const LEAD_M = 1.8;        // reach of a typical device power lead
const PARALLEL_GAP = 0.14; // visual spacing between cables that share both ends
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const SENSORS = [
  ["Full frame", 35.9], ["Super 35", 24.9], ["APS-C", 23.5], ["Micro Four Thirds", 17.3],
  ['1"', 13.2], ['2/3"', 9.6], ['1/2"', 6.4], ['1/2.8"', 5.6], ['1/3"', 4.8]
];

const SHAPE_KINDS = {
  room:    { name: "Room / walls", label: "Room",  w: 20,  h: 14 },
  stage:   { name: "Stage",        label: "Stage", w: 8,   h: 3 },
  table:   { name: "Table",        label: "Table", w: 1.8, h: 0.8 },
  round:   { name: "Round table",  label: "",      w: 1.8, h: 1.8 },
  seating: { name: "Seating block", label: "Seating", w: 6, h: 5 },
  riser:   { name: "Camera riser", label: "Riser", w: 2,   h: 2 },
  pillar:  { name: "Pillar",       label: "",      w: 0.5, h: 0.5 },
  door:    { name: "Door",         label: "Door",  w: 1.2, h: 0.2 },
  zone:    { name: "Zone",         label: "Zone",  w: 5,   h: 3 },
  label:   { name: "Text label",   label: "Label", w: 0,   h: 0 }
};

function toast(msg, ms = 2800) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), ms);
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, val) {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((o, k) => (o[k] ??= {}), obj);
  if (val === undefined) delete target[last];
  else target[last] = val;
}

// ---------- Storage -------------------------------------------------------------

const KEY_INDEX = "rigplan:index";
const KEY_LAST = "rigplan:last";
const keyProject = id => "rigplan:p:" + id;

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

function listProjects() {
  try { return JSON.parse(lsGet(KEY_INDEX)) || []; } catch (e) { return []; }
}

function saveNow() {
  project.updated = Date.now();
  const ok = lsSet(keyProject(project.id), JSON.stringify(project));
  if (!ok) {
    toast("Couldn't save - storage is full. A large background image is the usual cause; export the plan to keep it safe.", 6000);
    return;
  }
  const idx = listProjects().filter(p => p.id !== project.id);
  idx.unshift({ id: project.id, name: project.name, updated: project.updated });
  lsSet(KEY_INDEX, JSON.stringify(idx));
  lsSet(KEY_LAST, project.id);
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function loadProject(id) {
  try {
    const p = JSON.parse(lsGet(keyProject(id)));
    return p ? migrate(p) : null;
  } catch (e) { return null; }
}

// ---------- Project model ------------------------------------------------------------

function newProject(name = "Untitled show") {
  return migrate({ id: uid(), name });
}

// Fills in anything missing, so older saves and imports keep working.
function migrate(p) {
  const out = migrateFields(p);
  out.items = out.items.filter(it => CATALOG[it.type]);
  out.items.forEach(ensureItemDefaults);
  return out;
}
function migrateFields(p) {
  const region = REGIONS[p.region] ? p.region : "uk";
  return {
    v: 1,
    id: p.id || uid(),
    name: p.name || "Untitled show",
    region,
    venue: { w: 30, h: 20, ...(p.venue || {}) },
    grid: p.grid ?? 0.25,
    snap: p.snap ?? true,
    slackPct: p.slackPct ?? 10,
    dropM: p.dropM ?? 1.5,
    spares: p.spares ?? 1,
    showFov: p.showFov ?? true,
    showCableLabels: p.showCableLabels ?? true,
    showGrid: p.showGrid ?? true,
    cableView: ["focus", "all", "bundle"].includes(p.cableView) ? p.cableView : "focus",
    cableShow: { video: true, audio: true, data: true, power: true, ...(p.cableShow || {}) },
    circuits: p.circuits?.length ? p.circuits : [{ id: uid(), name: "Circuit A", amps: REGIONS[region].circuitA }],
    shapes: p.shapes || [],
    items: p.items || [],
    cables: p.cables || [],
    crew: (p.crew || []).map(c => ({ name: "", role: "", contact: "", callTime: "", hours: null, rate: null, ...c })),
    bg: p.bg || null,
    meta: { client: "", venue: "", date: "", ref: "", ...(p.meta || {}) },
    quote: { hireDays: 1, crewDays: 1, hoursPerDay: 10, discountPct: 0, includeCables: true, extras: [], locked: false, snapshot: null, ...(p.quote || {}) },
    exportOpts: { ...EXPORT_PRESETS.client, ...(p.exportOpts || {}) },
    updated: p.updated || Date.now()
  };
}

// What goes in the PDF. "client" is a branded proposal, "production" the crew pack.
const EXPORT_PRESETS = {
  client: {
    preset: "client", diagram: true, lightDiagram: true, kit: true, crew: true, crewNames: false, cameras: false,
    flow: false, network: false, cables: false, pull: false, power: false, checks: false, costs: "itemised", terms: true
  },
  production: {
    preset: "production", diagram: true, lightDiagram: true, kit: true, crew: true, crewNames: true, cameras: true,
    flow: true, network: true, cables: true, pull: true, power: true, checks: true, costs: "none", terms: false
  }
};

const def = it => CATALOG[it.type];
const itemById = id => project.items.find(i => i.id === id);
const personById = id => project.crew.find(p => p.id === id);
const itemWatts = it => it.watts ?? def(it).watts ?? 0;

function itemPorts(it) {
  const d = def(it);
  const list = [...d.ports];
  if (d.watts > 0 && !d.source && !d.ports.some(p => p.type === "power" && p.dir === "in")) {
    list.push({ id: "pwr", type: "power", dir: "in", name: "Power" });
  }
  return list;
}
const portOf = (it, pid) => itemPorts(it).find(p => p.id === pid);

function cableAt(itemId, portId) {
  return project.cables.find(c =>
    (c.from.item === itemId && c.from.port === portId) || (c.to.item === itemId && c.to.port === portId));
}
const otherEnd = (c, itemId) => (c.from.item === itemId ? c.to : c.from);

function nextLabel(short) {
  const used = new Set(project.items.map(i => i.label));
  let n = 1;
  while (used.has(`${short} ${n}`)) n++;
  return `${short} ${n}`;
}
function nextCableLabel(abbr) {
  const used = new Set(project.cables.map(c => c.label));
  let n = 1;
  while (used.has(`${abbr}-${String(n).padStart(2, "0")}`)) n++;
  return `${abbr}-${String(n).padStart(2, "0")}`;
}

function camInfo(it) {
  const d = def(it).camera;
  const p = it.props || {};
  const sw = p.sensorW ?? d.sensorW;
  const fmin = p.focalMin ?? d.focalMin;
  const fmax = p.focalMax ?? d.focalMax;
  const f = clamp(p.focal ?? fmin, fmin, fmax);
  const range = p.range ?? 10;
  const hfov = 2 * Math.atan(sw / (2 * f));
  // Frame width at distance d is d * sensorWidth / focalLength (thin-lens approximation).
  return { sw, fmin, fmax, f, range, hfov, frameW: range * sw / f, wideW: range * sw / fmin, teleW: range * sw / fmax };
}

// Kind of cable needed between two ports: same connector type, or an adapter
// cable within the analog audio family (e.g. XLR -> 3.5mm).
function cableKind(c) {
  const a = portOf(itemById(c.from.item), c.from.port);
  const b = portOf(itemById(c.to.item), c.to.port);
  return a.type === b.type ? a.type : `${a.type}>${b.type}`;
}
function kindInfo(kind) {
  if (CABLE_TYPES[kind]) return CABLE_TYPES[kind];
  const [a, b] = kind.split(">").map(k => CABLE_TYPES[k]);
  const strict = a.max <= b.max ? a : b;
  return {
    name: `${a.abbr} → ${b.abbr} adapter cable`, abbr: `${a.abbr}-${b.abbr}`, color: a.color,
    warn: Math.min(a.warn, b.warn), max: strict.max, stock: strict.stock
  };
}

function canConnect(ai, ap, bi, bp) {
  if (ai.id === bi.id) return { ok: false, reason: "Same device" };
  const used = cableAt(bi.id, bp.id);
  if (used) return { ok: false, reason: `In use → ${itemById(otherEnd(used, bi.id).item)?.label}` };
  const dirOk = ap.dir === "io" || bp.dir === "io" || ap.dir !== bp.dir;
  const A = CABLE_TYPES[ap.type], B = CABLE_TYPES[bp.type];
  if (ap.type !== bp.type) {
    if (A.family && A.family === B.family) {
      if (!dirOk) return { ok: false, reason: ap.dir === "out" ? "Both are outputs" : "Both are inputs" };
      return { ok: true, note: "adapter cable" };
    }
    const pair = [ap.type, bp.type].sort().join("+");
    if (pair === "hdmi+sdi") return { ok: false, reason: "Needs an HDMI↔SDI converter (Kit → Converters)" };
    return { ok: false, reason: `${B.abbr} ≠ ${A.abbr}` };
  }
  if (!dirOk) return { ok: false, reason: ap.dir === "out" ? "Both are outputs" : "Both are inputs" };
  return { ok: true };
}

// ---------- Geometry ---------------------------------------------------------------

function cableCtrl(c) {
  const a = itemById(c.from.item), b = itemById(c.to.item);
  return [{ x: a.x, y: a.y }, ...c.points, { x: b.x, y: b.y }];
}
// Orthogonal routing: run horizontally then vertically between control points,
// which is how cable actually gets taped down along walls and aisles.
function expand(pts, ortho) {
  if (!ortho) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1], q = pts[i];
    if (Math.abs(p.x - q.x) > 1e-6 && Math.abs(p.y - q.y) > 1e-6) out.push({ x: q.x, y: p.y });
    out.push(q);
  }
  return out;
}
const cablePath = c => expand(cableCtrl(c), c.route !== "direct");
function polyLen(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}
function pointAlong(pts, t) {
  let target = polyLen(pts) * t;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (target <= seg && seg > 0) {
      const k = target / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
    }
    target -= seg;
  }
  return pts[pts.length - 1];
}
function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
const snapV = v => (project.snap ? Math.round(v / project.grid) * project.grid : v);
const snapP = p => ({ x: snapV(p.x), y: snapV(p.y) });

function shapeContains(sh, p) {
  const c = Math.cos(-sh.rot * RAD), s = Math.sin(-sh.rot * RAD);
  const dx = p.x - sh.x, dy = p.y - sh.y;
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return Math.abs(lx) <= sh.w / 2 && Math.abs(ly) <= sh.h / 2;
}
// Smallest named shape an item sits in - used for "where is it" on reports.
function locate(it) {
  const hits = project.shapes.filter(s => !["room", "label"].includes(s.kind) && s.label && shapeContains(s, it));
  hits.sort((a, b) => a.w * a.h - b.w * b.h);
  return hits[0]?.label || "";
}

// ---------- Analysis (lengths, power, checks) ------------------------------------------

function analyse() {
  const P = project;
  const region = REGIONS[P.region];
  const A = { cable: {}, offset: {}, issues: [], strips: [], circuits: [], sources: [], fedBy: {}, unpowered: new Set() };
  const issue = (level, msg, ref) => A.issues.push({ level, msg, ref });

  // Cable lengths.
  const pairs = {};
  for (const c of P.cables) {
    const key = [c.from.item, c.to.item].sort().join("|");
    (pairs[key] ??= []).push(c.id);
  }
  for (const ids of Object.values(pairs)) {
    ids.forEach((id, i) => { A.offset[id] = (i - (ids.length - 1) / 2) * PARALLEL_GAP; });
  }

  for (const c of P.cables) {
    const kind = cableKind(c);
    const info = kindInfo(kind);
    const measured = polyLen(cablePath(c));
    const isPower = kind === "power";
    // Drops = vertical allowance at each end (floor to desk/tripod/truss). Short runs
    // are assumed to be on the same desk, so they get none unless set explicitly.
    const drops = c.drops ?? (isPower || measured < 3 ? 0 : 2);
    let planned = measured * (1 + P.slackPct / 100) + drops * P.dropM;
    if (c.lengthOverride > 0) planned = c.lengthOverride;
    let stock = info.stock.find(s => s >= planned - 1e-9) ?? null;
    let status = "ok", note = "";
    let needsCable = true;
    if (isPower && planned <= LEAD_M) {
      needsCable = false; stock = null; note = "Device lead reaches";
    } else if (planned > info.max) {
      status = "error";
      note = kind === "hdmi" ? "Too long for HDMI - use SDI, an HDMI extender, or move the kit"
        : kind === "usb" ? "Too long for USB - move the computer or use an active extension"
        : `Over the ${info.max}m practical limit for ${info.abbr}`;
      issue("error", `${c.label}: ${r1(planned)}m ${info.abbr} run. ${note}.`, { k: "cable", id: c.id });
    } else if (planned > info.warn) {
      status = "warn";
      note = `Long for ${info.abbr} - test it on site`;
      issue("warn", `${c.label}: ${r1(planned)}m is long for ${info.abbr} - test before the show.`, { k: "cable", id: c.id });
    }
    if (needsCable && stock == null && status !== "error") note = "Longer than stock - join or make up";
    A.cable[c.id] = { kind, info, measured, planned, drops, stock, status, note, needsCable };
  }

  // Power: walk downstream from every outlet.
  const loadOf = (it, seen) => {
    if (seen.has(it.id)) return 0;
    seen.add(it.id);
    let w = itemWatts(it);
    const d = def(it);
    if (d.strip || d.source) {
      for (const p of itemPorts(it)) {
        if (p.type !== "power" || p.dir !== "out") continue;
        const c = cableAt(it.id, p.id);
        if (c) w += loadOf(itemById(otherEnd(c, it.id).item), seen);
      }
    }
    return w;
  };

  for (const c of P.cables) {
    if (A.cable[c.id]?.kind !== "power") continue;
    A.fedBy[c.to.item] = c.from.item;
  }

  const circuitLoad = {};
  for (const it of P.items) {
    const d = def(it);
    if (d.source) {
      const load = loadOf(it, new Set());
      A.sources.push({ it, load });
      if (d.distroA) {
        A.circuits.push({ name: `${it.label} (${d.distroA}A distro)`, capW: d.distroA * region.volts, load, sources: [it.label] });
      } else {
        const cid = P.circuits.some(c => c.id === it.circuitId) ? it.circuitId : P.circuits[0].id;
        circuitLoad[cid] ??= { load: 0, sources: [] };
        circuitLoad[cid].load += load;
        circuitLoad[cid].sources.push(it.label);
        // Each outlet on a wall socket is limited to one plug's rating.
        for (const p of itemPorts(it)) {
          const cab = cableAt(it.id, p.id);
          if (!cab) continue;
          const down = itemById(otherEnd(cab, it.id).item);
          const w = loadOf(down, new Set());
          if (w > region.stripA * region.volts) {
            issue("error", `${it.label} ${p.name}: ${Math.round(w)}W is over one ${region.stripA}A plug (${region.stripA * region.volts}W).`, { k: "item", id: it.id });
          }
        }
      }
    }
    if (d.strip) {
      const load = loadOf(it, new Set()) - itemWatts(it);
      const capW = d.strip.ratingW ?? region.stripA * region.volts;
      const feed = A.fedBy[it.id] ? itemById(A.fedBy[it.id]) : null;
      A.strips.push({ it, load, capW, feed });
      if (load > capW) issue("error", `${it.label} is overloaded: ${Math.round(load)}W on a ${capW}W rating.`, { k: "item", id: it.id });
      else if (load > capW * 0.8) issue("warn", `${it.label} is at ${Math.round((load / capW) * 100)}% of its rating.`, { k: "item", id: it.id });
      if (load > 0 && !feed) issue("error", `${it.label} has kit plugged in but isn't plugged in itself.`, { k: "item", id: it.id });
      if (feed && def(feed).strip && !def(feed).strip.ratingW && !d.strip.ratingW) {
        issue("warn", `${it.label} is daisy-chained off ${feed.label}. Most venues ban chained strips - run it from a wall socket or distro.`, { k: "item", id: it.id });
      }
      if (d.strip.reel && load > 0) issue("info", `${it.label}: fully unwind the reel - coiled reels overheat under load.`, { k: "item", id: it.id });
    }
  }
  for (const circ of P.circuits) {
    const cl = circuitLoad[circ.id] || { load: 0, sources: [] };
    A.circuits.unshift({ name: circ.name, capW: circ.amps * region.volts, load: cl.load, sources: cl.sources, id: circ.id });
  }
  for (const c of A.circuits) {
    if (c.load > c.capW) issue("error", `${c.name} is overloaded: ${Math.round(c.load)}W of ${c.capW}W.`, null);
    else if (c.load > c.capW * 0.8) issue("warn", `${c.name} is at ${Math.round((c.load / c.capW) * 100)}% - keep circuits under 80%.`, null);
  }

  // Per-item checks.
  const hasEncoder = P.items.some(it => def(it).encoder);
  for (const it of P.items) {
    const d = def(it);
    const pw = itemPorts(it).find(p => p.type === "power" && p.dir === "in");
    if (pw && d.watts > 0 && !cableAt(it.id, pw.id)) {
      A.unpowered.add(it.id);
      issue("warn", `${it.label} isn't connected to power.`, { k: "item", id: it.id });
    }
    if (d.poe) {
      const eth = itemPorts(it).find(p => p.type === "eth");
      const c = eth && cableAt(it.id, eth.id);
      const peer = c && itemById(otherEnd(c, it.id).item);
      if (!peer || !def(peer).poeSource) {
        A.unpowered.add(it.id);
        issue("warn", `${it.label} is PoE powered - connect its Ethernet to a PoE switch.`, { k: "item", id: it.id });
      }
    }
    if (d.camera) {
      const video = itemPorts(it).some(p => (p.type === "sdi" || p.type === "hdmi" || (d.poe && p.type === "eth")) && p.dir !== "in" && cableAt(it.id, p.id));
      if (!video) issue("warn", `${it.label} has no video output connected.`, { k: "item", id: it.id });
      const ci = camInfo(it);
      if (ci.frameW > 30) issue("info", `${it.label} is framing ${r1(ci.frameW)}m wide - check the aim/zoom.`, { k: "item", id: it.id });
    }
    if (d.role && !it.operatorId) issue("warn", `No one is assigned to ${it.label} (${d.role}).`, { k: "item", id: it.id });
  }
  if (P.items.length && !hasEncoder) issue("info", "Nothing in the plan can encode the stream - add a streaming laptop, encoder or an ATEM Mini Pro.", null);

  // Crew stretched across several operated positions.
  for (const person of P.crew) {
    const posts = P.items.filter(it => it.operatorId === person.id && def(it).role);
    if (posts.length > 1) {
      issue("warn", `${person.name || "Unnamed"} is on ${posts.length} operated positions (${posts.map(i => i.label).join(", ")}).`, null);
    }
  }

  analyseNetwork(A, issue);
  analyseSignal(A, issue);

  const order = { error: 0, warn: 1, info: 2 };
  A.issues.sort((a, b) => order[a.level] - order[b.level]);
  return A;
}

// ---------- App state -----------------------------------------------------------------

let project = null;
let A = null;                 // latest analysis
let sel = null;               // { k: "item" | "shape" | "cable", id }
let mode = "select";          // "select" | "cable" | "measure" | "shape:<kind>"
let leftTab = "kit";
let view = { x: -1, y: -1, s: 30 }; // top-left corner (m) + pixels per metre
let pendingCable = null;      // { from: {item, port}, points: [] }
let cursorW = null;           // last cursor position in world coords
let drag = null;
let measure = null;
let reportTab = "checks";
let spaceDown = false;
let addOffset = 0;
const pointers = new Map();
const undoStack = [], redoStack = [];

const svg = $("#canvas");

function snapshot() {
  const { bg, ...rest } = project;
  return JSON.stringify(rest);
}
function pushUndo(snap) {
  if (!snap || snap === snapshot()) return;
  undoStack.push(snap);
  if (undoStack.length > 150) undoStack.shift();
  redoStack.length = 0;
}
function restore(snap) {
  const bg = project.bg;
  project = migrate(JSON.parse(snap));
  project.bg = bg;
  if (sel && !selectedObj()) sel = null;
  afterChange();
}
function undo() {
  if (!undoStack.length) return toast("Nothing to undo");
  redoStack.push(snapshot());
  restore(undoStack.pop());
}
function redo() {
  if (!redoStack.length) return toast("Nothing to redo");
  undoStack.push(snapshot());
  restore(redoStack.pop());
}
function mutate(fn) {
  const before = snapshot();
  fn();
  pushUndo(before);
  afterChange();
}
function afterChange() {
  renderAll();
  scheduleSave();
}

function selectedObj() {
  if (!sel) return null;
  const list = sel.k === "item" ? project.items : sel.k === "shape" ? project.shapes : project.cables;
  return list.find(o => o.id === sel.id) || null;
}
function select(k, id) {
  sel = k ? { k, id } : null;
  renderCanvas();
  renderInspector();
  if (leftTab === "cables") renderLeft();
  if (sel && isNarrow()) document.body.classList.add("show-right");
}
const isNarrow = () => window.matchMedia("(max-width: 900px)").matches;

// ---------- Mutations ------------------------------------------------------------------------

function addItem(type, x, y) {
  const d = CATALOG[type];
  const it = { id: uid(), type, x: snapV(x), y: snapV(y), rot: 0, label: nextLabel(d.short), notes: "", operatorId: null, props: {} };
  if (d.camera) {
    it.rot = -90;
    it.props = {
      sensorW: d.camera.sensorW, focalMin: d.camera.focalMin, focalMax: d.camera.focalMax,
      focal: r1(Math.min(d.camera.focalMax, d.camera.focalMin * 2)), range: 10
    };
  }
  if (d.source && !d.distroA) it.circuitId = project.circuits[0].id;
  ensureItemDefaults(it);
  mutate(() => project.items.push(it));
  select("item", it.id);
  return it;
}

function addShape(kind, x, y, w, h) {
  const k = SHAPE_KINDS[kind];
  const sh = { id: uid(), kind, x, y, w: w ?? k.w, h: h ?? k.h, rot: 0, label: k.label, locked: false };
  if (kind === "round") sh.h = sh.w;
  mutate(() => project.shapes.push(sh));
  select("shape", sh.id);
  return sh;
}

function connect(fromItem, fromPort, toItem, toPort, points = []) {
  // Normalise so "from" is the source end.
  let a = { item: fromItem.id, port: fromPort.id }, b = { item: toItem.id, port: toPort.id };
  let pts = points;
  if (fromPort.dir === "in" || (fromPort.dir === "io" && toPort.dir === "out")) {
    [a, b] = [b, a];
    pts = [...points].reverse();
  }
  const kind = fromPort.type === toPort.type ? fromPort.type : `${portOf(itemById(a.item), a.port).type}>${portOf(itemById(b.item), b.port).type}`;
  const c = { id: uid(), from: a, to: b, points: pts, route: "ortho", label: nextCableLabel(kindInfo(kind).abbr), notes: "", drops: null, lengthOverride: null };
  mutate(() => project.cables.push(c));
  return c;
}

function deleteSelected() {
  const obj = selectedObj();
  if (!obj) return;
  mutate(() => {
    if (sel.k === "item") {
      project.items = project.items.filter(i => i !== obj);
      project.cables = project.cables.filter(c => c.from.item !== obj.id && c.to.item !== obj.id);
    } else if (sel.k === "shape") {
      project.shapes = project.shapes.filter(s => s !== obj);
    } else {
      project.cables = project.cables.filter(c => c !== obj);
    }
  });
  select(null);
}

function duplicateSelected() {
  const obj = selectedObj();
  if (!obj || sel.k === "cable") return;
  const copy = JSON.parse(JSON.stringify(obj));
  copy.id = uid();
  copy.x += 1; copy.y += 1;
  mutate(() => {
    if (sel.k === "item") {
      copy.label = nextLabel(def(copy).short);
      copy.operatorId = null;
      project.items.push(copy);
    } else project.shapes.push(copy);
  });
  select(sel.k, copy.id);
}

// ---------- Rendering: canvas -------------------------------------------------------------

function worldFromClient(cx, cy) {
  const r = svg.getBoundingClientRect();
  return { x: view.x + (cx - r.left) / view.s, y: view.y + (cy - r.top) / view.s };
}

function fitView() {
  const r = svg.getBoundingClientRect();
  if (!r.width) return;
  const { w, h } = project.venue;
  // Leave room for the cable legend in the top-left corner when it's open.
  const left = legendOpen && r.width > 700 ? 230 : 0;
  const s = Math.min((r.width - left) / (w + 2), r.height / (h + 2));
  view.s = clamp(s, 2, 400);
  view.x = w / 2 - (r.width + left) / view.s / 2;
  view.y = h / 2 - r.height / view.s / 2;
  renderCanvas();
}

function zoomAt(factor, cx, cy) {
  const before = worldFromClient(cx, cy);
  view.s = clamp(view.s * factor, 2, 400);
  const r = svg.getBoundingClientRect();
  view.x = before.x - (cx - r.left) / view.s;
  view.y = before.y - (cy - r.top) / view.s;
  renderCanvas();
}

function renderBg() {
  const bg = project.bg;
  $("#L-bg").innerHTML = bg
    ? `<image href="${bg.data}" x="${bg.x || 0}" y="${bg.y || 0}" width="${bg.w}" height="${bg.w * bg.aspect}" opacity="${bg.opacity}" preserveAspectRatio="none"></image>`
    : "";
}

// Builds every layer's markup. `s` is pixels-per-metre, which sets text size.
function buildScene(s, opts = {}) {
  const P = project;
  const fs = Math.max(0.24, 11 / s);
  const halo = `stroke-width="${r2(fs * 0.25)}"`; // text outline, in metres like everything else
  const out = { grid: "", shapes: "", fov: "", cables: "", items: "", over: "" };
  const { w, h } = P.venue;

  // Grid
  out.grid += `<rect class="venue" x="0" y="0" width="${w}" height="${h}"></rect>`;
  if (P.showGrid) {
    const step = s < 8 ? 5 : 1;
    for (let x = 0; x <= w + 1e-6; x += step) out.grid += `<line class="${x % 5 === 0 ? "gmaj" : "gmin"}" x1="${x}" y1="0" x2="${x}" y2="${h}"></line>`;
    for (let y = 0; y <= h + 1e-6; y += step) out.grid += `<line class="${y % 5 === 0 ? "gmaj" : "gmin"}" x1="0" y1="${y}" x2="${w}" y2="${y}"></line>`;
    for (let x = 5; x < w; x += 5) out.grid += `<text class="gtxt" x="${x}" y="${-fs * 0.4}" font-size="${fs * 0.8}">${x}m</text>`;
    for (let y = 5; y < h; y += 5) out.grid += `<text class="gtxt" x="${-fs * 0.3}" y="${y}" font-size="${fs * 0.8}" text-anchor="end" dominant-baseline="middle">${y}m</text>`;
  }

  // Shapes
  for (const sh of P.shapes) {
    const isSel = !opts.print && sel?.k === "shape" && sel.id === sh.id;
    const cls = `shape sh-${sh.kind}${isSel ? " sel" : ""}${sh.locked ? " locked" : ""}`;
    let body;
    if (sh.kind === "label") {
      body = `<text class="sh-text" font-size="${sh.size || fs * 1.3}" text-anchor="middle" dominant-baseline="middle">${esc(sh.label)}</text>`;
    } else if (sh.kind === "round") {
      body = `<ellipse rx="${sh.w / 2}" ry="${sh.h / 2}"></ellipse>`;
    } else {
      body = `<rect x="${-sh.w / 2}" y="${-sh.h / 2}" width="${sh.w}" height="${sh.h}"></rect>`;
      if (sh.kind === "room" || sh.kind === "zone") {
        body += `<rect class="hit-edge" x="${-sh.w / 2}" y="${-sh.h / 2}" width="${sh.w}" height="${sh.h}"></rect>`;
      }
    }
    const lbl = sh.kind !== "label" && sh.label
      ? sh.kind === "room" || sh.kind === "zone"
        ? `<text class="sh-lbl corner" x="${sh.x - sh.w / 2 + fs * 0.4}" y="${sh.y - sh.h / 2 + fs * 1.1}" font-size="${fs}">${esc(sh.label)}</text>`
        : `<text class="sh-lbl" x="${sh.x}" y="${sh.y}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle">${esc(sh.label)}</text>`
      : "";
    out.shapes += `<g class="${cls}" data-k="shape" data-id="${sh.id}"><g transform="translate(${sh.x} ${sh.y}) rotate(${sh.rot})">${body}</g>${lbl}</g>`;
  }

  // Camera fields of view
  if (P.showFov) {
    for (const it of P.items) {
      if (!def(it).camera) continue;
      const ci = camInfo(it);
      const a = ci.hfov / 2, r = ci.range;
      const x1 = r * Math.cos(-a), y1 = r * Math.sin(-a), x2 = r * Math.cos(a), y2 = r * Math.sin(a);
      const tip = { x: it.x + r * Math.cos(it.rot * RAD), y: it.y + r * Math.sin(it.rot * RAD) };
      out.fov += `<g class="fov-g"><g transform="translate(${it.x} ${it.y}) rotate(${it.rot})">
        <path class="fov" d="M0 0 L${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2} Z"></path>
        <line class="fov-axis" x1="0" y1="0" x2="${r}" y2="0"></line></g>
        ${sel?.k === "item" && sel.id === it.id && !opts.print ? `<text class="fov-txt" ${halo} x="${tip.x}" y="${tip.y - fs * 0.9}" font-size="${fs * 0.9}" text-anchor="middle">${r1(ci.hfov / RAD)}° · ${r1(ci.frameW)}m wide @ ${r1(ci.range)}m</text>` : ""}</g>`;
    }
  }

  // Cables
  out.cables = buildCables(opts, fs, halo);

  // Items
  for (const it of P.items) {
    const d = def(it);
    const color = CAT[d.cat].color;
    const isSel = !opts.print && sel?.k === "item" && sel.id === it.id;
    const isPending = pendingCable?.from.item === it.id;
    const body = itemIcon(it);
    const person = it.operatorId && personById(it.operatorId);
    const warn = !opts.print && A.unpowered.has(it.id) ? `<circle class="warn-dot" cx="0.34" cy="-0.3" r="0.09"></circle>` : "";
    out.items += `<g class="item${isSel ? " sel" : ""}${isPending ? " pending" : ""}" data-k="item" data-id="${it.id}" transform="translate(${it.x} ${it.y})">
      <circle class="sel-ring" r="0.55"></circle>
      <g transform="rotate(${it.rot})">${body}</g>${warn}
      <text class="i-lbl" ${halo} y="${0.35 + fs * 0.9}" font-size="${fs}" text-anchor="middle">${esc(it.label)}</text>
      ${person ? `<text class="i-op" ${halo} y="${0.35 + fs * 1.9}" font-size="${fs * 0.8}" text-anchor="middle">${esc(person.name)}</text>` : ""}</g>`;
  }

  if (opts.print) return out;

  // Overlay: handles and in-progress interactions
  const hr = Math.max(0.12, 6 / s);
  const obj = selectedObj();
  if (obj && sel.k === "shape" && obj.kind !== "label") {
    const c = Math.cos(obj.rot * RAD), sn = Math.sin(obj.rot * RAD);
    const hx = obj.x + (obj.w / 2) * c - (obj.h / 2) * sn, hy = obj.y + (obj.w / 2) * sn + (obj.h / 2) * c;
    out.over += `<rect class="handle" data-k="resize" x="${hx - hr}" y="${hy - hr}" width="${hr * 2}" height="${hr * 2}"></rect>`;
  }
  if (obj && sel.k === "item" && def(obj).camera && P.showFov) {
    const ci = camInfo(obj);
    const tx = obj.x + ci.range * Math.cos(obj.rot * RAD), ty = obj.y + ci.range * Math.sin(obj.rot * RAD);
    out.over += `<circle class="handle aim" data-k="aim" cx="${tx}" cy="${ty}" r="${hr * 1.3}"></circle>`;
  }
  if (obj && sel.k === "cable") {
    obj.points.forEach((p, i) => {
      out.over += `<circle class="handle wp" data-k="wp" data-i="${i}" cx="${p.x}" cy="${p.y}" r="${hr}"></circle>`;
    });
  }
  if (pendingCable && cursorW) {
    const a = itemById(pendingCable.from.item);
    const pts = [{ x: a.x, y: a.y }, ...pendingCable.points, cursorW];
    const port = portOf(a, pendingCable.from.port);
    const d = "M" + expand(pts, true).map(p => `${p.x} ${p.y}`).join(" L");
    out.over += `<path class="c-preview" d="${d}" stroke="${CABLE_TYPES[port.type].color}"></path>`;
    const len = polyLen(expand(pts, true));
    out.over += `<text class="m-txt" ${halo} x="${cursorW.x + fs * 0.6}" y="${cursorW.y - fs * 0.6}" font-size="${fs}">${r1(len)}m</text>`;
  }
  if (drag?.type === "create" && drag.kind) {
    const x = Math.min(drag.a.x, drag.b.x), y = Math.min(drag.a.y, drag.b.y);
    out.over += `<rect class="create-box" x="${x}" y="${y}" width="${Math.abs(drag.b.x - drag.a.x)}" height="${Math.abs(drag.b.y - drag.a.y)}"></rect>`;
  }
  if (measure) {
    const { a, b } = measure;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    out.over += `<line class="m-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>
      <circle class="m-end" cx="${a.x}" cy="${a.y}" r="${hr * 0.7}"></circle><circle class="m-end" cx="${b.x}" cy="${b.y}" r="${hr * 0.7}"></circle>
      <text class="m-txt" ${halo} x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - fs * 0.5}" font-size="${fs * 1.1}" text-anchor="middle">${r2(len)}m</text>`;
  }
  return out;
}

function renderCanvas() {
  A = analyse();
  const r = svg.getBoundingClientRect();
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${Math.max(1, r.width) / view.s} ${Math.max(1, r.height) / view.s}`);
  const sc = buildScene(view.s);
  $("#L-grid").innerHTML = sc.grid;
  $("#L-shapes").innerHTML = sc.shapes;
  $("#L-fov").innerHTML = sc.fov;
  $("#L-cables").innerHTML = sc.cables;
  $("#L-items").innerHTML = sc.items;
  $("#L-over").innerHTML = sc.over;
  svg.dataset.mode = mode.startsWith("shape:") ? "shape" : mode;
  renderLegend();
  renderTopbar();
  renderHint();
}

function renderOverlayOnly() {
  const sc = buildScene(view.s);
  $("#L-over").innerHTML = sc.over;
}

function renderTopbar() {
  $$(".mode-btn").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
  const errors = A.issues.filter(i => i.level === "error").length;
  const warns = A.issues.filter(i => i.level === "warn").length;
  const btn = $("#checksBtn");
  btn.className = "chip-btn " + (errors ? "bad" : warns ? "warn" : "good");
  btn.textContent = errors || warns ? `⚠ ${errors ? errors + " error" + (errors > 1 ? "s" : "") : ""}${errors && warns ? " · " : ""}${warns ? warns + " warning" + (warns > 1 ? "s" : "") : ""}` : "✓ Checks";
  const nm = $("#projName");
  if (document.activeElement !== nm) nm.value = project.name;
}

function renderHint() {
  let t = "";
  if (mode === "cable") {
    t = pendingCable
      ? `From ${itemById(pendingCable.from.item).label} · ${portOf(itemById(pendingCable.from.item), pendingCable.from.port).name} - click the floor to add bends, click a device to finish. Backspace removes a bend, Esc cancels.`
      : "Cable: click the device the cable starts at.";
  } else if (mode === "measure") {
    t = measure ? `${r2(Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y))}m - drag again to re-measure.` : "Measure: drag between two points.";
  } else if (mode.startsWith("shape:")) {
    const k = mode.slice(6);
    t = k === "label" ? "Click to place a label." : `Drag to draw a ${SHAPE_KINDS[k].name.toLowerCase()}, or click for the default size. Esc to stop.`;
  } else if (!project.items.length && !project.shapes.length) {
    t = "Start with Venue → draw the room, or Projects → Load example.";
  }
  const h = $("#hint");
  h.textContent = t;
  h.classList.toggle("hidden", !t);
}

// ---------- Rendering: panels -------------------------------------------------------------

function renderAll() {
  renderCanvas();
  if (!$("#inspector").contains(document.activeElement)) renderInspector();
  if (!$("#leftBody").contains(document.activeElement) || leftTab !== "crew") renderLeft();
}

// Field builders. data-f = property path on the target object, data-t = parser.
function fNum(label, path, val, o = {}) {
  return `<label class="f"><span>${label}</span><div class="f-in"><input type="number" data-f="${path}" data-t="${o.t || "num"}" value="${val ?? ""}" step="${o.step ?? 0.1}"${o.min != null ? ` min="${o.min}"` : ""}${o.max != null ? ` max="${o.max}"` : ""}${o.ph ? ` placeholder="${o.ph}"` : ""}>${o.unit ? `<em>${o.unit}</em>` : ""}</div></label>`;
}
function fText(label, path, val, ph = "") {
  return `<label class="f"><span>${label}</span><input type="text" data-f="${path}" data-t="text" value="${esc(val)}" placeholder="${esc(ph)}"></label>`;
}
function fArea(label, path, val, ph = "") {
  return `<label class="f"><span>${label}</span><textarea data-f="${path}" data-t="text" rows="2" placeholder="${esc(ph)}">${esc(val)}</textarea></label>`;
}
function fSel(label, path, val, options, t = "text") {
  return `<label class="f"><span>${label}</span><select data-f="${path}" data-t="${t}">${options.map(([v, txt]) =>
    `<option value="${esc(v)}"${String(v) === String(val ?? "") ? " selected" : ""}>${esc(txt)}</option>`).join("")}</select></label>`;
}
function fCheck(label, path, val) {
  return `<label class="f check"><input type="checkbox" data-f="${path}" data-t="bool"${val ? " checked" : ""}><span>${label}</span></label>`;
}
function fRange(path, val, min, max, step) {
  return `<input type="range" class="range" data-f="${path}" data-t="num" value="${val}" min="${min}" max="${max}" step="${step}">`;
}
const portChip = type => `<span class="pchip" style="--c:${CABLE_TYPES[type].color}">${CABLE_TYPES[type].abbr}</span>`;
const levelIcon = l => (l === "error" ? "⛔" : l === "warn" ? "⚠️" : "ℹ️");

function renderInspector() {
  const el = $("#inspector");
  const obj = selectedObj();
  if (!obj) { el.innerHTML = inspectPlan(); return; }
  el.innerHTML = sel.k === "item" ? inspectItem(obj) : sel.k === "shape" ? inspectShape(obj) : inspectCable(obj);
  updateDerived();
}

function inspectPlan() {
  const P = project;
  const region = REGIONS[P.region];
  const top = A.issues.slice(0, 6);
  return `<div data-scope="project">
    <h3>Plan</h3>
    <p class="muted">${P.items.length} devices · ${P.cables.length} cables · ${P.crew.length} crew</p>
    <div class="readout"><div><b>${money(computeQuote().total)}</b><button class="link small" data-act="reports" data-tab="costing">quote total →</button></div>
      <div><b>${r1(A.net.encoders.reduce((t, e) => t + e.mbps, 0))}Mbps</b><button class="link small" data-act="reports" data-tab="network">stream upload →</button></div></div>
    ${top.length ? `<ul class="issues compact">${top.map(issueLi).join("")}</ul>
      ${A.issues.length > top.length ? `<button class="link" data-act="reports" data-tab="checks">All ${A.issues.length} checks →</button>` : ""}`
      : P.items.length ? `<p class="good-note">✓ No problems found.</p>` : ""}
    <h4>Show details</h4>
    <div class="row2">${fText("Client", "meta.client", P.meta.client)}${fText("Date(s)", "meta.date", P.meta.date)}</div>
    <div class="row2">${fText("Venue", "meta.venue", P.meta.venue)}${fText("Job ref", "meta.ref", P.meta.ref)}</div>
    <h4>Cable allowances</h4>
    ${fNum("Slack", "slackPct", P.slackPct, { step: 1, min: 0, unit: "%" })}
    ${fNum("Rise/drop per end", "dropM", P.dropM, { step: 0.5, min: 0, unit: "m" })}
    ${fNum("Spares per cable type", "spares", P.spares, { step: 1, min: 0 })}
    <p class="muted small">Planned length = routed length + slack + a drop at each end (floor to desk or tripod). Runs under 3m are treated as same-desk and get no drops.</p>
    <h4>Power</h4>
    ${fSel("Mains", "region", P.region, Object.entries(REGIONS).map(([k, r]) => [k, r.name]))}
    <div class="circuits">
      ${P.circuits.map((c, i) => {
        const info = A.circuits.find(x => x.id === c.id);
        const pct = info ? Math.round((info.load / info.capW) * 100) : 0;
        return `<div class="circ-row">
          <input type="text" data-f="circuits.${i}.name" data-t="text" value="${esc(c.name)}" aria-label="Circuit name">
          <input type="number" data-f="circuits.${i}.amps" data-t="num" value="${c.amps}" min="1" step="1" aria-label="Breaker amps"><em>A</em>
          <span class="meter ${pct > 100 ? "bad" : pct > 80 ? "warn" : ""}" title="${info ? Math.round(info.load) : 0}W of ${c.amps * region.volts}W"><i style="width:${Math.min(100, pct)}%"></i></span>
          ${P.circuits.length > 1 ? `<button class="icon-btn sm" data-act="del-circuit" data-id="${c.id}" title="Remove circuit">✕</button>` : ""}
        </div>`;
      }).join("")}
      <button class="btn sm" data-act="add-circuit">+ Circuit</button>
    </div>
    <p class="muted small">Ask the venue which sockets share a breaker, then set each wall socket's circuit.</p>
    <h4>Shortcuts</h4>
    <p class="muted small">V select · C cable · M measure · Del delete · Ctrl+D duplicate · R / Shift+R rotate · arrows nudge · Esc cancel · Space+drag or right-drag to pan · scroll to zoom</p>
  </div>`;
}

function issueLi(i) {
  const ref = i.ref ? ` data-act="goto" data-k="${i.ref.k}" data-id="${i.ref.id}"` : "";
  return `<li class="lvl-${i.level}"${ref}><span>${levelIcon(i.level)}</span><span>${esc(i.msg)}</span></li>`;
}

function inspectItem(it) {
  const d = def(it);
  const P = project;
  let h = `<div class="insp-head"><span class="cat-dot" style="--c:${CAT[d.cat].color}"></span><div>
    <input class="title-in" type="text" data-f="label" data-t="text" value="${esc(it.label)}" aria-label="Label">
    <p class="muted small">${esc(d.name)}</p></div></div>`;
  if (d.note) h += `<p class="note">${esc(d.note)}</p>`;

  const crewOpts = [["", d.role ? `- unassigned -` : "- none -"], ...P.crew.map(p => [p.id, `${p.name || "Unnamed"}${p.role ? " (" + p.role + ")" : ""}`])];
  h += `<h4>${d.role ? "Operator" : "Assigned to"}</h4>`;
  h += P.crew.length ? fSel(d.role ? `Needs: ${d.role}` : "Person", "operatorId", it.operatorId || "", crewOpts, "strOrNull")
    : `<p class="muted small">Add people in the Crew tab to assign them.</p>`;

  if (d.camera) {
    const ci = camInfo(it);
    h += `<h4>Lens &amp; field of view</h4>`;
    if (d.camera.lens === "interchangeable") {
      const sensors = SENSORS.some(([, w]) => w === ci.sw) ? SENSORS : [...SENSORS, [`Custom`, ci.sw]];
      h += fSel("Sensor", "props.sensorW", ci.sw, sensors.map(([n, w]) => [w, `${n} (${w}mm)`]), "num");
      h += `<div class="row2">${fNum("Lens min", "props.focalMin", ci.fmin, { unit: "mm", min: 1 })}${fNum("Lens max", "props.focalMax", ci.fmax, { unit: "mm", min: 1 })}</div>`;
    } else {
      h += `<p class="muted small">Fixed zoom ${ci.fmin}–${ci.fmax}mm on a ${ci.sw}mm-wide sensor.</p>`;
    }
    h += `<label class="f"><span>Focal length</span><div class="f-in"><input type="number" data-f="props.focal" data-t="num" value="${r1(ci.f)}" step="0.1" min="${ci.fmin}" max="${ci.fmax}"><em>mm</em></div></label>
      ${fRange("props.focal", r1(ci.f), ci.fmin, ci.fmax, 0.1)}
      <div class="row2">${fNum("Subject distance", "props.range", ci.range, { unit: "m", min: 0.5, step: 0.5 })}${fNum("Aim", "rot", Math.round(it.rot), { unit: "°", step: 5 })}</div>
      <div class="readout" data-d="cam"></div>
      <div class="shots"><span class="muted small">Frame for:</span>
        <button class="btn sm" data-act="shot" data-w="0.5" title="Head &amp; shoulders ≈ 0.5m wide">Close-up</button>
        <button class="btn sm" data-act="shot" data-w="1.2" title="Waist up ≈ 1.2m wide">Mid</button>
        <button class="btn sm" data-act="shot" data-w="2.5" title="Full body ≈ 2.5m wide">Full</button>
        <button class="btn sm" data-act="shot" data-w="wide" title="Widest the lens goes">Widest</button>
      </div>
      <p class="muted small">Drag the round handle on the diagram to aim and set distance.</p>`;
  } else {
    h += `<h4>Position</h4>`;
  }
  h += `<div class="row3">${fNum("X", "x", r2(it.x), { unit: "m" })}${fNum("Y", "y", r2(it.y), { unit: "m" })}${d.camera ? "" : fNum("Rotate", "rot", Math.round(it.rot), { unit: "°", step: 15 })}</div>`;
  h += inspectStream(it);

  // Power
  if (d.watts > 0 || d.source || d.strip || d.poe) {
    h += `<h4>Power</h4>`;
    if (d.watts > 0) h += fNum("Draw", "watts", itemWatts(it), { unit: "W", step: 1, min: 0 });
    if (d.source && !d.distroA) h += fSel("Circuit", "circuitId", it.circuitId, P.circuits.map(c => [c.id, `${c.name} (${c.amps}A)`]));
    h += `<div class="readout" data-d="power"></div>`;
  }

  // Ports
  h += `<h4>Connections</h4><ul class="ports">`;
  for (const p of itemPorts(it)) {
    const c = cableAt(it.id, p.id);
    const other = c && otherEnd(c, it.id);
    const oi = other && itemById(other.item);
    h += `<li>${portChip(p.type)}<span class="pname">${esc(p.name)}<em>${p.dir === "in" ? "in" : p.dir === "out" ? "out" : ""}</em></span>`;
    h += c
      ? `<button class="link" data-act="goto" data-k="cable" data-id="${c.id}">${esc(c.label)}</button><span class="arrow">→</span><button class="link" data-act="goto" data-k="item" data-id="${oi.id}">${esc(oi.label)}</button><button class="icon-btn sm" data-act="disconnect" data-id="${c.id}" title="Remove cable">✕</button>`
      : `<button class="btn sm" data-act="connect" data-port="${p.id}">Connect</button>`;
    h += `</li>`;
  }
  h += `</ul>`;
  h += fArea("Notes", "notes", it.notes, "e.g. needs 20m BNC + tripod dolly");
  h += `<div class="insp-actions"><button class="btn" data-act="duplicate">Duplicate</button><button class="btn danger" data-act="delete">Delete</button></div>`;
  return h;
}

function inspectShape(sh) {
  const kinds = Object.entries(SHAPE_KINDS).filter(([k]) => k !== "label").map(([k, v]) => [k, v.name]);
  let h = `<h3>${esc(SHAPE_KINDS[sh.kind].name)}</h3>`;
  h += fText("Label", "label", sh.label, "Shown on the plan and in reports");
  if (sh.kind === "label") {
    h += fNum("Text size", "size", sh.size ?? "", { unit: "m", step: 0.1, min: 0.1, t: "numOrNull", ph: "auto" });
    h += `<div class="row2">${fNum("X", "x", r2(sh.x), { unit: "m" })}${fNum("Y", "y", r2(sh.y), { unit: "m" })}</div>`;
  } else {
    h += fSel("Type", "kind", sh.kind, kinds);
    h += `<div class="row2">${fNum("Width", "w", r2(sh.w), { unit: "m", min: 0.1 })}${fNum("Depth", "h", r2(sh.h), { unit: "m", min: 0.1 })}</div>`;
    h += `<div class="row3">${fNum("Centre X", "x", r2(sh.x), { unit: "m" })}${fNum("Centre Y", "y", r2(sh.y), { unit: "m" })}${fNum("Rotate", "rot", sh.rot, { unit: "°", step: 15 })}</div>`;
    h += fCheck("Lock position (stops accidental drags)", "locked", sh.locked);
    h += `<p class="muted small">Drag the square handle to resize.</p>`;
  }
  h += `<div class="insp-actions"><button class="btn" data-act="duplicate">Duplicate</button><button class="btn danger" data-act="delete">Delete</button></div>`;
  return h;
}

function inspectCable(c) {
  const info = A.cable[c.id];
  const a = itemById(c.from.item), b = itemById(c.to.item);
  const pa = portOf(a, c.from.port), pb = portOf(b, c.to.port);
  let h = `<div class="insp-head"><span class="cat-dot" style="--c:${info.info.color}"></span><div>
    <input class="title-in" type="text" data-f="label" data-t="text" value="${esc(c.label)}" aria-label="Cable label">
    <p class="muted small">${esc(info.info.name)}</p></div></div>`;
  h += `<div class="route">
    <button class="link" data-act="goto" data-k="item" data-id="${a.id}">${esc(a.label)}</button> <span class="muted">${esc(pa.name)}</span>
    <div class="arrow-down">↓</div>
    <button class="link" data-act="goto" data-k="item" data-id="${b.id}">${esc(b.label)}</button> <span class="muted">${esc(pb.name)}</span></div>`;
  h += `<div class="readout" data-d="cable"></div>`;
  h += fSel("Routing", "route", c.route || "ortho", [["ortho", "Along walls (right angles)"], ["direct", "Direct (straight lines)"]]);
  h += fSel("Rise/drop allowance", "drops", c.drops ?? "", [["", "Auto"], ["0", "None (same desk)"], ["1", "One end"], ["2", "Both ends"]], "numOrNull");
  h += fNum("Length override", "lengthOverride", c.lengthOverride ?? "", { unit: "m", min: 0, step: 1, t: "numOrNull", ph: "auto" });
  h += `<p class="muted small">Click the cable's route to select it. Double-click the cable to add a bend, drag bends to route around things, double-click a bend to remove it.</p>`;
  if (c.points.length) h += `<button class="btn sm" data-act="clear-wp">Remove ${c.points.length} bend${c.points.length > 1 ? "s" : ""}</button>`;
  h += fArea("Notes", "notes", c.notes, "e.g. tape across fire exit - use ramp");
  h += `<div class="insp-actions"><button class="btn danger" data-act="delete">Delete cable</button></div>`;
  return h;
}

// Live readouts inside the inspector, refreshed without rebuilding the inputs.
function updateDerived() {
  const obj = selectedObj();
  const cam = $('[data-d="cam"]');
  if (cam && obj) {
    const ci = camInfo(obj);
    cam.innerHTML = `<div><b>${r1(ci.hfov / RAD)}°</b><span>horizontal FOV</span></div>
      <div><b>${r1(ci.frameW)} × ${r1((ci.frameW * 9) / 16)}m</b><span>frame at ${r1(ci.range)}m</span></div>
      <div><b>${r1(ci.wideW)}m → ${r2(ci.teleW)}m</b><span>widest → tightest here</span></div>`;
  }
  const pw = $('[data-d="power"]');
  if (pw && obj) {
    const d = def(obj);
    const region = REGIONS[project.region];
    const lines = [];
    if (d.source) {
      const s = A.sources.find(x => x.it.id === obj.id);
      lines.push(`<div><b>${Math.round(s?.load || 0)}W</b><span>drawn from here (${r1((s?.load || 0) / region.volts)}A)</span></div>`);
    }
    if (d.strip) {
      const s = A.strips.find(x => x.it.id === obj.id);
      lines.push(`<div><b>${Math.round(s.load)}W / ${s.capW}W</b><span>load on this ${d.strip.ratingW ? "unit" : "strip"}</span></div>`);
    }
    if (d.watts > 0 || d.strip) {
      const feed = A.fedBy[obj.id] && itemById(A.fedBy[obj.id]);
      lines.push(`<div><b>${feed ? esc(feed.label) : "Not plugged in"}</b><span>fed from</span></div>`);
    }
    if (d.poe) {
      const eth = itemPorts(obj).find(p => p.type === "eth");
      const c = cableAt(obj.id, eth.id);
      const peer = c && itemById(otherEnd(c, obj.id).item);
      lines.push(`<div><b>${peer && def(peer).poeSource ? esc(peer.label) : "No PoE source"}</b><span>powered over Ethernet</span></div>`);
    }
    pw.innerHTML = lines.join("");
  }
  const cab = $('[data-d="cable"]');
  if (cab && obj && A.cable[obj.id]) {
    const i = A.cable[obj.id];
    cab.innerHTML = `<div><b>${r1(i.measured)}m</b><span>routed on plan</span></div>
      <div><b>${r1(i.planned)}m</b><span>planned (slack${i.drops ? ` + ${i.drops} drop${i.drops > 1 ? "s" : ""}` : ""})</span></div>
      <div><b>${!i.needsCable ? "-" : i.stock ? i.stock + "m" : "custom"}</b><span>${!i.needsCable ? "device lead reaches" : "pull from stock"}</span></div>
      ${i.kind === "eth" ? `<div><b>${Math.round(A.net.link[obj.id] || 0)}Mbps</b><span>network traffic (${Math.round(((A.net.link[obj.id] || 0) / LINK_MBPS) * 100)}% of 1Gb)</span></div>` : ""}
      ${i.note ? `<p class="st-${i.status}">${esc(i.note)}</p>` : ""}`;
  }
}

function renderLeft() {
  $$(".tabs .tab").forEach(t => t.classList.toggle("on", t.dataset.tab === leftTab));
  const body = $("#leftBody");
  if (leftTab === "venue") body.innerHTML = renderVenueTab();
  else if (leftTab === "kit") {
    const q = $("#kitSearch")?.value || "";
    body.innerHTML = renderKitTab(q);
    const inp = $("#kitSearch");
    if (q) { inp.focus(); inp.setSelectionRange(q.length, q.length); }
  } else if (leftTab === "cables") {
    const q = $("#cableSearch")?.value || "";
    const focused = document.activeElement?.id === "cableSearch";
    const scroll = body.scrollTop;
    body.innerHTML = renderCablesTab(q);
    body.scrollTop = scroll;
    const inp = $("#cableSearch");
    if (focused) { inp.focus(); inp.setSelectionRange(q.length, q.length); }
  } else body.innerHTML = renderCrewTab();
}

function renderVenueTab() {
  const P = project;
  const tools = Object.entries(SHAPE_KINDS).map(([k, v]) =>
    `<button class="tool${mode === "shape:" + k ? " on" : ""}" data-act="mode" data-mode="shape:${k}"><i class="sw sw-${k}"></i>${v.name}</button>`).join("");
  return `<div data-scope="project">
    <p class="muted small">Pick a tool, then drag on the plan. Tip: trace over a venue floor plan image.</p>
    <div class="tools">${tools}</div>
    <h4>Venue size</h4>
    <div class="row2">${fNum("Width", "venue.w", P.venue.w, { unit: "m", min: 2, step: 1 })}${fNum("Depth", "venue.h", P.venue.h, { unit: "m", min: 2, step: 1 })}</div>
    <div class="row2">${fSel("Snap", "grid", P.snap ? P.grid : 0, [[0, "Off"], [0.1, "10cm"], [0.25, "25cm"], [0.5, "50cm"], [1, "1m"]], "grid")}</div>
    <h4>Floor plan image</h4>
    ${P.bg ? `${fNum("Real width of image", "bg.w", P.bg.w, { unit: "m", min: 1, step: 0.5 })}
      <div class="row2">${fNum("Offset X", "bg.x", P.bg.x || 0, { unit: "m", step: 0.5 })}${fNum("Offset Y", "bg.y", P.bg.y || 0, { unit: "m", step: 0.5 })}</div>
      <label class="f"><span>Opacity</span>${fRange("bg.opacity", P.bg.opacity, 0.05, 1, 0.05)}</label>
      <p class="muted small">Calibrate: measure a known wall with the Measure tool and adjust the width until it matches.</p>
      <div class="insp-actions"><button class="btn sm" data-act="bg-upload">Replace</button><button class="btn sm danger" data-act="bg-clear">Remove</button></div>`
      : `<button class="btn" data-act="bg-upload">Add plan image…</button>`}
    <h4>Show</h4>
    ${fCheck("Camera fields of view", "showFov", P.showFov)}
    ${fCheck("Cable labels", "showCableLabels", P.showCableLabels)}
    ${fCheck("Grid", "showGrid", P.showGrid)}
  </div>`;
}

function renderKitTab(q) {
  const needle = q.trim().toLowerCase();
  let h = `<input type="search" id="kitSearch" class="search" placeholder="Search kit…" value="${esc(q)}">
    <p class="muted small">Drag onto the plan, or click to drop it in the middle.</p>`;
  for (const cat of CATEGORIES) {
    const entries = Object.entries(CATALOG).filter(([k, d]) => d.cat === cat.id && (!needle || d.name.toLowerCase().includes(needle) || cat.name.toLowerCase().includes(needle)));
    if (!entries.length) continue;
    h += `<h4 class="cat-h"><span class="cat-dot" style="--c:${cat.color}"></span>${cat.name}</h4><ul class="kit">`;
    for (const [k, d] of entries) {
      const counts = {};
      d.ports.forEach(p => { if (p.type !== "power") counts[p.type] = (counts[p.type] || 0) + 1; });
      const summary = Object.entries(counts).map(([t, n]) => `${CABLE_TYPES[t].abbr}${n > 1 ? "×" + n : ""}`).join(" ");
      const n = project.items.filter(i => i.type === k).length;
      h += `<li draggable="true" data-act="add-item" data-type="${k}"><div><b>${esc(d.name)}</b><span class="muted small">${summary}${d.watts ? " · " + d.watts + "W" : ""}${d.strip ? ` · ${d.strip.outlets} outlets` : ""}</span></div>${n ? `<span class="count">${n}</span>` : ""}</li>`;
    }
    h += `</ul>`;
  }
  return h;
}

function renderCrewTab() {
  const P = project;
  const operated = P.items.filter(it => def(it).role);
  let h = `<p class="muted small">Add your team, then assign them to positions here or from a device's details.</p>
    <button class="btn" data-act="add-person">+ Add person</button><div class="crew">`;
  for (const p of P.crew) {
    const posts = P.items.filter(it => it.operatorId === p.id);
    const free = P.items.filter(it => !it.operatorId);
    h += `<div class="person" data-scope="person" data-pid="${p.id}">
      <div class="row2">${fText("Name", "name", p.name, "Name")}${fSel("Role", "role", p.role, [["", "- role -"], ...ROLES.map(r => [r, r])])}</div>
      <div class="row2">${fText("Phone / radio", "contact", p.contact, "optional")}${fText("Call time", "callTime", p.callTime, "e.g. 07:30")}</div>
      <div class="posts">${posts.map(it => `<span class="post"><button class="link" data-act="goto" data-k="item" data-id="${it.id}">${esc(it.label)}</button><button class="x" data-act="unassign" data-id="${it.id}" title="Unassign">✕</button></span>`).join("")}
        ${free.length ? `<select class="assign" data-act-change="assign" data-pid="${p.id}"><option value="">+ Assign…</option>${free.map(it => `<option value="${it.id}">${esc(it.label)}${def(it).role ? " · " + esc(def(it).role) : ""}</option>`).join("")}</select>` : ""}
      </div>
      <button class="link danger small" data-act="del-person" data-id="${p.id}">Remove</button>
    </div>`;
  }
  h += `</div>`;
  const open = operated.filter(it => !it.operatorId);
  if (open.length) h += `<h4>Unstaffed positions</h4><ul class="plain">${open.map(it => `<li><button class="link" data-act="goto" data-k="item" data-id="${it.id}">${esc(it.label)}</button> <span class="muted small">${esc(def(it).role)}</span></li>`).join("")}</ul>`;
  return h;
}

// ---------- Reports -------------------------------------------------------------------------------

function reportData() {
  const P = project;
  const region = REGIONS[P.region];

  const cables = P.cables.map(c => {
    const i = A.cable[c.id];
    const a = itemById(c.from.item), b = itemById(c.to.item);
    return {
      Label: c.label, Type: i.info.name,
      From: `${a.label} · ${portOf(a, c.from.port).name}`, To: `${b.label} · ${portOf(b, c.to.port).name}`,
      "Routed (m)": r1(i.measured), "Planned (m)": r1(i.planned),
      "Stock length": !i.needsCable ? "device lead" : i.stock ? `${i.stock}m` : "custom",
      Status: i.status === "ok" ? "" : i.note, Notes: c.notes || "", _st: i.status
    };
  }).sort((x, y) => x.Label.localeCompare(y.Label, undefined, { numeric: true }));

  // Pull sheet: count each stock length per cable kind, spares on the most common length.
  const pull = {};
  for (const c of P.cables) {
    const i = A.cable[c.id];
    if (!i.needsCable) continue;
    const name = i.kind === "power" ? "Mains extension lead" : i.info.name;
    const len = i.stock ? `${i.stock}m` : `custom ${Math.ceil(i.planned)}m`;
    (pull[name] ??= {})[len] = (pull[name][len] || 0) + 1;
  }
  const pullRows = [];
  for (const [name, lens] of Object.entries(pull)) {
    const top = Object.entries(lens).sort((a, b) => b[1] - a[1])[0][0];
    Object.entries(lens).sort((a, b) => parseFloat(a[0].replace("custom ", "")) - parseFloat(b[0].replace("custom ", "")))
      .forEach(([len, qty]) => {
        const spare = len === top ? P.spares : 0;
        pullRows.push({ Cable: name, Length: len, Qty: qty, Spare: spare, Total: qty + spare });
      });
  }
  const adapters = {};
  for (const c of P.cables) if (A.cable[c.id].kind.includes(">")) adapters[A.cable[c.id].info.name] = true;

  const kitGroups = {};
  for (const it of P.items) (kitGroups[it.type] ??= []).push(it);
  const kit = Object.entries(kitGroups).map(([type, list]) => ({
    Category: CAT[CATALOG[type].cat].name, Equipment: CATALOG[type].name, Qty: list.length,
    Labels: list.map(i => i.label).join(", "), "Power (W)": list.reduce((s, i) => s + itemWatts(i), 0) || ""
  })).sort((a, b) => a.Category.localeCompare(b.Category));

  const positions = P.items.map(it => {
    const feed = A.fedBy[it.id] && itemById(A.fedBy[it.id]);
    const op = it.operatorId && personById(it.operatorId);
    return {
      Label: it.label, Equipment: def(it).name, Location: locate(it), Operator: op ? op.name : def(it).role ? "UNASSIGNED" : "",
      Power: itemWatts(it) ? `${itemWatts(it)}W from ${feed ? feed.label : "-"}` : "", Notes: it.notes || ""
    };
  }).sort((a, b) => a.Label.localeCompare(b.Label, undefined, { numeric: true }));

  const circuits = A.circuits.map(c => ({
    Circuit: c.name, Sources: c.sources.join(", ") || "-", "Load (W)": Math.round(c.load),
    "Load (A)": r1(c.load / region.volts), "Capacity (W)": c.capW, Used: c.capW ? `${Math.round((c.load / c.capW) * 100)}%` : "",
    _st: c.load > c.capW ? "error" : c.load > c.capW * 0.8 ? "warn" : "ok"
  }));
  const strips = A.strips.map(s => ({
    Strip: s.it.label, Type: def(s.it).name, "Fed from": s.feed ? s.feed.label : "NOT PLUGGED IN",
    "Load (W)": Math.round(s.load), "Rating (W)": s.capW, Used: `${Math.round((s.load / s.capW) * 100)}%`,
    _st: s.load > s.capW ? "error" : s.load > s.capW * 0.8 ? "warn" : "ok"
  }));
  const totalW = P.items.reduce((s, i) => s + itemWatts(i), 0);

  const crew = P.crew.map(p => {
    const posts = P.items.filter(it => it.operatorId === p.id);
    return {
      Name: p.name || "Unnamed", Role: p.role || "", Contact: p.contact || "", "Call time": p.callTime || "",
      Positions: posts.map(it => `${it.label}${locate(it) ? " @ " + locate(it) : ""}`).join(", ")
    };
  });
  const cameras = P.items.filter(it => def(it).camera).map(it => {
    const ci = camInfo(it);
    const op = it.operatorId && personById(it.operatorId);
    return {
      Camera: it.label, Model: def(it).name, Operator: op ? op.name : def(it).role ? "UNASSIGNED" : "remote",
      Location: locate(it), Lens: `${ci.fmin}–${ci.fmax}mm`, Focal: `${r1(ci.f)}mm`, HFOV: `${r1(ci.hfov / RAD)}°`,
      Distance: `${r1(ci.range)}m`, Frame: `${r1(ci.frameW)} × ${r1((ci.frameW * 9) / 16)}m`,
      "Range here": `${r1(ci.wideW)}m → ${r2(ci.teleW)}m`, Notes: it.notes || ""
    };
  }).sort((a, b) => a.Camera.localeCompare(b.Camera, undefined, { numeric: true }));
  const unstaffed = P.items.filter(it => def(it).role && !it.operatorId).map(it => ({ Position: it.label, Needs: def(it).role, Location: locate(it) }));

  return { cables, pullRows, adapters: Object.keys(adapters), kit, positions, circuits, strips, totalW, crew, cameras, unstaffed, region };
}

function table(rows, cols) {
  if (!rows.length) return `<p class="muted">Nothing here yet.</p>`;
  cols = cols || Object.keys(rows[0]).filter(k => !k.startsWith("_"));
  return `<div class="tbl-wrap"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r =>
    `<tr class="${r._st ? "st-" + r._st : ""}">${cols.map(c => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

const REPORT_TABS = [
  ["checks", "Checks"], ["costing", "Costing"], ["flow", "Signal flow"], ["network", "Stream & network"],
  ["cables", "Cable schedule"], ["pull", "Pull sheet"], ["power", "Power"], ["cameras", "Camera shots"],
  ["kit", "Kit list"], ["crew", "Crew sheet"]
];

function reportBody(tab, R) {
  if (tab === "checks") {
    return A.issues.length ? `<ul class="issues">${A.issues.map(issueLi).join("")}</ul>` : `<p class="good-note">✓ No problems found.</p>`;
  }
  if (tab === "costing") return renderCostingReport();
  if (tab === "flow") return renderFlowReport();
  if (tab === "network") return renderNetReport();
  if (tab === "cables") return table(R.cables) + csvBtn("cables");
  if (tab === "pull") {
    return table(R.pullRows) + csvBtn("pull") +
      (R.adapters.length ? `<p class="muted small">Adapter cables in the list: ${R.adapters.map(esc).join(", ")}.</p>` : "") +
      `<p class="muted small">Lengths include ${project.slackPct}% slack and ${project.dropM}m per rise/drop. Power runs short enough for the device's own lead aren't listed.</p>`;
  }
  if (tab === "power") {
    return `<p><b>${R.totalW}W</b> total draw (${r1(R.totalW / R.region.volts)}A at ${R.region.volts}V).</p>
      <h4>Circuits</h4>${table(R.circuits)}<h4>Strips, reels &amp; UPS</h4>${table(R.strips)}` + csvBtn("circuits");
  }
  if (tab === "cameras") {
    return table(R.cameras) + csvBtn("cameras") +
      `<p class="muted small">Frame = width × height (16:9) at the subject distance. "Range here" = widest → tightest shot from this position. Figures are thin-lens approximations; lens breathing and crop modes change them slightly.</p>`;
  }
  if (tab === "kit") return `<h4>Totals</h4>${table(R.kit)}${csvBtn("kit")}<h4>Every device</h4>${table(R.positions)}${csvBtn("positions")}`;
  if (tab === "crew") {
    return table(R.crew) + csvBtn("crew") + (R.unstaffed.length ? `<h4>Unstaffed positions</h4>${table(R.unstaffed)}` : "");
  }
  return "";
}
const csvBtn = key => `<div class="tbl-actions"><button class="btn sm" data-act="csv" data-key="${key}">Download CSV</button></div>`;

function openReports(tab) {
  reportTab = tab || reportTab;
  showModal("Reports", () => `<nav class="tabs wide">${REPORT_TABS.map(([k, n]) =>
    `<button class="tab${k === reportTab ? " on" : ""}" data-act="report-tab" data-tab="${k}">${n}${k === "checks" && A.issues.length ? ` (${A.issues.length})` : ""}</button>`).join("")}
    <button class="btn sm push-right" data-act="export-pdf">PDF export…</button></nav>
    <div class="report">${reportBody(reportTab, reportData())}</div>`);
}

function downloadCSV(key) {
  const R = reportData();
  const N = ["streams", "ports"].includes(key) ? netReportData() : null;
  const rows = {
    cables: R.cables, pull: R.pullRows, circuits: [...R.circuits, ...R.strips], kit: R.kit, positions: R.positions,
    crew: R.crew, cameras: R.cameras, streams: N?.outputs, ports: N?.ports, quote: key === "quote" ? quoteCSVRows() : null
  }[key] || [];
  if (!rows.length) return toast("Nothing to export");
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !k.startsWith("_"));
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.map(cell).join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\n");
  downloadFile(`${slug(project.name)}-${key}.csv`, csv, "text/csv");
}
const slug = s => (s || "plan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderExport() {
  const o = project.exportOpts, m = project.meta;
  const chk = (k, label) => fCheck(label, k, o[k]);
  return `<div class="export">
    <div class="preset-row">
      <button class="btn${o.preset === "client" ? " on" : ""}" data-act="export-preset" data-p="client">Client proposal</button>
      <button class="btn${o.preset === "production" ? " on" : ""}" data-act="export-preset" data-p="production">Production pack</button>
      ${o.preset === "custom" ? `<span class="muted small">Custom selection</span>` : ""}
    </div>
    <div data-scope="project"><h4>Show details</h4>
      <div class="row2">${fText("Client", "meta.client", m.client)}${fText("Venue", "meta.venue", m.venue)}</div>
      <div class="row2">${fText("Date(s)", "meta.date", m.date, "e.g. 14–15 March")}${fText("Quote / job ref", "meta.ref", m.ref)}</div>
    </div>
    <div data-scope="export"><h4>Include</h4>
      <div class="check-grid">
        ${chk("diagram", "Venue diagram")}${chk("lightDiagram", "Light diagram (prints cleaner)")}
        ${chk("kit", "Kit list")}${chk("crew", "Crew")}${chk("crewNames", "Crew names &amp; contacts")}
        ${chk("cameras", "Camera shots")}${chk("flow", "Signal flow")}${chk("network", "Stream &amp; network")}
        ${chk("cables", "Cable schedule")}${chk("pull", "Pull sheet")}${chk("power", "Power")}
        ${chk("checks", "Plan checks")}${chk("terms", "Terms (from company settings)")}
      </div>
      ${fSel("Costs", "costs", o.costs, [["itemised", "Itemised"], ["sections", "Section totals only"], ["total", "Grand total only"], ["none", "Don't show costs"]])}
    </div>
    ${company.name || company.logo ? "" : `<p class="note">Add your company name, logo and colour in <button class="link" data-act="company">Company &amp; rates</button> to brand the PDF.</p>`}
    <div class="insp-actions"><button class="btn primary" data-act="do-print">Create PDF</button>
      <span class="muted small">Opens the print dialog - choose "Save as PDF".</span></div>
  </div>`;
}

function printPlan() {
  const o = project.exportOpts, m = project.meta;
  const R = reportData();
  const { w, h } = project.venue;
  const pad = 1.5;
  const sc = buildScene(1000 / (w + pad * 2), { print: true });
  const bg = project.bg ? $("#L-bg").innerHTML : "";
  const diagram = `<svg class="print-svg${o.lightDiagram ? " light" : ""}" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" xmlns="http://www.w3.org/2000/svg">
    ${svg.querySelector("defs").outerHTML}<rect x="${-pad}" y="${-pad}" width="${w + pad * 2}" height="${h + pad * 2}" class="print-bg"></rect>
    <g>${bg}</g><g>${sc.grid}</g><g>${sc.shapes}</g><g>${sc.fov}</g><g>${sc.cables}</g><g>${sc.items}</g></svg>`;
  const legend = [...new Set(project.cables.map(c => A.cable[c.id].kind))].map(k => {
    const i = kindInfo(k);
    return `<span class="lg"><i class="k-${baseType(k)}" style="background:${i.color}"></i>${esc(i.name)}</span>`;
  }).join("");

  const title = o.costs !== "none" ? "Proposal" : "Production pack";
  const crewRows = o.crewNames ? R.crew : Object.entries(project.crew.reduce((acc, p) => {
    const r = p.role || "Crew";
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {})).map(([Role, n]) => ({ Role, People: n }));
  // Clients don't need to see the venue's own sockets and network drop.
  const kitRows = R.kit.filter(k => !Object.values(CATALOG).some(d => d.name === k.Equipment && d.venueOwned))
    .map(({ Category, Equipment, Qty }) => ({ Category, Equipment, Qty }));
  const sec = (on, name, body) => (on ? `<section><h2>${name}</h2>${body}</section>` : "");

  $("#printRoot").innerHTML = `<div class="doc" style="--brand:${esc(company.color || "#6c6cff")}">
    <header class="doc-head">
      <div class="doc-brand">${company.logo ? `<img src="${company.logo}" alt="">` : ""}
        <div>${company.name ? `<b>${esc(company.name)}</b>` : ""}${company.contact ? `<span>${esc(company.contact)}</span>` : ""}</div></div>
      <div class="doc-title"><b>${title}</b>${m.ref ? `<span>Ref: ${esc(m.ref)}</span>` : ""}<span>${new Date().toLocaleDateString()}</span></div>
    </header>
    <h1>${esc(project.name)}</h1>
    <p class="doc-meta">${[m.client && `Client: ${esc(m.client)}`, m.venue && `Venue: ${esc(m.venue)}`, m.date && `Date: ${esc(m.date)}`].filter(Boolean).join(" · ")}</p>
    ${o.diagram ? `${diagram}<div class="legend">${legend}</div>` : ""}
    ${sec(o.costs !== "none", "Costs", quotePrintHtml(o.costs))}
    ${sec(o.kit, "Equipment", table(kitRows))}
    ${sec(o.crew, "Crew", table(crewRows))}
    ${sec(o.cameras, "Camera shots", table(R.cameras))}
    ${sec(o.flow, "Signal flow", renderFlowReport())}
    ${sec(o.network, "Stream &amp; network", renderNetReport())}
    ${sec(o.pull, "Pull sheet", table(R.pullRows))}
    ${sec(o.cables, "Cable schedule", table(R.cables))}
    ${sec(o.power, "Power", table(R.circuits) + table(R.strips))}
    ${sec(o.checks && A.issues.length, "Plan checks", `<ul class="issues">${A.issues.map(issueLi).join("")}</ul>`)}
    ${sec(o.terms && company.terms, "Terms", `<p class="terms">${esc(company.terms)}</p>`)}
    <footer class="doc-foot">${esc([company.name, company.contact].filter(Boolean).join(" · "))}</footer>
  </div>`;
  document.body.classList.add("printing");
  window.print();
  setTimeout(() => document.body.classList.remove("printing"), 500);
}

// ---------- Modal, popover, projects ----------------------------------------------------------------

function openModal() { $("#modal").classList.remove("hidden"); }
function closeModal() { $("#modal").classList.add("hidden"); modalView = null; }

// Modal screens are functions returning HTML, so they can be re-rendered after an
// edit (totals update) without losing the scroll position or the focused field.
let modalView = null;
function showModal(title, render) {
  const keep = modalView && $("#modalTitle").textContent === title;
  const scroll = keep ? $("#modalBody").scrollTop : 0;
  $("#modalTitle").textContent = title;
  modalView = render;
  $("#modalBody").innerHTML = render();
  $("#modalBody").scrollTop = scroll;
  openModal();
}
// Re-render after focus has moved and any click in progress has landed, so tabbing
// to the next field or clicking a button right after an edit still works.
let pointerDown = false, modalRerenderQueued = false;
document.addEventListener("pointerdown", () => { pointerDown = true; }, true);
document.addEventListener("pointerup", () => {
  pointerDown = false;
  if (modalRerenderQueued) setTimeout(flushModalRerender, 0);
}, true);
function queueModalRerender() {
  modalRerenderQueued = true;
  if (!pointerDown) setTimeout(flushModalRerender, 0);
}
function flushModalRerender() {
  if (!modalRerenderQueued) return;
  modalRerenderQueued = false;
  rerenderModal();
}
function rerenderModal() {
  if (!modalView || $("#modal").classList.contains("hidden")) return;
  const act = document.activeElement;
  const scopeKey = el => { const sc = el.closest("[data-scope]"); return sc ? `${sc.dataset.scope}:${sc.dataset.pid || ""}:${sc.dataset.eid || ""}` : ""; };
  const key = act?.dataset?.f && $("#modalBody").contains(act) ? [act.dataset.f, scopeKey(act)] : null;
  const scroll = $("#modalBody").scrollTop;
  $("#modalBody").innerHTML = modalView();
  $("#modalBody").scrollTop = scroll;
  if (key) {
    const el = $$("#modalBody [data-f]").find(x => x.dataset.f === key[0] && scopeKey(x) === key[1]);
    if (el) {
      el.focus();
      // Match native tab behaviour (select the contents) so the next keystroke
      // replaces the value instead of landing in front of it.
      if (el.select && el.type !== "checkbox") el.select();
      editBefore = snapshot();
    }
  }
}

function openCompany() {
  showModal("Company & rates", renderCompany);
}

function openProjects() {
  const list = listProjects();
  showModal("Projects", () => `<div class="proj-actions">
      <button class="btn" data-act="new-project">+ New plan</button>
      <button class="btn" data-act="example">Load example</button>
      <button class="btn" data-act="import">Import…</button>
      <button class="btn" data-act="export">Export this plan</button>
      <button class="btn" data-act="dup-project">Duplicate this plan</button>
      <button class="btn" data-act="company">Company &amp; rates</button>
    </div>
    <p class="muted small">Plans save automatically in this browser. Export to share with the team or move to another device.</p>
    <ul class="proj-list">${list.map(p => `<li class="${p.id === project.id ? "on" : ""}">
      <button class="link" data-act="open-project" data-id="${p.id}">${esc(p.name)}</button>
      <span class="muted small">${new Date(p.updated).toLocaleString()}</span>
      ${p.id === project.id ? `<span class="muted small">open</span>` : `<button class="icon-btn sm" data-act="delete-project" data-id="${p.id}" title="Delete">✕</button>`}
    </li>`).join("")}</ul>`);
}

function switchTo(p) {
  saveNow();
  project = p;
  sel = null; pendingCable = null; measure = null;
  undoStack.length = 0; redoStack.length = 0;
  renderBg();
  saveNow();
  fitView();
  renderAll();
}

function showPortPicker(cx, cy, it, opts, onPick) {
  const pop = $("#popover");
  pop.innerHTML = `<div class="pop-h">${esc(it.label)} <span class="muted small">${esc(def(it).name)}</span></div><ul>${opts.map((o, i) =>
    `<li><button ${o.ok ? "" : "disabled"} data-i="${i}">${portChip(o.p.type)}<span>${esc(o.p.name)}</span><em>${esc(o.ok ? o.note || "" : o.reason)}</em></button></li>`).join("")}</ul>`;
  pop.classList.remove("hidden");
  const r = pop.getBoundingClientRect();
  pop.style.left = clamp(cx + 8, 8, window.innerWidth - r.width - 8) + "px";
  pop.style.top = clamp(cy + 8, 8, window.innerHeight - r.height - 8) + "px";
  pop.onclick = e => {
    const b = e.target.closest("button[data-i]");
    if (!b || b.disabled) return;
    hidePopover();
    onPick(opts[+b.dataset.i].p);
  };
}
function hidePopover() { $("#popover").classList.add("hidden"); }

// ---------- Cable workflow -------------------------------------------------------------------------

function setMode(m) {
  mode = m;
  pendingCable = null;
  if (m !== "measure") measure = null;
  hidePopover();
  renderCanvas();
  if (leftTab === "venue") renderLeft();
}

function startCable(it, port) {
  pendingCable = { from: { item: it.id, port: port.id }, points: [] };
  if (mode !== "cable") { mode = "cable"; }
  renderCanvas();
}

function cableClickItem(it, cx, cy) {
  if (!pendingCable) {
    const opts = itemPorts(it).map(p => {
      const c = cableAt(it.id, p.id);
      return { p, ok: !c, reason: c ? `→ ${itemById(otherEnd(c, it.id).item).label}` : "" };
    });
    const free = opts.filter(o => o.ok);
    if (!free.length) return toast(`${it.label} has no free connections`);
    if (free.length === 1) return startCable(it, free[0].p);
    return showPortPicker(cx, cy, it, opts, p => startCable(it, p));
  }
  if (it.id === pendingCable.from.item) return;
  const fi = itemById(pendingCable.from.item), fp = portOf(fi, pendingCable.from.port);
  const opts = itemPorts(it).map(p => ({ p, ...canConnect(fi, fp, it, p) }));
  // Best matches first: exact type and direction, then adapters, then the rest.
  opts.sort((a, b) => (b.ok - a.ok) || ((b.p.type === fp.type) - (a.p.type === fp.type)));
  const ok = opts.filter(o => o.ok);
  const finish = p => {
    const c = connect(fi, fp, it, p, pendingCable.points);
    pendingCable = null;
    select("cable", c.id);
    toast(`${c.label}: ${r1(A.cable[c.id].planned)}m ${A.cable[c.id].info.abbr}`);
  };
  if (!ok.length) {
    const why = opts.find(o => o.reason?.includes("converter"))?.reason || `No free ${CABLE_TYPES[fp.type].abbr} ${fp.dir === "out" ? "input" : fp.dir === "in" ? "output" : "port"} on ${it.label}`;
    return toast(why);
  }
  const exact = ok.filter(o => o.p.type === fp.type);
  if (exact.length === 1 && ok.length === 1) return finish(exact[0].p);
  showPortPicker(cx, cy, it, opts, finish);
}

// ---------- Pointer & keyboard input -----------------------------------------------------------------

function hitTarget(e) {
  const t = e.target.closest?.("[data-k]");
  return t ? { k: t.dataset.k, id: t.dataset.id, i: t.dataset.i } : { k: null };
}

svg.addEventListener("pointerdown", e => {
  hidePopover();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    drag = { type: "pinch", dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
    return;
  }
  const now = Date.now();
  const isDouble = mode === "select" && lastDown && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
  lastDown = isDouble ? null : { t: now, x: e.clientX, y: e.clientY };
  if (isDouble && handleDouble(e)) return;
  const w = worldFromClient(e.clientX, e.clientY);
  const hit = hitTarget(e);
  const start = { cx: e.clientX, cy: e.clientY, moved: false, before: snapshot() };

  if (e.button === 1 || e.button === 2 || spaceDown) {
    drag = { ...start, type: "pan", vx: view.x, vy: view.y };
    return;
  }
  if (mode === "measure") {
    measure = { a: snapP(w), b: snapP(w) };
    drag = { ...start, type: "measure" };
    return;
  }
  if (mode.startsWith("shape:")) {
    const kind = mode.slice(6);
    if (kind === "label") {
      const sh = addShape("label", snapV(w.x), snapV(w.y));
      setMode("select");
      select("shape", sh.id);
      setTimeout(() => $('#inspector [data-f="label"]')?.select(), 0);
      return;
    }
    drag = { ...start, type: "create", kind, a: snapP(w), b: snapP(w) };
    return;
  }
  if (mode === "cable") {
    if (hit.k === "item") return cableClickItem(itemById(hit.id), e.clientX, e.clientY);
    if (pendingCable) {
      pendingCable.points.push(snapP(w));
      renderOverlayOnly();
      return;
    }
    drag = { ...start, type: "pan", vx: view.x, vy: view.y };
    return;
  }

  // Select mode
  const obj = selectedObj();
  if (hit.k === "resize" && obj) {
    drag = { ...start, type: "resize", id: obj.id };
  } else if (hit.k === "aim" && obj) {
    drag = { ...start, type: "aim", id: obj.id };
  } else if (hit.k === "wp" && obj) {
    drag = { ...start, type: "wp", id: obj.id, i: +hit.i };
  } else if (hit.k === "item") {
    const it = itemById(hit.id);
    if (!(sel?.k === "item" && sel.id === it.id)) select("item", it.id);
    drag = { ...start, type: "move", k: "item", id: it.id, dx: w.x - it.x, dy: w.y - it.y };
  } else if (hit.k === "shape") {
    const sh = project.shapes.find(s => s.id === hit.id);
    if (!(sel?.k === "shape" && sel.id === sh.id)) select("shape", sh.id);
    drag = sh.locked ? { ...start, type: "pan", vx: view.x, vy: view.y }
      : { ...start, type: "move", k: "shape", id: sh.id, dx: w.x - sh.x, dy: w.y - sh.y };
  } else if (hit.k === "cable") {
    select("cable", hit.id);
    drag = { ...start, type: "pan", vx: view.x, vy: view.y };
  } else {
    if (sel) select(null);
    drag = { ...start, type: "pan", vx: view.x, vy: view.y };
  }
});

window.addEventListener("pointermove", e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (drag?.type === "pinch") {
    if (pointers.size < 2) return;
    const [p1, p2] = [...pointers.values()];
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    view.x -= (mid.x - drag.mid.x) / view.s;
    view.y -= (mid.y - drag.mid.y) / view.s;
    zoomAt(dist / drag.dist, mid.x, mid.y);
    drag.dist = dist; drag.mid = mid;
    return;
  }
  const w = worldFromClient(e.clientX, e.clientY);
  if (pendingCable && e.target.closest?.("#canvas")) {
    cursorW = snapP(w);
    renderOverlayOnly();
  }
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 3) return;
  drag.moved = true;

  if (drag.type === "pan") {
    view.x = drag.vx - (e.clientX - drag.cx) / view.s;
    view.y = drag.vy - (e.clientY - drag.cy) / view.s;
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${svg.clientWidth / view.s} ${svg.clientHeight / view.s}`);
    return;
  }
  if (drag.type === "measure") { measure.b = snapP(w); renderOverlayOnly(); renderHint(); return; }
  if (drag.type === "create") { drag.b = snapP(w); renderOverlayOnly(); return; }
  if (drag.type === "move") {
    const list = drag.k === "item" ? project.items : project.shapes;
    const o = list.find(x => x.id === drag.id);
    o.x = snapV(w.x - drag.dx);
    o.y = snapV(w.y - drag.dy);
  } else if (drag.type === "resize") {
    const sh = project.shapes.find(x => x.id === drag.id);
    const c = Math.cos(sh.rot * RAD), s = Math.sin(sh.rot * RAD);
    drag.tl ??= { x: sh.x - (sh.w / 2) * c + (sh.h / 2) * s, y: sh.y - (sh.w / 2) * s - (sh.h / 2) * c };
    const dx = w.x - drag.tl.x, dy = w.y - drag.tl.y;
    sh.w = Math.max(0.2, snapV(dx * c + dy * s));
    sh.h = sh.kind === "round" ? sh.w : Math.max(0.2, snapV(-dx * s + dy * c));
    sh.x = drag.tl.x + (sh.w / 2) * c - (sh.h / 2) * s;
    sh.y = drag.tl.y + (sh.w / 2) * s + (sh.h / 2) * c;
  } else if (drag.type === "aim") {
    const it = itemById(drag.id);
    it.rot = Math.round(Math.atan2(w.y - it.y, w.x - it.x) / RAD);
    it.props.range = Math.max(0.5, r1(Math.hypot(w.x - it.x, w.y - it.y)));
  } else if (drag.type === "wp") {
    const c = project.cables.find(x => x.id === drag.id);
    c.points[drag.i] = snapP(w);
  }
  renderCanvas();
  updateDerived();
});

window.addEventListener("pointerup", e => {
  pointers.delete(e.pointerId);
  if (!drag) return;
  const d = drag;
  if (d.type === "pinch") { if (pointers.size < 2) drag = null; return; }
  drag = null;
  if (d.type === "create") {
    const x = Math.min(d.a.x, d.b.x), y = Math.min(d.a.y, d.b.y);
    const w = Math.abs(d.b.x - d.a.x), h = Math.abs(d.b.y - d.a.y);
    const k = SHAPE_KINDS[d.kind];
    if (w < 0.2 || h < 0.2) addShape(d.kind, d.a.x, d.a.y);
    else addShape(d.kind, x + w / 2, y + h / 2, w, d.kind === "round" ? w : h);
    if (d.kind === "room" && !d.moved) toast(`Added a ${k.w}×${k.h}m room - drag its corner handle to resize.`);
    return;
  }
  if (["move", "resize", "aim", "wp"].includes(d.type) && d.moved) {
    pushUndo(d.before);
    scheduleSave();
    renderInspector();
    updateDerived();
  }
});

svg.addEventListener("contextmenu", e => e.preventDefault());

// Double-click/tap: add a bend on a cable, remove a bend on a waypoint. Detected by
// hand because the SVG is re-rendered between clicks, which breaks native dblclick.
let lastDown = null;
function handleDouble(e) {
  const hit = hitTarget(e);
  const w = worldFromClient(e.clientX, e.clientY);
  if (hit.k === "wp") {
    const c = selectedObj();
    mutate(() => c.points.splice(+hit.i, 1));
    return true;
  }
  if (hit.k === "cable") {
    const c = project.cables.find(x => x.id === hit.id);
    const ctrl = cableCtrl(c);
    let best = 0, bestD = Infinity;
    for (let i = 1; i < ctrl.length; i++) {
      const dd = distToSeg(w, ctrl[i - 1], ctrl[i]);
      if (dd < bestD) { bestD = dd; best = i - 1; }
    }
    mutate(() => c.points.splice(best, 0, snapP(w)));
    select("cable", c.id);
    return true;
  }
  return false;
}

svg.addEventListener("wheel", e => {
  e.preventDefault();
  if (e.ctrlKey || !e.deltaX) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
  else {
    view.x += e.deltaX / view.s;
    view.y += e.deltaY / view.s;
    renderCanvas();
  }
}, { passive: false });

// Hovering a row in the cable list highlights that run on the plan.
$("#leftBody").addEventListener("mouseover", e => {
  const id = e.target.closest("[data-hover]")?.dataset.hover || null;
  if (id !== hoverCable) { hoverCable = id; renderCanvas(); }
});
$("#leftBody").addEventListener("mouseleave", () => {
  if (hoverCable) { hoverCable = null; renderCanvas(); }
});

// Drag kit from the sidebar onto the plan.
$("#leftBody").addEventListener("dragstart", e => {
  const li = e.target.closest("[data-type]");
  if (li) e.dataTransfer.setData("text/plain", li.dataset.type);
});
svg.addEventListener("dragover", e => e.preventDefault());
svg.addEventListener("drop", e => {
  e.preventDefault();
  const type = e.dataTransfer.getData("text/plain");
  if (!CATALOG[type]) return;
  const w = worldFromClient(e.clientX, e.clientY);
  if (mode !== "select") setMode("select");
  addItem(type, w.x, w.y);
});

window.addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); redo(); return; }
  if (e.key === "Escape") {
    hidePopover();
    if (!$("#modal").classList.contains("hidden")) return closeModal();
    if (typing) return document.activeElement.blur();
    if (pendingCable) { pendingCable = null; renderCanvas(); return; }
    if (mode !== "select") return setMode("select");
    return select(null);
  }
  if (typing) return;
  if (e.key === " ") { spaceDown = true; svg.classList.add("panning"); e.preventDefault(); return; }
  if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); return; }
  if (mod) return;
  const obj = selectedObj();
  if ((e.key === "Delete" || e.key === "Backspace")) {
    e.preventDefault();
    if (pendingCable) { pendingCable.points.pop(); renderOverlayOnly(); return; }
    return deleteSelected();
  }
  const k = e.key.toLowerCase();
  if (k === "v") return setMode("select");
  if (k === "c") return setMode("cable");
  if (k === "m") return setMode("measure");
  if (k === "r" && obj && sel.k !== "cable") {
    return mutate(() => { obj.rot = ((obj.rot + (e.shiftKey ? -15 : 15)) % 360 + 360) % 360; if (obj.rot > 180) obj.rot -= 360; });
  }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && obj && sel.k !== "cable") {
    e.preventDefault();
    const step = e.shiftKey ? 1 : project.grid || 0.1;
    mutate(() => { obj.x = r2(obj.x + arrows[e.key][0] * step); obj.y = r2(obj.y + arrows[e.key][1] * step); });
  }
});
window.addEventListener("keyup", e => {
  if (e.key === " ") { spaceDown = false; svg.classList.remove("panning"); }
});

// ---------- Form inputs (inspector, venue, crew) ---------------------------------------------------------

function inputTarget(el) {
  const scope = el.closest("[data-scope]");
  if (scope?.dataset.scope === "project") return project;
  if (scope?.dataset.scope === "person") return personById(scope.dataset.pid);
  if (scope?.dataset.scope === "company") return company;
  if (scope?.dataset.scope === "quote") return project.quote;
  if (scope?.dataset.scope === "export") return project.exportOpts;
  if (scope?.dataset.scope === "extra") return project.quote.extras.find(x => x.id === scope.dataset.eid);
  return selectedObj();
}
function parseInput(el) {
  const t = el.dataset.t;
  if (t === "bool") return el.checked;
  if (t === "num") { const n = parseFloat(el.value); return Number.isFinite(n) ? n : undefined; }
  if (t === "numOrNull") { const n = parseFloat(el.value); return Number.isFinite(n) ? n : null; }
  if (t === "strOrNull") return el.value || null;
  return el.value;
}

let editBefore = null;
document.addEventListener("focusin", e => {
  if (e.target.matches?.("[data-f], #projName")) editBefore = snapshot();
});

function applyInput(el) {
  const target = inputTarget(el);
  if (!target) return false;
  const path = el.dataset.f;
  const val = parseInput(el);
  if (val === undefined && el.dataset.t === "num") return false;
  if (el.dataset.t === "grid") {
    const g = parseFloat(el.value);
    project.snap = g > 0;
    if (g > 0) project.grid = g;
  } else if (path.startsWith("bg.") && !project.bg) {
    return false;
  } else {
    setPath(target, path, val);
  }
  // Keep camera focal length inside the lens range when the lens changes.
  if (sel?.k === "item" && target === selectedObj() && def(target).camera) {
    const ci = camInfo(target);
    target.props.focal = r1(ci.f);
  }
  if (path === "venue.w" || path === "venue.h") target.venue[path.slice(6)] = Math.max(2, target.venue[path.slice(6)]);
  if (path.startsWith("bg.") && target === project) renderBg();
  if (target === company) saveCompany();
  if (target === project.exportOpts) project.exportOpts.preset = "custom";
  networkInputHook(target, path);
  // Mirror the value into any twin control (e.g. focal slider + number box).
  $$(`[data-f="${path}"]`).forEach(o => { if (o !== el && o.type !== "checkbox" && inputTarget(o) === target) o.value = getPath(target, path) ?? ""; });
  return true;
}

document.addEventListener("input", e => {
  const el = e.target;
  if (el.id === "kitSearch" || el.id === "cableSearch") { renderLeft(); return; }
  if (el.id === "projName") { project.name = el.value; scheduleSave(); return; }
  if (!el.dataset?.f) return;
  if (!applyInput(el)) return;
  renderCanvas();
  updateDerived();
  scheduleSave();
});

document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset?.actChange === "assign") {
    if (!el.value) return;
    const it = itemById(el.value);
    mutate(() => { it.operatorId = el.dataset.pid; });
    return;
  }
  if (el.id === "projName") { pushUndo(editBefore); return; }
  if (!el.dataset?.f) return;
  applyInput(el);
  pushUndo(editBefore);
  editBefore = snapshot();
  const structural = el.tagName === "SELECT" || el.type === "checkbox" || ["kind", "operatorId", "region"].includes(el.dataset.f);
  renderCanvas();
  if (structural || !$("#inspector").contains(el)) renderInspector();
  if ((structural || $("#modal").contains(el)) && leftTab !== "kit") renderLeft();
  updateDerived();
  if ($("#modal").contains(el)) queueModalRerender();
  scheduleSave();
});

// ---------- Click actions ------------------------------------------------------------------------------

const ACTIONS = {
  mode: b => setMode(b.dataset.mode === mode && mode.startsWith("shape:") ? "select" : b.dataset.mode),
  undo, redo,
  "left-tab": b => { leftTab = b.dataset.tab; renderLeft(); },
  "cable-view": b => { project.cableView = b.dataset.v; scheduleSave(); renderCanvas(); },
  "legend-toggle": () => { legendOpen = !legendOpen; renderLegend(); },
  "toggle-left": () => { document.body.classList.toggle("show-left"); document.body.classList.remove("show-right"); },
  "toggle-right": () => { document.body.classList.toggle("show-right"); document.body.classList.remove("show-left"); },
  zoom: b => { const r = svg.getBoundingClientRect(); zoomAt(+b.dataset.z, r.left + r.width / 2, r.top + r.height / 2); },
  fit: fitView,
  "add-item": b => {
    const r = svg.getBoundingClientRect();
    const c = worldFromClient(r.left + r.width / 2, r.top + r.height / 2);
    addOffset = (addOffset + 1) % 6;
    if (mode !== "select") setMode("select");
    addItem(b.dataset.type, c.x + addOffset * 0.5, c.y + addOffset * 0.5);
    if (isNarrow()) document.body.classList.remove("show-left");
  },
  delete: deleteSelected,
  duplicate: duplicateSelected,
  goto: b => {
    select(b.dataset.k, b.dataset.id);
    const o = selectedObj();
    if (o) {
      // Bring it into view if it's off screen (cables: their midpoint).
      const pt = b.dataset.k === "cable" ? pointAlong(cablePath(o), 0.5) : o;
      const r = svg.getBoundingClientRect();
      const w = worldFromClient(r.left, r.top), w2 = worldFromClient(r.right, r.bottom);
      if (pt.x < w.x || pt.x > w2.x || pt.y < w.y || pt.y > w2.y) {
        view.x = pt.x - (w2.x - w.x) / 2; view.y = pt.y - (w2.y - w.y) / 2;
        renderCanvas();
      }
    }
    closeModal();
  },
  connect: b => {
    const it = selectedObj();
    setMode("cable");
    startCable(it, portOf(it, b.dataset.port));
    toast("Now click the device it goes to (click the floor on the way to add bends).");
    if (isNarrow()) document.body.classList.remove("show-right");
  },
  disconnect: b => mutate(() => { project.cables = project.cables.filter(c => c.id !== b.dataset.id); }),
  "clear-wp": () => { const c = selectedObj(); mutate(() => { c.points = []; }); },
  shot: b => {
    const it = selectedObj();
    const ci = camInfo(it);
    const want = b.dataset.w === "wide" ? ci.fmin : (ci.range * ci.sw) / parseFloat(b.dataset.w);
    const f = clamp(want, ci.fmin, ci.fmax);
    mutate(() => { it.props.focal = r1(f); });
    if (want > ci.fmax + 0.05) toast(`Can't get that tight from ${ci.range}m - tightest is ${r2(ci.teleW)}m wide. Move closer or use a longer lens.`, 5000);
    else if (want < ci.fmin - 0.05) toast(`Can't go that wide from ${ci.range}m - widest is ${r1(ci.wideW)}m. Move back or use a wider lens.`, 5000);
  },
  "add-circuit": () => mutate(() => project.circuits.push({ id: uid(), name: `Circuit ${String.fromCharCode(65 + project.circuits.length)}`, amps: REGIONS[project.region].circuitA })),
  "del-circuit": b => mutate(() => {
    project.circuits = project.circuits.filter(c => c.id !== b.dataset.id);
    project.items.forEach(it => { if (it.circuitId === b.dataset.id) it.circuitId = project.circuits[0].id; });
  }),
  "add-person": () => {
    mutate(() => project.crew.push({ id: uid(), name: "", role: "", contact: "" }));
    leftTab = "crew"; renderLeft();
    const names = $$('#leftBody .person [data-f="name"]');
    names[names.length - 1]?.focus();
  },
  "del-person": b => mutate(() => {
    project.crew = project.crew.filter(p => p.id !== b.dataset.id);
    project.items.forEach(it => { if (it.operatorId === b.dataset.id) it.operatorId = null; });
  }),
  unassign: b => mutate(() => { itemById(b.dataset.id).operatorId = null; }),
  reports: b => openReports(b.dataset.tab),
  "report-tab": b => { openReports(b.dataset.tab); $("#modalBody").scrollTop = 0; },
  csv: b => downloadCSV(b.dataset.key),
  "export-pdf": () => showModal("PDF export", renderExport),
  "export-preset": b => { project.exportOpts = { ...EXPORT_PRESETS[b.dataset.p] }; scheduleSave(); rerenderModal(); },
  "do-print": () => { closeModal(); printPlan(); },
  company: openCompany,
  "logo-upload": () => $("#logoFile").click(),
  "logo-clear": () => { company.logo = null; saveCompany(); rerenderModal(); },
  "company-export": () => downloadFile("rigplan-company.json", JSON.stringify(company, null, 1), "application/json"),
  "company-import": () => $("#companyFile").click(),
  "toggle-lock": () => {
    mutate(() => { if (project.quote.locked) { project.quote.locked = false; project.quote.snapshot = null; } else lockPrices(); });
    rerenderModal();
  },
  "add-extra": () => {
    mutate(() => project.quote.extras.push({ id: uid(), desc: "", qty: 1, unit: 0 }));
    rerenderModal();
    const descs = $$('#modalBody [data-scope="extra"] [data-f="desc"]');
    descs[descs.length - 1]?.focus();
  },
  "del-extra": b => { mutate(() => { project.quote.extras = project.quote.extras.filter(x => x.id !== b.dataset.id); }); rerenderModal(); },
  "add-output": () => {
    const it = selectedObj();
    mutate(() => it.props.outputs.push({ id: uid(), name: `Stream ${it.props.outputs.length + 1}`, preset: "1080p30", kbps: 6000 }));
  },
  "del-output": b => { const it = selectedObj(); mutate(() => it.props.outputs.splice(+b.dataset.i, 1)); },
  "close-modal": closeModal,
  projects: openProjects,
  "new-project": () => { const name = prompt("Name for the new plan:", "New show"); if (name == null) return; switchTo(newProject(name || "New show")); closeModal(); },
  "open-project": b => { const p = loadProject(b.dataset.id); if (!p) return toast("Couldn't open that plan"); switchTo(p); closeModal(); },
  "delete-project": b => {
    const entry = listProjects().find(p => p.id === b.dataset.id);
    if (!confirm(`Delete "${entry?.name}"? This can't be undone.`)) return;
    lsDel(keyProject(b.dataset.id));
    lsSet(KEY_INDEX, JSON.stringify(listProjects().filter(p => p.id !== b.dataset.id)));
    openProjects();
  },
  "dup-project": () => { const p = migrate(JSON.parse(JSON.stringify(project))); p.id = uid(); p.name += " (copy)"; switchTo(p); closeModal(); },
  export: () => downloadFile(`${slug(project.name)}.rigplan.json`, JSON.stringify(project, null, 1), "application/json"),
  import: () => $("#importFile").click(),
  example: () => { switchTo(buildExample()); closeModal(); toast("Example loaded - open Reports to see the cable, power and crew sheets."); },
  "bg-upload": () => $("#bgFile").click(),
  "bg-clear": () => { project.bg = null; renderBg(); saveNow(); renderLeft(); }
};

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.tagName === "SELECT") return;
  if (b.closest("#canvas")) return;
  const fn = ACTIONS[b.dataset.act];
  if (fn) fn(b);
});

$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("pointerdown", e => { if (!e.target.closest("#popover") && !e.target.closest("#canvas")) hidePopover(); });

$("#importFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const p = migrate(JSON.parse(await file.text()));
    if (listProjects().some(x => x.id === p.id)) p.id = uid();
    p.items = p.items.filter(it => CATALOG[it.type]);
    switchTo(p);
    closeModal();
    toast(`Imported "${p.name}"`);
  } catch (err) {
    toast("That file isn't a Rig Plan export.");
  }
});

$("#logoFile").addEventListener("change", e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 600 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    company.logo = cv.toDataURL("image/png"); // PNG keeps transparency
    URL.revokeObjectURL(img.src);
    saveCompany();
    rerenderModal();
  };
  img.onerror = () => toast("Couldn't read that image - use PNG, JPG or SVG.");
  img.src = URL.createObjectURL(file);
});

$("#companyFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (typeof data !== "object" || !data.kitRates) throw new Error("not company settings");
    company = { ...defaultCompany(), ...data };
    saveCompany();
    rerenderModal();
    renderAll();
    toast("Company settings imported.");
  } catch (err) {
    toast("That file isn't a Rig Plan company settings export.");
  }
});

// Downscale floor plan images so they fit in localStorage.
$("#bgFile").addEventListener("change", e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const max = 1800;
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    const data = cv.toDataURL("image/jpeg", 0.8);
    project.bg = { data, w: project.bg?.w || project.venue.w, aspect: cv.height / cv.width, opacity: 0.5, x: 0, y: 0 };
    URL.revokeObjectURL(img.src);
    renderBg();
    saveNow();
    leftTab = "venue";
    renderLeft();
    toast("Plan image added - set its real width so the scale matches.");
  };
  img.onerror = () => toast("Couldn't read that image. PDFs need exporting to PNG/JPG first.");
  img.src = URL.createObjectURL(file);
});

window.addEventListener("resize", () => renderCanvas());
window.addEventListener("beforeunload", () => { clearTimeout(saveTimer); saveNow(); });

// ---------- Example plan ---------------------------------------------------------------------------------

// A small conference livestream: 3 cameras (2 manned + PTZ), SDI to an ATEM at FOH,
// lectern + radio mics into a desk, graphics laptop, hardware encoder, intercom.
function buildExample() {
  const prev = project;
  project = newProject("Example: conference livestream");
  const P = project;
  P.venue = { w: 26, h: 19 };
  const S = (kind, x, y, w, h, label) => { const s = { id: uid(), kind, x, y, w, h, rot: 0, label: label ?? SHAPE_KINDS[kind].label, locked: kind === "room" }; P.shapes.push(s); return s; };
  S("room", 13, 9.5, 24, 17, "Main hall");
  S("stage", 13, 3, 10, 3, "Stage");
  S("seating", 8.5, 10, 7, 6, "Seating L");
  S("seating", 17.5, 10, 7, 6, "Seating R");
  S("riser", 13, 14.5, 2.5, 2, "Camera riser");
  S("zone", 20.7, 16.1, 8.6, 3.2, "Production (FOH)");
  S("table", 20.7, 15.95, 8, 1.5, "Prod table");
  S("table", 16, 3.3, 0.7, 0.6, "Lectern");
  S("door", 1, 13, 0.3, 2, "Doors");
  S("pillar", 5, 14, 0.5, 0.5, "");
  S("label", 13, 17.5, 0, 0, "Fire exit - keep clear").size = 0.45;

  const I = (type, x, y, extra = {}) => {
    const d = CATALOG[type];
    const it = { id: uid(), type, x, y, rot: 0, label: nextLabel(d.short), notes: "", operatorId: null, props: {}, ...extra };
    if (d.camera) it.props = { sensorW: d.camera.sensorW, focalMin: d.camera.focalMin, focalMax: d.camera.focalMax, focal: d.camera.focalMin * 2, range: 10, ...(extra.props || {}) };
    if (d.source && !d.distroA) it.circuitId = P.circuits[0].id;
    ensureItemDefaults(it);
    P.items.push(it);
    return it;
  };
  const aim = (it, tx, ty, widthM) => {
    it.rot = Math.round(Math.atan2(ty - it.y, tx - it.x) / RAD);
    it.props.range = r1(Math.hypot(tx - it.x, ty - it.y));
    const ci = camInfo(it);
    it.props.focal = r1(clamp((ci.range * ci.sw) / widthM, ci.fmin, ci.fmax));
  };

  const cam1 = I("cam_z190", 13, 14.5, { notes: "Main wide/mid on riser" });
  aim(cam1, 13, 3, 3);
  const cam2 = I("cam_xf405", 3.5, 6.5, { notes: "Audience-left cutaway, tight on lectern" });
  aim(cam2, 16, 3.3, 1.2);
  const cam3 = I("cam_ptz", 23, 5.5);
  aim(cam3, 12, 3, 9);
  const sw = I("atem_tvs_hd8", 19.3, 16.3);
  const mv = I("monitor_mv", 19.3, 15.5, { label: "MON 1" });
  const mix = I("mixer_digital", 22.5, 16.3);
  const rx = I("wireless_rx", 22.5, 15.5);
  const lect = I("mic_lectern", 16, 3.3);
  const gfx = I("gfx_laptop", 17.6, 16.3);
  const cnv = I("conv_hdmi_sdi", 17.6, 15.5);
  const enc = I("hw_encoder", 24.1, 16.3);
  const rtr = I("router_bonding", 24.1, 15.5);
  const lan = I("venue_network", 25, 17.6);
  const ptzc = I("ptz_controller", 20.9, 16.3);
  const tv = I("tv_confidence", 13, 5.3, { notes: "Confidence monitor facing stage" });
  const cnv2 = I("conv_sdi_hdmi", 12, 5.3);
  const com = I("com_base", 20.9, 15.5);
  const bp1 = I("com_beltpack", 13.8, 15.1);
  const bp2 = I("com_beltpack", 3.5, 7.4);
  const wallE = I("wall_socket", 25, 14, { label: "WALL 1" });
  const wallW = I("wall_socket", 1, 6, { label: "WALL 2" });
  const wallS = I("wall_socket", 25, 4.5, { label: "WALL 3" });
  const ps1 = I("power_strip6", 23.3, 17.2);
  const ps2 = I("power_strip4", 18.5, 17.2);
  const reel = I("cable_reel", 11.8, 15.2);

  const C = (a, ap, b, bp, points = []) => {
    const pa = portOf(a, ap), pb = portOf(b, bp);
    const kind = pa.type === pb.type ? pa.type : `${pa.type}>${pb.type}`;
    P.cables.push({ id: uid(), from: { item: a.id, port: ap }, to: { item: b.id, port: bp }, points, route: "ortho", label: nextCableLabel(kindInfo(kind).abbr), notes: "", drops: null, lengthOverride: null });
  };
  // Video
  C(cam1, "sdi_out_1", sw, "sdi_in_1", [{ x: 13, y: 16.5 }]);
  C(cam2, "sdi_out_1", sw, "sdi_in_2", [{ x: 1.5, y: 6.5 }, { x: 1.5, y: 17.5 }]);
  C(cam3, "sdi_out_1", sw, "sdi_in_3", [{ x: 24.7, y: 5.5 }, { x: 24.7, y: 14.5 }]);
  C(gfx, "hdmi_out_1", cnv, "hdmi_in_1");
  C(cnv, "sdi_out_1", sw, "sdi_in_4");
  C(sw, "hdmi_out_1", mv, "hdmi_in_1");
  C(sw, "sdi_out_5", enc, "sdi_in_1");
  C(sw, "sdi_out_1", cnv2, "sdi_in_1", [{ x: 18, y: 14.5 }, { x: 18, y: 7 }, { x: 12, y: 7 }]);
  C(cnv2, "hdmi_out_1", tv, "hdmi_in_1");
  // Audio
  C(lect, "xlr_out_1", mix, "xlr_in_1", [{ x: 18, y: 3.3 }, { x: 18, y: 14.5 }]);
  C(rx, "xlr_out_1", mix, "xlr_in_2");
  C(mix, "xlr_out_1", sw, "xlr_in_1");
  // Network
  C(lan, "eth_out_1", rtr, "eth_in_1");
  C(rtr, "eth_io_1", enc, "eth_io_1");
  C(ptzc, "eth_io_1", rtr, "eth_io_2");
  C(cam3, "eth_io_1", rtr, "eth_io_3", [{ x: 24.7, y: 5.5 }, { x: 24.7, y: 14.5 }]);
  // Intercom
  C(com, "com_io_1", bp1, "com_io_1");
  C(com, "com_io_2", bp2, "com_io_1", [{ x: 20.9, y: 17.5 }, { x: 1.5, y: 17.5 }, { x: 1.5, y: 7.4 }]);
  // Power
  C(wallE, "power_out_1", ps1, "power_in_1");
  C(wallE, "power_out_2", ps2, "power_in_1");
  C(ps1, "power_out_1", sw, "pwr");
  C(ps1, "power_out_2", mix, "pwr");
  C(ps1, "power_out_3", enc, "pwr");
  C(ps1, "power_out_4", rtr, "pwr");
  C(ps1, "power_out_5", rx, "pwr");
  C(ps1, "power_out_6", ptzc, "pwr");
  C(ps2, "power_out_1", mv, "pwr");
  C(ps2, "power_out_2", gfx, "pwr");
  C(ps2, "power_out_3", cnv, "pwr");
  C(ps2, "power_out_4", com, "pwr");
  C(wallW, "power_out_1", cam2, "pwr");
  C(wallS, "power_out_1", cam3, "pwr");
  C(wallS, "power_out_2", tv, "pwr", [{ x: 24.8, y: 5.3 }]);
  C(wallW, "power_out_2", reel, "power_in_1", [{ x: 1.3, y: 15.2 }]);
  C(reel, "power_out_1", cam1, "pwr");
  C(reel, "power_out_2", cnv2, "pwr", [{ x: 11.8, y: 7.2 }]);

  const people = [["Jamie", "Technical lead", "Ch 1 + 2"], ["Alex", "Director", "Ch 1"], ["Sam", "Vision mixer (TD)", "Ch 1"], ["Jordan", "Camera operator", "Ch 1"],
    ["Priya", "Camera operator", "Ch 1"], ["Chris", "Audio engineer", "Ch 2"], ["Morgan", "Graphics operator", "Ch 1"], ["Taylor", "Streaming / encoder", "Ch 2"]];
  const ids = people.map(([name, role, contact]) => { const p = { id: uid(), name, role, contact }; P.crew.push(p); return p.id; });
  com.operatorId = ids[0]; ptzc.operatorId = ids[1]; sw.operatorId = ids[2];
  cam1.operatorId = ids[3]; cam2.operatorId = ids[4];
  mix.operatorId = ids[5]; gfx.operatorId = ids[6]; enc.operatorId = ids[7];
  bp1.operatorId = ids[3]; bp2.operatorId = ids[4];

  enc.props.outputs = [
    { id: uid(), name: "YouTube", preset: "1080p30", kbps: 6000 },
    { id: uid(), name: "LinkedIn Live", preset: "720p30", kbps: 3000 }
  ];
  lan.props.upMbps = 20;
  rtr.props.upMbps = 15;
  P.meta = { client: "Example Events Ltd", venue: "Main hall", date: "", ref: "Q-0001" };
  P.quote.extras = [
    { id: uid(), desc: "Van hire + fuel", qty: 1, unit: 120 },
    { id: uid(), desc: "Crew travel", qty: 8, unit: 15 }
  ];

  const built = project;
  project = prev;
  return built;
}

// ---------- Boot ---------------------------------------------------------------------------------------

(function boot() {
  loadCompany();
  const last = lsGet(KEY_LAST);
  project = (last && loadProject(last)) || null;
  if (!project) {
    project = buildExample();
    saveNow();
  }
  renderBg();
  renderAll();
  requestAnimationFrame(() => { fitView(); renderAll(); });
})();
