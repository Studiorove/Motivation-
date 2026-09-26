"use strict";

// Costing: a company-wide rate card + branding (stored once per browser), and a
// per-plan quote (hire days, crew hours, extras, discount). A plan can lock a copy
// of the rate card so an old quote doesn't change when rates are updated later.

const KEY_COMPANY = "rigplan:company";
let company = null;

function defaultCompany() {
  return {
    name: "", contact: "", color: "#6c6cff", logo: null, terms: "",
    currency: "£", vatPct: 20, extraDayPct: 100,
    kitRates: {}, roleRates: {}, cableRates: {}
  };
}

function loadCompany() {
  try { company = { ...defaultCompany(), ...(JSON.parse(lsGet(KEY_COMPANY)) || {}) }; }
  catch (e) { company = defaultCompany(); }
}

function saveCompany() {
  if (!lsSet(KEY_COMPANY, JSON.stringify(company))) toast("Couldn't save company settings - try a smaller logo.", 5000);
}

const RATE_FIELDS = ["currency", "vatPct", "extraDayPct", "kitRates", "roleRates", "cableRates"];
const rateCard = () => (project.quote.locked && project.quote.snapshot) || company;
const kitRate = type => rateCard().kitRates?.[type] ?? CATALOG[type].rate ?? 0;
const roleRate = role => rateCard().roleRates?.[role] ?? DEFAULT_ROLE_RATES[role] ?? 0;
const cableBase = kind => kind.split(">")[0];
const cableRate = kind => rateCard().cableRates?.[cableBase(kind)] ?? DEFAULT_CABLE_RATES[cableBase(kind)] ?? 0;

function money(n) {
  return (rateCard().currency || "") + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Day 1 at full rate, each extra day at extraDayPct of the rate.
function hireFactor(days) {
  if (!(days > 0)) return 0;
  return 1 + (days - 1) * ((rateCard().extraDayPct ?? 100) / 100);
}

const personHours = p => p.hours ?? project.quote.crewDays * project.quote.hoursPerDay;
const personRate = p => p.rate ?? roleRate(p.role);

function computeQuote() {
  const P = project, q = P.quote;
  const f = hireFactor(q.hireDays);
  const daysTxt = `${q.hireDays} day${q.hireDays === 1 ? "" : "s"}`;

  const byType = {};
  for (const it of P.items) (byType[it.type] ??= []).push(it);
  const kit = Object.entries(byType)
    .map(([type, list]) => ({ desc: CATALOG[type].name, cat: CAT[CATALOG[type].cat].name, qty: list.length, rate: kitRate(type), days: daysTxt, total: list.length * kitRate(type) * f }))
    .filter(l => l.rate > 0)
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.desc.localeCompare(b.desc));

  const cables = [];
  if (q.includeCables) {
    const byKind = {};
    for (const c of P.cables) {
      const i = A.cable[c.id];
      if (i?.needsCable) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
    }
    for (const [kind, n] of Object.entries(byKind)) {
      const qty = n + (P.spares || 0);
      const rate = cableRate(kind);
      if (rate > 0) cables.push({ desc: kind === "power" ? "Mains extension leads" : `${kindInfo(kind).name} cables`, qty, rate, days: daysTxt, total: qty * rate * f });
    }
    cables.sort((a, b) => a.desc.localeCompare(b.desc));
  }
  // Ramps and matting are needed whether or not cables themselves are charged.
  const safetyRate = k => rateCard().kitRates?.[k] ?? SAFETY_ITEMS[k].rate;
  if (A.safety.ramps) cables.push({ desc: SAFETY_ITEMS.safety_ramp.name, qty: A.safety.ramps, rate: safetyRate("safety_ramp"), days: daysTxt, total: A.safety.ramps * safetyRate("safety_ramp") * f });
  if (A.safety.matM) cables.push({ desc: "Cable matting (m)", qty: A.safety.matM, rate: safetyRate("safety_mat"), days: daysTxt, total: A.safety.matM * safetyRate("safety_mat") * f });

  const crew = P.crew.map(p => ({
    desc: `${p.name || "Unnamed"}${p.role ? " · " + p.role : ""}`, role: p.role || "Crew", qty: personHours(p), unit: "hrs",
    rate: personRate(p), total: personHours(p) * personRate(p), person: p
  }));

  const extras = q.extras.map(x => ({ desc: x.desc || "Item", qty: x.qty || 0, rate: x.unit || 0, total: (x.qty || 0) * (x.unit || 0), extra: x }));

  const sections = [
    { id: "kit", name: "Equipment hire", lines: kit },
    { id: "cables", name: "Cables & safety", lines: cables },
    { id: "crew", name: "Crew", lines: crew },
    { id: "extras", name: "Other costs", lines: extras }
  ].map(s => ({ ...s, subtotal: s.lines.reduce((t, l) => t + l.total, 0) }));

  const subtotal = sections.reduce((t, s) => t + s.subtotal, 0);
  const discount = subtotal * (q.discountPct || 0) / 100;
  const net = subtotal - discount;
  const vatPct = rateCard().vatPct || 0;
  const vat = net * vatPct / 100;
  return { sections, subtotal, discount, net, vatPct, vat, total: net + vat };
}

// ---------- Costing report tab (editable) -------------------------------------------------

function renderCostingReport() {
  const q = project.quote;
  const Q = computeQuote();
  const cur = rateCard().currency;
  let h = `<div class="quote-bar" data-scope="quote">
      ${fNum("Kit hire days", "hireDays", q.hireDays, { step: 1, min: 0 })}
      ${fNum("Crew days", "crewDays", q.crewDays, { step: 0.5, min: 0 })}
      ${fNum("Hours per crew day", "hoursPerDay", q.hoursPerDay, { step: 0.5, min: 0 })}
      ${fNum("Discount", "discountPct", q.discountPct, { step: 1, min: 0, max: 100, unit: "%" })}
      ${fCheck("Charge for cables", "includeCables", q.includeCables)}
    </div>
    <div class="quote-actions">
      <button class="btn sm" data-act="company">Edit rate card &amp; branding</button>
      <button class="btn sm" data-act="toggle-lock">${q.locked ? "🔒 Prices locked - unlock" : "Lock prices for this plan"}</button>
      <span class="muted small">${q.locked ? "Uses the rates saved when you locked it." : `Uses the current rate card. Extra days charged at ${rateCard().extraDayPct ?? 100}%.`}</span>
    </div>`;

  const lineTable = (s, cols, row) => s.lines.length
    ? `<div class="tbl-wrap"><table class="quote"><thead><tr>${cols.map((c, i) => `<th${i === cols.length - 1 ? ' class="num"' : ""}>${c}</th>`).join("")}</tr></thead><tbody>${s.lines.map(row).join("")}
       <tr class="sub"><td colspan="${cols.length - 1}">${esc(s.name)} subtotal</td><td class="num">${money(s.subtotal)}</td></tr></tbody></table></div>`
    : `<p class="muted small">Nothing here.</p>`;

  const [kit, cables, crew, extras] = Q.sections;
  h += `<h4>Equipment hire</h4>` + lineTable(kit, ["Equipment", "Qty", "Rate/day", "Hire", "Total"], l =>
    `<tr><td>${esc(l.desc)}</td><td>${l.qty}</td><td>${money(l.rate)}</td><td>${l.days}</td><td class="num">${money(l.total)}</td></tr>`);
  if (q.includeCables || cables.lines.length) h += `<h4>Cables &amp; safety</h4>` + lineTable(cables, ["Cable", "Qty (incl. spares)", "Rate/day", "Hire", "Total"], l =>
    `<tr><td>${esc(l.desc)}</td><td>${l.qty}</td><td>${money(l.rate)}</td><td>${l.days}</td><td class="num">${money(l.total)}</td></tr>`);

  h += `<h4>Crew</h4>` + (crew.lines.length ? lineTable(crew, ["Person", "Hours", `Rate/hr (${esc(cur)})`, "Total"], l =>
    `<tr data-scope="person" data-pid="${l.person.id}"><td>${esc(l.desc)}</td>
      <td><input type="number" class="cell" data-f="hours" data-t="numOrNull" value="${l.person.hours ?? ""}" placeholder="${project.quote.crewDays * project.quote.hoursPerDay}" step="0.5" min="0"></td>
      <td><input type="number" class="cell" data-f="rate" data-t="numOrNull" value="${l.person.rate ?? ""}" placeholder="${roleRate(l.person.role)}" step="1" min="0"></td>
      <td class="num">${money(l.total)}</td></tr>`) : `<p class="muted small">Add people in the Crew tab.</p>`);

  h += `<h4>Other costs</h4><div class="tbl-wrap"><table class="quote"><thead><tr><th>Description</th><th>Qty</th><th>Unit (${esc(cur)})</th><th>Total</th><th></th></tr></thead><tbody>
    ${extras.lines.map(l => `<tr data-scope="extra" data-eid="${l.extra.id}">
      <td><input type="text" class="cell wide" data-f="desc" data-t="text" value="${esc(l.extra.desc)}" placeholder="e.g. Van hire, travel, platform fees"></td>
      <td><input type="number" class="cell" data-f="qty" data-t="num" value="${l.extra.qty}" step="1" min="0"></td>
      <td><input type="number" class="cell" data-f="unit" data-t="num" value="${l.extra.unit}" step="1" min="0"></td>
      <td class="num">${money(l.total)}</td><td><button class="icon-btn sm" data-act="del-extra" data-id="${l.extra.id}" title="Remove">✕</button></td></tr>`).join("")}
    </tbody></table></div><button class="btn sm" data-act="add-extra">+ Add cost</button>`;

  h += `<div class="totals">
    <div><span>Subtotal</span><b>${money(Q.subtotal)}</b></div>
    ${Q.discount ? `<div><span>Discount (${q.discountPct}%)</span><b>−${money(Q.discount)}</b></div>` : ""}
    <div><span>VAT (${Q.vatPct}%)</span><b>${money(Q.vat)}</b></div>
    <div class="grand"><span>Total</span><b>${money(Q.total)}</b></div></div>`;
  return h + csvBtn("quote");
}

function quoteCSVRows() {
  const Q = computeQuote();
  const rows = [];
  for (const s of Q.sections) for (const l of s.lines) rows.push({ Section: s.name, Item: l.desc, Qty: l.qty, Rate: r2(l.rate), Total: r2(l.total) });
  rows.push({ Section: "", Item: "Subtotal", Total: r2(Q.subtotal) });
  if (Q.discount) rows.push({ Section: "", Item: "Discount", Total: -r2(Q.discount) });
  rows.push({ Section: "", Item: `VAT ${Q.vatPct}%`, Total: r2(Q.vat) });
  rows.push({ Section: "", Item: "Total", Total: r2(Q.total) });
  return rows;
}

// Quote block for the PDF. mode: "itemised" | "sections" | "total"
function quotePrintHtml(mode) {
  const Q = computeQuote();
  const q = project.quote;
  let h = "";
  if (mode === "itemised") {
    for (const s of Q.sections) {
      if (!s.lines.length) continue;
      h += `<table class="quote"><thead><tr><th>${esc(s.name)}</th><th>Qty</th><th>Rate</th><th class="num">Total</th></tr></thead><tbody>
        ${s.lines.map(l => `<tr><td>${esc(s.id === "crew" ? l.role : l.desc)}${l.days ? ` <span class="muted">· ${l.days}</span>` : ""}</td><td>${l.qty}${l.unit ? " " + l.unit : ""}</td><td>${money(l.rate)}</td><td class="num">${money(l.total)}</td></tr>`).join("")}
        <tr class="sub"><td colspan="3">Subtotal</td><td class="num">${money(s.subtotal)}</td></tr></tbody></table>`;
    }
  } else if (mode === "sections") {
    h += `<table class="quote"><tbody>${Q.sections.filter(s => s.lines.length).map(s => `<tr><td>${esc(s.name)}</td><td class="num">${money(s.subtotal)}</td></tr>`).join("")}</tbody></table>`;
  }
  h += `<div class="totals">
    ${mode !== "total" ? `<div><span>Subtotal</span><b>${money(Q.subtotal)}</b></div>` : ""}
    ${Q.discount && mode !== "total" ? `<div><span>Discount (${q.discountPct}%)</span><b>−${money(Q.discount)}</b></div>` : ""}
    ${mode !== "total" ? `<div><span>VAT (${Q.vatPct}%)</span><b>${money(Q.vat)}</b></div>` : ""}
    <div class="grand"><span>Total${mode === "total" ? ` (incl. ${Q.vatPct}% VAT)` : ""}</span><b>${money(Q.total)}</b></div></div>`;
  return h;
}

// ---------- Company & rates screen ----------------------------------------------------------

function renderCompany() {
  const C = company;
  let h = `<div data-scope="company" class="company">
    <section><h4>Branding</h4>
      <div class="brand-row">
        <div class="logo-box">${C.logo ? `<img src="${C.logo}" alt="Company logo">` : `<span class="muted small">No logo</span>`}</div>
        <div class="grow">
          ${fText("Company name", "name", C.name, "Shown on client PDFs")}
          ${fText("Contact line", "contact", C.contact, "email · phone · website")}
          <div class="row2"><label class="f"><span>Brand colour</span><input type="color" data-f="color" data-t="text" value="${esc(C.color)}"></label>
          <div class="f"><span>Logo</span><div class="insp-actions tight"><button class="btn sm" data-act="logo-upload">${C.logo ? "Replace" : "Upload…"}</button>${C.logo ? `<button class="btn sm danger" data-act="logo-clear">Remove</button>` : ""}</div></div></div>
        </div>
      </div>
      ${fArea("Terms / notes on quotes", "terms", C.terms, "e.g. 50% deposit to confirm. Prices exclude venue power and internet.")}
    </section>
    <section><h4>Pricing defaults</h4>
      <div class="row3">${fText("Currency symbol", "currency", C.currency)}${fNum("VAT / tax", "vatPct", C.vatPct, { unit: "%", step: 1, min: 0 })}${fNum("Extra days at", "extraDayPct", C.extraDayPct, { unit: "%", step: 5, min: 0 })}</div>
      <p class="muted small">"Extra days at 50%" means day 2 onwards costs half the day rate. 100% = every day full price.</p>
    </section>
    <section><h4>Crew rates per hour</h4><div class="rate-grid">
      ${ROLES.map(r => rateInput(r, `roleRates.${r}`, C.roleRates[r], DEFAULT_ROLE_RATES[r])).join("")}</div></section>
    <section><h4>Cable hire per day</h4><div class="rate-grid">
      ${Object.entries(CABLE_TYPES).map(([k, t]) => rateInput(t.name, `cableRates.${k}`, C.cableRates[k], DEFAULT_CABLE_RATES[k])).join("")}
      ${Object.entries(SAFETY_ITEMS).map(([k, t]) => rateInput(t.name, `kitRates.${k}`, C.kitRates[k], t.rate)).join("")}</div></section>
    <section><h4>Equipment hire per day</h4>`;
  for (const cat of CATEGORIES) {
    h += `<p class="cat-h small"><span class="cat-dot" style="--c:${cat.color}"></span>${cat.name}</p><div class="rate-grid">`;
    for (const [k, d] of Object.entries(CATALOG)) if (d.cat === cat.id) h += rateInput(d.name, `kitRates.${k}`, C.kitRates[k], d.rate);
    h += `</div>`;
  }
  h += `<p class="muted small">Blank = the built-in placeholder shown in grey. These are rough guesses - set your own.</p></section>
    <div class="insp-actions"><button class="btn" data-act="company-export">Export settings</button><button class="btn" data-act="company-import">Import settings…</button></div>
    <p class="muted small">Company settings are shared by every plan in this browser. Export them to give the rest of the team the same rate card and branding.</p></div>`;
  return h;
}

function rateInput(label, path, val, fallback) {
  return `<label class="rate"><span>${esc(label)}</span><div class="f-in"><em>${esc(company.currency)}</em><input type="number" data-f="${esc(path)}" data-t="numOrNull" value="${val ?? ""}" placeholder="${fallback ?? 0}" step="0.5" min="0"></div></label>`;
}

function lockPrices() {
  const snap = {};
  for (const k of RATE_FIELDS) snap[k] = JSON.parse(JSON.stringify(company[k]));
  // Freeze the placeholders too, so later catalog changes can't move the quote.
  for (const [k, d] of Object.entries(CATALOG)) snap.kitRates[k] ??= d.rate ?? 0;
  for (const r of ROLES) snap.roleRates[r] ??= DEFAULT_ROLE_RATES[r] ?? 0;
  for (const [k, t] of Object.entries(SAFETY_ITEMS)) snap.kitRates[k] ??= t.rate;
  for (const k of Object.keys(CABLE_TYPES)) snap.cableRates[k] ??= DEFAULT_CABLE_RATES[k] ?? 0;
  project.quote.snapshot = snap;
  project.quote.locked = true;
}
