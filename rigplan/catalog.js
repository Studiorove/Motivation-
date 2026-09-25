// Equipment + cable catalog. Specs are approximate planning figures, not
// manufacturer-certified - always check the real kit before a show.

// Cable/connector types. `max`/`warn` are practical run lengths in metres
// (passive cable, no extenders). `stock` is the lengths you'd pull from a
// cable store; planned runs are rounded up to the next stock length.
const CABLE_TYPES = {
  sdi:   { name: "SDI (BNC)",       abbr: "SDI",  color: "#f5a524", warn: 70, max: 100, stock: [1, 2, 5, 10, 15, 20, 30, 50, 75, 100] },
  hdmi:  { name: "HDMI",            abbr: "HDMI", color: "#4aa3ff", warn: 10, max: 15,  stock: [1, 2, 3, 5, 10, 15] },
  xlr:   { name: "XLR audio",       abbr: "XLR",  color: "#e05ad6", warn: 80, max: 100, stock: [1, 2, 3, 5, 10, 15, 20, 30, 50], family: "audio" },
  trs:   { name: '1/4" jack',       abbr: "JACK", color: "#c77dff", warn: 10, max: 20,  stock: [1, 2, 3, 5, 10], family: "audio" },
  mini:  { name: "3.5mm jack",      abbr: "3.5",  color: "#a78bfa", warn: 5,  max: 10,  stock: [1, 2, 3, 5, 10], family: "audio" },
  eth:   { name: "Ethernet (Cat6)", abbr: "NET",  color: "#3ad68a", warn: 90, max: 100, stock: [1, 2, 3, 5, 10, 15, 20, 30, 50, 100] },
  usb:   { name: "USB",             abbr: "USB",  color: "#9aa0ae", warn: 3,  max: 5,   stock: [1, 2, 3, 5] },
  com:   { name: "Intercom (XLR)",  abbr: "COM",  color: "#f472b6", warn: 150, max: 300, stock: [5, 10, 20, 30, 50, 100] },
  power: { name: "Mains power",     abbr: "PWR",  color: "#ff5b4a", warn: 40, max: 50,  stock: [2, 5, 10, 15, 25, 50] }
};

// Crew roles, in rough order of seniority on a call sheet.
const ROLES = [
  "Director",
  "Producer",
  "Technical lead",
  "Vision mixer (TD)",
  "Camera operator",
  "Audio engineer",
  "Graphics operator",
  "Streaming / encoder",
  "Floor manager",
  "Runner"
];

const CATEGORIES = [
  { id: "camera",  name: "Cameras",           color: "#f5a524" },
  { id: "switch",  name: "Vision mixers",     color: "#6c6cff" },
  { id: "audio",   name: "Audio",             color: "#e05ad6" },
  { id: "gfx",     name: "Graphics & playback", color: "#22d3ee" },
  { id: "stream",  name: "Streaming & network", color: "#3ad68a" },
  { id: "display", name: "Monitors & displays", color: "#4aa3ff" },
  { id: "convert", name: "Converters",        color: "#9aa0ae" },
  { id: "comms",   name: "Comms",             color: "#f472b6" },
  { id: "power",   name: "Power",             color: "#ff5b4a" }
];

// Port-list helper: ports("sdi", "out", 2, "SDI Out") ->
// [{id:"sdi_out_1", type:"sdi", dir:"out", name:"SDI Out 1"}, ...]
function ports(type, dir, count, name) {
  const list = [];
  for (let i = 1; i <= count; i++) {
    list.push({
      id: `${type}_${dir}_${i}`,
      type,
      dir,
      name: count > 1 ? `${name} ${i}` : name
    });
  }
  return list;
}

// Every catalog entry:
//   cat, name, short (label prefix), watts (0 / absent = battery or passive),
//   ports: [...], role (crew role that operates it, if any),
//   camera: { sensorW mm, focalMin mm, focalMax mm, lens: "fixed"|"interchangeable" }
//   strip: { outlets, ratingA } for power distribution; source: true for wall outlets.
const CATALOG = {
  // ---- Cameras -------------------------------------------------------------
  cam_z190: {
    cat: "camera", name: "Sony PXW-Z190 (1/3\")", short: "CAM", watts: 8, role: "Camera operator",
    camera: { sensorW: 4.8, focalMin: 4.3, focalMax: 107.5, lens: "fixed" },
    ports: [...ports("sdi", "out", 1, "SDI Out"), ...ports("hdmi", "out", 1, "HDMI Out"), ...ports("xlr", "in", 2, "XLR In")]
  },
  cam_xf405: {
    cat: "camera", name: "Canon XF405 (1\")", short: "CAM", watts: 7, role: "Camera operator",
    camera: { sensorW: 13.2, focalMin: 8.8, focalMax: 132, lens: "fixed" },
    ports: [...ports("sdi", "out", 1, "SDI Out"), ...ports("hdmi", "out", 1, "HDMI Out"), ...ports("xlr", "in", 2, "XLR In")]
  },
  cam_fx6: {
    cat: "camera", name: "Sony FX6 (full frame)", short: "CAM", watts: 18, role: "Camera operator",
    camera: { sensorW: 35.7, focalMin: 24, focalMax: 105, lens: "interchangeable" },
    ports: [...ports("sdi", "out", 1, "12G-SDI Out"), ...ports("hdmi", "out", 1, "HDMI Out"), ...ports("xlr", "in", 2, "XLR In")]
  },
  cam_a7: {
    cat: "camera", name: "Mirrorless (full frame, HDMI)", short: "CAM", watts: 10, role: "Camera operator",
    camera: { sensorW: 35.6, focalMin: 24, focalMax: 70, lens: "interchangeable" },
    ports: [...ports("hdmi", "out", 1, "HDMI Out"), ...ports("mini", "in", 1, "Mic In")]
  },
  cam_bmpcc6k: {
    cat: "camera", name: "Blackmagic Pocket 6K (S35)", short: "CAM", watts: 22, role: "Camera operator",
    camera: { sensorW: 23.1, focalMin: 18, focalMax: 55, lens: "interchangeable" },
    ports: [...ports("hdmi", "out", 1, "HDMI Out"), ...ports("mini", "in", 1, "Mic In")]
  },
  cam_bmstudio: {
    cat: "camera", name: "Blackmagic Studio Camera 4K Pro (MFT)", short: "CAM", watts: 25, role: "Camera operator",
    camera: { sensorW: 18.96, focalMin: 14, focalMax: 140, lens: "interchangeable" },
    ports: [...ports("sdi", "out", 1, "12G-SDI Out"), ...ports("sdi", "in", 1, "SDI Return"), ...ports("hdmi", "out", 1, "HDMI Out"), ...ports("eth", "io", 1, "Ethernet"), ...ports("com", "io", 1, "Talkback")]
  },
  cam_ptz: {
    cat: "camera", name: "PTZ camera 30x (1/2.7\")", short: "PTZ", watts: 12,
    camera: { sensorW: 5.37, focalMin: 4.42, focalMax: 132.6, lens: "fixed" },
    ports: [...ports("sdi", "out", 1, "SDI Out"), ...ports("hdmi", "out", 1, "HDMI Out"), ...ports("eth", "io", 1, "Ethernet (control/NDI)")]
  },
  cam_ptz_ndi: {
    cat: "camera", name: "PTZ camera 20x NDI/PoE", short: "PTZ",
    camera: { sensorW: 5.6, focalMin: 4.7, focalMax: 94, lens: "fixed" },
    ports: [...ports("eth", "io", 1, "Ethernet (PoE+/NDI)"), ...ports("hdmi", "out", 1, "HDMI Out")],
    poe: true, note: "Powered over PoE+ - needs a PoE switch."
  },
  ptz_controller: {
    cat: "camera", name: "PTZ joystick controller", short: "PTZC", watts: 10, role: "Camera operator",
    ports: [...ports("eth", "io", 1, "Ethernet")]
  },

  // ---- Vision mixers ---------------------------------------------------------
  atem_mini_pro: {
    cat: "switch", name: "ATEM Mini Pro", short: "SW", watts: 20, role: "Vision mixer (TD)",
    ports: [...ports("hdmi", "in", 4, "HDMI In"), ...ports("hdmi", "out", 1, "HDMI Out"), ...ports("usb", "out", 1, "USB-C Webcam Out"), ...ports("eth", "io", 1, "Ethernet"), ...ports("mini", "in", 2, "Mic In")]
  },
  atem_mini_extreme: {
    cat: "switch", name: "ATEM Mini Extreme ISO", short: "SW", watts: 36, role: "Vision mixer (TD)",
    ports: [...ports("hdmi", "in", 8, "HDMI In"), ...ports("hdmi", "out", 3, "HDMI Out"), ...ports("usb", "out", 2, "USB-C"), ...ports("eth", "io", 1, "Ethernet"), ...ports("mini", "in", 2, "Mic In")]
  },
  atem_tvs_hd8: {
    cat: "switch", name: "ATEM Television Studio HD8", short: "SW", watts: 60, role: "Vision mixer (TD)",
    ports: [...ports("sdi", "in", 8, "SDI In"), ...ports("sdi", "out", 4, "SDI Aux Out"), ...ports("sdi", "out", 1, "SDI Program Out"), ...ports("hdmi", "out", 1, "HDMI Multiview"), ...ports("xlr", "in", 2, "XLR In"), ...ports("eth", "io", 1, "Ethernet"), ...ports("com", "io", 1, "Talkback")]
  },
  vmix_pc: {
    cat: "switch", name: "vMix/OBS PC (4x SDI capture)", short: "PC", watts: 450, role: "Vision mixer (TD)",
    ports: [...ports("sdi", "in", 4, "SDI In"), ...ports("hdmi", "out", 2, "HDMI Out"), ...ports("eth", "io", 1, "Ethernet"), ...ports("usb", "in", 2, "USB")]
  },

  // ---- Audio -----------------------------------------------------------------
  mixer_digital: {
    cat: "audio", name: "Digital audio mixer (16ch)", short: "MIX", watts: 90, role: "Audio engineer",
    ports: [...ports("xlr", "in", 16, "XLR In"), ...ports("xlr", "out", 8, "XLR Out"), ...ports("eth", "io", 1, "Ethernet"), ...ports("usb", "out", 1, "USB Audio")]
  },
  mixer_analog: {
    cat: "audio", name: "Analog audio mixer (8ch)", short: "MIX", watts: 30, role: "Audio engineer",
    ports: [...ports("xlr", "in", 8, "XLR In"), ...ports("xlr", "out", 2, "Main Out"), ...ports("trs", "out", 2, "Aux Out")]
  },
  mic_wired: {
    cat: "audio", name: "Wired mic (SM58-type)", short: "MIC",
    ports: [...ports("xlr", "out", 1, "XLR Out")]
  },
  mic_lectern: {
    cat: "audio", name: "Lectern gooseneck mic", short: "MIC",
    ports: [...ports("xlr", "out", 1, "XLR Out")], note: "Needs 48V phantom from the mixer."
  },
  wireless_rx: {
    cat: "audio", name: "Wireless mic receiver", short: "RF", watts: 6,
    ports: [...ports("xlr", "out", 1, "XLR Out")], note: "Keep line of sight to the stage; check local RF licensing."
  },
  di_box: {
    cat: "audio", name: "DI box (laptop audio)", short: "DI",
    ports: [...ports("mini", "in", 1, "3.5mm In"), ...ports("xlr", "out", 1, "XLR Out")]
  },
  speaker_pa: {
    cat: "audio", name: "Powered PA speaker", short: "PA", watts: 250,
    ports: [...ports("xlr", "in", 1, "XLR In")]
  },
  headphones_amp: {
    cat: "audio", name: "Headphone amp", short: "HPA", watts: 10,
    ports: [...ports("xlr", "in", 2, "XLR In"), ...ports("trs", "out", 4, "Phones Out")]
  },

  // ---- Graphics / playback ----------------------------------------------------
  gfx_laptop: {
    cat: "gfx", name: "Graphics laptop (H2R / Singular)", short: "GFX", watts: 90, role: "Graphics operator",
    ports: [...ports("hdmi", "out", 1, "HDMI Out"), ...ports("eth", "io", 1, "Ethernet"), ...ports("mini", "out", 1, "Audio Out")]
  },
  slides_laptop: {
    cat: "gfx", name: "Presentation laptop", short: "PRES", watts: 65, role: "Graphics operator",
    ports: [...ports("hdmi", "out", 1, "HDMI Out"), ...ports("mini", "out", 1, "Audio Out")]
  },
  playback: {
    cat: "gfx", name: "Video playback deck (HyperDeck)", short: "PLAY", watts: 15,
    ports: [...ports("sdi", "out", 1, "SDI Out"), ...ports("sdi", "in", 1, "SDI In"), ...ports("hdmi", "out", 1, "HDMI Out"), ...ports("eth", "io", 1, "Ethernet")]
  },

  // ---- Streaming & network -------------------------------------------------------
  stream_pc: {
    cat: "stream", name: "Streaming laptop (OBS)", short: "ENC", watts: 90, role: "Streaming / encoder",
    ports: [...ports("usb", "in", 2, "USB In"), ...ports("hdmi", "in", 1, "HDMI capture"), ...ports("eth", "io", 1, "Ethernet")]
  },
  hw_encoder: {
    cat: "stream", name: "Hardware encoder (SDI/HDMI)", short: "ENC", watts: 15, role: "Streaming / encoder",
    ports: [...ports("sdi", "in", 1, "SDI In"), ...ports("hdmi", "in", 1, "HDMI In"), ...ports("eth", "io", 1, "Ethernet")]
  },
  router_bonding: {
    cat: "stream", name: "Router / 4G-5G bonding", short: "NET", watts: 25,
    ports: [...ports("eth", "io", 4, "LAN"), ...ports("eth", "in", 1, "WAN (venue)")]
  },
  switch_poe: {
    cat: "stream", name: "Network switch 8-port PoE+", short: "SWN", watts: 150, poeSource: true,
    ports: [...ports("eth", "io", 8, "Port")], note: "Wattage includes PoE budget."
  },
  venue_network: {
    cat: "stream", name: "Venue network drop", short: "LAN",
    ports: [...ports("eth", "out", 1, "Wall port")], note: "Confirm upload speed and open ports with the venue."
  },

  // ---- Displays ------------------------------------------------------------------
  monitor_mv: {
    cat: "display", name: "Multiview monitor (27\")", short: "MON", watts: 40,
    ports: [...ports("hdmi", "in", 1, "HDMI In")]
  },
  monitor_field: {
    cat: "display", name: "Field monitor 7\" (SDI/HDMI)", short: "MON", watts: 12,
    ports: [...ports("sdi", "in", 1, "SDI In"), ...ports("hdmi", "in", 1, "HDMI In")]
  },
  tv_confidence: {
    cat: "display", name: "Confidence / stage TV (55\")", short: "TV", watts: 120,
    ports: [...ports("hdmi", "in", 1, "HDMI In")]
  },
  projector: {
    cat: "display", name: "Projector", short: "PROJ", watts: 350,
    ports: [...ports("hdmi", "in", 1, "HDMI In"), ...ports("sdi", "in", 1, "SDI In")]
  },

  // ---- Converters ------------------------------------------------------------------
  conv_hdmi_sdi: {
    cat: "convert", name: "HDMI → SDI converter", short: "CNV", watts: 3,
    ports: [...ports("hdmi", "in", 1, "HDMI In"), ...ports("sdi", "out", 1, "SDI Out")]
  },
  conv_sdi_hdmi: {
    cat: "convert", name: "SDI → HDMI converter", short: "CNV", watts: 3,
    ports: [...ports("sdi", "in", 1, "SDI In"), ...ports("hdmi", "out", 1, "HDMI Out")]
  },
  sdi_da: {
    cat: "convert", name: "SDI distribution amp 1→4", short: "DA", watts: 8,
    ports: [...ports("sdi", "in", 1, "SDI In"), ...ports("sdi", "out", 4, "SDI Out")]
  },
  hdmi_splitter: {
    cat: "convert", name: "HDMI splitter 1→2", short: "SPL", watts: 5,
    ports: [...ports("hdmi", "in", 1, "HDMI In"), ...ports("hdmi", "out", 2, "HDMI Out")]
  },
  hdmi_fibre: {
    cat: "convert", name: "HDMI over Cat6 extender (TX+RX)", short: "EXT", watts: 10,
    ports: [...ports("hdmi", "in", 1, "HDMI In"), ...ports("hdmi", "out", 1, "HDMI Out")],
    note: "Place TX at source, RX at destination - planned as one unit here."
  },

  // ---- Comms ---------------------------------------------------------------------------
  com_base: {
    cat: "comms", name: "Intercom base station (2ch)", short: "COM", watts: 30, role: "Technical lead",
    ports: [...ports("com", "io", 4, "Line")]
  },
  com_beltpack: {
    cat: "comms", name: "Intercom beltpack", short: "BP",
    ports: [...ports("com", "io", 2, "Line (loop-thru)")], note: "Powered from the intercom line."
  },

  // ---- Power ------------------------------------------------------------------------------
  wall_socket: {
    cat: "power", name: "Wall socket (double)", short: "WALL", source: true,
    ports: [...ports("power", "out", 2, "Outlet")]
  },
  power_strip4: {
    cat: "power", name: "Power strip 4-way", short: "PS",
    strip: { outlets: 4 },
    ports: [...ports("power", "in", 1, "Plug"), ...ports("power", "out", 4, "Outlet")]
  },
  power_strip6: {
    cat: "power", name: "Power strip 6-way", short: "PS",
    strip: { outlets: 6 },
    ports: [...ports("power", "in", 1, "Plug"), ...ports("power", "out", 6, "Outlet")]
  },
  cable_reel: {
    cat: "power", name: "Extension reel 25m (4-way)", short: "REEL",
    strip: { outlets: 4, reel: true },
    ports: [...ports("power", "in", 1, "Plug"), ...ports("power", "out", 4, "Outlet")],
    note: "Fully unwind reels under load - coiled reels overheat."
  },
  distro_16a: {
    cat: "power", name: "Power distro 16A (6-way)", short: "DIST", source: true, distroA: 16,
    ports: [...ports("power", "out", 6, "Outlet")], note: "Fed from a 16A commando - treat as its own circuit."
  },
  ups: {
    cat: "power", name: "UPS 1500VA", short: "UPS", watts: 30,
    strip: { outlets: 4, ratingW: 900 },
    ports: [...ports("power", "in", 1, "Plug"), ...ports("power", "out", 4, "Outlet")]
  }
};

// Mains regions: nominal voltage, per-plug/strip limit and a typical circuit breaker.
const REGIONS = {
  uk: { name: "UK (230V, 13A plugs)", volts: 230, stripA: 13, circuitA: 32 },
  eu: { name: "EU (230V, 16A)",        volts: 230, stripA: 16, circuitA: 16 },
  us: { name: "US (120V, 15A)",        volts: 120, stripA: 15, circuitA: 20 },
  au: { name: "AU/NZ (230V, 10A)",     volts: 230, stripA: 10, circuitA: 16 }
};

// Number ports per device so ids stay unique when a device has several groups of
// the same connector (e.g. aux + program SDI outs): sdi_out_1..4, then sdi_out_5.
for (const d of Object.values(CATALOG)) {
  const n = {};
  for (const p of d.ports) {
    const k = `${p.type}_${p.dir}`;
    n[k] = (n[k] || 0) + 1;
    p.id = `${k}_${n[k]}`;
  }
}
