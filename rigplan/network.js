"use strict";

// Livestream analysis: where every video/audio source ends up (signal flow),
// how much upload the streams need vs what the venue has, how loaded each
// network link is (NDI + stream traffic), and PoE budgets.
// Loaded before app.js and only called after boot, so app.js globals are fine here.

const SIGNAL_TYPES = new Set(["sdi", "hdmi", "xlr", "trs", "mini", "usb"]);
const LINK_MBPS = 1000;   // gigabit Ethernet
const HEADROOM = 1.5;     // upload should be at least 1.5x what the streams use

const outputMbps = o => ((o.kbps || 0) + STREAM_AUDIO_KBPS) / 1000;
const encoderMbps = it => (it.props?.outputs || []).reduce((s, o) => s + outputMbps(o), 0);
const ndiMbps = it => def(it).ndi[it.props?.ndiMode || "hx"];

// Props that the inspector edits in place need to exist first.
function ensureItemDefaults(it) {
  const d = def(it);
  it.props ??= {};
  if (d.encoder && !Array.isArray(it.props.outputs)) {
    it.props.outputs = [{ id: uid(), name: "Main stream", preset: "1080p30", kbps: 6000 }];
  }
  if (d.internet && it.props.upMbps == null) it.props.upMbps = d.internet.upMbps;
  if (d.ndi && !it.props.ndiMode) it.props.ndiMode = "hx";
  return it;
}

function isVideoSource(it) {
  const d = def(it);
  return (d.camera != null) || d.cat === "gfx";
}

// ---------- Network ----------------------------------------------------------------

function netAdj() {
  const adj = {};
  for (const c of project.cables) {
    if (cableKind(c) !== "eth") continue;
    (adj[c.from.item] ??= []).push({ to: c.to.item, cable: c.id });
    (adj[c.to.item] ??= []).push({ to: c.from.item, cable: c.id });
  }
  return adj;
}

// Shortest path (fewest hops) from src to the first item matching isDst.
function bfs(adj, src, isDst) {
  const prev = { [src]: null };
  const q = [src];
  while (q.length) {
    const id = q.shift();
    if (id !== src && isDst(itemById(id))) {
      const cables = [];
      for (let cur = id; prev[cur]; cur = prev[cur].from) cables.unshift(prev[cur].cable);
      return { dst: id, cables };
    }
    for (const e of adj[id] || []) {
      if (e.to in prev) continue;
      prev[e.to] = { from: id, cable: e.cable };
      q.push(e.to);
    }
  }
  return null;
}

// A bonding router with the venue line on its WAN port sends part of the upload
// down that line, in proportion to each uplink's speed.
function splitBonded(adj, dstId, mbps, addLoad) {
  const parent = { [dstId]: null };
  const q2 = [dstId];
  while (q2.length) {
    const id = q2.shift();
    for (const e of adj[id] || []) if (!(e.to in parent)) { parent[e.to] = { from: id, cable: e.cable }; q2.push(e.to); }
  }
  const others = Object.keys(parent).filter(id => id !== dstId && def(itemById(id)).internet);
  if (!others.length) return;
  const up = id => itemById(id).props?.upMbps || 0;
  const total = up(dstId) + others.reduce((s, id) => s + up(id), 0);
  if (!total) return;
  for (const id of others) {
    const cables = [];
    for (let cur = id; parent[cur]; cur = parent[cur].from) cables.push(parent[cur].cable);
    addLoad(cables, (mbps * up(id)) / total);
  }
}

function component(adj, src) {
  const seen = new Set([src]);
  const q = [src];
  while (q.length) for (const e of adj[q.shift()] || []) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
  return seen;
}

function analyseNetwork(A, issue) {
  const P = project;
  const adj = netAdj();
  const net = { link: {}, encoders: [], uplinks: [], ndi: [], poe: [], ndiTo: {} };
  A.net = net;
  const addLoad = (cables, mbps) => cables.forEach(id => { net.link[id] = (net.link[id] || 0) + mbps; });

  // Stream uploads, grouped by the network each encoder sits on.
  const groups = new Map();
  for (const it of P.items) {
    if (!def(it).encoder) continue;
    const mbps = encoderMbps(it);
    const path = bfs(adj, it.id, x => def(x).internet);
    net.encoders.push({ it, mbps, path });
    if (!mbps) continue;
    if (!path) {
      issue("error", `${it.label} is set to stream ${r1(mbps)}Mbps but has no network route to the internet (venue network drop or bonding router).`, { k: "item", id: it.id });
      continue;
    }
    addLoad(path.cables, mbps);
    splitBonded(adj, path.dst, mbps, addLoad);
    const comp = component(adj, it.id);
    const key = [...comp].sort().join("|");
    if (!groups.has(key)) {
      const sources = P.items.filter(x => comp.has(x.id) && def(x).internet);
      groups.set(key, { sources, available: sources.reduce((s, x) => s + (x.props?.upMbps || 0), 0), needed: 0, encoders: [] });
    }
    const g = groups.get(key);
    g.needed += mbps;
    g.encoders.push(it);
  }
  for (const g of groups.values()) {
    net.uplinks.push(g);
    const names = g.sources.map(x => x.label).join(" + ");
    if (g.needed > g.available) {
      issue("error", `Upload: streams need ${r1(g.needed)}Mbps but ${names} only give ${r1(g.available)}Mbps. Lower the bitrate, add bonding, or get a faster line.`, { k: "item", id: g.sources[0].id });
    } else if (g.needed * HEADROOM > g.available) {
      issue("warn", `Upload headroom is thin: ${r1(g.needed)}Mbps of streams on ${r1(g.available)}Mbps (${names}). Aim for ${r1(g.needed * HEADROOM)}Mbps+.`, { k: "item", id: g.sources[0].id });
    }
  }

  // NDI sources to the nearest NDI receiver.
  for (const it of P.items) {
    if (!def(it).ndi) continue;
    const eth = itemPorts(it).find(p => p.type === "eth");
    if (!cableAt(it.id, eth.id)) continue; // "not connected" is already reported elsewhere
    const mbps = ndiMbps(it);
    const path = bfs(adj, it.id, x => def(x).ndiRx);
    net.ndi.push({ it, mbps, path });
    if (!path) {
      issue("warn", `${it.label} sends NDI but nothing on its network can receive it - add a vMix/OBS machine on the same switch.`, { k: "item", id: it.id });
      continue;
    }
    addLoad(path.cables, mbps);
    net.ndiTo[it.id] = path.dst;
  }

  // Per-link load.
  for (const [id, mbps] of Object.entries(net.link)) {
    const c = P.cables.find(x => x.id === id);
    if (mbps > LINK_MBPS) issue("error", `${c.label} carries ${Math.round(mbps)}Mbps - more than a gigabit link. Switch NDI sources to NDI|HX or split them across switches.`, { k: "cable", id });
    else if (mbps > LINK_MBPS * 0.7) issue("warn", `${c.label} is at ${Math.round((mbps / LINK_MBPS) * 100)}% of a gigabit link.`, { k: "cable", id });
  }

  // PoE budgets.
  for (const sw of P.items) {
    const budget = def(sw).poeBudgetW;
    if (!budget) continue;
    const loads = [];
    for (const p of itemPorts(sw)) {
      const c = cableAt(sw.id, p.id);
      const peer = c && itemById(otherEnd(c, sw.id).item);
      if (peer && def(peer).poe) loads.push({ it: peer, w: def(peer).poeW || 0 });
    }
    const used = loads.reduce((s, l) => s + l.w, 0);
    net.poe.push({ it: sw, budget, used, loads });
    if (used > budget) issue("error", `${sw.label}: PoE devices need ${used}W but the switch only supplies ${budget}W.`, { k: "item", id: sw.id });
    else if (used > budget * 0.8) issue("warn", `${sw.label} is using ${used}W of its ${budget}W PoE budget.`, { k: "item", id: sw.id });
  }
}

// ---------- Signal flow --------------------------------------------------------------

function signalAdj(A) {
  const adj = {};
  for (const c of project.cables) {
    const t = portOf(itemById(c.from.item), c.from.port).type;
    if (!SIGNAL_TYPES.has(t)) continue;
    (adj[c.from.item] ??= []).push({ to: c.to.item, cable: c.id, fromPort: c.from.port, toPort: c.to.port });
  }
  // NDI sources reach their receiver over the network.
  for (const [src, dst] of Object.entries(A.net?.ndiTo || {})) {
    (adj[src] ??= []).push({ to: dst, cable: null, ndi: true });
  }
  return adj;
}

// Returns the list of hops from src to the first item matching isDst, or null.
function tracePath(adj, src, isDst) {
  const prev = { [src]: null };
  const q = [src];
  while (q.length) {
    const id = q.shift();
    if (id !== src && isDst(itemById(id))) {
      const hops = [];
      for (let cur = id; prev[cur]; cur = prev[cur].from) hops.unshift(prev[cur].edge);
      return hops.map((e, i) => ({ ...e, from: i ? hops[i - 1].to : src }));
    }
    for (const e of adj[id] || []) {
      if (e.to in prev) continue;
      prev[e.to] = { from: id, edge: e };
      q.push(e.to);
    }
  }
  return null;
}

function analyseSignal(A, issue) {
  const P = project;
  const adj = signalAdj(A);
  const hasEncoder = P.items.some(it => def(it).encoder);
  const flow = { video: [], audio: [] };
  A.flow = flow;
  const hasOutput = it => (adj[it.id] || []).length > 0;
  for (const it of P.items) {
    const d = def(it);
    const video = isVideoSource(it);
    const audio = d.audioSrc && !video;
    if (!video && !audio) continue;
    const path = d.encoder ? [] : tracePath(adj, it.id, x => def(x).encoder);
    flow[video ? "video" : "audio"].push({ it, path });
    if (hasEncoder && !path && hasOutput(it)) {
      issue("warn", `${it.label}'s ${video ? "picture" : "audio"} never reaches anything that streams - check its routing.`, { k: "item", id: it.id });
    }
  }
}

// ---------- Report sections ----------------------------------------------------------

function chainHtml(src, hops) {
  if (!hops) return `<div class="chain"><span class="node">${esc(src.label)}</span><span class="edge bad">not reaching the stream</span></div>`;
  if (!hops.length) return `<div class="chain"><span class="node end">${esc(src.label)} · streams itself</span></div>`;
  const pname = (id, pid) => (pid ? portOf(itemById(id), pid).name : "");
  let h = `<div class="chain"><span class="node">${esc(src.label)}<em>${esc(pname(src.id, hops[0].fromPort))}</em></span>`;
  hops.forEach((e, i) => {
    const cab = e.cable && project.cables.find(c => c.id === e.cable);
    h += `<span class="edge">${e.ndi ? "NDI" : esc(cab.label)}</span>`;
    const to = itemById(e.to);
    const inP = pname(e.to, e.toPort), outP = hops[i + 1] ? pname(e.to, hops[i + 1].fromPort) : "";
    const last = i === hops.length - 1;
    h += `<span class="node${last ? " end" : ""}">${esc(to.label)}<em>${esc([inP, outP].filter(Boolean).join(" → "))}</em>${last ? " 📡" : ""}</span>`;
  });
  return h + `</div>`;
}

// Follows converters/DAs back to the device that actually makes the signal.
function upstreamSource(itemId, portId) {
  const via = [];
  let c = cableAt(itemId, portId);
  let guard = 0;
  while (c && guard++ < 10) {
    const src = itemById(c.from.item);
    if (def(src).cat !== "convert") return { src, via, cable: c };
    via.push(src.label);
    const inPort = itemPorts(src).find(p => p.dir === "in" && p.type !== "power" && cableAt(src.id, p.id));
    if (!inPort) return { src, via: via.slice(0, -1), cable: c };
    c = cableAt(src.id, inPort.id);
  }
  return null;
}

function flowReportData() {
  const switchers = project.items.filter(it => def(it).cat === "switch").map(sw => ({
    it: sw,
    rows: itemPorts(sw).filter(p => p.dir === "in" && SIGNAL_TYPES.has(p.type)).map(p => {
      const u = upstreamSource(sw.id, p.id);
      return {
        Input: p.name, Source: u ? `${u.src.label} · ${def(u.src).name}` : "-",
        Via: u ? [u.cable.label, ...u.via].join(" → ") : "", _st: u ? "" : "empty"
      };
    })
  }));
  const mixers = project.items.filter(it => def(it).cat === "audio" && def(it).role).map(mx => {
    let ch = 0;
    return {
      it: mx,
      rows: itemPorts(mx).filter(p => p.dir === "in" && SIGNAL_TYPES.has(p.type)).map(p => {
        ch++;
        const u = upstreamSource(mx.id, p.id);
        return {
          Ch: ch, Input: p.name, Source: u ? `${u.src.label} · ${def(u.src).name}` : "-",
          Cable: u ? [u.cable.label, ...u.via].join(" → ") : "", "48V": u && def(u.src).phantom ? "Yes" : "",
          Notes: u?.src.notes || "", _st: u ? "" : "empty"
        };
      })
    };
  });
  return { switchers, mixers };
}

function renderFlowReport() {
  const F = flowReportData();
  let h = "";
  const hideEmpty = rows => rows.filter(r => r._st !== "empty");
  for (const s of F.switchers) {
    const used = hideEmpty(s.rows);
    h += `<h4>${esc(s.it.label)} inputs · ${esc(def(s.it).name)} <span class="muted">(${used.length}/${s.rows.length} used)</span></h4>${table(used)}`;
  }
  for (const m of F.mixers) {
    const used = hideEmpty(m.rows);
    h += `<h4>${esc(m.it.label)} input list · ${esc(def(m.it).name)} <span class="muted">(${used.length}/${m.rows.length} used)</span></h4>${table(used)}`;
  }
  h += `<h4>Video → stream</h4>${A.flow.video.map(f => chainHtml(f.it, f.path)).join("") || `<p class="muted">No video sources.</p>`}`;
  h += `<h4>Audio → stream</h4>${A.flow.audio.map(f => chainHtml(f.it, f.path)).join("") || `<p class="muted">No audio sources.</p>`}`;
  h += `<p class="muted small">Chains follow cables from each source through mixers, converters and the vision mixer to the first device that streams. Audio carried inside HDMI/SDI counts.</p>`;
  return h;
}

function netReportData() {
  const N = A.net;
  const uplinks = N.uplinks.map(g => ({
    Uplink: g.sources.map(x => `${x.label} (${r1(x.props.upMbps)}Mbps)`).join(" + "),
    Encoders: g.encoders.map(x => x.label).join(", "),
    "Needed (Mbps)": r1(g.needed), "With headroom (Mbps)": r1(g.needed * HEADROOM), "Available (Mbps)": r1(g.available),
    _st: g.needed > g.available ? "error" : g.needed * HEADROOM > g.available ? "warn" : ""
  }));
  const outputs = N.encoders.flatMap(e => (e.it.props.outputs || []).map(o => ({
    Encoder: e.it.label, Output: o.name, Preset: o.preset, "Video (kbps)": o.kbps, "Total (Mbps)": r1(outputMbps(o)),
    Route: e.path ? `→ ${itemById(e.path.dst).label}` : "NO ROUTE", _st: e.path ? "" : "error"
  })));
  const ports = [];
  for (const it of project.items) {
    const eths = itemPorts(it).filter(p => p.type === "eth");
    if (eths.length < 3) continue;
    for (const p of eths) {
      const c = cableAt(it.id, p.id);
      const peer = c && itemById(otherEnd(c, it.id).item);
      const mbps = c ? N.link[c.id] || 0 : 0;
      ports.push({
        Device: it.label, Port: p.name, "Connected to": peer ? peer.label : "-", Cable: c ? c.label : "",
        "Traffic (Mbps)": c ? Math.round(mbps) : "", "Of 1Gb": c ? `${Math.round((mbps / LINK_MBPS) * 100)}%` : "",
        PoE: peer && def(peer).poe ? `${def(peer).poeW}W` : "",
        _st: mbps > LINK_MBPS ? "error" : mbps > LINK_MBPS * 0.7 ? "warn" : ""
      });
    }
  }
  const poe = N.poe.map(p => ({ Switch: p.it.label, Devices: p.loads.map(l => `${l.it.label} ${l.w}W`).join(", ") || "-", "Used (W)": p.used, "Budget (W)": p.budget, _st: p.used > p.budget ? "error" : p.used > p.budget * 0.8 ? "warn" : "" }));
  const ndi = N.ndi.map(n => ({ Source: n.it.label, Mode: n.it.props.ndiMode === "full" ? "Full NDI" : "NDI|HX", "Mbps": n.mbps, Receiver: n.path ? itemById(n.path.dst).label : "NONE", _st: n.path ? "" : "warn" }));
  return { uplinks, outputs, ports, poe, ndi };
}

function renderNetReport() {
  const R = netReportData();
  return `<h4>Upload</h4>${table(R.uplinks)}
    <p class="muted small">Speed-test the venue line at the same time of day as the show, wired, not on Wi-Fi. Streams need a steady ${HEADROOM}× headroom - upload speed fluctuates.</p>
    <h4>Stream outputs</h4>${table(R.outputs)}${csvBtn("streams")}
    ${R.ndi.length ? `<h4>NDI sources</h4>${table(R.ndi)}` : ""}
    <h4>Switch &amp; router ports</h4>${table(R.ports)}${csvBtn("ports")}
    ${R.poe.length ? `<h4>PoE budget</h4>${table(R.poe)}` : ""}
    <p class="muted small">Traffic is routed along the shortest cable path: each stream to its uplink, each NDI source to the nearest vMix/OBS machine. Links are assumed to be gigabit.</p>`;
}

// ---------- Inspector section for encoders / uplinks / NDI ------------------------------

function inspectStream(it) {
  const d = def(it);
  let h = "";
  if (d.encoder) {
    const e = A.net.encoders.find(x => x.it.id === it.id);
    h += `<h4>Stream outputs</h4>`;
    it.props.outputs.forEach((o, i) => {
      h += `<div class="out-row">
        <input type="text" data-f="props.outputs.${i}.name" data-t="text" value="${esc(o.name)}" aria-label="Output name" placeholder="e.g. YouTube">
        <select data-f="props.outputs.${i}.preset" data-t="text" aria-label="Preset">${[...STREAM_PRESETS.map(([n]) => n), "custom"].map(n => `<option${n === o.preset ? " selected" : ""}>${n}</option>`).join("")}</select>
        <input type="number" data-f="props.outputs.${i}.kbps" data-t="num" value="${o.kbps}" step="500" min="0" aria-label="Video kbps"><em>kbps</em>
        <button class="icon-btn sm" data-act="del-output" data-i="${i}" title="Remove output">✕</button></div>`;
    });
    h += `<button class="btn sm" data-act="add-output">+ Output</button>
      <div class="readout"><div><b>${r1(encoderMbps(it))}Mbps</b><span>upload needed (incl. ${STREAM_AUDIO_KBPS}kbps audio each)</span></div>
      <div><b>${e?.path ? esc(itemById(e.path.dst).label) : "No route"}</b><span>to the internet via</span></div></div>
      <p class="muted small">Sending to several platforms from here uses upload for each. Using a restream service? List it as one output.</p>`;
  }
  if (d.internet) {
    h += `<h4>Internet</h4>${fNum(d.internet.label, "props.upMbps", it.props.upMbps, { unit: "Mbps", step: 1, min: 0 })}
      <p class="muted small">Use a real speed test from the venue, not the advertised figure.</p>`;
  }
  if (d.ndi && d.ndi.full !== d.ndi.hx) {
    h += `<h4>NDI</h4>${fSel("Format", "props.ndiMode", it.props.ndiMode, [["hx", `NDI|HX (~${d.ndi.hx}Mbps)`], ["full", `Full NDI (~${d.ndi.full}Mbps)`]])}`;
  }
  if (d.poeBudgetW) {
    const p = A.net.poe.find(x => x.it.id === it.id);
    h += `<div class="readout"><div><b>${p.used}W / ${p.budget}W</b><span>PoE used</span></div></div>`;
  }
  return h;
}

// Called by the input handler after a field changes.
function networkInputHook(target, path) {
  const m = path.match(/^props\.outputs\.(\d+)\.(preset|kbps)$/);
  if (!m) return;
  const o = target.props.outputs[+m[1]];
  if (m[2] === "preset") {
    const p = STREAM_PRESETS.find(([n]) => n === o.preset);
    if (p) o.kbps = p[1];
    $$(`[data-f="props.outputs.${m[1]}.kbps"]`).forEach(el => { el.value = o.kbps; });
  } else {
    const p = STREAM_PRESETS.find(([n]) => n === o.preset);
    if (!p || p[1] !== o.kbps) {
      o.preset = "custom";
      $$(`[data-f="props.outputs.${m[1]}.preset"]`).forEach(el => { el.value = "custom"; });
    }
  }
}
