"use strict";

// Call sheet: show-day schedule (worked back from the show time using a set-up
// estimate built from the plan), venue and emergency information, crew contacts.
// Loaded before app.js; only called after boot.

const toMin = t => {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(t || "").trim());
  return m ? (+m[1] % 24) * 60 + +m[2] : null;
};
const fmtTime = m => {
  if (m == null) return "-";
  const d = ((Math.round(m) % 1440) + 1440) % 1440;
  const prevDay = m < 0 ? " (day before)" : "";
  return `${String(Math.floor(d / 60)).padStart(2, "0")}:${String(d % 60).padStart(2, "0")}${prevDay}`;
};
const fmtDur = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""}` : `${m}m`);
const round15 = m => Math.ceil(m / 15) * 15;

// Rough, deliberately conservative crew-minutes per task. Tuned for small
// livestream crews; the total can be overridden on the call sheet.
const NON_RIGGING = ["Director", "Producer"];

function setupEstimate() {
  const P = project;
  const lines = [];
  const add = (task, min) => { if (min > 0) lines.push({ task, min: Math.round(min) }); };
  const items = P.items.filter(it => !def(it).venueOwned);
  const cams = items.filter(it => def(it).camera);
  const power = items.filter(it => def(it).cat === "power");
  const other = items.length - cams.length - power.length;
  const cables = P.cables.filter(c => A.cable[c.id]?.needsCable !== false);
  const metres = cables.reduce((s, c) => s + (A.cable[c.id]?.planned || 0), 0);

  add("Unload, load in and unpack", 30 + items.length * 2);
  add(`Build, level and balance ${cams.length} camera${cams.length === 1 ? "" : "s"}`, cams.length * 15);
  add(`Place and connect ${other} other device${other === 1 ? "" : "s"}`, other * 5);
  add(`Run and dress ${cables.length} cables (${Math.round(metres)}m)`, cables.length * 3 + metres / 10);
  add(`Power distribution (${power.length} units)`, power.length * 5);
  if (A.safety.ramps || A.safety.matM) add("Lay cable ramps and matting", A.safety.ramps * 3 + A.safety.matM * 1);
  if (P.shapes.some(s => s.kind === "riser")) add("Check risers and camera positions", 15);
  if (P.items.some(it => def(it).encoder)) add("Network, encoder and test stream", 30);
  if (P.items.some(it => def(it).cat === "audio" && def(it).role)) add("Audio patch and line check prep", 20);
  if (P.items.some(it => def(it).cat === "switch")) add("Vision mixer inputs, multiview and graphics", 20);

  const work = lines.reduce((s, l) => s + l.min, 0);
  // Only people who rig count; directors and producers are usually elsewhere.
  const riggers = P.crew.filter(p => !NON_RIGGING.includes(p.role)).length;
  const crew = Math.max(1, riggers);
  // Extra people help less and less (shared cable routes, one vision mixer):
  // each extra person counts as ~60%, and no more than 4 people's worth.
  const effective = Math.min(1 + (crew - 1) * 0.6, 4);
  const setup = round15(work / effective);
  const getout = round15((work * 0.6) / effective);
  return { lines, work, crew, setup, getout };
}

function callSchedule() {
  const C = project.callsheet;
  const est = setupEstimate();
  const setup = C.setupOverride > 0 ? C.setupOverride : est.setup;
  const getout = C.getoutOverride > 0 ? C.getoutOverride : est.getout;
  const show = toMin(C.showTime);
  if (show == null) return { est, setup, getout, rows: null };
  const doors = show - (C.doorsBefore || 0);
  const checks = doors - (C.rehearsal || 0);
  const setupDone = checks - (C.buffer || 0);
  const crewCall = setupDone - setup;
  const offAir = show + (C.showLen || 0);
  const rows = [
    { t: crewCall, what: "Crew call - load in and start set-up" },
    { t: setupDone, what: `Set-up complete (${fmtDur(setup)} estimated)` },
    ...(C.buffer ? [{ t: setupDone, what: `Contingency (${fmtDur(C.buffer)})` }] : []),
    { t: checks, what: "Line check, camera checks, test stream, rehearsal" },
    { t: doors, what: "Doors open - cable routes clear, crew in position" },
    { t: show, what: "Live / show start" },
    { t: offAir, what: "Off air / show end" },
    { t: offAir + getout, what: `Get-out complete (${fmtDur(getout)} estimated)` }
  ];
  return { est, setup, getout, rows, crewCall };
}

function mapsLink(what) {
  const where = [project.callsheet.address, project.meta.venue].filter(Boolean).join(", ");
  if (!where) return "";
  return `<a class="link small" href="https://www.google.com/maps/search/${encodeURIComponent(what + " near " + where)}" target="_blank" rel="noopener">Find on maps ↗</a>`;
}

function contactBlock(key, title, hint) {
  const c = project.callsheet[key];
  return `<div class="cs-card"><div class="cs-card-h"><b>${title}</b>${mapsLink(hint)}</div>
    ${fText("Name", `${key}.name`, c.name, hint)}
    ${fText("Address", `${key}.address`, c.address)}
    ${fText("Phone", `${key}.phone`, c.phone)}</div>`;
}

function renderCallSheet() {
  const P = project, C = P.callsheet, region = REGIONS[P.region];
  const S = callSchedule();
  const crewOpts = [["", "-"], ...P.crew.map(p => [p.name || "Unnamed", `${p.name || "Unnamed"}${p.role ? " (" + p.role + ")" : ""}`])];
  let h = `<div data-scope="callsheet">
    <h4>Show day</h4>
    <div class="row3">
      <div data-scope="project">${fText("Date", "meta.date", P.meta.date, "e.g. Sat 14 March")}</div>
      ${fText("Show / live time", "showTime", C.showTime, "e.g. 19:00")}
      ${fNum("Show length", "showLen", C.showLen, { unit: "min", step: 15, min: 0 })}
    </div>
    <div class="row3">
      ${fNum("Doors open before", "doorsBefore", C.doorsBefore, { unit: "min", step: 15, min: 0 })}
      ${fNum("Line check & rehearsal", "rehearsal", C.rehearsal, { unit: "min", step: 15, min: 0 })}
      ${fNum("Contingency", "buffer", C.buffer, { unit: "min", step: 15, min: 0 })}
    </div>
    <div class="row2">
      ${fNum(`Set-up time (estimate ${fmtDur(S.est.setup)})`, "setupOverride", C.setupOverride ?? "", { unit: "min", step: 15, min: 0, t: "numOrNull", ph: String(S.est.setup) })}
      ${fNum(`Get-out time (estimate ${fmtDur(S.est.getout)})`, "getoutOverride", C.getoutOverride ?? "", { unit: "min", step: 15, min: 0, t: "numOrNull", ph: String(S.est.getout) })}
    </div>
    ${S.rows ? `<table class="sched"><tbody>${S.rows.map(r => `<tr><td class="t">${fmtTime(r.t)}</td><td>${esc(r.what)}</td></tr>`).join("")}</tbody></table>`
      : `<p class="note">Enter the show time to build the schedule.</p>`}
    <details class="est"><summary>How the set-up estimate is worked out</summary>
      <table><tbody>${S.est.lines.map(l => `<tr><td>${esc(l.task)}</td><td class="num">${l.min} min</td></tr>`).join("")}
      <tr class="sub"><td>Total work</td><td class="num">${S.est.work} min</td></tr>
      <tr><td>${S.est.crew} rigging crew (each extra person ≈ 60%, max 4 people's worth)</td><td class="num">≈ ${fmtDur(S.est.setup)}</td></tr></tbody></table>
      <p class="muted small">A rough guide from the plan. Type your own set-up time above to override it.</p></details>

    <h4>Venue</h4>
    <div class="row2">${fText("Address", "address", C.address, "Street, town, postcode")}${fText("What3words / map pin", "pin", C.pin, "optional")}</div>
    <div class="row2">${fText("Venue contact", "venueContact", C.venueContact, "Name")}${fText("Venue contact phone", "venuePhone", C.venuePhone)}</div>
    <div class="row2">${fText("Access & loading", "access", C.access, "e.g. Loading bay on Mill Lane, lift to 1st floor")}${fText("Parking", "parking", C.parking)}</div>
    <div class="row2">${fText("Client contact", "clientContact", C.clientContact, "Name")}${fText("Client contact phone", "clientPhone", C.clientPhone)}</div>
    <div class="row2">${fText("Wi-Fi / network", "wifi", C.wifi, "Network and who to ask")}${fText("Catering / breaks", "catering", C.catering)}</div>

    <h4>Emergency</h4>
    <p class="emerg">Emergency services: <b>${esc(region.emergency)}</b> <span class="muted small">(${esc(region.name.split(" (")[0])} - change under Plan → Power → Mains)</span></p>
    <div class="cs-grid">
      ${contactBlock("hospital", "Nearest A&amp;E / hospital", "hospital emergency department")}
      ${contactBlock("doctor", "Doctor / urgent care", "urgent care doctor")}
      ${contactBlock("chemist", "Chemist / pharmacy", "pharmacy")}
      ${contactBlock("police", "Police (non-emergency)", "police station")}
    </div>
    <div class="row3">
      ${fSel("First aider", "firstAider", C.firstAider, crewOpts)}
      ${fText("First aid kit location", "firstAidKit", C.firstAidKit, "e.g. Production table")}
      ${fText("Fire assembly point", "assembly", C.assembly, "e.g. Car park by main gate")}
    </div>
    <p class="muted small">Check these with the venue on the recce. "Find on maps" opens a search near the venue address - confirm the hospital has a 24-hour emergency department.</p>
    ${fArea("Notes for the crew", "notes", C.notes, "Dress code, radio channels, meal times, anything else")}
  </div>
  <h4>Crew contacts</h4>
  ${table(callCrewRows(S))}
  ${csvBtn("callsheet")}`;
  return h;
}

// Someone's call: their own time, or the general crew call from the schedule.
function crewCallTime() {
  const S = callSchedule();
  return S.rows ? S.crewCall : null;
}
function callTimeFor(p, crewCall = crewCallTime()) {
  if (p.callTime) {
    const m = toMin(p.callTime);
    return m == null ? p.callTime : fmtTime(m);
  }
  return crewCall == null ? "" : fmtTime(crewCall);
}

function callCrewRows(S = callSchedule()) {
  return project.crew.map(p => ({
    Name: p.name || "Unnamed", Role: p.role || "", Phone: p.contact || "", Email: p.email || "", Radio: p.radio || "",
    "Call time": p.callTime || (S.rows ? fmtTime(S.crewCall) : ""),
    Positions: project.items.filter(it => it.operatorId === p.id).map(it => it.label).join(", ")
  }));
}

function callSheetPrintHtml() {
  const P = project, C = P.callsheet, region = REGIONS[P.region];
  const S = callSchedule();
  const kv = rows => `<table class="kv"><tbody>${rows.filter(([, v]) => v).map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`;
  const place = (title, c) => (c.name || c.phone || c.address)
    ? `<div class="cs-print-card"><b>${title}</b><span>${esc(c.name)}</span><span>${esc(c.address)}</span><span class="ph">${esc(c.phone)}</span></div>` : "";
  return `
    ${S.rows ? `<table class="sched"><tbody>${S.rows.map(r => `<tr><td class="t">${fmtTime(r.t)}</td><td>${esc(r.what)}</td></tr>`).join("")}</tbody></table>` : ""}
    <div class="cs-cols">
      <div><h4>Venue</h4>${kv([["Venue", P.meta.venue], ["Address", C.address], ["Map pin", C.pin], ["Contact", [C.venueContact, C.venuePhone].filter(Boolean).join(" · ")],
        ["Client", [P.meta.client, C.clientContact, C.clientPhone].filter(Boolean).join(" · ")], ["Access", C.access], ["Parking", C.parking], ["Wi-Fi", C.wifi], ["Catering", C.catering]])}</div>
      <div><h4>Emergency - call ${esc(region.emergency)}</h4>
        <div class="cs-print-grid">${place("A&amp;E / hospital", C.hospital)}${place("Doctor", C.doctor)}${place("Chemist", C.chemist)}${place("Police (non-emergency)", C.police)}</div>
        ${kv([["First aider", C.firstAider], ["First aid kit", C.firstAidKit], ["Assembly point", C.assembly]])}</div>
    </div>
    ${C.notes ? `<h4>Notes</h4><p class="terms">${esc(C.notes)}</p>` : ""}
    <h4>Crew</h4>${table(callCrewRows(S))}`;
}

function callSheetCSVRows() {
  return callCrewRows();
}
