/**
 * KHILJI MARKET ANALYZER - MANGO BOT v4.3.0
 * DIAGNOSTIC DATA DISCOVERY BUILD
 *
 * REAL DATA ONLY
 * NO FAKE CANDLES
 * NO RANDOM DATA
 * NO TRADE EXECUTION
 * NO WEBSOCKET INTERCEPTION
 * NO AUTH / SESSION BYPASS
 */

(function () {
  "use strict";

  /* =========================
     DUPLICATE GUARD
  ========================= */
  if (window.__MANGO_BOT_LOADED__) {
    if (window.__MANGO_BOT_INSTANCE__ &&
        window.__MANGO_BOT_INSTANCE__.show) {
      window.__MANGO_BOT_INSTANCE__.show();
    }
    return;
  }

  window.__MANGO_BOT_LOADED__ = true;

  /* =========================
     CONFIG
  ========================= */
  var CFG = {
    bridge: "http://127.0.0.1:8765",
    minCandles: 50,
    scanLimit: 500
  };

  var state = {
    source: "NONE DETECTED",
    candles: [],
    symbol: "UNKNOWN",
    timeframe: "UNKNOWN",
    latest: null,
    hint: "NO DATA"
  };

  /* =========================
     HELPERS
  ========================= */
  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function timeValue(v) {
    var n = num(v);
    if (n === null) return null;

    if (n < 10000000000) n *= 1000;

    return n;
  }

  function candle(o) {
    if (!o) return null;

    var t = timeValue(
      o.time !== undefined ? o.time :
      o.timestamp !== undefined ? o.timestamp :
      o.ts !== undefined ? o.ts :
      o.from !== undefined ? o.from :
      o.t
    );

    var op = num(
      o.open !== undefined ? o.open :
      o.o
    );

    var hi = num(
      o.high !== undefined ? o.high :
      o.h
    );

    var lo = num(
      o.low !== undefined ? o.low :
      o.l
    );

    var cl = num(
      o.close !== undefined ? o.close :
      o.c
    );

    if ([t, op, hi, lo, cl].some(function (x) {
      return x === null;
    })) return null;

    if (t > Date.now() + 60000) return null;

    if (lo > op || lo > cl || hi < op || hi < cl) {
      return null;
    }

    return {
      time: Math.floor(t),
      open: op,
      high: hi,
      low: lo,
      close: cl
    };
  }

  function arrayCandle(x) {
    if (!Array.isArray(x) || x.length < 5) return null;

    return candle({
      time: x[0],
      open: x[1],
      high: x[2],
      low: x[3],
      close: x[4]
    });
  }

  function normalize(arr) {
    if (!Array.isArray(arr)) return [];

    var out = [];

    for (var i = 0; i < arr.length; i++) {
      var c = Array.isArray(arr[i])
        ? arrayCandle(arr[i])
        : candle(arr[i]);

      if (c) out.push(c);
    }

    var seen = {};
    out = out.filter(function (c) {
      if (seen[c.time]) return false;
      seen[c.time] = true;
      return true;
    });

    out.sort(function (a, b) {
      return a.time - b.time;
    });

    return out.slice(-CFG.scanLimit);
  }

  function merge(a, b) {
    return normalize((a || []).concat(b || []));
  }

  function fmtTime(t) {
    if (!t) return "N/A";

    try {
      return new Date(t).toLocaleString();
    } catch (e) {
      return "N/A";
    }
  }

  /* =========================
     BRIDGE
  ========================= */
  async function bridgeStatus() {
    try {
      var r = await fetch(CFG.bridge + "/status", {
        method: "GET",
        cache: "no-store"
      });

      if (!r.ok) return null;

      return await r.json();
    } catch (e) {
      return null;
    }
  }

  async function bridgeCandles() {
    try {
      var r = await fetch(CFG.bridge + "/candles", {
        method: "GET",
        cache: "no-store"
      });

      if (!r.ok) return [];

      var j = await r.json();

      return normalize(
        Array.isArray(j) ? j :
        Array.isArray(j.candles) ? j.candles :
        []
      );
    } catch (e) {
      return [];
    }
  }

  /* =========================
     TRADINGVIEW DISCOVERY
  ========================= */
  function tradingViewScan() {
    var result = {
      candles: [],
      symbol: "UNKNOWN",
      timeframe: "UNKNOWN",
      keys: []
    };

    try {
      var tv = window.tvWidget;

      if (!tv) return result;

      result.keys = Object.keys(tv).slice(0, 30);

      var chart = null;

      try {
        chart = tv.activeChart();
      } catch (e) {}

      if (!chart) return result;

      try {
        if (typeof chart.symbol === "function") {
          result.symbol = chart.symbol() || "UNKNOWN";
        }
      } catch (e) {}

      try {
        if (typeof chart.resolution === "function") {
          result.timeframe = chart.resolution() || "UNKNOWN";
        }
      } catch (e) {}

      /* Public chart API probes */
      var candidates = [];

      try {
        if (typeof chart.data === "function") {
          candidates.push(chart.data());
        } else if (Array.isArray(chart.data)) {
          candidates.push(chart.data);
        }
      } catch (e) {}

      try {
        if (typeof chart.getData === "function") {
          candidates.push(chart.getData());
        }
      } catch (e) {}

      for (var i = 0; i < candidates.length; i++) {
        var n = normalize(candidates[i]);

        if (n.length > result.candles.length) {
          result.candles = n;
        }
      }
    } catch (e) {}

    return result;
  }

  /* =========================
     HIGHCHARTS DISCOVERY
  ========================= */
  function highchartsScan() {
    var result = [];

    try {
      var charts = window.Highcharts &&
                   Array.isArray(window.Highcharts.charts)
        ? window.Highcharts.charts
        : [];

      charts.forEach(function (ch) {
        if (!ch || !ch.series) return;

        ch.series.forEach(function (s) {
          if (!s || !Array.isArray(s.points)) return;

          var arr = [];

          s.points.forEach(function (p) {
            if (!p) return;

            if (
              p.open !== undefined &&
              p.high !== undefined &&
              p.low !== undefined &&
              p.close !== undefined
            ) {
              arr.push({
                time: p.x,
                open: p.open,
                high: p.high,
                low: p.low,
                close: p.close
              });
            }
          });

          result = merge(result, arr);
        });
      });
    } catch (e) {}

    return result;
  }

  /* =========================
     WINDOW ARRAY DISCOVERY
  ========================= */
  function windowArrayScan() {
    var names = [
      "candles",
      "quotes",
      "chartData",
      "historyCandles",
      "activeCandles",
      "currentQuotes",
      "_candles",
      "rawCandles",
      "bars",
      "ohlcData",
      "chartQuotes",
      "priceData",
      "history",
      "marketData",
      "klineData",
      "ohlcv"
    ];

    var best = [];
    var found = [];

    names.forEach(function (name) {
      try {
        var v = window[name];

        if (Array.isArray(v)) {
          var n = normalize(v);

          if (n.length) {
            found.push(name + ":" + n.length);

            if (n.length > best.length) {
              best = n;
            }
          }
        }
      } catch (e) {}
    });

    return {
      candles: best,
      found: found
    };
  }

  /* =========================
     DOM OHLC DISCOVERY
  ========================= */
  function domScan() {
    var selectors = [
      "[data-open][data-high][data-low][data-close]",
      "[data-open][data-close]",
      "[data-o][data-h][data-l][data-c]",
      "[data-time][data-open][data-high][data-low][data-close]"
    ];

    var out = [];

    selectors.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (el) {
          var c = candle({
            time:
              el.getAttribute("data-time") ||
              el.getAttribute("data-timestamp") ||
              Date.now(),

            open:
              el.getAttribute("data-open") ||
              el.getAttribute("data-o"),

            high:
              el.getAttribute("data-high") ||
              el.getAttribute("data-h"),

            low:
              el.getAttribute("data-low") ||
              el.getAttribute("data-l"),

            close:
              el.getAttribute("data-close") ||
              el.getAttribute("data-c")
          });

          if (c) out.push(c);
        });
      } catch (e) {}
    });

    return normalize(out);
  }

  /* =========================
     PERFORMANCE RESOURCE HINTS
     ========================= */
  function resourceScan() {
    var hits = [];

    try {
      var entries = performance.getEntriesByType("resource") || [];

      entries.forEach(function (e) {
        var u = String(e.name || "");

        if (
          /candle|candles|chart|quote|quotes|ohlc|ohlcv|kline|market|price|history|stream|socket/i.test(u)
        ) {
          hits.push(u);
        }
      });
    } catch (e) {}

    return hits.slice(-30);
  }

  /* =========================
     PUBLIC GLOBAL HINTS
  ========================= */
  function globalScan() {
    var hits = [];

    try {
      Object.keys(window).forEach(function (k) {
        if (
          /candle|chart|quote|ohlc|kline|market|price|history|bars/i.test(k)
        ) {
          hits.push(k);
        }
      });
    } catch (e) {}

    return hits.slice(0, 80);
  }

  /* =========================
     SYMBOL
  ========================= */
  function detectSymbol(tvSymbol) {
    if (tvSymbol && tvSymbol !== "UNKNOWN") {
      return tvSymbol;
    }

    var selectors = [
      ".current-symbol",
      ".asset-select",
      ".header__asset-name",
      ".pairs-item.active",
      ".asset-name",
      ".active-asset",
      ".btn-symbol",
      ".open-chart-asset-name",
      "[data-qa='current-asset']",
      "[data-testid='ticker-name']",
      ".symbol-name"
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);

        if (el) {
          var t = (el.textContent || "").trim();

          if (t && t.length < 80) {
            return t;
          }
        }
      } catch (e) {}
    }

    try {
      var p = new URLSearchParams(location.search);

      return (
        p.get("symbol") ||
        p.get("pair") ||
        p.get("asset") ||
        "UNKNOWN"
      );
    } catch (e) {
      return "UNKNOWN";
    }
  }

  /* =========================
     TIMEFRAME
  ========================= */
  function detectTimeframe(tvTimeframe, candles) {
    if (tvTimeframe && tvTimeframe !== "UNKNOWN") {
      return String(tvTimeframe);
    }

    var selectors = [
      ".timeframe.active",
      ".time-frame.active",
      "[data-timeframe].active",
      "[data-interval].active",
      "[data-resolution].active"
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);

        if (el) {
          var t = (
            el.getAttribute("data-timeframe") ||
            el.getAttribute("data-interval") ||
            el.getAttribute("data-resolution") ||
            el.textContent ||
            ""
          ).trim();

          if (t) return t;
        }
      } catch (e) {}
    }

    if (candles.length >= 3) {
      var a = candles[candles.length - 1].time;
      var b = candles[candles.length - 2].time;

      var sec = Math.round(Math.abs(a - b) / 1000);

      if (sec === 60) return "1m";
      if (sec === 300) return "5m";
      if (sec === 900) return "15m";
      if (sec === 1800) return "30m";
      if (sec === 3600) return "1h";
    }

    return "UNKNOWN";
  }

  /* =========================
     FULL DISCOVERY
  ========================= */
  async function discover() {

    state.source = "NONE DETECTED";
    state.candles = [];
    state.hint = "NO PUBLIC CANDLE DATA FOUND";

    var bridge = await bridgeStatus();

    if (bridge) {
      var bc = await bridgeCandles();

      if (bc.length) {
        state.candles = bc;
        state.source = "LOCAL BRIDGE";
        state.symbol = bridge.asset || "UNKNOWN";

        var p = Number(bridge.period);

        state.timeframe =
          p === 60 ? "1m" :
          p === 300 ? "5m" :
          p === 900 ? "15m" :
          p === 1800 ? "30m" :
          p ? String(p) + "s" :
          "UNKNOWN";

        state.hint = "BRIDGE DATA FOUND";

        return;
      }
    }

    var tv = tradingViewScan();

    if (tv.candles.length) {
      state.candles = tv.candles;
      state.source = "TRADINGVIEW PUBLIC DATA";
      state.symbol = tv.symbol;
      state.timeframe = tv.timeframe;
      state.hint = "TRADINGVIEW DATA FOUND";

      return;
    }

    var hc = highchartsScan();

    if (hc.length) {
      state.candles = hc;
      state.source = "HIGHCHARTS PUBLIC DATA";
      state.hint = "HIGHCHARTS DATA FOUND";

      return;
    }

    var wa = windowArrayScan();

    if (wa.candles.length) {
      state.candles = wa.candles;
      state.source = "PUBLIC WINDOW ARRAY";
      state.hint = "WINDOW ARRAY: " + wa.found.join(", ");

      return;
    }

    var dc = domScan();

    if (dc.length) {
      state.candles = dc;
      state.source = "DOM OHLC DATA";
      state.hint = "DOM OHLC DATA FOUND";

      return;
    }

    state.symbol = detectSymbol(tv.symbol);
    state.timeframe = detectTimeframe(
      tv.timeframe,
      []
    );

    var resources = resourceScan();
    var globals = globalScan();

    if (resources.length) {
      state.hint =
        "NO CANDLES. RESOURCE HINTS FOUND: " +
        resources.length;
    } else if (globals.length) {
      state.hint =
        "NO CANDLES. GLOBAL HINTS FOUND: " +
        globals.join(", ");
    } else {
      state.hint =
        "NO PUBLIC OHLC DATA EXPOSED TO MANGO";
    }

    state.debugResources = resources;
    state.debugGlobals = globals;
    state.tvKeys = tv.keys;
  }

  /* =========================
     UI
  ========================= */
  var root = document.createElement("div");

  root.id = "mango-diagnostic-root";

  root.innerHTML =
    '<div id="mango-btn" style="' +
    'position:fixed;left:12px;top:45%;z-index:2147483646;' +
    'width:58px;height:58px;border-radius:50%;' +
    'background:#101722;border:3px solid #22c55e;' +
    'display:flex;align-items:center;justify-content:center;' +
    'color:#22c55e;font-weight:bold;font-size:12px;' +
    'font-family:Arial;box-shadow:0 0 12px #000;' +
    '">MANGO</div>' +

    '<div id="mango-panel" style="' +
    'display:none;position:fixed;left:72px;top:100px;' +
    'z-index:2147483647;width:330px;max-height:80vh;' +
    'overflow:auto;background:#07111f;color:#fff;' +
    'border:1px solid #26364a;border-radius:10px;' +
    'padding:12px;font-family:Arial;font-size:11px;' +
    'box-shadow:0 10px 30px #000;' +
    '">' +

    '<div style="font-size:14px;font-weight:bold;color:#22c55e">' +
    '🥭 MANGO BOT v4.3 DIAGNOSTIC' +
    '<span id="mango-close" style="float:right;color:#fff;font-size:18px">×</span>' +
    '</div>' +

    '<button id="mango-scan" style="' +
    'width:100%;margin:10px 0;padding:9px;' +
    'background:#22c55e;color:#001b0a;border:0;' +
    'border-radius:6px;font-weight:bold;' +
    '">RUN DATA DIAGNOSTIC</button>' +

    '<div id="mango-status" style="' +
    'border:1px solid #334155;padding:10px;border-radius:6px;' +
    'line-height:1.65;white-space:pre-wrap;' +
    '">Ready.</div>' +

    '<div style="margin-top:10px;color:#94a3b8">' +
    'Diagnostic only — no trade execution.' +
    '</div>' +

    '</div>';

  document.body.appendChild(root);

  var btn = document.getElementById("mango-btn");
  var panel = document.getElementById("mango-panel");
  var close = document.getElementById("mango-close");
  var scan = document.getElementById("mango-scan");
  var box = document.getElementById("mango-status");

  function show() {
    panel.style.display = "block";
  }

  function hide() {
    panel.style.display = "none";
  }

  btn.onclick = function (e) {
    e.stopPropagation();
    show();
  };

  close.onclick = function (e) {
    e.stopPropagation();
    hide();
  };

  /* =========================
     DIAGNOSTIC REPORT
  ========================= */
  async function run() {

    box.textContent = "Scanning public market data...";

    await discover();

    var c = state.candles || [];

    var lines = [];

    lines.push(
      "DATA SOURCE: " + state.source
    );

    lines.push(
      "SYMBOL: " + state.symbol
    );

    lines.push(
      "TIMEFRAME: " + state.timeframe
    );

    lines.push(
      "CANDLE COUNT: " + c.length
    );

    if (c.length) {
      var last = c[c.length - 1];

      lines.push(
        "LATEST CANDLE: " + fmtTime(last.time)
      );

      lines.push(
        "LATEST PRICE: " + last.close
      );

      lines.push(
        "LATEST OHLC: " +
        last.open + " / " +
        last.high + " / " +
        last.low + " / " +
        last.close
      );
    } else {
      lines.push("LATEST CANDLE: N/A");
      lines.push("LATEST PRICE: N/A");
    }

    lines.push("");
    lines.push("DIAGNOSTIC:");
    lines.push(state.hint);

    if (state.debugResources &&
        state.debugResources.length) {

      lines.push("");
      lines.push(
        "RESOURCE HINTS: " +
        state.debugResources.length
      );

      state.debugResources.slice(-8).forEach(function (x) {
        lines.push("- " + x.slice(0, 180));
      });
    }

    if (state.debugGlobals &&
        state.debugGlobals.length) {

      lines.push("");
      lines.push(
        "GLOBAL HINTS:"
      );

      lines.push(
        state.debugGlobals.join(", ")
      );
    }

    if (state.tvKeys &&
        state.tvKeys.length) {

      lines.push("");
      lines.push(
        "TRADINGVIEW OBJECT KEYS:"
      );

      lines.push(
        state.tvKeys.join(", ")
      );
    }

    if (c.length >= CFG.minCandles) {
      lines.push("");
      lines.push(
        "RESULT: REAL CANDLE DATA AVAILABLE"
      );
    } else {
      lines.push("");
      lines.push(
        "RESULT: NO DATA / WAIT"
      );
    }

    box.textContent = lines.join("\n");
  }

  scan.onclick = function () {
    run();
  };

  window.__MANGO_BOT_INSTANCE__ = {
    show: show,
    hide: hide,
    scan: run,
    version: "4.3.0-DIAGNOSTIC"
  };

  /* Open automatically */
  show();

  run();

})();
