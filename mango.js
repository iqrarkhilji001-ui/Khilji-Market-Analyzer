/**
 * KHILJI MARKET ANALYZER — MANGO BOT v4.0.0
 * Production browser analyzer
 *
 * SAFE MODE:
 * - Real page-exposed OHLC only
 * - No fake/random candles
 * - No random UP/DOWN
 * - No trade execution
 * - No Buy/Sell/Call/Put clicking
 * - No private WebSocket interception
 * - No auth/CORS bypass
 */

(function () {
  "use strict";

  /* =========================================================
     0. DUPLICATE GUARD
  ========================================================= */

  if (window.__KHILJI_MANGO_V4__) {
    try {
      if (window.__KHILJI_MANGO_V4__.open) {
        window.__KHILJI_MANGO_V4__.open();
      }
    } catch (e) {}
    return;
  }

  window.__KHILJI_MANGO_V4__ = {
    version: "4.0.0",
    open: null
  };

  /* =========================================================
     1. CONFIG
  ========================================================= */

  var CFG = {
    MIN_CANDLES: 50,
    MAX_SCAN_DEPTH: 4,
    MAX_ARRAY_ITEMS: 500,
    MIN_SCORE: 70,
    RSI_PERIOD: 14,
    EMA_FAST: 9,
    EMA_MID: 21,
    EMA_SLOW: 50,
    MACD_FAST: 12,
    MACD_SLOW: 26,
    MACD_SIGNAL: 9,
    ROC_PERIOD: 10,
    SR_PERIOD: 20
  };

  var state = {
    candles: [],
    source: "NONE",
    symbol: "UNKNOWN",
    timeframe: "UNKNOWN",
    lastPrice: null,
    signal: "WAIT",
    bullScore: 0,
    bearScore: 0,
    error: "",
    scanning: false,
    report: null
  };

  /* =========================================================
     2. BASIC HELPERS
  ========================================================= */

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function num(v) {
    if (typeof v === "number" && isFinite(v)) return v;

    if (typeof v === "string") {
      var s = v.replace(/,/g, "").trim();
      if (s !== "" && isFinite(Number(s))) {
        return Number(s);
      }
    }

    return null;
  }

  function first(obj, keys) {
    if (!obj || typeof obj !== "object") return null;

    for (var i = 0; i < keys.length; i++) {
      if (
        Object.prototype.hasOwnProperty.call(obj, keys[i]) &&
        obj[keys[i]] != null
      ) {
        return obj[keys[i]];
      }
    }

    return null;
  }

  function safeText(el) {
    try {
      return (el.innerText || el.textContent || "").trim();
    } catch (e) {
      return "";
    }
  }

  function removeOldUI() {
    var old = document.getElementById("KHILJI_MANGO_ROOT_V4");
    if (old) old.remove();

    var oldStyle = document.getElementById("KHILJI_MANGO_STYLE_V4");
    if (oldStyle) oldStyle.remove();
  }

  /* =========================================================
     3. STYLE
  ========================================================= */

  removeOldUI();

  var style = document.createElement("style");

  style.id = "KHILJI_MANGO_STYLE_V4";

  style.textContent = `
    #KHILJI_MANGO_ROOT_V4,
    #KHILJI_MANGO_ROOT_V4 * {
      box-sizing: border-box;
    }

    #KHILJI_MANGO_ROOT_V4 {
      position: fixed !important;
      left: 14px !important;
      bottom: 18px !important;
      width: 58px !important;
      height: 58px !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      touch-action: manipulation !important;
      font-family: Arial, sans-serif !important;
    }

    #KHILJI_MANGO_BUTTON_V4 {
      width: 58px !important;
      height: 58px !important;
      border-radius: 50% !important;
      border: 2px solid #00ff88 !important;
      background: #07130d !important;
      color: #00ff88 !important;
      font-weight: 900 !important;
      font-size: 13px !important;
      box-shadow: 0 0 18px rgba(0,255,136,.65) !important;
      cursor: pointer !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      -webkit-tap-highlight-color: transparent !important;
    }

    #KHILJI_MANGO_TRIANGLE_V4 {
      position: fixed !important;
      right: 12px !important;
      top: 72px !important;
      width: 0 !important;
      height: 0 !important;
      border-left: 15px solid transparent !important;
      border-right: 15px solid transparent !important;
      border-bottom: 25px solid #00ff88 !important;
      filter: drop-shadow(0 0 7px #00ff88) !important;
      z-index: 2147483647 !important;
      cursor: pointer !important;
      pointer-events: auto !important;
      touch-action: manipulation !important;
    }

    #KHILJI_MANGO_PANEL_V4 {
      position: fixed !important;
      right: 10px !important;
      top: 108px !important;
      width: min(360px, calc(100vw - 20px)) !important;
      max-height: calc(100vh - 125px) !important;
      overflow-y: auto !important;
      background: rgba(5,10,8,.98) !important;
      color: #eafff2 !important;
      border: 1px solid #00ff88 !important;
      border-radius: 14px !important;
      padding: 12px !important;
      z-index: 2147483646 !important;
      pointer-events: auto !important;
      touch-action: manipulation !important;
      display: none !important;
      box-shadow: 0 0 25px rgba(0,255,136,.30) !important;
      font-size: 12px !important;
      line-height: 1.4 !important;
    }

    #KHILJI_MANGO_PANEL_V4 button {
      border: 1px solid #00ff88 !important;
      background: #07130d !important;
      color: #00ff88 !important;
      border-radius: 8px !important;
      padding: 8px 10px !important;
      margin: 3px !important;
      font-weight: 800 !important;
      cursor: pointer !important;
      pointer-events: auto !important;
      touch-action: manipulation !important;
    }

    #KHILJI_MANGO_PANEL_V4 .m-row {
      display: flex !important;
      justify-content: space-between !important;
      gap: 8px !important;
      padding: 4px 0 !important;
      border-bottom: 1px solid rgba(255,255,255,.07) !important;
    }

    #KHILJI_MANGO_PANEL_V4 .m-key {
      color: #8fa99a !important;
    }

    #KHILJI_MANGO_PANEL_V4 .m-value {
      text-align: right !important;
      word-break: break-word !important;
    }

    #KHILJI_MANGO_PANEL_V4 .m-title {
      color: #00ff88 !important;
      font-size: 15px !important;
      font-weight: 900 !important;
      margin-bottom: 8px !important;
    }

    #KHILJI_MANGO_PANEL_V4 .m-signal {
      font-size: 20px !important;
      font-weight: 900 !important;
      text-align: center !important;
      padding: 10px !important;
      margin: 8px 0 !important;
      border: 1px solid #00ff88 !important;
      border-radius: 10px !important;
    }

    #KHILJI_MANGO_PANEL_V4 .m-good {
      color: #00ff88 !important;
    }

    #KHILJI_MANGO_PANEL_V4 .m-warn {
      color: #ffd166 !important;
    }

    #KHILJI_MANGO_PANEL_V4 .m-bad {
      color: #ff6961 !important;
    }

    #KHILJI_MANGO_PANEL_V4 .m-small {
      color: #80948a !important;
      font-size: 10px !important;
      margin-top: 8px !important;
    }

    #KHILJI_MANGO_STATUS_V4 {
      position: fixed !important;
      left: 82px !important;
      bottom: 23px !important;
      z-index: 2147483647 !important;
      background: rgba(0,0,0,.85) !important;
      color: #00ff88 !important;
      border: 1px solid #00ff88 !important;
      border-radius: 8px !important;
      padding: 5px 8px !important;
      font: 11px Arial,sans-serif !important;
      pointer-events: none !important;
    }
  `;

  document.head.appendChild(style);

  /* =========================================================
     4. UI
  ========================================================= */

  var root = document.createElement("div");
  root.id = "KHILJI_MANGO_ROOT_V4";

  var mangoButton = document.createElement("button");
  mangoButton.id = "KHILJI_MANGO_BUTTON_V4";
  mangoButton.type = "button";
  mangoButton.textContent = "MANGO";

  var triangle = document.createElement("div");
  triangle.id = "KHILJI_MANGO_TRIANGLE_V4";
  triangle.title = "MANGO Analysis";

  var statusBox = document.createElement("div");
  statusBox.id = "KHILJI_MANGO_STATUS_V4";
  statusBox.textContent = "MANGO READY";

  var panel = document.createElement("div");
  panel.id = "KHILJI_MANGO_PANEL_V4";

  root.appendChild(mangoButton);
  document.body.appendChild(root);
  document.body.appendChild(triangle);
  document.body.appendChild(statusBox);
  document.body.appendChild(panel);

  /* =========================================================
     5. STATUS
  ========================================================= */

  function setStatus(text, type) {
    statusBox.textContent = "MANGO: " + text;

    if (type === "bad") {
      statusBox.style.color = "#ff6961";
      statusBox.style.borderColor = "#ff6961";
    } else if (type === "warn") {
      statusBox.style.color = "#ffd166";
      statusBox.style.borderColor = "#ffd166";
    } else {
      statusBox.style.color = "#00ff88";
      statusBox.style.borderColor = "#00ff88";
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function row(k, v) {
    return (
      '<div class="m-row">' +
      '<span class="m-key">' + esc(k) + "</span>" +
      '<span class="m-value">' + esc(v) + "</span>" +
      "</div>"
    );
  }

  /* =========================================================
     6. CANDLE NORMALIZER
  ========================================================= */

  function normalizeCandle(x) {
    if (!x) return null;

    var t, o, h, l, c;

    if (Array.isArray(x)) {
      if (x.length >= 5) {
        t = num(x[0]);
        o = num(x[1]);
        h = num(x[2]);
        l = num(x[3]);
        c = num(x[4]);

        if (
          t != null &&
          o != null &&
          h != null &&
          l != null &&
          c != null
        ) {
          return {
            t: t,
            o: o,
            h: h,
            l: l,
            c: c
          };
        }
      }
    }

    if (typeof x !== "object") return null;

    t = num(
      first(x, [
        "t",
        "time",
        "timestamp",
        "ts",
        "date",
        "datetime",
        "startTime",
        "start",
        "x"
      ])
    );

    o = num(first(x, ["o", "open", "Open"]));
    h = num(first(x, ["h", "high", "High"]));
    l = num(first(x, ["l", "low", "Low"]));
    c = num(first(x, ["c", "close", "Close", "price"]));

    if (
      t != null &&
      o != null &&
      h != null &&
      l != null &&
      c != null
    ) {
      return {
        t: t,
        o: o,
        h: h,
        l: l,
        c: c
      };
    }

    return null;
  }

  function normalizeArray(arr) {
    if (!Array.isArray(arr)) return [];

    var out = [];

    for (
      var i = Math.max(0, arr.length - CFG.MAX_ARRAY_ITEMS);
      i < arr.length;
      i++
    ) {
      var c = normalizeCandle(arr[i]);

      if (c) out.push(c);
    }

    return out;
  }

  /* =========================================================
     7. CANDLE VALIDATION
  ========================================================= */

  function validateCandles(candles) {
    if (!Array.isArray(candles)) {
      return {
        ok: false,
        reason: "NOT_ARRAY"
      };
    }

    if (candles.length < CFG.MIN_CANDLES) {
      return {
        ok: false,
        reason: "TOO_FEW_CANDLES: " + candles.length
      };
    }

    var prev = null;

    for (var i = 0; i < candles.length; i++) {
      var x = candles[i];

      if (
        !x ||
        !isFinite(x.t) ||
        !isFinite(x.o) ||
        !isFinite(x.h) ||
        !isFinite(x.l) ||
        !isFinite(x.c)
      ) {
        return {
          ok: false,
          reason: "INVALID_OHLC_AT_" + i
        };
      }

      if (
        x.h < Math.max(x.o, x.c) ||
        x.l > Math.min(x.o, x.c) ||
        x.h < x.l
      ) {
        return {
          ok: false,
          reason: "INVALID_HL_AT_" + i
        };
      }

      if (prev != null && x.t < prev) {
        return {
          ok: false,
          reason: "TIME_NOT_SORTED"
        };
      }

      prev = x.t;
    }

    var duplicate = 0;

    for (var j = 1; j < candles.length; j++) {
      if (candles[j].t === candles[j - 1].t) {
        duplicate++;
      }
    }

    if (duplicate > Math.floor(candles.length * 0.1)) {
      return {
        ok: false,
        reason: "TOO_MANY_DUPLICATE_TIMESTAMPS"
      };
    }

    return {
      ok: true,
      reason: "VALID"
    };
  }

  /* =========================================================
     8. SORT / DEDUP
  ========================================================= */

  function cleanCandles(candles) {
    var copy = candles.slice();

    copy.sort(function (a, b) {
      return a.t - b.t;
    });

    var map = {};
    var out = [];

    for (var i = 0; i < copy.length; i++) {
      var key = String(copy[i].t);
      map[key] = copy[i];
    }

    Object.keys(map)
      .sort(function (a, b) {
        return Number(a) - Number(b);
      })
      .forEach(function (k) {
        out.push(map[k]);
      });

    return out;
  }

  /* =========================================================
     9. TRADINGVIEW
  ========================================================= */

  function findTradingView() {
    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart === "function"
      ) {
        var chart = window.tvWidget.activeChart();

        if (chart) {
          var data = null;

          try {
            if (typeof chart.data === "function") {
              data = chart.data();
            }
          } catch (e) {}

          if (data) {
            var c = normalizeArray(data);

            if (validateCandles(c).ok) {
              return {
                candles: cleanCandles(c),
                source: "TradingView.activeChart.data()"
              };
            }
          }
        }
      }
    } catch (e) {}

    return null;
  }

  /* =========================================================
     10. HIGHCHARTS
  ========================================================= */

  function findHighcharts() {
    try {
      if (!window.Highcharts || !Array.isArray(window.Highcharts.charts)) {
        return null;
      }

      for (var i = 0; i < window.Highcharts.charts.length; i++) {
        var chart = window.Highcharts.charts[i];

        if (!chart || !chart.series) continue;

        for (var j = 0; j < chart.series.length; j++) {
          var series = chart.series[j];

          if (!series || !series.points) continue;

          var arr = [];

          for (var k = 0; k < series.points.length; k++) {
            var p = series.points[k];

            if (
              p &&
              p.open != null &&
              p.high != null &&
              p.low != null &&
              p.close != null
            ) {
              arr.push({
                t: num(p.x),
                o: num(p.open),
                h: num(p.high),
                l: num(p.low),
                c: num(p.close)
              });
            }
          }

          if (validateCandles(arr).ok) {
            return {
              candles: cleanCandles(arr),
              source: "Highcharts.series.points"
            };
          }
        }
      }
    } catch (e) {}

    return null;
  }

  /* =========================================================
     11. PUBLIC OBJECT EXTRACTION
  ========================================================= */

  function extractFromObject(obj, depth, seen) {
    if (!obj || depth > CFG.MAX_SCAN_DEPTH) return null;

    var type = typeof obj;

    if (type !== "object" && type !== "function") {
      return null;
    }

    if (!seen) seen = [];

    if (seen.indexOf(obj) !== -1) return null;

    seen.push(obj);

    try {
      if (Array.isArray(obj)) {
        var direct = normalizeArray(obj);

        if (validateCandles(direct).ok) {
          return cleanCandles(direct);
        }

        for (
          var i = 0;
          i < Math.min(obj.length, CFG.MAX_ARRAY_ITEMS);
          i++
        ) {
          var nested = extractFromObject(obj[i], depth + 1, seen);

          if (nested && validateCandles(nested).ok) {
            return nested;
          }
        }

        return null;
      }

      var keys;

      try {
        keys = Object.keys(obj);
      } catch (e) {
        return null;
      }

      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];

        if (
          /candle|ohlc|bars|quotes|history|series|data|prices/i.test(key)
        ) {
          var value;

          try {
            value = obj[key];
          } catch (e) {
            continue;
          }

          var normalized = normalizeArray(value);

          if (validateCandles(normalized).ok) {
            return cleanCandles(normalized);
          }

          var child = extractFromObject(value, depth + 1, seen);

          if (child && validateCandles(child).ok) {
            return child;
          }
        }
      }
    } catch (e) {}

    return null;
  }

  /* =========================================================
     12. PUBLIC STATE ROOTS
  ========================================================= */

  function findPublicState() {
    var names = [
      "__INITIAL_STATE__",
      "__NEXT_DATA__",
      "__PRELOADED_STATE__",
      "appState",
      "marketState",
      "chartState",
      "store",
      "state",
      "market",
      "chart",
      "candles",
      "bars",
      "ohlc",
      "quotes",
      "history",
      "priceHistory"
    ];

    for (var i = 0; i < names.length; i++) {
      try {
        if (window[names[i]] != null) {
          var result = extractFromObject(window[names[i]], 0, []);

          if (result && validateCandles(result).ok) {
            return {
              candles: result,
              source: "window." + names[i]
            };
          }
        }
      } catch (e) {}
    }

    return null;
  }

  /* =========================================================
     13. BOUNDED WINDOW SCAN
  ========================================================= */

  function findWindowArrays() {
    var keys = [];

    try {
      keys = Object.keys(window);
    } catch (e) {
      return null;
    }

    var preferred = [];

    for (var i = 0; i < keys.length; i++) {
      if (
        /candle|ohlc|bars|quotes|history|series|market|chart|price/i.test(
          keys[i]
        )
      ) {
        preferred.push(keys[i]);
      }
    }

    for (var j = 0; j < preferred.length; j++) {
      try {
        var val = window[preferred[j]];

        var arr = normalizeArray(val);

        if (validateCandles(arr).ok) {
          return {
            candles: cleanCandles(arr),
            source: "window." + preferred[j]
          };
        }

        var nested = extractFromObject(val, 0, []);

        if (nested && validateCandles(nested).ok) {
          return {
            candles: nested,
            source: "window." + preferred[j]
          };
        }
      } catch (e) {}
    }

    return null;
  }

  /* =========================================================
     14. DOM DATA ARRAYS
  ========================================================= */

  function findDOMData() {
    try {
      var elements = document.querySelectorAll(
        "[data-candles],[data-ohlc],[data-bars],[data-quotes]"
      );

      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];

        var attrs = [
          "data-candles",
          "data-ohlc",
          "data-bars",
          "data-quotes"
        ];

        for (var j = 0; j < attrs.length; j++) {
          var raw = el.getAttribute(attrs[j]);

          if (!raw) continue;

          try {
            var parsed = JSON.parse(raw);
            var arr = normalizeArray(parsed);

            if (validateCandles(arr).ok) {
              return {
                candles: cleanCandles(arr),
                source: "DOM." + attrs[j]
              };
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    return null;
  }

  /* =========================================================
     15. DISCOVERY
  ========================================================= */

  function discoverCandles() {
    var result = null;

    result = findTradingView();
    if (result) return result;

    result = findHighcharts();
    if (result) return result;

    result = findPublicState();
    if (result) return result;

    result = findDOMData();
    if (result) return result;

    result = findWindowArrays();
    if (result) return result;

    return {
      candles: [],
      source: "NONE DETECTED"
    };
  }

  /* =========================================================
     16. SYMBOL DETECTION
  ========================================================= */

  function detectSymbol() {
    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart === "function"
      ) {
        var chart = window.tvWidget.activeChart();

        if (chart && typeof chart.symbol === "function") {
          var s = chart.symbol();

          if (s) return String(s);
        }
      }
    } catch (e) {}

    var selectors = [
      "[data-symbol]",
      "[data-pair]",
      "[data-ticker]",
      "[data-asset]",
      "[data-instrument]"
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);

        if (el) {
          var attr =
            el.getAttribute("data-symbol") ||
            el.getAttribute("data-pair") ||
            el.getAttribute("data-ticker") ||
            el.getAttribute("data-asset") ||
            el.getAttribute("data-instrument");

          if (attr) return attr;
        }
      } catch (e) {}
    }

    try {
      var bodyText = document.body.innerText || "";

      var m = bodyText.match(
        /\b([A-Z]{3,6}(?:\/|-)[A-Z]{3,6})\b/
      );

      if (m) return m[1];
    } catch (e) {}

    try {
      var url = location.href;

      var p = new URL(url).searchParams;

      var s2 =
        p.get("symbol") ||
        p.get("pair") ||
        p.get("asset") ||
        p.get("ticker");

      if (s2) return s2;
    } catch (e) {}

    return "UNKNOWN";
  }

  /* =========================================================
     17. TIMEFRAME DETECTION
  ========================================================= */

  function detectTimeframe() {
    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart === "function"
      ) {
        var chart = window.tvWidget.activeChart();

        if (chart && typeof chart.resolution === "function") {
          var r = chart.resolution();

          if (r) return String(r);
        }
      }
    } catch (e) {}

    var selectors = [
      "[data-timeframe]",
      "[data-interval]",
      "[data-period]"
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);

        if (el) {
          var v =
            el.getAttribute("data-timeframe") ||
            el.getAttribute("data-interval") ||
            el.getAttribute("data-period");

          if (v) return v;
        }
      } catch (e) {}
    }

    try {
      var text = document.body.innerText || "";

      var m = text.match(
        /\b(1m|3m|5m|10m|15m|30m|1h|4h|1d|60s|300s)\b/i
      );

      if (m) return m[1];
    } catch (e) {}

    return "UNKNOWN";
  }

  /* =========================================================
     18. INDICATORS
  ========================================================= */

  function closes(candles) {
    return candles.map(function (x) {
      return x.c;
    });
  }

  function ema(values, period) {
    if (!values.length) return [];

    var k = 2 / (period + 1);
    var out = [];
    var prev = values[0];

    out.push(prev);

    for (var i = 1; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out.push(prev);
    }

    return out;
  }

  function rsi(values, period) {
    if (values.length <= period) return null;

    var gain = 0;
    var loss = 0;

    for (var i = 1; i <= period; i++) {
      var diff = values[i] - values[i - 1];

      if (diff >= 0) gain += diff;
      else loss -= diff;
    }

    gain /= period;
    loss /= period;

    for (var j = period + 1; j < values.length; j++) {
      var d = values[j] - values[j - 1];

      var g = d > 0 ? d : 0;
      var l = d < 0 ? -d : 0;

      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
    }

    if (loss === 0) return 100;

    var rs = gain / loss;

    return 100 - 100 / (1 + rs);
  }

  function macd(values) {
    var fast = ema(values, CFG.MACD_FAST);
    var slow = ema(values, CFG.MACD_SLOW);

    var line = [];

    for (var i = 0; i < values.length; i++) {
      line.push(fast[i] - slow[i]);
    }

    var signal = ema(line, CFG.MACD_SIGNAL);

    var lastLine = line[line.length - 1];
    var lastSignal = signal[signal.length - 1];

    return {
      line: lastLine,
      signal: lastSignal,
      histogram: lastLine - lastSignal
    };
  }

  function roc(values, period) {
    if (values.length <= period) return null;

    var last = values[values.length - 1];
    var prev = values[values.length - 1 - period];

    if (prev === 0) return null;

    return ((last - prev) / prev) * 100;
  }

  function supportResistance(candles, period) {
    var slice = candles.slice(
      Math.max(0, candles.length - period)
    );

    var support = Infinity;
    var resistance = -Infinity;

    for (var i = 0; i < slice.length; i++) {
      support = Math.min(support, slice[i].l);
      resistance = Math.max(resistance, slice[i].h);
    }

    return {
      support: support,
      resistance: resistance
    };
  }

  /* =========================================================
     19. ANALYSIS
  ========================================================= */

  function analyze(candles) {
    var values = closes(candles);

    var e9 = ema(values, CFG.EMA_FAST);
    var e21 = ema(values, CFG.EMA_MID);
    var e50 = ema(values, CFG.EMA_SLOW);

    var ema9 = e9[e9.length - 1];
    var ema21 = e21[e21.length - 1];
    var ema50 = e50[e50.length - 1];

    var r = rsi(values, CFG.RSI_PERIOD);

    var m = macd(values);

    var ro = roc(values, CFG.ROC_PERIOD);

    var sr = supportResistance(candles, CFG.SR_PERIOD);

    var price = values[values.length - 1];

    var bull = 0;
    var bear = 0;

    /* EMA 9 / 21 */

    if (ema9 > ema21) bull += 15;
    else if (ema9 < ema21) bear += 15;

    /* EMA 21 / 50 */

    if (ema21 > ema50) bull += 10;
    else if (ema21 < ema50) bear += 10;

    /* RSI */

    if (r != null) {
      if (r >= 50 && r <= 70) bull += 15;
      else if (r >= 30 && r < 50) bear += 15;
    }

    /* MACD */

    if (m.histogram > 0) bull += 15;
    else if (m.histogram < 0) bear += 15;

    /* ROC */

    if (ro != null) {
      if (ro > 0) bull += 10;
      else if (ro < 0) bear += 10;
    }

    /* Support / resistance position */

    var range = sr.resistance - sr.support;

    if (range > 0) {
      var pos = (price - sr.support) / range;

      if (pos < 0.35) {
        bull += 15;
      } else if (pos > 0.65) {
        bear += 15;
      }
    }

    var signal = "WAIT";

    if (bull >= CFG.MIN_SCORE && bull > bear) {
      signal = "UP";
    } else if (bear >= CFG.MIN_SCORE && bear > bull) {
      signal = "DOWN";
    }

    var trend = "SIDEWAYS";

    if (ema9 > ema21 && ema21 > ema50) {
      trend = "BULLISH";
    } else if (ema9 < ema21 && ema21 < ema50) {
      trend = "BEARISH";
    }

    return {
      price: price,
      ema9: ema9,
      ema21: ema21,
      ema50: ema50,
      rsi: r,
      macd: m,
      roc: ro,
      support: sr.support,
      resistance: sr.resistance,
      bullScore: bull,
      bearScore: bear,
      trend: trend,
      signal: signal
    };
  }

  /* =========================================================
     20. LIBRARY DETECTION
  ========================================================= */

  function detectLibraries() {
    var list = [];

    try {
      if (window.tvWidget) list.push("TradingView");
    } catch (e) {}

    try {
      if (window.Highcharts) list.push("Highcharts");
    } catch (e) {}

    try {
      if (window.ApexCharts) list.push("ApexCharts");
    } catch (e) {}

    try {
      if (window.Chart) list.push("Chart.js");
    } catch (e) {}

    try {
      if (window.LightweightCharts) {
        list.push("LightweightCharts");
      }
    } catch (e) {}

    return list.length ? list.join(", ") : "NONE DETECTED";
  }

  /* =========================================================
     21. SCAN
  ========================================================= */

  async function scan() {
    if (state.scanning) return;

    state.scanning = true;

    setStatus("SCANNING...", "warn");

    renderPanel();

    await sleep(150);

    try {
      var result = discoverCandles();

      var candles = cleanCandles(result.candles || []);

      state.source = result.source || "NONE DETECTED";
      state.symbol = detectSymbol();
      state.timeframe = detectTimeframe();
      state.candles = candles;

      var validation = validateCandles(candles);

      if (!validation.ok) {
        state.lastPrice = null;
        state.signal = "WAIT";
        state.bullScore = 0;
        state.bearScore = 0;
        state.error = validation.reason;

        setStatus("NO DATA / WAIT", "bad");

        state.report = {
          version: CFG,
          source: state.source,
          symbol: state.symbol,
          timeframe: state.timeframe,
          candleCount: candles.length,
          validation: validation,
          libraries: detectLibraries(),
          signal: "WAIT",
          error: state.error
        };

        renderPanel();

        return;
      }

      var analysis = analyze(candles);

      state.lastPrice = analysis.price;
      state.signal = analysis.signal;
      state.bullScore = analysis.bullScore;
      state.bearScore = analysis.bearScore;
      state.error = "";

      state.report = {
        source: state.source,
        symbol: state.symbol,
        timeframe: state.timeframe,
        candleCount: candles.length,
        lastCandle: candles[candles.length - 1],
        analysis: analysis,
        validation: validation,
        libraries: detectLibraries()
      };

      if (analysis.signal === "UP") {
        setStatus("UP", "good");
      } else if (analysis.signal === "DOWN") {
        setStatus("DOWN", "bad");
      } else {
        setStatus("WAIT", "warn");
      }

      renderPanel();
    } catch (err) {
      state.error = String(err && err.message ? err.message : err);
      state.signal = "WAIT";

      setStatus("ERROR / WAIT", "bad");

      renderPanel();
    } finally {
      state.scanning = false;
    }
  }

  /* =========================================================
     22. PANEL
  ========================================================= */

  function renderPanel() {
    var a = null;

    if (state.report && state.report.analysis) {
      a = state.report.analysis;
    }

    var signalClass = "m-warn";

    if (state.signal === "UP") signalClass = "m-good";
    if (state.signal === "DOWN") signalClass = "m-bad";

    var html = "";

    html += '<div class="m-title">KHILJI MANGO ANALYZER v4.0</div>';

    html +=
      '<div class="m-signal ' +
      signalClass +
      '">' +
      esc(state.signal) +
      "</div>";

    html += row("DATA SOURCE", state.source);
    html += row("SYMBOL", state.symbol);
    html += row("TIMEFRAME", state.timeframe);
    html += row("CANDLE COUNT", state.candles.length);
    html += row(
      "LAST PRICE",
      state.lastPrice == null
        ? "N/A"
        : Number(state.lastPrice).toFixed(6)
    );

    if (a) {
      html += row("RSI 14", a.rsi == null ? "N/A" : a.rsi.toFixed(2));
      html += row("EMA 9", a.ema9.toFixed(6));
      html += row("EMA 21", a.ema21.toFixed(6));
      html += row("EMA 50", a.ema50.toFixed(6));

      html += row("MACD", a.macd.line.toFixed(6));
      html += row("MACD SIGNAL", a.macd.signal.toFixed(6));
      html += row(
        "MACD HIST",
        a.macd.histogram.toFixed(6)
      );

      html += row(
        "ROC",
        a.roc == null ? "N/A" : a.roc.toFixed(3) + "%"
      );

      html += row(
        "SUPPORT",
        a.support.toFixed(6)
      );

      html += row(
        "RESISTANCE",
        a.resistance.toFixed(6)
      );

      html += row("TREND", a.trend);

      html += row(
        "BULL SCORE",
        String(a.bullScore) + "/80"
      );

      html += row(
        "BEAR SCORE",
        String(a.bearScore) + "/80"
      );
    }

    if (state.error) {
      html += row("VALIDATION", state.error);
    } else if (state.candles.length) {
      html += row("VALIDATION", "PASSED");
    } else {
      html += row("VALIDATION", "NO DATA");
    }

    html +=
      '<div style="margin-top:8px;text-align:center;">' +
      '<button id="KHILJI_SCAN_V4" type="button">SCAN AGAIN</button>' +
      '<button id="KHILJI_REPORT_V4" type="button">REPORT</button>' +
      '<button id="KHILJI_CLOSE_V4" type="button">CLOSE</button>' +
      "</div>";

    html +=
      '<div class="m-small">' +
      "SAFE MODE: Analyzer only. No trade execution." +
      "</div>";

    panel.innerHTML = html;

    var scanButton = document.getElementById("KHILJI_SCAN_V4");
    var reportButton = document.getElementById("KHILJI_REPORT_V4");
    var closeButton = document.getElementById("KHILJI_CLOSE_V4");

    if (scanButton) {
      scanButton.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        scan();
      });
    }

    if (reportButton) {
      reportButton.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        showReport();
      });
    }

    if (closeButton) {
      closeButton.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        panel.style.display = "none";
      });
    }
  }

  /* =========================================================
     23. REPORT
  ========================================================= */

  function showReport() {
    var r = state.report || {
      status: "NOT SCANNED"
    };

    var text = "";

    try {
      text = JSON.stringify(r, null, 2);
    } catch (e) {
      text = "REPORT ERROR";
    }

    panel.innerHTML =
      '<div class="m-title">MANGO DIAGNOSTIC REPORT</div>' +
      '<pre style="white-space:pre-wrap;word-break:break-word;color:#d9ffe8;font-size:10px;">' +
      esc(text) +
      "</pre>" +
      '<button id="KHILJI_BACK_V4" type="button">BACK</button>';

    var back = document.getElementById("KHILJI_BACK_V4");

    if (back) {
      back.addEventListener("click", function () {
        renderPanel();
      });
    }
  }

  /* =========================================================
     24. BUTTON EVENTS
  ========================================================= */

  function openPanel() {
    panel.style.display =
      panel.style.display === "block" ? "none" : "block";

    if (panel.style.display === "block") {
      renderPanel();
    }
  }

  mangoButton.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();

    openPanel();
  });

  triangle.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();

    openPanel();
    scan();
  });

  /* =========================================================
     25. PUBLIC OPEN
  ========================================================= */

  window.__KHILJI_MANGO_V4__.open = openPanel;

  /* =========================================================
     26. INITIAL STATE
  ========================================================= */

  setStatus("READY", "good");

  renderPanel();

  /*
   * IMPORTANT:
   * We deliberately do NOT auto-trade.
   * We also do not fabricate data.
   */

})();
