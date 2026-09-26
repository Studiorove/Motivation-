"use strict";

// Cable safety and risk assessment.
// Hazard zones (fire doors, escape routes, walkways, doorways, no-cable zones) are
// checked against every cable route; crossings need a treatment (ramp, matting,
// overhead). The risk assessment is generated from the plan and can be edited.
// Loaded before app.js; only called after boot.

const HAZARDS = {
  door: {
    name: "Doorway", rule: "warn",
    treatments: [["none", "Not protected"], ["ramp", "Cable ramp"], ["matting", "Cable matting"], ["overhead", "Flown overhead"]],
    why: "trip hazard and stops the door closing"
  },
  fire_door: {
    name: "Fire door", rule: "error",
    treatments: [["none", "No cables through (required)"], ["approved", "Venue-approved route (e.g. cable port)"]],
    why: "fire doors must close unobstructed"
  },
  escape: {
    name: "Escape route", rule: "error",
    treatments: [["none", "Not protected"], ["ramp", "Cable ramp"], ["matting", "Cable matting"], ["overhead", "Flown overhead"]],
    why: "escape routes must stay clear and trip-free"
  },
  walkway: {
    name: "Walkway / aisle", rule: "warn",
    treatments: [["none", "Not protected"], ["ramp", "Cable ramp"], ["matting", "Cable matting"], ["overhead", "Flown overhead"]],
    why: "trip hazard for the audience and crew"
  },
  nocable: {
    name: "No-cable zone", rule: "error",
    treatments: [["none", "No cables allowed"]],
    why: "nothing may be run here"
  }
};

const RAMP_SECTION_M = 0.9;   // length of one cable ramp section
const RAMP_CHANNELS = 5;      // cables per ramp
const CLUSTER_M = 1.2;        // crossings closer than this share a ramp run
const OVERHEAD_M = 2.4;       // minimum clear height for flown cables over routes

const SAFETY_ITEMS = {
  safety_ramp: { name: `Cable ramp section (${RAMP_CHANNELS}-channel, ${RAMP_SECTION_M}m)`, rate: 4 },
  safety_mat: { name: "Cable matting (per metre)", rate: 1.5 }
};

// Length and midpoint of segment a→b inside a (rotated) rectangle shape.
function clipToShape(sh, a, b) {
  const c = Math.cos(-sh.rot * RAD), s = Math.sin(-sh.rot * RAD);
  const loc = p => ({ x: (p.x - sh.x) * c - (p.y - sh.y) * s, y: (p.x - sh.x) * s + (p.y - sh.y) * c });
  const A1 = loc(a), B1 = loc(b);
  const dx = B1.x - A1.x, dy = B1.y - A1.y;
  let t0 = 0, t1 = 1;
  const edges = [[-dx, A1.x + sh.w / 2], [dx, sh.w / 2 - A1.x], [-dy, A1.y + sh.h / 2], [dy, sh.h / 2 - A1.y]];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  if (t1 - t0 < 1e-9) return null;
  const len = (t1 - t0) * Math.hypot(b.x - a.x, b.y - a.y);
  const tm = (t0 + t1) / 2;
  return { len, mid: { x: a.x + (b.x - a.x) * tm, y: a.y + (b.y - a.y) * tm } };
}

function crossingsFor(sh) {
  const out = [];
  for (const c of project.cables) {
    const pts = cablePath(c);
    let len = 0, mid = null, best = 0;
    for (let i = 1; i < pts.length; i++) {
      const hit = clipToShape(sh, pts[i - 1], pts[i]);
      if (!hit) continue;
      len += hit.len;
      if (hit.len >= best) { best = hit.len; mid = hit.mid; }
    }
    // Touching a thin door edge still counts as going through it.
    if (mid && (len > 0.02 || sh.kind === "door" || sh.kind === "fire_door")) out.push({ c, len, mid });
  }
  return out;
}

function analyseSafety(A, issue) {
  const S = { zones: [], ramps: 0, matM: 0, overhead: 0 };
  A.safety = S;
  for (const sh of project.shapes) {
    const hz = HAZARDS[sh.kind];
    if (!hz) continue;
    const treat = hz.treatments.some(([k]) => k === sh.treatment) ? sh.treatment : "none";
    const crossings = crossingsFor(sh);
    // Group crossings that are close together: they can share one ramp run / mat.
    const clusters = [];
    for (const x of crossings) {
      const cl = clusters.find(k => Math.hypot(k.mid.x - x.mid.x, k.mid.y - x.mid.y) < CLUSTER_M);
      if (cl) { cl.items.push(x); cl.len = Math.max(cl.len, x.len); }
      else clusters.push({ mid: x.mid, items: [x], len: x.len });
    }
    let ramps = 0, matM = 0;
    for (const cl of clusters) {
      const sections = Math.max(1, Math.ceil(cl.len / RAMP_SECTION_M));
      cl.ramps = Math.ceil(cl.items.length / RAMP_CHANNELS) * sections;
      cl.matM = Math.max(1, Math.ceil(cl.len));
      if (treat === "ramp") ramps += cl.ramps;
      if (treat === "matting") matM += cl.matM;
    }
    if (treat === "overhead") S.overhead += clusters.length;
    S.ramps += ramps;
    S.matM += matM;
    const zone = { sh, hz, treat, crossings, clusters, ramps, matM };
    S.zones.push(zone);

    if (!crossings.length) continue;
    const names = crossings.map(x => x.c.label).join(", ");
    const ref = { k: "shape", id: sh.id };
    const where = sh.label || hz.name;
    if (sh.kind === "nocable") {
      issue("error", `${names} ${crossings.length > 1 ? "run" : "runs"} through "${where}" (no-cable zone). Reroute.`, ref);
    } else if (sh.kind === "fire_door") {
      if (treat === "approved") issue("info", `${names} pass "${where}" on a venue-approved route - get written sign-off from the venue.`, ref);
      else issue("error", `${names} ${crossings.length > 1 ? "go" : "goes"} through fire door "${where}" - ${hz.why}. Reroute, or use a venue-approved cable port.`, ref);
    } else if (treat === "none") {
      issue(hz.rule, `${names} ${crossings.length > 1 ? "cross" : "crosses"} ${hz.name.toLowerCase()} "${where}" unprotected - ${hz.why}. Set a ramp, matting or overhead route.`, ref);
    }
    if (sh.kind === "escape" || sh.kind === "walkway") {
      const along = crossings.filter(x => x.len > Math.max(3, 1.5 * Math.min(sh.w, sh.h)));
      if (along.length) issue("warn", `${along.map(x => x.c.label).join(", ")} ${along.length > 1 ? "run" : "runs"} along "${where}" instead of across it (${r1(Math.max(...along.map(x => x.len)))}m) - move to the edge of the route.`, ref);
    }
  }
}

// Ramp/crossing markers drawn on top of cables.
function hazardMarkers(fs, halo, print) {
  let out = "";
  for (const z of A.safety.zones) {
    for (const cl of z.clusters) {
      const ok = z.sh.kind !== "nocable" && (z.treat !== "none" && (z.sh.kind !== "fire_door" || z.treat === "approved"));
      const { x, y } = cl.mid;
      if (ok && z.treat === "ramp") {
        out += `<g class="hz-mark ramp" transform="translate(${x} ${y})"><rect x="-0.22" y="-0.12" width="0.44" height="0.24" rx="0.03"></rect>
          <path d="M-0.14 -0.12 L-0.02 0.12 M0.02 -0.12 L0.14 0.12"></path></g>`;
      } else if (ok) {
        out += `<g class="hz-mark okmark" transform="translate(${x} ${y})"><circle r="0.14"></circle></g>`;
      } else {
        out += `<g class="hz-mark bad" transform="translate(${x} ${y})"><circle r="0.2"></circle><text font-size="0.26" text-anchor="middle" dominant-baseline="central">!</text></g>`;
      }
      if (cl.items.length > 1 || ok) {
        const lbl = ok ? (z.treat === "ramp" ? `${cl.ramps}× ramp` : z.treat === "matting" ? `${cl.matM}m mat` : z.treat === "overhead" ? `fly ≥${OVERHEAD_M}m` : "approved") : `${cl.items.length} unprotected`;
        out += `<text class="hz-lbl${ok ? "" : " bad"}" ${halo} x="${x}" y="${y + 0.25 + fs * 0.7}" font-size="${fs * 0.7}" text-anchor="middle">${lbl}</text>`;
      }
    }
  }
  return out;
}

function inspectHazard(sh) {
  const hz = HAZARDS[sh.kind];
  if (!hz) return "";
  const z = A.safety.zones.find(x => x.sh.id === sh.id);
  let h = `<h4>Cable safety</h4>`;
  if (hz.treatments.length > 1) h += fSel("Cables crossing here", "treatment", z.treat, hz.treatments);
  const summary = !z.crossings.length ? "No cables cross it"
    : `${z.crossings.length} cable${z.crossings.length > 1 ? "s" : ""} at ${z.clusters.length} crossing point${z.clusters.length > 1 ? "s" : ""}`;
  h += `<div class="readout"><div><b>${summary}</b></div>
    ${z.treat === "ramp" && z.ramps ? `<div><b>${z.ramps}</b><span>ramp sections (${RAMP_CHANNELS}-channel)</span></div>` : ""}
    ${z.treat === "matting" && z.matM ? `<div><b>${z.matM}m</b><span>cable matting</span></div>` : ""}
    ${z.treat === "overhead" && z.clusters.length ? `<div><b>≥${OVERHEAD_M}m</b><span>clear height when flown</span></div>` : ""}</div>`;
  if (z.crossings.length) {
    h += `<ul class="plain small">${z.crossings.map(x => `<li><button class="link" data-act="goto" data-k="cable" data-id="${x.c.id}">${esc(x.c.label)}</button> <span class="muted">${esc(A.cable[x.c.id].info.name)} · ${r1(x.len)}m inside</span></li>`).join("")}</ul>`;
  }
  h += `<p class="muted small">Rule: ${esc(hz.why)}.</p>`;
  return h;
}

// ---------- Risk assessment -------------------------------------------------------------

const RISK_LEVELS = [[1, "Very unlikely / Minor"], [2, "Unlikely / Moderate"], [3, "Possible / Serious"], [4, "Likely / Major"], [5, "Very likely / Fatal"]];
const LIKELIHOOD = ["", "Very unlikely", "Unlikely", "Possible", "Likely", "Very likely"];
const SEVERITY = ["", "Minor", "Moderate", "Serious", "Major", "Fatal"];

function riskBand(score) {
  if (score >= 20) return ["vhigh", "Very high"];
  if (score >= 10) return ["high", "High"];
  if (score >= 5) return ["med", "Medium"];
  return ["low", "Low"];
}

// Hazards generated from the plan. Each has a stable id so edits survive re-generation.
function autoRisks() {
  const P = project, S = A.safety;
  const rows = [];
  const add = r => rows.push({ auto: true, ...r });
  const byKind = k => S.zones.filter(z => z.sh.kind === k);
  const has = pred => P.items.some(pred);
  const issuesOf = re => A.issues.filter(i => re.test(i.msg));

  // Trip hazards from cable crossings.
  const crossZones = S.zones.filter(z => ["door", "walkway", "escape"].includes(z.sh.kind) && z.crossings.length);
  const unprotected = crossZones.filter(z => z.treat === "none");
  if (crossZones.length || P.cables.length) {
    const ctl = ["Cables run along walls and under furniture where possible", "All floor cables taped flat with gaffer tape; no loose loops"];
    if (S.ramps) ctl.push(`${S.ramps} cable ramp sections at crossing points`);
    if (S.matM) ctl.push(`${S.matM}m of cable matting at crossings`);
    if (S.overhead) ctl.push(`${S.overhead} crossing${S.overhead > 1 ? "s" : ""} flown overhead at ≥${OVERHEAD_M}m`);
    ctl.push("Cable routes walked and checked before doors open");
    add({
      id: "trip", hazard: "Trip hazard from cables on the floor, across walkways, aisles and doorways",
      who: "Audience, crew, venue staff", controls: ctl.join(". ") + ".",
      l: 4, s: 3, rl: unprotected.length ? 4 : 2, rs: 3,
      further: unprotected.length ? `Protect crossings at: ${unprotected.map(z => z.sh.label || z.hz.name).join(", ")}.` : ""
    });
  }

  // Fire exits and fire doors.
  const fd = byKind("fire_door"), esc_ = byKind("escape");
  if (fd.length || esc_.length) {
    const bad = [...fd.filter(z => z.crossings.length && z.treat !== "approved"), ...esc_.filter(z => z.crossings.length && z.treat === "none")];
    add({
      id: "exits", hazard: "Obstruction of fire exits, escape routes or fire doors",
      who: "Everyone in the venue", l: 3, s: 5, rl: bad.length ? 4 : 1, rs: 5,
      controls: `No cables or kit through fire doors${fd.length ? ` (${fd.map(z => z.sh.label || "fire door").join(", ")})` : ""}. Escape routes kept clear, crossings ramped or flown. Routes agreed with the venue duty manager.`,
      further: bad.length ? `Reroute or protect cables at: ${bad.map(z => z.sh.label || z.hz.name).join(", ")}.` : ""
    });
  }
  const nc = byKind("nocable").filter(z => z.crossings.length);
  if (nc.length) {
    add({
      id: "nocable", hazard: "Cables in a no-cable zone", who: "Audience, performers, crew", l: 4, s: 3, rl: 4, rs: 3,
      controls: "Zone marked on the plan.", further: `Reroute cables out of: ${nc.map(z => z.sh.label || "no-cable zone").join(", ")}.`
    });
  }

  // Electrical.
  if (has(it => itemWatts(it) > 0)) {
    const totalW = P.items.reduce((s, it) => s + itemWatts(it), 0);
    const worst = A.circuits.reduce((m, c) => Math.max(m, c.capW ? c.load / c.capW : 0), 0);
    const elecIssues = issuesOf(/overloaded|daisy-chained|isn't plugged in|over one/);
    add({
      id: "electric", hazard: "Electric shock or fire from mains equipment and distribution",
      who: "Crew, venue staff, audience", l: 3, s: 5, rl: elecIssues.length ? 3 : 1, rs: 5,
      controls: `All equipment and leads PAT tested and visually inspected. RCD protection on all distribution. ${Math.round(totalW)}W total, busiest circuit at ${Math.round(worst * 100)}% of its rating. No daisy-chained strips. Drinks kept away from equipment.`,
      further: elecIssues.map(i => i.msg).join(" ")
    });
  }
  if (has(it => def(it).strip?.reel)) {
    add({
      id: "reel", hazard: "Overheating of coiled extension reels", who: "Crew, venue", l: 3, s: 4, rl: 1, rs: 4,
      controls: "Reels fully unwound before use and loads kept within the reel's uncoiled rating.", further: ""
    });
  }

  // Working at height: risers and staging.
  const risers = P.shapes.filter(s => s.kind === "riser");
  if (risers.length) {
    add({
      id: "height", hazard: "Falls from camera risers or staging",
      who: "Camera operators, crew", l: 2, s: 4, rl: 1, rs: 4,
      controls: `${risers.length} riser${risers.length > 1 ? "s" : ""} (${risers.map(r => r.label || "riser").join(", ")}) with edge protection or handrails above 0.6m, steps for access, tripods secured, no cables on steps.`,
      further: ""
    });
  }

  // Tripods and stands in audience areas.
  const audienceZones = P.shapes.filter(s => ["seating", "walkway", "escape"].includes(s.kind));
  const exposed = P.items.filter(it => (def(it).camera || it.type === "speaker_pa") && audienceZones.some(z => shapeContains(z, it)));
  if (exposed.length || has(it => def(it).camera && !it.type.startsWith("cam_ptz"))) {
    add({
      id: "tripods", hazard: "Tripods and stands knocked over in audience areas",
      who: "Audience, camera operators", l: exposed.length ? 3 : 2, s: 3, rl: exposed.length ? 2 : 1, rs: 3,
      controls: "Tripod legs taped or sandbagged, spreaders fitted, positions agreed with the venue, operators stay with manned cameras.",
      further: exposed.length ? `Check positions inside audience areas: ${exposed.map(i => i.label).join(", ")}.` : ""
    });
  }

  if (has(it => it.type === "speaker_pa")) {
    add({
      id: "pa", hazard: "Speaker stands toppling; excessive sound levels",
      who: "Audience, performers, crew", l: 2, s: 4, rl: 1, rs: 3,
      controls: "Stands on level ground, within rated load, legs taped/weighted. Sound levels monitored and kept within venue limits.", further: ""
    });
  }
  if (has(it => it.type === "projector")) {
    add({
      id: "projector", hazard: "Hot surfaces and bright light from projectors",
      who: "Presenters, crew", l: 2, s: 2, rl: 1, rs: 2,
      controls: "Projectors positioned out of reach, vents kept clear, presenters briefed not to look into the lens.", further: ""
    });
  }
  if (P.items.length) {
    add({
      id: "manual", hazard: "Manual handling injuries during load-in and load-out",
      who: "Crew", l: 3, s: 3, rl: 2, rs: 3,
      controls: "Kit in wheeled flight cases, team lifts for anything over 20kg, trolleys used, clear route agreed with the venue, proper footwear.", further: ""
    });
  }
  const longDay = P.crew.some(p => personHours(p) / Math.max(1, P.quote.crewDays) > 10);
  if (P.crew.length) {
    add({
      id: "fatigue", hazard: "Crew fatigue from long working days",
      who: "Crew", l: longDay ? 3 : 2, s: 3, rl: longDay ? 2 : 1, rs: 3,
      controls: `Scheduled breaks, water available, call times on the crew sheet. Planned day: ${P.quote.hoursPerDay} hours.`,
      further: longDay ? "Some crew are over 10 hours a day - plan relief or a split call." : ""
    });
  }
  if (has(it => def(it).cat === "switch")) {
    add({
      id: "foh", hazard: "Audience interference with the production position",
      who: "Crew, audience", l: 2, s: 2, rl: 1, rs: 2,
      controls: "Production position behind barriers or a table line, cables dressed away from the audience side, crew present whenever the room is open.", further: ""
    });
  }
  return rows;
}

// Auto rows merged with the user's edits, plus custom rows.
function riskRows() {
  const R = project.risk;
  const auto = autoRisks().map(r => ({ ...r, ...(R.overrides[r.id] || {}), edited: !!R.overrides[r.id] && Object.keys(R.overrides[r.id]).length > 0 }));
  return [...auto, ...R.custom.map(r => ({ ...r, custom: true }))];
}

function riskTarget(id) {
  const R = project.risk;
  const custom = R.custom.find(r => r.id === id);
  if (custom) return custom;
  return (R.overrides[id] ??= {});
}

function levelSel(path, val, labels) {
  return `<select data-f="${path}" data-t="num">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === +val ? " selected" : ""}>${n} ${labels[n]}</option>`).join("")}</select>`;
}
const bandChip = (l, s) => { const [cls, name] = riskBand(l * s); return `<span class="rchip r-${cls}">${l * s} ${name}</span>`; };

function renderRiskReport() {
  const R = project.risk;
  const rows = riskRows();
  const crewOpts = [["", "-"], ...project.crew.map(p => [p.name || "Unnamed", `${p.name || "Unnamed"}${p.role ? " (" + p.role + ")" : ""}`])];
  let h = `<div data-scope="riskhead" class="row3">
      ${fText("Assessed by", "assessor", R.assessor, "Name")}
      ${fText("Date", "date", R.date, "e.g. 12 March 2027")}
      ${fText("Review by", "review", R.review, "e.g. on the get-in")}
    </div>
    <p class="muted small">Generated from the plan and updated live as the plan changes. Edit any field to override it. Score = likelihood × severity (1–5 each): 1–4 low, 5–9 medium, 10–16 high, 20+ very high.</p>`;
  for (const r of rows) {
    const off = r.na;
    h += `<div class="risk${off ? " na" : ""}" data-scope="risk" data-rid="${r.id}">
      <div class="risk-head">
        ${r.custom ? `<input type="text" class="title-in sm" data-f="hazard" data-t="text" value="${esc(r.hazard)}" placeholder="Describe the hazard">` : `<b>${esc(r.hazard)}</b>`}
        <span class="risk-chips">${bandChip(r.l, r.s)}<span class="muted">→</span>${bandChip(r.rl, r.rs)}</span>
      </div>
      ${off ? "" : `<div class="risk-grid">
        ${fText("Who might be harmed", "who", r.who)}
        ${fSel("Responsible", "owner", r.owner || "", crewOpts)}
        <label class="f wide"><span>Controls in place</span><textarea data-f="controls" data-t="text" rows="2">${esc(r.controls)}</textarea></label>
        <label class="f"><span>Likelihood (before)</span>${levelSel("l", r.l, LIKELIHOOD)}</label>
        <label class="f"><span>Severity (before)</span>${levelSel("s", r.s, SEVERITY)}</label>
        <label class="f"><span>Likelihood (with controls)</span>${levelSel("rl", r.rl, LIKELIHOOD)}</label>
        <label class="f"><span>Severity (with controls)</span>${levelSel("rs", r.rs, SEVERITY)}</label>
        <label class="f wide"><span>Further action needed</span><textarea data-f="further" data-t="text" rows="1" placeholder="None">${esc(r.further)}</textarea></label>
      </div>`}
      <div class="risk-actions">
        ${fCheck("Not applicable", "na", off)}
        ${r.custom ? `<button class="link danger small" data-act="del-risk" data-id="${r.id}">Remove</button>`
          : r.edited ? `<button class="link small" data-act="reset-risk" data-id="${r.id}">Reset to generated</button>` : `<span class="muted small">auto</span>`}
      </div>
    </div>`;
  }
  h += `<button class="btn" data-act="add-risk">+ Add hazard</button>` + csvBtn("risk");
  return h;
}

function riskCSVRows() {
  return riskRows().filter(r => !r.na).map(r => ({
    Hazard: r.hazard, "Who might be harmed": r.who, "Controls in place": r.controls,
    "Risk before": `${r.l * r.s} (${riskBand(r.l * r.s)[1]})`, "Further action": r.further || "",
    "Residual risk": `${r.rl * r.rs} (${riskBand(r.rl * r.rs)[1]})`, Responsible: r.owner || ""
  }));
}

function riskPrintHtml() {
  const R = project.risk;
  const rows = riskRows().filter(r => !r.na);
  return `<p class="doc-meta">${[R.assessor && `Assessed by: ${esc(R.assessor)}`, R.date && `Date: ${esc(R.date)}`, R.review && `Review: ${esc(R.review)}`].filter(Boolean).join(" · ")}</p>
    <table class="risk-table"><thead><tr><th>Hazard</th><th>Who</th><th>Controls in place</th><th>Before</th><th>Further action</th><th>After</th><th>Responsible</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><b>${esc(r.hazard)}</b></td><td>${esc(r.who)}</td><td>${esc(r.controls)}</td>
      <td>${bandChip(r.l, r.s)}</td><td>${esc(r.further || "-")}</td><td>${bandChip(r.rl, r.rs)}</td><td>${esc(r.owner || "")}</td></tr>`).join("")}
    </tbody></table>
    <p class="muted small">Score = likelihood × severity (1–5 each). 1–4 low, 5–9 medium, 10–16 high, 20+ very high.</p>
    <div class="signoff"><span>Assessor signature: ____________________</span><span>Venue representative: ____________________</span><span>Date: ____________</span></div>`;
}
