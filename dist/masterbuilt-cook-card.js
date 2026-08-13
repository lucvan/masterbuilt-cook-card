/*!
 * Masterbuilt Cook Card
 * A Lovelace card for the masterbuilt_gravity integration.
 * https://github.com/lucvan/masterbuilt-cook-card
 * MIT licensed.
 *
 * No build step: this file is the artifact. It is plain DOM and hand-drawn SVG
 * rather than a charting library, because bundling one would mean a toolchain
 * and because the whole point of this card is an x-axis that fits the cook —
 * something the generic chart cards cannot do without rewriting your stored
 * dashboard config on a timer.
 */

const CARD_VERSION = "0.3.0";

console.info(
  `%c MASTERBUILT-COOK-CARD %c ${CARD_VERSION} `,
  "color:#fff;background:#ff3b30;font-weight:700",
  "color:#ff3b30;background:#1c1c1e"
);

const DOMAIN = "masterbuilt_gravity";

// translation_key -> role. The integration sets these, so the card can find its
// entities from a device without the user listing twelve entity ids.
const ROLES = {
  grill_temp: "grill",
  target_temp: "target",
  probe1_temp: "probe1",
  probe2_temp: "probe2",
  probe3_temp: "probe3",
  probe4_temp: "probe4",
  probe1_target: "probe1_target",
  probe2_target: "probe2_target",
  probe3_target: "probe3_target",
  probe4_target: "probe4_target",
  heat_intensity: "heat",
  error: "error",
  rssi: "rssi",
  cook_start: "cookStart",
  last_cook: "lastCook",
  // Settable number entities (v0.6.0+ integration). These drive the controls.
  grill_target_set: "grillSet",
  probe1_target_set: "probe1Set",
  probe2_target_set: "probe2Set",
  probe3_target_set: "probe3Set",
  probe4_target_set: "probe4Set",
};

const BINARY_ROLES = {
  power: "power",
  heating: "heating",
  engaged: "engaged",
  target_reached: "atTemp",
  door_open: "door",
  lid_open: "lid",
  problem: "problem",
  stale: "stale",
  probe1_reached: "probe1Reached",
  probe2_reached: "probe2Reached",
  probe3_reached: "probe3Reached",
  probe4_reached: "probe4Reached",
};

const PROBE_COLORS = ["#32ade6", "#34c759", "#af52de", "#ff9500"];

const SERIES = [
  { key: "grill", label: "Grill", color: "#ff3b30", width: 5 },
  { key: "target", label: "Target", color: "#ffcc00", width: 2, dashed: true, step: true },
  ...[1, 2, 3, 4].flatMap((n) => [
    { key: `probe${n}`, label: `Probe ${n}`, color: PROBE_COLORS[n - 1], width: n === 1 ? 4 : 3 },
    // Probe targets share the probe's colour, dashed and thinner, so a probe
    // and its setpoint read as a pair. Only drawn when a target is actually
    // set — the integration leaves the series out otherwise.
    {
      key: `probe${n}_target`,
      label: `Probe ${n} target`,
      color: PROBE_COLORS[n - 1],
      width: 2,
      dashed: true,
      target: true,
      step: true,
    },
  ]),
];

// The state timeline: what the old dashboard called the "Power / heating
// timeline". Home Assistant's history-graph renders non-numeric entities as
// coloured state bars, which is exactly the look wanted here.
const TIMELINE_ROLES = ["power", "heating", "engaged", "atTemp", "door", "problem"];

const LIVE_REFRESH_MS = 60000;

/* ------------------------------------------------------------------ helpers */

const num = (v) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

function elapsed(seconds) {
  if (seconds == null || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function clockLabel(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}` : `${m}m`;
}

function niceTicks(min, max, count) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min || 0];
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

/** Escape for safe interpolation into markup. */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* -------------------------------------------------------------------- chart */

/**
 * Render series as SVG. Axes fit the data, which is the entire reason this card
 * exists — a fixed graph_span leaves a three-hour cook floating in twelve hours
 * of empty grid.
 */
function chartSvg(series, opts) {
  const { width = 600, height = 300, unit = "", nowOffset = null } = opts;
  const pad = { top: 12, right: 14, bottom: 26, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const active = SERIES.filter((s) => (series[s.key] || []).length > 1);
  if (!active.length) {
    return `<svg viewBox="0 0 ${width} ${height}" class="chart">
      <text x="${width / 2}" y="${height / 2}" class="empty">No samples for this cook</text>
    </svg>`;
  }

  let xMax = 0;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of active) {
    for (const [t, v] of series[s.key]) {
      if (t > xMax) xMax = t;
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (nowOffset != null && nowOffset > xMax) xMax = nowOffset;
  if (xMax <= 0) xMax = 1;

  const span = yMax - yMin || 10;
  yMin = Math.floor(yMin - span * 0.08);
  yMax = Math.ceil(yMax + span * 0.08);

  const px = (t) => pad.left + (t / xMax) * plotW;
  const py = (v) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const yTicks = niceTicks(yMin, yMax, 4);
  const xTicks = niceTicks(0, xMax, 5);

  const grid = [
    ...yTicks.map(
      (v) =>
        `<line class="grid" x1="${pad.left}" y1="${py(v).toFixed(1)}" x2="${
          width - pad.right
        }" y2="${py(v).toFixed(1)}"/>
         <text class="axis" x="${pad.left - 6}" y="${(py(v) + 4).toFixed(1)}"
               text-anchor="end">${Math.round(v)}</text>`
    ),
    ...xTicks.map(
      (t) =>
        `<text class="axis" x="${px(t).toFixed(1)}" y="${height - 8}"
               text-anchor="middle">${clockLabel(t)}</text>`
    ),
  ].join("");

  const paths = active
    .map((s) => {
      const pts = series[s.key];
      let d;
      if (s.step) {
        // Setpoints are step-valued and sampled only when they change, so a
        // target held for three hours is two points. Joining those with a
        // straight line draws a ramp and claims the setpoint was being moved
        // the whole time. Hold the value, then step.
        d = pts
          .map(([t, v], i) =>
            i
              ? `H${px(t).toFixed(1)}V${py(v).toFixed(1)}`
              : `M${px(t).toFixed(1)},${py(v).toFixed(1)}`
          )
          .join("");
      } else {
        d = pts
          .map(([t, v], i) => `${i ? "L" : "M"}${px(t).toFixed(1)},${py(v).toFixed(1)}`)
          .join("");
      }
      return `<path d="${d}" fill="none" stroke="${s.color}"
        stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"
        ${s.dashed ? 'stroke-dasharray="8 6"' : ""}/>`;
    })
    .join("");

  const nowLine =
    nowOffset != null
      ? `<line class="now" x1="${px(nowOffset).toFixed(1)}" y1="${pad.top}"
           x2="${px(nowOffset).toFixed(1)}" y2="${pad.top + plotH}"/>`
      : "";

  return `<svg viewBox="0 0 ${width} ${height}" class="chart"
            preserveAspectRatio="none" data-xmax="${xMax}"
            data-left="${pad.left}" data-plotw="${plotW}">
    ${grid}${nowLine}${paths}
    <line class="crosshair" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + plotH}" hidden/>
    <rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}"
          fill="transparent" class="hit"/>
  </svg>`;
}

/* --------------------------------------------------------------------- card */

class MasterbuiltCookCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._mode = "live";
    this._cooks = null;
    this._selected = null;
    this._history = null;
    this._loading = false;
    this._error = null;
    this._lastFetch = 0;
    this._sig = "";
    this._hover = null;
  }

  static getStubConfig(hass) {
    const device = Object.values(hass.devices || {}).find((d) =>
      (d.identifiers || []).some((i) => i[0] === DOMAIN)
    );
    return { type: "custom:masterbuilt-cook-card", device: device?.id };
  }

  setConfig(config) {
    if (!config.device && !config.entities) {
      throw new Error(
        "Set 'device' to your grill's device id (or provide 'entities' explicitly)."
      );
    }
    this._config = {
      probes: [1, 2, 3, 4],
      live_chart: "native",
      timeline: true,
      show_targets: true,
      ...config,
    };
    this._mode = config.default_mode === "history" ? "history" : "live";
    this._sig = "";
    this._nested = {};
  }

  get _useNative() {
    return this._mode === "live" && this._config.live_chart === "native";
  }

  getCardSize() {
    return 8;
  }

  set hass(hass) {
    this._hass = hass;
    const found = this._resolve();
    // Re-render only when something we display actually changed. Without this
    // the card rebuilds on every state change anywhere in Home Assistant.
    const sig = Object.values(found.states)
      .map((s) => (s ? `${s.entity_id}=${s.state}` : ""))
      .join("|");
    if (sig !== this._sig) {
      this._sig = sig;
      this._entities = found;
      // Drop optimistic values the real state has caught up to.
      if (this._pending) {
        for (const [id, val] of Object.entries(this._pending)) {
          if (Math.round(Number(hass.states[id]?.state)) === Math.round(val)) {
            delete this._pending[id];
          }
        }
      }
      this._render();
    }
    // The native chart fetches its own history; only the custom one needs us to.
    if (
      this._mode === "live" &&
      !this._useNative &&
      Date.now() - this._lastFetch > LIVE_REFRESH_MS
    ) {
      this._fetchHistory();
    }
    for (const n of Object.values(this._nested)) {
      if (n.el) n.el.hass = hass;
    }
  }

  /**
   * Hours of history the live chart should show: the cook so far plus a little
   * headroom. Home Assistant's own history-graph takes hours_to_show but has no
   * start/end window, so this is how it gets pinned to the cook rather than to
   * an arbitrary fixed span.
   */
  _liveHours() {
    const start = this._entities?.states?.cookStart?.state;
    const min = this._config.min_hours || 0.5;
    if (!start || ["unknown", "unavailable"].includes(start)) {
      return this._config.idle_hours || 2;
    }
    const hours = (Date.now() - new Date(start).getTime()) / 3600000;
    return Math.max(min, Math.round(hours * 1.1 * 100) / 100);
  }

  /**
   * Build (or re-window) a nested built-in card, cached under `name`.
   *
   * Rebuilding on every tick would restart the card's own history fetch, so it
   * is only recreated when the cook window has moved enough to matter.
   */
  async _mountNested(slot, name, config) {
    const hours = this._liveHours();
    const cached = this._nested[name];
    const changed =
      !cached || cached.hours == null || Math.abs(hours - cached.hours) / cached.hours > 0.05;

    if (changed) {
      const helpers = await window.loadCardHelpers();
      const el = await helpers.createCardElement({ ...config, hours_to_show: hours });
      el.hass = this._hass;
      this._nested[name] = { el, hours };
    }
    const el = this._nested[name].el;
    if (el.parentElement !== slot) slot.replaceChildren(el);
  }

  /** Entity ids for the temperature chart, including probe targets if set. */
  _chartEntities() {
    const ids = this._entities?.ids || {};
    const roles = ["grill", "target"];
    for (const n of this._config.probes) {
      roles.push(`probe${n}`);
      if (this._config.show_targets) roles.push(`probe${n}_target`);
    }
    return roles
      .map((r) => ids[r])
      .filter((id) => {
        if (!id) return false;
        // A probe target that has never been set sits at unknown/unavailable;
        // including it would add an empty row to the legend.
        const st = this._hass.states[id];
        return st && !["unknown", "unavailable"].includes(st.state);
      });
  }

  _timelineEntities() {
    const b = this._entities?.binary || {};
    const ids = this._entities?.ids || {};
    const list = (this._config.timeline_roles || TIMELINE_ROLES)
      .map((r) => b[r])
      .filter(Boolean);
    if (ids.error) list.push(ids.error);
    return list;
  }

  /** Find our entities from the configured device, via the entity registry. */
  _resolve() {
    const hass = this._hass;
    const out = { ids: {}, states: {}, binary: {}, binaryStates: {} };
    if (!hass) return out;

    if (this._config.entities) {
      for (const [role, id] of Object.entries(this._config.entities)) {
        out.ids[role] = id;
        out.states[role] = hass.states[id];
      }
      return out;
    }

    for (const [entityId, entry] of Object.entries(hass.entities || {})) {
      if (entry.device_id !== this._config.device) continue;
      if (entry.platform !== DOMAIN) continue;
      const role = ROLES[entry.translation_key];
      if (role) {
        out.ids[role] = entityId;
        out.states[role] = hass.states[entityId];
        continue;
      }
      const bRole = BINARY_ROLES[entry.translation_key];
      if (bRole) {
        out.binary[bRole] = entityId;
        out.binaryStates[bRole] = hass.states[entityId];
      }
    }
    return out;
  }

  get _unit() {
    const grill = this._entities?.states?.grill;
    return grill?.attributes?.unit_of_measurement || "";
  }

  async _call(service, data) {
    const res = await this._hass.callService(DOMAIN, service, data, undefined, false, true);
    return res?.response ?? res;
  }

  /** Set a number entity (grill or probe target) to an absolute value. */
  async _setNumber(entityId, value) {
    const st = this._hass.states[entityId];
    if (!st) return;
    const min = Number(st.attributes.min ?? -Infinity);
    const max = Number(st.attributes.max ?? Infinity);
    const clamped = Math.min(max, Math.max(min, value));
    // Optimistic: reflect immediately, the poll will confirm.
    this._pending = { ...(this._pending || {}), [entityId]: clamped };
    this._render();
    try {
      await this._hass.callService("number", "set_value", { value: clamped }, { entity_id: entityId });
    } catch (err) {
      this._error = `Could not set value: ${err.message || err}`;
    }
  }

  /** Nudge a number entity by ±step. */
  _step(role, delta) {
    const id = this._entities?.ids?.[role];
    if (!id) return;
    const st = this._hass.states[id];
    const cur = this._pending?.[id] ?? Number(st?.state);
    if (!Number.isFinite(cur)) return;
    const step = Number(st?.attributes?.step) || 5;
    this._setNumber(id, cur + delta * step);
  }

  async _fetchCooks() {
    if (!this._config.device) return;
    try {
      const res = await this._call("list_cooks", { device_id: this._config.device });
      this._cooks = res?.cooks || [];
    } catch (err) {
      this._error = `Could not list cooks: ${err.message || err}`;
      this._cooks = [];
    }
    this._render();
  }

  async _fetchHistory(sessionId) {
    if (!this._config.device || this._loading) return;
    this._loading = true;
    this._lastFetch = Date.now();
    this._error = null;
    try {
      const data = {
        device_id: this._config.device,
        max_points: this._config.max_points || 400,
      };
      if (sessionId != null) data.session_id = String(sessionId);
      const res = await this._call("get_cook_history", data);
      this._history = res || null;
      this._selected = res?.session?.id ?? sessionId ?? null;
    } catch (err) {
      this._error = `Could not load cook: ${err.message || err}`;
      this._history = null;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _setMode(mode) {
    if (this._mode === mode) return;
    this._mode = mode;
    this._hover = null;
    if (mode === "history") {
      if (!this._cooks) this._fetchCooks();
      this._render();
    } else if (this._config.live_chart === "native") {
      this._render();
    } else {
      this._fetchHistory();
    }
  }

  /* ------------------------------------------------------------- rendering */

  _render() {
    if (!this._hass || !this._config) return;
    const e = this._entities || this._resolve();
    const unit = this._unit;
    const stale = e.binaryStates?.stale?.state === "on";

    const series = this._history?.series || {};
    const shown = {};
    for (const s of SERIES) {
      const probe = /^probe(\d)/.exec(s.key);
      if (probe && !this._config.probes.includes(Number(probe[1]))) continue;
      if (s.target && !this._config.show_targets) continue;
      if (series[s.key]?.length) shown[s.key] = series[s.key];
    }

    const cookStartState = e.states?.cookStart?.state;
    const cooking = cookStartState && !["unknown", "unavailable"].includes(cookStartState);
    let nowOffset = null;
    if (this._mode === "live" && cooking) {
      nowOffset = (Date.now() - new Date(cookStartState).getTime()) / 1000;
    }

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="head">
          <div class="title">${esc(this._config.title || "Cook")}</div>
          <div class="modes">
            <button class="${this._mode === "live" ? "on" : ""}" data-mode="live">Live</button>
            <button class="${this._mode === "history" ? "on" : ""}" data-mode="history">History</button>
          </div>
        </div>

        ${stale ? `<div class="alert">No contact with the grill — it may still be cooking. Check it physically.</div>` : ""}
        ${this._error ? `<div class="alert soft">${esc(this._error)}</div>` : ""}

        ${this._mode === "live" ? this._liveHeader(e, unit, cooking, nowOffset) : this._historyPicker()}

        <div class="chartwrap">
          ${this._loading && !this._useNative ? `<div class="loading">Loading…</div>` : ""}
          ${this._useNative ? `<div class="native"></div>` : chartSvg(shown, { unit, nowOffset })}
        </div>

        ${
          this._useNative
            ? ""
            : `<div class="legend">
          ${SERIES.filter((s) => shown[s.key])
            .map(
              (s) => `<span class="lg">
                <i style="background:${s.color};${s.dashed ? "opacity:.85" : ""}"></i>
                ${esc(s.label)}<b data-lg="${s.key}"></b></span>`
            )
            .join("")}
          ${this._history?.source ? `<span class="src">${esc(this._history.source)}</span>` : ""}
        </div>`
        }

        ${this._mode === "live" ? this._probeRow(e, unit) : this._historyFooter()}
        ${this._mode === "live" ? this._controls(e, unit) : ""}

        ${
          this._config.timeline && this._mode === "live"
            ? `<div class="tl"><div class="tlhead">State timeline</div><div class="timeline"></div></div>`
            : ""
        }
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => this._setMode(b.dataset.mode))
    );
    this.shadowRoot.querySelectorAll("[data-step]").forEach((b) =>
      b.addEventListener("click", () => this._step(b.dataset.role, Number(b.dataset.step)))
    );
    const picker = this.shadowRoot.querySelector("#cookpick");
    if (picker) {
      picker.addEventListener("change", () => this._fetchHistory(picker.value));
    }

    const slot = this.shadowRoot.querySelector(".native");
    if (slot) {
      const entities = this._chartEntities();
      if (entities.length) {
        this._mountNested(slot, "chart", {
          type: "history-graph",
          show_names: true,
          fit_y_data: true,
          entities,
        });
      }
    } else {
      this._wireHover(shown);
    }

    const tl = this.shadowRoot.querySelector(".timeline");
    if (tl) {
      const entities = this._timelineEntities();
      if (entities.length) {
        this._mountNested(tl, "timeline", {
          type: "history-graph",
          show_names: true,
          entities,
        });
      }
    }
  }

  _liveHeader(e, unit, cooking, nowOffset) {
    const grill = num(e.states?.grill?.state);
    const target = num(e.states?.target?.state);
    const heat = num(e.states?.heat?.state);
    const atTemp = e.binaryStates?.atTemp?.state === "on";
    const heating = e.binaryStates?.heating?.state === "on";
    const door = e.binaryStates?.door?.state === "on";
    const power = e.binaryStates?.power?.state === "on";

    return `
      <div class="hero">
        <div class="big">
          <span class="v">${grill == null ? "—" : Math.round(grill)}</span>
          <span class="u">${esc(unit)}</span>
          <div class="cap">Grill</div>
        </div>
        <div class="meta">
          <div><span>Target</span><b>${target == null ? "—" : Math.round(target) + unit}</b></div>
          <div><span>Heat</span><b>${heat == null ? "—" : Math.round(heat) + "%"}</b></div>
          <div><span>${cooking ? "Cooking" : "Idle"}</span><b>${
            cooking ? elapsed(nowOffset) : "—"
          }</b></div>
        </div>
        <div class="pills">
          ${power ? `<span class="pill on">On</span>` : `<span class="pill">Off</span>`}
          ${heating ? `<span class="pill hot">Heating</span>` : ""}
          ${atTemp ? `<span class="pill good">At temp</span>` : ""}
          ${door ? `<span class="pill warn">Hopper open</span>` : ""}
        </div>
      </div>`;
  }

  _probeRow(e, unit) {
    const live = (st) => st && !["unknown", "unavailable"].includes(st.state);

    const cells = this._config.probes
      .map((n) => {
        const st = e.states?.[`probe${n}`];
        if (!live(st)) {
          return `<div class="probe off"><span>Probe ${n}</span><b>—</b></div>`;
        }
        const v = num(st.state);
        const tgtState = e.states?.[`probe${n}_target`];
        const tgt = live(tgtState) ? num(tgtState.state) : null;
        const reached = e.binaryStates?.[`probe${n}Reached`]?.state === "on";
        const color = PROBE_COLORS[n - 1];
        return `<div class="probe">
          <span style="color:${color}">Probe ${n}</span>
          <b>${v == null ? "—" : Math.round(v) + unit}${
            tgt != null ? `<i class="tgt${reached ? " hit" : ""}">→ ${Math.round(tgt)}${unit}</i>` : ""
          }</b></div>`;
      })
      .join("");

    const err = e.states?.error;
    const heat = num(e.states?.heat?.state);
    const extras = `
      <div class="probe"><span>Fan</span><b>${heat == null ? "—" : Math.round(heat) + "%"}</b></div>
      <div class="probe"><span>Error</span><b class="${
        err && err.state !== "OK" ? "bad" : ""
      }">${esc(err ? err.state : "—")}</b></div>`;

    return `<div class="probes">${cells}${extras}</div>`;
  }

  /**
   * Setpoint controls. One stepper row per settable target that exists — the
   * grill, plus each plugged-in probe. Shown only when the integration exposes
   * the number entities (v0.6.0+); older installs are read-only and get nothing.
   */
  _controls(e, unit) {
    if (this._config.controls === false) return "";
    const ids = e.ids || {};
    const rows = [];

    const stepper = (role, label, color) => {
      const id = ids[role];
      if (!id) return "";
      const st = this._hass.states[id];
      if (!st || ["unknown", "unavailable"].includes(st.state)) return "";
      const val = this._pending?.[id] ?? Math.round(Number(st.state));
      const busy = this._pending?.[id] != null;
      return `<div class="ctl">
        <span class="ctl-label"${color ? ` style="color:${color}"` : ""}>${esc(label)}</span>
        <div class="stepper${busy ? " busy" : ""}">
          <button data-role="${role}" data-step="-1" aria-label="decrease">−</button>
          <b>${Number.isFinite(val) ? val + unit : "—"}</b>
          <button data-role="${role}" data-step="1" aria-label="increase">+</button>
        </div>
      </div>`;
    };

    rows.push(stepper("grillSet", "Grill target", "#ff3b30"));
    for (const n of this._config.probes) {
      rows.push(stepper(`probe${n}Set`, `Probe ${n} target`, PROBE_COLORS[n - 1]));
    }
    const body = rows.filter(Boolean).join("");
    if (!body) return "";
    return `<div class="controls"><div class="tlhead">Set temperatures</div>${body}</div>`;
  }

  _historyPicker() {
    if (!this._cooks) return `<div class="pickwrap"><div class="loading">Loading cooks…</div></div>`;
    if (!this._cooks.length) return `<div class="pickwrap"><div class="loading">No cooks found</div></div>`;
    const opts = this._cooks
      .map((c) => {
        const d = new Date((c.start || 0) * 1000);
        const dur = c.end ? elapsed(c.end - c.start) : "in progress";
        const label = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })} · ${dur}`;
        const sel = String(c.id) === String(this._selected) ? " selected" : "";
        return `<option value="${c.id}"${sel}>${esc(label)}</option>`;
      })
      .join("");
    return `<div class="pickwrap">
      <select id="cookpick">${opts}</select>
    </div>`;
  }

  _historyFooter() {
    const s = this._history?.session;
    if (!s) return "";
    const dur = s.end ? elapsed(s.end - s.start) : "in progress";
    return `<div class="probes">
      <div class="probe"><span>Duration</span><b>${esc(dur)}</b></div>
      <div class="probe"><span>Samples</span><b>${esc(s.snapshot_count ?? "—")}</b></div>
      <div class="probe"><span>Cook ID</span><b>${esc(s.id ?? "—")}</b></div>
    </div>`;
  }

  /** Crosshair readout: nearest sample per series to the pointer's x. */
  _wireHover(series) {
    const svg = this.shadowRoot.querySelector("svg.chart");
    const hit = svg?.querySelector(".hit");
    if (!hit) return;
    const cross = svg.querySelector(".crosshair");
    const xMax = Number(svg.dataset.xmax);
    const left = Number(svg.dataset.left);
    const plotW = Number(svg.dataset.plotw);

    const clear = () => {
      cross.setAttribute("hidden", "");
      this.shadowRoot.querySelectorAll("[data-lg]").forEach((el) => (el.textContent = ""));
    };

    hit.addEventListener("pointerleave", clear);
    hit.addEventListener("pointermove", (ev) => {
      const box = svg.getBoundingClientRect();
      const ratio = (ev.clientX - box.left) / box.width;
      const svgX = ratio * svg.viewBox.baseVal.width;
      const t = ((svgX - left) / plotW) * xMax;
      cross.removeAttribute("hidden");
      cross.setAttribute("x1", svgX);
      cross.setAttribute("x2", svgX);
      for (const s of SERIES) {
        const pts = series[s.key];
        const el = this.shadowRoot.querySelector(`[data-lg="${s.key}"]`);
        if (!el || !pts?.length) continue;
        let best = pts[0];
        for (const p of pts) {
          if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
        }
        el.textContent = ` ${Math.round(best[1])}`;
      }
    });
  }
}

/* ------------------------------------------------------------------ styles */

const STYLES = `
:host { display:block; }
ha-card { padding:14px 16px 16px; }
.head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.title { font-size:1.15rem; font-weight:600; color:var(--primary-text-color); }
.modes button {
  background:transparent; border:1px solid var(--divider-color); color:var(--secondary-text-color);
  padding:4px 12px; border-radius:14px; cursor:pointer; font:inherit; font-size:.8rem;
}
.modes button + button { margin-left:6px; }
.modes button.on { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
.alert {
  margin-top:10px; padding:8px 12px; border-radius:8px; font-size:.85rem;
  background:rgba(255,59,48,.12); color:var(--error-color,#ff3b30);
  border:1px solid rgba(255,59,48,.35);
}
.alert.soft { background:rgba(255,149,0,.12); color:var(--warning-color,#ff9500); border-color:rgba(255,149,0,.3); }
.hero { display:flex; align-items:flex-end; gap:20px; margin:12px 0 4px; flex-wrap:wrap; }
.big .v { font-size:2.6rem; font-weight:300; line-height:1; color:var(--primary-text-color); }
.big .u { font-size:1.1rem; color:var(--secondary-text-color); }
.big .cap { font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; color:var(--secondary-text-color); margin-top:2px; }
.meta { display:flex; gap:18px; }
.meta div { display:flex; flex-direction:column; }
.meta span { font-size:.7rem; text-transform:uppercase; letter-spacing:.05em; color:var(--secondary-text-color); }
.meta b { font-size:1rem; font-weight:500; color:var(--primary-text-color); }
.pills { display:flex; gap:6px; flex-wrap:wrap; margin-left:auto; }
.pill { font-size:.7rem; padding:3px 9px; border-radius:10px; background:var(--divider-color); color:var(--secondary-text-color); }
.pill.on { background:rgba(52,199,89,.18); color:#34c759; }
.pill.hot { background:rgba(255,59,48,.18); color:#ff3b30; }
.pill.good { background:rgba(50,173,230,.18); color:#32ade6; }
.pill.warn { background:rgba(255,149,0,.2); color:#ff9500; }
.pickwrap { margin:12px 0 4px; }
#cookpick {
  width:100%; padding:7px 10px; border-radius:8px; font:inherit; font-size:.85rem;
  background:var(--secondary-background-color); color:var(--primary-text-color);
  border:1px solid var(--divider-color);
}
.chartwrap { position:relative; margin-top:8px; }
/* The nested history-graph brings its own ha-card; strip it so it sits inside ours. */
.native ha-card { box-shadow:none; border:none; background:transparent; padding:0; }
.native { min-height:200px; }
.loading {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-size:.85rem; color:var(--secondary-text-color); z-index:1;
}
svg.chart { width:100%; height:280px; display:block; overflow:visible; }
svg.chart .grid { stroke:var(--divider-color); stroke-width:1; stroke-dasharray:3 3; opacity:.7; }
svg.chart .axis { fill:var(--secondary-text-color); font-size:11px; }
svg.chart .empty { fill:var(--secondary-text-color); font-size:13px; text-anchor:middle; }
svg.chart .now { stroke:var(--secondary-text-color); stroke-width:1; stroke-dasharray:2 4; }
svg.chart .crosshair { stroke:var(--secondary-text-color); stroke-width:1; opacity:.6; }
svg.chart .hit { cursor:crosshair; }
.legend { display:flex; gap:14px; flex-wrap:wrap; align-items:center; margin-top:6px; font-size:.78rem; color:var(--secondary-text-color); }
.legend .lg { display:inline-flex; align-items:center; gap:5px; }
.legend i { width:14px; height:3px; border-radius:2px; display:inline-block; }
.legend b { color:var(--primary-text-color); font-weight:600; }
.legend .src { margin-left:auto; opacity:.6; font-size:.7rem; text-transform:uppercase; letter-spacing:.05em; }
.probes { display:flex; gap:14px; flex-wrap:wrap; margin-top:12px; padding-top:10px; border-top:1px solid var(--divider-color); }
.probe { display:flex; flex-direction:column; min-width:64px; }
.probe span { font-size:.7rem; text-transform:uppercase; letter-spacing:.05em; color:var(--secondary-text-color); }
.probe b { font-size:.95rem; font-weight:500; color:var(--primary-text-color); }
.probe.off b, .probe.off span { opacity:.4; }
.probe .tgt { font-style:normal; font-size:.78rem; color:var(--secondary-text-color); margin-left:5px; }
.probe .tgt.hit { color:#34c759; }
.probe b.bad { color:var(--error-color,#ff3b30); }
.tl { margin-top:14px; padding-top:10px; border-top:1px solid var(--divider-color); }
.tlhead { font-size:.7rem; text-transform:uppercase; letter-spacing:.06em; color:var(--secondary-text-color); margin-bottom:2px; }
.controls { margin-top:14px; padding-top:10px; border-top:1px solid var(--divider-color); }
.controls .tlhead { margin-bottom:8px; }
.ctl { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:4px 0; }
.ctl-label { font-size:.9rem; font-weight:500; color:var(--primary-text-color); }
.stepper { display:inline-flex; align-items:center; gap:2px; }
.stepper button {
  width:34px; height:34px; border-radius:8px; border:1px solid var(--divider-color);
  background:var(--secondary-background-color); color:var(--primary-text-color);
  font-size:1.2rem; line-height:1; cursor:pointer; font-family:inherit;
}
.stepper button:active { background:var(--primary-color); color:#fff; }
.stepper b { min-width:74px; text-align:center; font-size:1rem; font-weight:600; font-variant-numeric:tabular-nums; }
.stepper.busy b { opacity:.55; }
.timeline ha-card { box-shadow:none; border:none; background:transparent; padding:0; }
.timeline { min-height:120px; }
@media (max-width:420px) {
  .pills { margin-left:0; }
  svg.chart { height:220px; }
}
`;

customElements.define("masterbuilt-cook-card", MasterbuiltCookCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "masterbuilt-cook-card",
  name: "Masterbuilt Cook Card",
  description: "Live and historic cooks for a Masterbuilt Gravity Series grill.",
  preview: true,
  documentationURL: "https://github.com/lucvan/masterbuilt-cook-card",
});
