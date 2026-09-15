// Render checks: run the card's real render methods against a stubbed browser.
//
//   node tests/render.test.js            # the built card
//   node tests/render.test.js other.js   # any other build, e.g. a past release
//
// Deliberately dependency-free. Covers what must NOT change for existing cards
// as well as the newer behaviour; run against v0.3.3 it fails exactly the three
// checks for behaviour added in v0.4.0 and passes the rest.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const target = process.argv[2] || path.join(__dirname, "..", "dist", "masterbuilt-cook-card.js");
const src = fs.readFileSync(target, "utf8");
let Card;
const ctx = {
  console: { info() {}, warn() {}, error: console.error, log: console.log },
  HTMLElement: class { attachShadow() { this.shadowRoot = { querySelectorAll: () => [] }; return this.shadowRoot; } },
  customElements: { define: (_n, cls) => { Card = cls; }, get: () => undefined },
  window: {},
  document: { createElement: () => ({}) },
  setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, Number, JSON, Intl,
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -- " + detail}`);
  if (!cond) failures++;
};

function card(config) {
  const c = new Card();
  c.setConfig({ device: "dev", ...config });
  c._hass = { states: {} };
  return c;
}
const st = (state) => ({ state, attributes: {} });
function grill({ slots = [1, 2, 3, 4], unplugged = [], power = "on", withPower = true } = {}) {
  const e = { ids: {}, states: {}, binary: {}, binaryStates: {} };
  e.states.grill = st("225");
  for (const n of slots) {
    e.ids[`probe${n}`] = `sensor.p${n}`;
    e.states[`probe${n}`] = st(unplugged.includes(n) ? "unavailable" : String(150 + n));
  }
  if (withPower) e.binaryStates.power = st(power);
  return e;
}
const tiles = (html) => [...html.matchAll(/>Probe (\d)</g)].map((m) => Number(m[1]));
const temps = (html) => [...html.matchAll(/(\d{3})°F/g)].map((m) => Number(m[1]));

// --- probe tiles follow the grill's entities ---
check("default config, 4 slots, probe 2 unplugged: tiles 1-4 unchanged",
  JSON.stringify(tiles(card({})._probeRow(grill({ unplugged: [2] }), "°F"))) === "[1,2,3,4]",
  tiles(card({})._probeRow(grill({ unplugged: [2] }), "°F")));
check("default config, profile gives 2 slots: tiles 1-2 only",
  JSON.stringify(tiles(card({})._probeRow(grill({ slots: [1, 2] }), "°F"))) === "[1,2]",
  tiles(card({})._probeRow(grill({ slots: [1, 2] }), "°F")));
check("explicit probes [1,2,3,4], 2 slots exist: user's pinned list respected",
  JSON.stringify(tiles(card({ probes: [1, 2, 3, 4] })._probeRow(grill({ slots: [1, 2] }), "°F"))) === "[1,2,3,4]",
  tiles(card({ probes: [1, 2, 3, 4] })._probeRow(grill({ slots: [1, 2] }), "°F")));

// --- hide_temps_when_off ---
const off = grill({ slots: [1], power: "off" });
check("option on, power off: grill reads —",
  /class="v">—</.test(card({ hide_temps_when_off: true })._liveHeader(off, "°F", false, 0)));
check("option on, power off: probe temperature hidden",
  temps(card({ hide_temps_when_off: true })._probeRow(off, "°F")).length === 0,
  card({ hide_temps_when_off: true })._probeRow(off, "°F"));
check("option on, power on: values shown",
  /class="v">225</.test(card({ hide_temps_when_off: true })._liveHeader(grill({ power: "on" }), "°F", true, 0)));
check("option on, power entity missing: fails open, values shown",
  /class="v">225</.test(card({ hide_temps_when_off: true })._liveHeader(grill({ withPower: false }), "°F", false, 0)));
check("option on, power unavailable: fails open, values shown",
  /class="v">225</.test(card({ hide_temps_when_off: true })._liveHeader(grill({ power: "unavailable" }), "°F", false, 0)));
check("default (option off), power off: values still shown -- existing cards unchanged",
  /class="v">225</.test(card({})._liveHeader(off, "°F", false, 0)) && temps(card({})._probeRow(off, "°F")).length === 1);

// --- read-only integration: no setpoint entities ---
check("read-only install: controls block omitted entirely",
  card({})._controls(grill(), "°F") === "", card({})._controls(grill(), "°F"));

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
