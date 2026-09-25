/*!
 * KHILJI Market Analyzer - MANGO BOT v3.2.0
 * Production JavaScript Engine
 * REAL PUBLIC DATA ONLY
 * NO TRADE EXECUTION
 */

(function () {
  "use strict";

  if (window.__MANGO_BOT_LOADED__) {
    try { window.__MANGO_BOT_INSTANCE__?.toggle?.(); } catch (_) {}
    return;
  }

  window.__MANGO_BOT_LOADED__ = true;

  const CONFIG = {
    VERSION: "3.2.0",
    MIN_CANDLES: 50,
    PREFERRED_CANDLES: 150,
    RSI: 14,
    EMA_FAST: 9,
    EMA_MID: 21,
    EMA_SLOW: 50,
    MACD_FAST: 12,
    MACD_SLOW: 26,
    MACD_SIGNAL: 9,
    ROC: 10,
    SR: 20,
    MIN_SCORE: 70
  };

  const NS = "MANGO_32";

  function safe(fn, fallback = null) {
    try { return fn(); } catch (_) { return fallback; }
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeCandle(x) {
    if (!x) return null;

    let t = x.t ?? x.time ?? x.timestamp ?? x.ts ?? x.date;
    let o = x.o ?? x.open;
    let h = x.h ?? x.high;
    let l = x.l ?? x.low;
    let c = x.c ?? x.close;

    if (Array.isArray(x)) {
      if (x.length >= 5) {
        t = x[0];
        o = x[1];
        h = x[2];
        l = x[3];
        c = x[4];
      }
    }

    t = num(t);
    o = num(o);
    h = num(h);
    l = num(l);
    c = num(c);

    if (t && t < 10000000000) t *= 1000;

    if (![o, h, l, c].every(Number.isFinite)) return null;
    if (!Number.isFinite(t)) return null;

    if (h < Math.max(o, c)) return null;
    if (l > Math.min(o, c)) return null;
    if (h < l) return null;

    return { t, o, h, l, c };
  }

  function validateCandles(arr) {
    if (!Array.isArray(arr)) return [];

    const out = arr
      .map(normalizeCandle)
      .filter(Boolean)
      .sort((a, b) => a.t - b.t);

    const unique = [];
    const seen = new Set();

    for (const c of out) {
      if (seen.has(c.t)) continue;
      seen.add(c.t);
      unique.push(c);
    }

    const now = Date.now();

    return unique.filter(c =>
      c.t <= now + 60000 &&
      c.c > 0 &&
      c.h > 0 &&
      c.l > 0
    );
  }

  function extractFromObject(obj, path = "window", depth = 0, out = []) {
    if (!obj || depth > 2 || out.length > 50) return out;

    if (Array.isArray(obj)) {
      if (obj.length >= CONFIG.MIN_CANDLES) {
        const valid = validateCandles(obj);
        if (valid.length >= CONFIG.MIN_CANDLES) {
          out.push({ candles: valid, source: path });
        }
      }
      return out;
    }

    if (typeof obj !== "object") return out;

    const keys = Object.keys(obj).slice(0, 100);

    for (const key of keys) {
      if (/password|passwd|token|secret|auth|credential|cookie|session|private/i.test(key)) {
        continue;
      }

      const value = safe(() => obj[key]);

      if (
        /candles|bars|quotes|ohlc|kline|history|series|price|data/i.test(key)
      ) {
        if (Array.isArray(value)) {
          const valid = validateCandles(value);

          if (valid.length >= CONFIG.MIN_CANDLES) {
            out.push({
              candles: valid,
              source: path + "." + key
            });
          }
        }
      }

      if (depth < 2 && value && typeof value === "object") {
        extractFromObject(value, path + "." + key, depth + 1, out);
      }
    }

    return out;
  }

  function discoverHighcharts() {
    const result = [];

    const charts = safe(() => window.Highcharts?.charts, []);

    if (!Array.isArray(charts)) return result;

    for (const chart of charts) {
      if (!chart?.series) continue;

      for (const series of chart.series) {
        const data = safe(() => series.options?.data || series.data, []);

        if (!Array.isArray(data)) continue;

        const candles = data.map(p => {
          if (Array.isArray(p) && p.length >= 5) {
            return {
              t: num(p[0]),
              o: num(p[1]),
              h: num(p[2]),
              l: num(p[3]),
              c: num(p[4])
            };
          }

          if (p?.options) {
            return {
              t: num(p.x),
              o: num(p.options.open),
              h: num(p.options.high),
              l: num(p.options.low),
              c: num(p.options.close)
            };
          }

          return null;
        }).filter(Boolean);

        const valid = validateCandles(candles);

        if (valid.length >= CONFIG.MIN_CANDLES) {
          result.push({
            candles: valid,
            source: "Highcharts"
          });
        }
      }
    }

    return result;
  }

  function discoverTradingView() {
    const result = [];

    const widget = safe(() => window.tvWidget);

    if (!widget) return result;

    const chart = safe(() => widget.activeChart?.());

    if (!chart) return result;

    const data = safe(() => chart.data?.(), []);

    if (Array.isArray(data)) {
      const valid = validateCandles(data);

      if (valid.length >= CONFIG.MIN_CANDLES) {
        result.push({
          candles: valid,
          source: "TradingView public widget"
        });
      }
    }

    return result;
  }

  function discoverPublicState() {
    const result = [];

    const roots = [
      "__INITIAL_STATE__",
      "__NEXT_DATA__",
      "__PRELOADED_STATE__",
      "appState",
      "marketState",
      "chartState",
      "store",
      "state",
      "candles",
      "bars",
      "quotes",
      "chartData",
      "historyCandles",
      "activeCandles",
      "ohlcData",
      "klineData",
      "historyData",
      "priceData"
    ];

    for (const name of roots) {
      const value = safe(() => window[name]);

      if (!value) continue;

      extractFromObject(value, name, 0, result);
    }

    return result;
  }

  function discoverData() {
    const all = [
      ...discoverTradingView(),
      ...discoverHighcharts(),
      ...discoverPublicState()
    ];

    if (!all.length) {
      return {
        candles: [],
        source: "NONE DETECTED"
      };
    }

    all.sort((a, b) => b.candles.length - a.candles.length);

    return all[0];
  }

  function getSymbol() {
    const tv = safe(() =>
      window.tvWidget?.activeChart?.()?.symbol?.()
    );

    if (tv) return String(tv);

    const selectors = [
      "[data-symbol]",
      "[data-pair]",
      "[data-asset]",
      "[data-ticker]"
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);

      if (!el) continue;

      const value =
        el.getAttribute("data-symbol") ||
        el.getAttribute("data-pair") ||
        el.getAttribute("data-asset") ||
        el.getAttribute("data-ticker");

      if (value) return value;
    }

    const params = new URLSearchParams(location.search);

    return (
      params.get("symbol") ||
      params.get("pair") ||
      params.get("asset") ||
      params.get("ticker") ||
      "UNKNOWN"
    );
  }

  function getTimeframe() {
    const tv = safe(() =>
      window.tvWidget?.activeChart?.()?.resolution?.()
    );

    if (tv) return String(tv);

    const el = document.querySelector(
      "[data-timeframe],[data-period],[data-interval]"
    );

    if (el) {
      return (
        el.getAttribute("data-timeframe") ||
        el.getAttribute("data-period") ||
        el.getAttribute("data-interval") ||
        "UNKNOWN"
      );
    }

    return "UNKNOWN";
  }

  function ema(values, period) {
    if (values.length < period) return [];

    const result = [];
    const k = 2 / (period + 1);

    let prev =
      values.slice(0, period)
        .reduce((a, b) => a + b, 0) / period;

    for (let i = 0; i < period - 1; i++) {
      result.push(null);
    }

    result.push(prev);

    for (let i = period; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      result.push(prev);
    }

    return result;
  }

  function rsi(values, period = 14) {
    const result = Array(values.length).fill(null);

    if (values.length <= period) return result;

    let gain = 0;
    let loss = 0;

    for (let i = 1; i <= period; i++) {
      const d = values[i] - values[i - 1];

      if (d >= 0) gain += d;
      else loss -= d;
    }

    gain /= period;
    loss /= period;

    result[period] =
      loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);

    for (let i = period + 1; i < values.length; i++) {
      const d = values[i] - values[i - 1];

      const g = Math.max(d, 0);
      const l = Math.max(-d, 0);

      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;

      result[i] =
        loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }

    return result;
  }

  function macd(values) {
    const fast = ema(values, CONFIG.MACD_FAST);
    const slow = ema(values, CONFIG.MACD_SLOW);

    const line = values.map((_, i) => {
      if (fast[i] == null || slow[i] == null) return null;
      return fast[i] - slow[i];
    });

    const clean = line.filter(v => v != null);
    const signalClean = ema(clean, CONFIG.MACD_SIGNAL);

    const signal = Array(line.length).fill(null);

    let j = 0;

    for (let i = 0; i < line.length; i++) {
      if (line[i] != null) {
        signal[i] = signalClean[j] ?? null;
        j++;
      }
    }

    const histogram = line.map((v, i) => {
      if (v == null || signal[i] == null) return null;
      return v - signal[i];
    });

    return { line, signal, histogram };
  }

  function roc(values, period = 10) {
    const result = Array(values.length).fill(null);

    for (let i = period; i < values.length; i++) {
      const old = values[i - period];

      if (old !== 0) {
        result[i] =
          ((values[i] - old) / old) * 100;
      }
    }

    return result;
  }

  function supportResistance(candles, period = 20) {
    const slice = candles.slice(-period);

    return {
      support: Math.min(...slice.map(x => x.l)),
      resistance: Math.max(...slice.map(x => x.h))
    };
  }

  function calculate(candles) {
    const close = candles.map(x => x.c);

    const e9 = ema(close, CONFIG.EMA_FAST);
    const e21 = ema(close, CONFIG.EMA_MID);
    const e50 = ema(close, CONFIG.EMA_SLOW);

    const r = rsi(close, CONFIG.RSI);
    const m = macd(close);
    const ro = roc(close, CONFIG.ROC);
    const sr = supportResistance(candles, CONFIG.SR);

    const i = close.length - 1;

    const price = close[i];

    let bull = 0;
    let bear = 0;

    if (e9[i] > e21[i]) bull += 15;
    else bear += 15;

    if (e21[i] > e50[i]) bull += 10;
    else bear += 10;

    if (r[i] >= 50 && r[i] < 70) bull += 15;
    else if (r[i] < 50 && r[i] > 30) bear += 15;

    if (m.histogram[i] > 0) bull += 15;
    else if (m.histogram[i] < 0) bear += 15;

    if (ro[i] > 0) bull += 10;
    else if (ro[i] < 0) bear += 10;

    const range =
      sr.resistance - sr.support;

    if (range > 0) {
      const position =
        (price - sr.support) / range;

      if (position < 0.35) bull += 15;
      if (position > 0.65) bear += 15;
    }

    const score = Math.max(bull, bear);

    let signal = "WAIT";

    if (score >= CONFIG.MIN_SCORE) {
      signal = bull > bear ? "UP" : "DOWN";
    }

    return {
      price,
      ema9: e9[i],
      ema21: e21[i],
      ema50: e50[i],
      rsi: r[i],
      macd: m.line[i],
      macdSignal: m.signal[i],
      histogram: m.histogram[i],
      roc: ro[i],
      support: sr.support,
      resistance: sr.resistance,
      bull,
      bear,
      score,
      signal
    };
  }

  function createUI() {
    if (document.getElementById(NS + "_ROOT")) return;

    const style = document.createElement("style");

    style.textContent = `
      #${NS}_ROOT {
        position:fixed;
        left:12px;
        bottom:18px;
        z-index:2147483647;
        font-family:Arial,sans-serif;
      }

      #${NS}_BTN {
        width:58px;
        height:58px;
        border-radius:50%;
        border:2px solid #fff;
        background:#111;
        color:#fff;
        font-weight:bold;
        cursor:pointer;
        box-shadow:0 4px 18px #0008;
      }

      #${NS}_PANEL {
        display:none;
        position:fixed;
        left:12px;
        bottom:85px;
        width:330px;
        max-width:calc(100vw - 24px);
        max-height:75vh;
        overflow:auto;
        background:#101318;
        color:#fff;
        border:1px solid #444;
        border-radius:12px;
        padding:12px;
        box-shadow:0 8px 30px #0009;
        font-size:12px;
      }

      #${NS}_PANEL h3 {
        margin:0 0 10px;
        font-size:15px;
      }

      .${NS}_row {
        display:flex;
        justify-content:space-between;
        gap:8px;
        padding:4px 0;
        border-bottom:1px solid #252931;
      }

      #${NS}_SCAN {
        width:100%;
        margin-top:10px;
        padding:9px;
        border:0;
        border-radius:7px;
        background:#fff;
        color:#111;
        font-weight:bold;
      }

      #${NS}_TRI {
        position:fixed;
        right:12px;
        top:12px;
        z-index:2147483647;
        width:38px;
        height:38px;
        border:0;
        border-radius:8px;
        background:#111;
        color:#fff;
        font-size:20px;
      }
    `;

    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = NS + "_ROOT";

    const btn = document.createElement("button");
    btn.id = NS + "_BTN";
    btn.textContent = "MANGO";

    const panel = document.createElement("div");
    panel.id = NS + "_PANEL";

    const tri = document.createElement("button");
    tri.id = NS + "_TRI";
    tri.textContent = "▲";

    root.appendChild(btn);
    document.body.appendChild(root);
    document.body.appendChild(panel);
    document.body.appendChild(tri);

    function scan() {
      const data = discoverData();

      if (data.candles.length < CONFIG.MIN_CANDLES) {
        panel.innerHTML = `
          <h3>MANGO BOT v${CONFIG.VERSION}</h3>
          <div class="${NS}_row">
            <span>DATA SOURCE</span>
            <b>${data.source}</b>
          </div>
          <div class="${NS}_row">
            <span>CANDLES</span>
            <b>${data.candles.length}</b>
          </div>
          <div class="${NS}_row">
            <span>SYMBOL</span>
            <b>${getSymbol()}</b>
          </div>
          <div class="${NS}_row">
            <span>TIMEFRAME</span>
            <b>${getTimeframe()}</b>
          </div>
          <div class="${NS}_row">
            <span>STATUS</span>
            <b>NO DATA / WAIT</b>
          </div>
          <button id="${NS}_SCAN">SCAN AGAIN</button>
        `;

        panel.querySelector("#" + NS + "_SCAN")
          .onclick = scan;

        return;
      }

      const result = calculate(data.candles);
      const last = data.candles[data.candles.length - 1];

      panel.innerHTML = `
        <h3>MANGO BOT v${CONFIG.VERSION}</h3>

        <div class="${NS}_row">
          <span>SOURCE</span>
          <b>${data.source}</b>
        </div>

        <div class="${NS}_row">
          <span>SYMBOL</span>
          <b>${getSymbol()}</b>
        </div>

        <div class="${NS}_row">
          <span>TIMEFRAME</span>
          <b>${getTimeframe()}</b>
        </div>

        <div class="${NS}_row">
          <span>CANDLES</span>
          <b>${data.candles.length}</b>
        </div>

        <div class="${NS}_row">
          <span>PRICE</span>
          <b>${result.price.toFixed(6)}</b>
        </div>

        <div class="${NS}_row">
          <span>RSI14</span>
          <b>${result.rsi?.toFixed(2) ?? "--"}</b>
        </div>

        <div class="${NS}_row">
          <span>EMA9 / EMA21 / EMA50</span>
          <b>
            ${result.ema9?.toFixed(4) ?? "--"} /
            ${result.ema21?.toFixed(4) ?? "--"} /
            ${result.ema50?.toFixed(4) ?? "--"}
          </b>
        </div>

        <div class="${NS}_row">
          <span>MACD</span>
          <b>${result.macd?.toFixed(5) ?? "--"}</b>
        </div>

        <div class="${NS}_row">
          <span>ROC</span>
          <b>${result.roc?.toFixed(2) ?? "--"}%</b>
        </div>

        <div class="${NS}_row">
          <span>SUPPORT</span>
          <b>${result.support.toFixed(6)}</b>
        </div>

        <div class="${NS}_row">
          <span>RESISTANCE</span>
          <b>${result.resistance.toFixed(6)}</b>
        </div>

        <div class="${NS}_row">
          <span>CONFIRMATION</span>
          <b>${result.score}/100</b>
        </div>

        <div class="${NS}_row">
          <span>FINAL</span>
          <b>${result.signal}</b>
        </div>

        <button id="${NS}_SCAN">SCAN AGAIN</button>
      `;

      panel.querySelector("#" + NS + "_SCAN")
        .onclick = scan;
    }

    function toggle() {
      panel.style.display =
        panel.style.display === "block"
          ? "none"
          : "block";

      if (panel.style.display === "block") {
        scan();
      }
    }

    btn.onclick = toggle;
    tri.onclick = toggle;

    window.__MANGO_BOT_INSTANCE__ = {
      version: CONFIG.VERSION,
      scan,
      toggle
    };
  }

  createUI();

})();
