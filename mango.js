/**
 * KHILJI MARKET ANALYZER — MANGO BOT v4.1.0
 * Production browser analyzer
 *
 * REAL DATA ONLY
 * No fake/random candles
 * No trade execution
 * No private WebSocket interception
 * No auth/CORS bypass
 */

(function () {
  "use strict";

  if (window.__KHILJI_MANGO_V41__) {
    try {
      if (window.__KHILJI_MANGO_V41__.open) {
        window.__KHILJI_MANGO_V41__.open();
      }
    } catch (e) {}
    return;
  }

  window.__KHILJI_MANGO_V41__ = {
    version: "4.1.0",
    open: null
  };

  var CFG = {
    MIN_CANDLES: 50,
    MAX_CANDLES: 300,
    MAX_SCAN_DEPTH: 5,
    MAX_ARRAY_ITEMS: 1000,

    RSI_PERIOD: 14,
    EMA_FAST: 9,
    EMA_MID: 21,
    EMA_SLOW: 50,

    MACD_FAST: 12,
    MACD_SLOW: 26,
    MACD_SIGNAL: 9,

    ROC_PERIOD: 10,
    SR_PERIOD: 20,

    MIN_SCORE: 70,

    FRESHNESS_SECONDS: 180
  };

  var state = {
    candles: [],
    source: "NONE DETECTED",
    symbol: "UNKNOWN",
    timeframe: "UNKNOWN",
    lastPrice: null,
    lastCandleTime: null,

    signal: "WAIT",
    bullScore: 0,
    bearScore: 0,

    validation: "NOT SCANNED",
    error: "",

    scanning: false,
    report: null
  };

  function num(v) {
    if (typeof v === "number") {
      return isFinite(v) ? v : null;
    }

    if (typeof v === "string") {
      var s = v.replace(/,/g, "").trim();

      if (s !== "" && isFinite(Number(s))) {
        return Number(s);
      }
    }

    return null;
  }

  function first(obj, keys) {
    if (!obj || typeof obj !== "object") {
      return null;
    }

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

  function normalizeTime(v) {
    var t = num(v);

    if (t == null) return null;

    /*
     * Convert milliseconds → seconds.
     */
    if (t > 100000000000) {
      t = t / 1000;
    }

    /*
     * Reject obviously invalid timestamps.
     */
    if (t < 1000000000 || t > 5000000000) {
      return null;
    }

    return t;
  }

  function normalizeCandle(x) {
    if (!x) return null;

    var t = null;
    var o = null;
    var h = null;
    var l = null;
    var c = null;

    /*
     * Array formats:
     *
     * [time, open, high, low, close]
     *
     * [open, high, low, close, time]
     */

    if (Array.isArray(x)) {
      if (x.length >= 5) {

        var a0 = normalizeTime(x[0]);
        var a4 = normalizeTime(x[4]);

        if (a0 != null) {
          t = a0;
          o = num(x[1]);
          h = num(x[2]);
          l = num(x[3]);
          c = num(x[4]);
        } else if (a4 != null) {
          t = a4;
          o = num(x[0]);
          h = num(x[1]);
          l = num(x[2]);
          c = num(x[3]);
        }

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

      return null;
    }

    if (
      typeof x !== "object" &&
      typeof x !== "function"
    ) {
      return null;
    }

    t = normalizeTime(
      first(x, [
        "t",
        "time",
        "timestamp",
        "ts",
        "date",
        "datetime",
        "start",
        "startTime",
        "timeStamp",
        "x"
      ])
    );

    o = num(
      first(x, [
        "o",
        "open",
        "Open",
        "OPEN"
      ])
    );

    h = num(
      first(x, [
        "h",
        "high",
        "High",
        "HIGH"
      ])
    );

    l = num(
      first(x, [
        "l",
        "low",
        "Low",
        "LOW"
      ])
    );

    c = num(
      first(x, [
        "c",
        "close",
        "Close",
        "CLOSE",
        "price",
        "last"
      ])
    );

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
    if (!Array.isArray(arr)) {
      return [];
    }

    var out = [];

    var start = Math.max(
      0,
      arr.length - CFG.MAX_ARRAY_ITEMS
    );

    for (var i = start; i < arr.length; i++) {
      var candle = normalizeCandle(arr[i]);

      if (candle) {
        out.push(candle);
      }
    }

    return out;
  }

  function cleanCandles(candles) {
    if (!Array.isArray(candles)) {
      return [];
    }

    var map = {};

    for (var i = 0; i < candles.length; i++) {
      var c = candles[i];

      if (!c || !isFinite(c.t)) {
        continue;
      }

      map[String(c.t)] = c;
    }

    var out = Object.keys(map)
      .sort(function (a, b) {
        return Number(a) - Number(b);
      })
      .map(function (k) {
        return map[k];
      });

    if (out.length > CFG.MAX_CANDLES) {
      out = out.slice(
        out.length - CFG.MAX_CANDLES
      );
    }

    return out;
  }
/* ============================================================
   PART 2/6 — CANDLE VALIDATION + FRESHNESS
   ============================================================ */

  function validateCandle(c) {
    if (!c) return false;

    if (
      !isFinite(c.t) ||
      !isFinite(c.o) ||
      !isFinite(c.h) ||
      !isFinite(c.l) ||
      !isFinite(c.c)
    ) {
      return false;
    }

    if (
      c.o <= 0 ||
      c.h <= 0 ||
      c.l <= 0 ||
      c.c <= 0
    ) {
      return false;
    }

    /*
     * Correct OHLC relationship:
     *
     * High must be >= Open and Close
     * Low must be <= Open and Close
     */
    if (c.h < c.o) return false;
    if (c.h < c.c) return false;
    if (c.l > c.o) return false;
    if (c.l > c.c) return false;

    /*
     * Candle timestamp cannot be in the future.
     */
    if (c.t > (Date.now() / 1000) + 120) {
      return false;
    }

    return true;
  }


  function validateCandles(candles) {
    var result = {
      valid: false,
      count: 0,
      reason: ""
    };

    if (!Array.isArray(candles)) {
      result.reason = "NOT AN ARRAY";
      return result;
    }

    if (candles.length < CFG.MIN_CANDLES) {
      result.reason =
        "INSUFFICIENT CANDLES (" +
        candles.length +
        "/" +
        CFG.MIN_CANDLES +
        ")";
      return result;
    }

    var valid = [];
    var bad = 0;
    var duplicate = 0;
    var lastT = 0;

    for (var i = 0; i < candles.length; i++) {
      var c = candles[i];

      if (!validateCandle(c)) {
        bad++;
        continue;
      }

      if (c.t === lastT) {
        duplicate++;
        continue;
      }

      if (lastT && c.t < lastT) {
        bad++;
        continue;
      }

      lastT = c.t;
      valid.push(c);
    }

    if (valid.length < CFG.MIN_CANDLES) {
      result.count = valid.length;
      result.reason =
        "VALID CANDLES " +
        valid.length +
        "/" +
        CFG.MIN_CANDLES;

      return result;
    }

    /*
     * Reject excessive corruption.
     */
    var totalBad = bad + duplicate;

    if (
      totalBad > 0 &&
      totalBad / candles.length > 0.10
    ) {
      result.count = valid.length;
      result.reason =
        "DATA CORRUPTION > 10%";

      return result;
    }

    result.valid = true;
    result.count = valid.length;
    result.reason = "VALID";

    return result;
  }


  function timeframeSeconds(tf) {
    if (!tf) return 60;

    var s = String(tf)
      .toLowerCase()
      .replace(/\s+/g, "");

    /*
     * Seconds
     */
    if (/^\d+s$/.test(s)) {
      return Number(s.replace("s", ""));
    }

    /*
     * Minutes
     */
    if (/^\d+m$/.test(s)) {
      return Number(s.replace("m", "")) * 60;
    }

    /*
     * Hours
     */
    if (/^\d+h$/.test(s)) {
      return Number(s.replace("h", "")) * 3600;
    }

    /*
     * Common TradingView style:
     * 1, 5, 15, 30, 60, 240
     */
    if (/^\d+$/.test(s)) {
      return Number(s) * 60;
    }

    if (s === "1d" || s === "d") {
      return 86400;
    }

    if (s === "1w" || s === "w") {
      return 604800;
    }

    return 60;
  }


  function freshnessLimit(tf) {
    var sec = timeframeSeconds(tf);

    /*
     * Allow enough time for the current candle to update.
     */
    var limit = Math.max(
      CFG.FRESHNESS_SECONDS,
      sec * 2
    );

    /*
     * Short OTC/chart intervals.
     */
    if (sec <= 15) {
      limit = 45;
    } else if (sec <= 30) {
      limit = 90;
    } else if (sec <= 300) {
      limit = 600;
    } else if (sec <= 900) {
      limit = 1800;
    }

    return limit;
  }


  function checkFreshness(candles, tf) {
    if (!candles || !candles.length) {
      return {
        fresh: false,
        age: null,
        reason: "NO CANDLES"
      };
    }

    var last = candles[candles.length - 1];

    if (!last || !isFinite(last.t)) {
      return {
        fresh: false,
        age: null,
        reason: "INVALID LAST CANDLE"
      };
    }

    var now = Date.now() / 1000;
    var age = now - last.t;

    /*
     * Future timestamps are invalid.
     */
    if (age < -120) {
      return {
        fresh: false,
        age: age,
        reason: "FUTURE CANDLE"
      };
    }

    var limit = freshnessLimit(tf);

    if (age > limit) {
      return {
        fresh: false,
        age: age,
        reason:
          "STALE (" +
          Math.round(age) +
          "s > " +
          limit +
          "s)"
      };
    }

    return {
      fresh: true,
      age: age,
      reason:
        "FRESH (" +
        Math.round(Math.max(0, age)) +
        "s)"
    };
  }


  function finalDataGate(candles, tf) {
    var validation = validateCandles(candles);

    if (!validation.valid) {
      return {
        ok: false,
        validation: validation.reason,
        freshness: "NOT CHECKED"
      };
    }

    var freshness = checkFreshness(
      candles,
      tf
    );

    if (!freshness.fresh) {
      return {
        ok: false,
        validation: "VALID",
        freshness: freshness.reason
      };
    }

    return {
      ok: true,
      validation: "VALID",
      freshness: freshness.reason
    };
  }


  function safeGet(obj, key) {
    try {
      if (!obj) return undefined;
      return obj[key];
    } catch (e) {
      return undefined;
    }
  }


  function looksLikeCandleArray(arr) {
    if (!Array.isArray(arr)) {
      return false;
    }

    if (arr.length < 5) {
      return false;
    }

    /*
     * Test a limited sample first.
     */
    var samples = Math.min(
      arr.length,
      12
    );

    var hits = 0;

    for (var i = 0; i < samples; i++) {
      if (normalizeCandle(arr[i])) {
        hits++;
      }
    }

    return hits >= Math.min(5, samples);
  }


  function candidateFromArray(arr, name) {
    if (!looksLikeCandleArray(arr)) {
      return null;
    }

    var normalized = cleanCandles(
      normalizeArray(arr)
    );

    if (normalized.length < CFG.MIN_CANDLES) {
      return null;
    }

    var check = finalDataGate(
      normalized,
      state.timeframe
    );

    return {
      name: name,
      candles: normalized,
      gate: check
    };
  }
/* ============================================================
   PART 3/6 — DEEP PUBLIC DATA DISCOVERY ENGINE
   ============================================================ */

  var discovery = {
    inspected: 0,
    candidates: 0,
    rejected: 0,
    notes: []
  };


  function note(msg) {
    try {
      if (discovery.notes.length < 80) {
        discovery.notes.push(String(msg));
      }
    } catch (e) {}
  }


  function scoreCandidate(item) {
    if (!item || !item.candles) return -1;

    var score = item.candles.length;

    if (
      item.gate &&
      item.gate.ok
    ) {
      score += 10000;
    }

    if (
      item.name &&
      /candle|ohlc|bar|quote|history/i.test(
        item.name
      )
    ) {
      score += 1000;
    }

    return score;
  }


  function safeKeys(obj) {
    try {
      return Object.keys(obj);
    } catch (e) {
      return [];
    }
  }


  function findArraysDeep(
    root,
    path,
    depth,
    results,
    seen
  ) {
    if (!root) return;

    if (depth > CFG.MAX_SCAN_DEPTH) {
      return;
    }

    if (
      typeof root !== "object" &&
      typeof root !== "function"
    ) {
      return;
    }

    try {
      if (seen.indexOf(root) !== -1) {
        return;
      }

      if (seen.length < 3000) {
        seen.push(root);
      }
    } catch (e) {
      return;
    }

    /*
     * Direct array candidate.
     */
    if (Array.isArray(root)) {
      var candidate = candidateFromArray(
        root,
        path
      );

      if (candidate) {
        results.push(candidate);
        discovery.candidates++;
      }

      /*
       * Even if this array isn't directly candles,
       * inspect nested arrays.
       */
      var max = Math.min(
        root.length,
        80
      );

      for (var i = 0; i < max; i++) {
        var item = safeGet(root, i);

        if (
          item &&
          typeof item === "object"
        ) {
          findArraysDeep(
            item,
            path + "[" + i + "]",
            depth + 1,
            results,
            seen
          );
        }
      }

      return;
    }

    /*
     * Object keys.
     */
    var keys = safeKeys(root);

    if (keys.length > 250) {
      keys = keys.slice(0, 250);
    }

    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];

      /*
       * Ignore obvious non-data/browser internals.
       */
      if (
        key === "document" ||
        key === "location" ||
        key === "frames" ||
        key === "parent" ||
        key === "top" ||
        key === "window" ||
        key === "self" ||
        key === "chrome" ||
        key === "webkitStorageInfo"
      ) {
        continue;
      }

      var value = safeGet(
        root,
        key
      );

      if (
        value == null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        continue;
      }

      var childPath =
        path + "." + key;

      /*
       * Prioritize names which commonly contain
       * market/candle data.
       */
      if (
        /candle|ohlc|bar|quote|history|price|series|market|chart|data|result|payload|items/i
          .test(key)
      ) {
        findArraysDeep(
          value,
          childPath,
          depth + 1,
          results,
          seen
        );
      } else if (depth < 2) {
        findArraysDeep(
          value,
          childPath,
          depth + 1,
          results,
          seen
        );
      }
    }
  }


  function discoverTradingView(results) {
    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart ===
          "function"
      ) {
        var chart =
          window.tvWidget.activeChart();

        /*
         * Symbol.
         */
        try {
          if (
            chart &&
            typeof chart.symbol === "function"
          ) {
            var sym = chart.symbol();

            if (sym) {
              state.symbol = String(sym);
            }
          }
        } catch (e) {}

        /*
         * Timeframe / resolution.
         */
        try {
          if (
            chart &&
            typeof chart.resolution ===
              "function"
          ) {
            var res =
              chart.resolution();

            if (res) {
              state.timeframe =
                String(res);
            }
          }
        } catch (e) {}

        /*
         * Public chart data.
         */
        try {
          if (
            chart &&
            typeof chart.data ===
              "function"
          ) {
            var data = chart.data();

            var c =
              candidateFromArray(
                data,
                "TradingView.activeChart().data()"
              );

            if (c) {
              results.push(c);
            } else {
              note(
                "TradingView chart.data() found but rejected"
              );
            }
          }
        } catch (e) {
          note(
            "TradingView data() unavailable"
          );
        }
      }
    } catch (e) {
      note(
        "TradingView discovery error"
      );
    }
  }


  function discoverHighcharts(results) {
    try {
      if (
        !window.Highcharts ||
        !Array.isArray(
          window.Highcharts.charts
        )
      ) {
        return;
      }

      for (
        var i = 0;
        i < window.Highcharts.charts.length;
        i++
      ) {
        var chart =
          window.Highcharts.charts[i];

        if (!chart || !chart.series) {
          continue;
        }

        for (
          var s = 0;
          s < chart.series.length;
          s++
        ) {
          var series =
            chart.series[s];

          if (!series || !series.points) {
            continue;
          }

          var arr = [];

          for (
            var p = 0;
            p < series.points.length;
            p++
          ) {
            var point =
              series.points[p];

            if (!point) continue;

            /*
             * Highcharts OHLC-style points.
             */
            var candle = normalizeCandle({
              time:
                point.x,
              open:
                point.open,
              high:
                point.high,
              low:
                point.low,
              close:
                point.close
            });

            if (candle) {
              arr.push(candle);
            }
          }

          if (
            arr.length >=
            CFG.MIN_CANDLES
          ) {
            var cleaned =
              cleanCandles(arr);

            var gate =
              finalDataGate(
                cleaned,
                state.timeframe
              );

            results.push({
              name:
                "Highcharts[" +
                i +
                "].series[" +
                s +
                "]",
              candles: cleaned,
              gate: gate
            });
          }
        }
      }
    } catch (e) {
      note(
        "Highcharts discovery error"
      );
    }
  }


  function discoverKnownRoots(results) {
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
      "priceHistory",
      "chartData",
      "historyCandles",
      "activeCandles",
      "rawCandles",
      "ohlcData"
    ];

    for (
      var i = 0;
      i < names.length;
      i++
    ) {
      var name = names[i];

      var root =
        safeGet(
          window,
          name
        );

      if (root == null) {
        continue;
      }

      discovery.inspected++;

      /*
       * Direct array first.
       */
      var direct =
        candidateFromArray(
          root,
          "window." + name
        );

      if (direct) {
        results.push(direct);
        continue;
      }

      /*
       * Then bounded recursive search.
       */
      findArraysDeep(
        root,
        "window." + name,
        0,
        results,
        []
      );
    }
  }


  function discoverWindowObjects(results) {
    var keys = [];

    try {
      keys = Object.keys(window);
    } catch (e) {
      return;
    }

    /*
     * Only inspect likely public market-related
     * globals to avoid an expensive full-page walk.
     */
    var checked = 0;

    for (
      var i = 0;
      i < keys.length;
      i++
    ) {
      var key = keys[i];

      if (
        !/candle|ohlc|bar|quote|history|market|chart|price|series|ticker/i
          .test(key)
      ) {
        continue;
      }

      if (checked >= 100) {
        break;
      }

      checked++;

      var value =
        safeGet(
          window,
          key
        );

      if (value == null) {
        continue;
      }

      discovery.inspected++;

      var direct =
        candidateFromArray(
          value,
          "window." + key
        );

      if (direct) {
        results.push(direct);
      } else {
        findArraysDeep(
          value,
          "window." + key,
          0,
          results,
          []
        );
      }
    }
  }


  function discoverDOMData(results) {
    var selectors = [
      "[data-candles]",
      "[data-ohlc]",
      "[data-bars]",
      "[data-quotes]",
      "[data-chart-data]",
      "[data-history]"
    ];

    for (
      var i = 0;
      i < selectors.length;
      i++
    ) {
      var nodes = [];

      try {
        nodes =
          document.querySelectorAll(
            selectors[i]
          );
      } catch (e) {
        continue;
      }

      for (
        var n = 0;
        n < nodes.length;
        n++
      ) {
        var el = nodes[n];

        var attrs = [
          "data-candles",
          "data-ohlc",
          "data-bars",
          "data-quotes",
          "data-chart-data",
          "data-history"
        ];

        for (
          var a = 0;
          a < attrs.length;
          a++
        ) {
          var raw =
            el.getAttribute(
              attrs[a]
            );

          if (!raw) continue;

          try {
            var parsed =
              JSON.parse(raw);

            var candidate =
              candidateFromArray(
                parsed,
                "DOM " +
                  selectors[i]
              );

            if (candidate) {
              results.push(
                candidate
              );
            }
          } catch (e) {}
        }
      }
    }
  }


  function discoverPublicMarketData() {
    discovery.inspected = 0;
    discovery.candidates = 0;
    discovery.rejected = 0;
    discovery.notes = [];

    var results = [];

    /*
     * Most specific sources first.
     */
    discoverTradingView(results);

    discoverHighcharts(results);

    discoverKnownRoots(results);

    discoverWindowObjects(results);

    discoverDOMData(results);

    if (!results.length) {
      note(
        "NO VALID PUBLIC CANDLE ARRAY FOUND"
      );
      return null;
    }

    /*
     * Highest-quality candidate first.
     */
    results.sort(function (a, b) {
      return (
        scoreCandidate(b) -
        scoreCandidate(a)
      );
    });

    /*
     * Select only a candidate that passes
     * the complete data gate.
     */
    for (
      var i = 0;
      i < results.length;
      i++
    ) {
      var item = results[i];

      if (
        item &&
        item.gate &&
        item.gate.ok &&
        item.candles &&
        item.candles.length >=
          CFG.MIN_CANDLES
      ) {
        return item;
      }

      discovery.rejected++;
    }

    /*
     * Keep the strongest rejected candidate
     * for diagnostics.
     */
    var best = results[0];

    if (best) {
      state.report = {
        bestRejectedSource:
          best.name,
        candleCount:
          best.candles
            ? best.candles.length
            : 0,
        validation:
          best.gate
            ? best.gate.validation
            : "UNKNOWN",
        freshness:
          best.gate
            ? best.gate.freshness
            : "UNKNOWN",
        inspected:
          discovery.inspected,
        candidates:
          discovery.candidates,
        rejected:
          discovery.rejected
      };
    }

    return null;
  }
/* ============================================================
   PART 4/6 — SYMBOL + TIMEFRAME + INDICATORS
   ============================================================ */

  function detectSymbol() {
    var found = "";

    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart ===
          "function"
      ) {
        var ch =
          window.tvWidget.activeChart();

        if (
          ch &&
          typeof ch.symbol === "function"
        ) {
          found = ch.symbol();
        }
      }
    } catch (e) {}

    if (!found) {
      var selectors = [
        "[data-symbol]",
        "[data-pair]",
        "[data-ticker]",
        "[data-asset]",
        "[data-instrument]",
        ".current-symbol",
        ".symbol-name",
        ".asset-select"
      ];

      for (
        var i = 0;
        i < selectors.length;
        i++
      ) {
        try {
          var el =
            document.querySelector(
              selectors[i]
            );

          if (el) {
            found =
              el.getAttribute("data-symbol") ||
              el.getAttribute("data-pair") ||
              el.getAttribute("data-ticker") ||
              el.getAttribute("data-asset") ||
              el.getAttribute("data-instrument") ||
              el.textContent.trim();

            if (found) break;
          }
        } catch (e) {}
      }
    }

    if (!found) {
      try {
        var params =
          new URLSearchParams(
            location.search
          );

        found =
          params.get("symbol") ||
          params.get("pair") ||
          params.get("asset") ||
          params.get("ticker") ||
          "";
      } catch (e) {}
    }

    if (!found) {
      try {
        var txt =
          document.body.innerText
            .slice(0, 12000);

        var m =
          txt.match(
            /\b([A-Z]{3,10})[\/\-]([A-Z]{3,10})\b/
          );

        if (m) {
          found =
            m[1] + "/" + m[2];
        }
      } catch (e) {}
    }

    return found
      ? String(found)
      : "UNKNOWN";
  }


  function detectTimeframe() {
    var found = "";

    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart ===
          "function"
      ) {
        var ch =
          window.tvWidget.activeChart();

        if (
          ch &&
          typeof ch.resolution ===
            "function"
        ) {
          found = ch.resolution();
        }
      }
    } catch (e) {}

    if (!found) {
      var selectors = [
        "[data-timeframe]",
        "[data-interval]",
        "[data-period]",
        ".timeframe.active",
        ".interval.active"
      ];

      for (
        var i = 0;
        i < selectors.length;
        i++
      ) {
        try {
          var el =
            document.querySelector(
              selectors[i]
            );

          if (el) {
            found =
              el.getAttribute(
                "data-timeframe"
              ) ||
              el.getAttribute(
                "data-interval"
              ) ||
              el.getAttribute(
                "data-period"
              ) ||
              el.textContent.trim();

            if (found) break;
          }
        } catch (e) {}
      }
    }

    if (!found) {
      try {
        var params =
          new URLSearchParams(
            location.search
          );

        found =
          params.get("timeframe") ||
          params.get("interval") ||
          params.get("period") ||
          "";
      } catch (e) {}
    }

    return found
      ? String(found)
      : "UNKNOWN";
  }


  function ema(values, period) {
    if (
      !Array.isArray(values) ||
      values.length < period
    ) {
      return null;
    }

    var k =
      2 / (period + 1);

    var sum = 0;

    for (
      var i = 0;
      i < period;
      i++
    ) {
      sum += values[i];
    }

    var prev =
      sum / period;

    for (
      var j = period;
      j < values.length;
      j++
    ) {
      prev =
        values[j] * k +
        prev * (1 - k);
    }

    return prev;
  }


  function emaSeries(values, period) {
    var out = [];

    if (
      !Array.isArray(values) ||
      values.length < period
    ) {
      return out;
    }

    var sum = 0;

    for (
      var i = 0;
      i < period;
      i++
    ) {
      sum += values[i];
    }

    var prev =
      sum / period;

    out.push(prev);

    var k =
      2 / (period + 1);

    for (
      var j = period;
      j < values.length;
      j++
    ) {
      prev =
        values[j] * k +
        prev * (1 - k);

      out.push(prev);
    }

    return out;
  }


  function rsi(values, period) {
    if (
      !Array.isArray(values) ||
      values.length <= period
    ) {
      return null;
    }

    var gain = 0;
    var loss = 0;

    for (
      var i = 1;
      i <= period;
      i++
    ) {
      var d =
        values[i] -
        values[i - 1];

      if (d >= 0) {
        gain += d;
      } else {
        loss -= d;
      }
    }

    var avgGain =
      gain / period;

    var avgLoss =
      loss / period;

    for (
      var j = period + 1;
      j < values.length;
      j++
    ) {
      var diff =
        values[j] -
        values[j - 1];

      var g =
        diff > 0
          ? diff
          : 0;

      var l =
        diff < 0
          ? -diff
          : 0;

      avgGain =
        (
          avgGain *
            (period - 1) +
          g
        ) / period;

      avgLoss =
        (
          avgLoss *
            (period - 1) +
          l
        ) / period;
    }

    if (avgLoss === 0) {
      return 100;
    }

    var rs =
      avgGain / avgLoss;

    return 100 -
      100 / (1 + rs);
  }


  function macd(values) {
    var fast =
      emaSeries(
        values,
        CFG.MACD_FAST
      );

    var slow =
      emaSeries(
        values,
        CFG.MACD_SLOW
      );

    if (!fast.length || !slow.length) {
      return null;
    }

    /*
     * Align the fast EMA with slow EMA.
     */
    var offset =
      CFG.MACD_SLOW -
      CFG.MACD_FAST;

    var line = [];

    for (
      var i = 0;
      i < slow.length;
      i++
    ) {
      var fi =
        i + offset;

      if (
        fi >= 0 &&
        fi < fast.length
      ) {
        line.push(
          fast[fi] -
          slow[i]
        );
      }
    }

    if (
      line.length <
      CFG.MACD_SIGNAL
    ) {
      return null;
    }

    var signal =
      ema(
        line,
        CFG.MACD_SIGNAL
      );

    var latest =
      line[line.length - 1];

    return {
      line: latest,
      signal: signal,
      histogram:
        latest - signal
    };
  }


  function roc(values, period) {
    if (
      !Array.isArray(values) ||
      values.length <= period
    ) {
      return null;
    }

    var current =
      values[values.length - 1];

    var previous =
      values[
        values.length - 1 - period
      ];

    if (
      !isFinite(current) ||
      !isFinite(previous) ||
      previous === 0
    ) {
      return null;
    }

    return (
      (current - previous) /
      previous
    ) * 100;
  }


  function supportResistance(candles) {
    if (
      !candles ||
      candles.length < CFG.SR_PERIOD
    ) {
      return null;
    }

    var start =
      Math.max(
        0,
        candles.length -
          CFG.SR_PERIOD
      );

    var support =
      Infinity;

    var resistance =
      -Infinity;

    for (
      var i = start;
      i < candles.length;
      i++
    ) {
      var c = candles[i];

      if (c.l < support) {
        support = c.l;
      }

      if (c.h > resistance) {
        resistance = c.h;
      }
    }

    if (
      !isFinite(support) ||
      !isFinite(resistance)
    ) {
      return null;
    }

    return {
      support: support,
      resistance: resistance
    };
  }


  function calculateIndicators(candles) {
    if (
      !candles ||
      candles.length <
        CFG.MIN_CANDLES
    ) {
      return null;
    }

    var closes =
      candles.map(function (c) {
        return c.c;
      });

    var e9 =
      ema(
        closes,
        CFG.EMA_FAST
      );

    var e21 =
      ema(
        closes,
        CFG.EMA_MID
      );

    var e50 =
      ema(
        closes,
        CFG.EMA_SLOW
      );

    var r =
      rsi(
        closes,
        CFG.RSI_PERIOD
      );

    var m =
      macd(closes);

    var momentum =
      roc(
        closes,
        CFG.ROC_PERIOD
      );

    var sr =
      supportResistance(
        candles
      );

    return {
      price:
        closes[
          closes.length - 1
        ],

      ema9: e9,
      ema21: e21,
      ema50: e50,

      rsi: r,

      macd:
        m,

      momentum:
        momentum,

      support:
        sr
          ? sr.support
          : null,

      resistance:
        sr
          ? sr.resistance
          : null
    };
  }
/* ============================================================
   PART 4/6 — SYMBOL + TIMEFRAME + INDICATORS
   ============================================================ */

  function detectSymbol() {
    var found = "";

    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart ===
          "function"
      ) {
        var ch =
          window.tvWidget.activeChart();

        if (
          ch &&
          typeof ch.symbol === "function"
        ) {
          found = ch.symbol();
        }
      }
    } catch (e) {}

    if (!found) {
      var selectors = [
        "[data-symbol]",
        "[data-pair]",
        "[data-ticker]",
        "[data-asset]",
        "[data-instrument]",
        ".current-symbol",
        ".symbol-name",
        ".asset-select"
      ];

      for (
        var i = 0;
        i < selectors.length;
        i++
      ) {
        try {
          var el =
            document.querySelector(
              selectors[i]
            );

          if (el) {
            found =
              el.getAttribute("data-symbol") ||
              el.getAttribute("data-pair") ||
              el.getAttribute("data-ticker") ||
              el.getAttribute("data-asset") ||
              el.getAttribute("data-instrument") ||
              el.textContent.trim();

            if (found) break;
          }
        } catch (e) {}
      }
    }

    if (!found) {
      try {
        var params =
          new URLSearchParams(
            location.search
          );

        found =
          params.get("symbol") ||
          params.get("pair") ||
          params.get("asset") ||
          params.get("ticker") ||
          "";
      } catch (e) {}
    }

    if (!found) {
      try {
        var txt =
          document.body.innerText
            .slice(0, 12000);

        var m =
          txt.match(
            /\b([A-Z]{3,10})[\/\-]([A-Z]{3,10})\b/
          );

        if (m) {
          found =
            m[1] + "/" + m[2];
        }
      } catch (e) {}
    }

    return found
      ? String(found)
      : "UNKNOWN";
  }


  function detectTimeframe() {
    var found = "";

    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart ===
          "function"
      ) {
        var ch =
          window.tvWidget.activeChart();

        if (
          ch &&
          typeof ch.resolution ===
            "function"
        ) {
          found = ch.resolution();
        }
      }
    } catch (e) {}

    if (!found) {
      var selectors = [
        "[data-timeframe]",
        "[data-interval]",
        "[data-period]",
        ".timeframe.active",
        ".interval.active"
      ];

      for (
        var i = 0;
        i < selectors.length;
        i++
      ) {
        try {
          var el =
            document.querySelector(
              selectors[i]
            );

          if (el) {
            found =
              el.getAttribute(
                "data-timeframe"
              ) ||
              el.getAttribute(
                "data-interval"
              ) ||
              el.getAttribute(
                "data-period"
              ) ||
              el.textContent.trim();

            if (found) break;
          }
        } catch (e) {}
      }
    }

    if (!found) {
      try {
        var params =
          new URLSearchParams(
            location.search
          );

        found =
          params.get("timeframe") ||
          params.get("interval") ||
          params.get("period") ||
          "";
      } catch (e) {}
    }

    return found
      ? String(found)
      : "UNKNOWN";
  }


  function ema(values, period) {
    if (
      !Array.isArray(values) ||
      values.length < period
    ) {
      return null;
    }

    var k =
      2 / (period + 1);

    var sum = 0;

    for (
      var i = 0;
      i < period;
      i++
    ) {
      sum += values[i];
    }

    var prev =
      sum / period;

    for (
      var j = period;
      j < values.length;
      j++
    ) {
      prev =
        values[j] * k +
        prev * (1 - k);
    }

    return prev;
  }


  function emaSeries(values, period) {
    var out = [];

    if (
      !Array.isArray(values) ||
      values.length < period
    ) {
      return out;
    }

    var sum = 0;

    for (
      var i = 0;
      i < period;
      i++
    ) {
      sum += values[i];
    }

    var prev =
      sum / period;

    out.push(prev);

    var k =
      2 / (period + 1);

    for (
      var j = period;
      j < values.length;
      j++
    ) {
      prev =
        values[j] * k +
        prev * (1 - k);

      out.push(prev);
    }

    return out;
  }


  function rsi(values, period) {
    if (
      !Array.isArray(values) ||
      values.length <= period
    ) {
      return null;
    }

    var gain = 0;
    var loss = 0;

    for (
      var i = 1;
      i <= period;
      i++
    ) {
      var d =
        values[i] -
        values[i - 1];

      if (d >= 0) {
        gain += d;
      } else {
        loss -= d;
      }
    }

    var avgGain =
      gain / period;

    var avgLoss =
      loss / period;

    for (
      var j = period + 1;
      j < values.length;
      j++
    ) {
      var diff =
        values[j] -
        values[j - 1];

      var g =
        diff > 0
          ? diff
          : 0;

      var l =
        diff < 0
          ? -diff
          : 0;

      avgGain =
        (
          avgGain *
            (period - 1) +
          g
        ) / period;

      avgLoss =
        (
          avgLoss *
            (period - 1) +
          l
        ) / period;
    }

    if (avgLoss === 0) {
      return 100;
    }

    var rs =
      avgGain / avgLoss;

    return 100 -
      100 / (1 + rs);
  }


  function macd(values) {
    var fast =
      emaSeries(
        values,
        CFG.MACD_FAST
      );

    var slow =
      emaSeries(
        values,
        CFG.MACD_SLOW
      );

    if (!fast.length || !slow.length) {
      return null;
    }

    /*
     * Align the fast EMA with slow EMA.
     */
    var offset =
      CFG.MACD_SLOW -
      CFG.MACD_FAST;

    var line = [];

    for (
      var i = 0;
      i < slow.length;
      i++
    ) {
      var fi =
        i + offset;

      if (
        fi >= 0 &&
        fi < fast.length
      ) {
        line.push(
          fast[fi] -
          slow[i]
        );
      }
    }

    if (
      line.length <
      CFG.MACD_SIGNAL
    ) {
      return null;
    }

    var signal =
      ema(
        line,
        CFG.MACD_SIGNAL
      );

    var latest =
      line[line.length - 1];

    return {
      line: latest,
      signal: signal,
      histogram:
        latest - signal
    };
  }


  function roc(values, period) {
    if (
      !Array.isArray(values) ||
      values.length <= period
    ) {
      return null;
    }

    var current =
      values[values.length - 1];

    var previous =
      values[
        values.length - 1 - period
      ];

    if (
      !isFinite(current) ||
      !isFinite(previous) ||
      previous === 0
    ) {
      return null;
    }

    return (
      (current - previous) /
      previous
    ) * 100;
  }


  function supportResistance(candles) {
    if (
      !candles ||
      candles.length < CFG.SR_PERIOD
    ) {
      return null;
    }

    var start =
      Math.max(
        0,
        candles.length -
          CFG.SR_PERIOD
      );

    var support =
      Infinity;

    var resistance =
      -Infinity;

    for (
      var i = start;
      i < candles.length;
      i++
    ) {
      var c = candles[i];

      if (c.l < support) {
        support = c.l;
      }

      if (c.h > resistance) {
        resistance = c.h;
      }
    }

    if (
      !isFinite(support) ||
      !isFinite(resistance)
    ) {
      return null;
    }

    return {
      support: support,
      resistance: resistance
    };
  }


  function calculateIndicators(candles) {
    if (
      !candles ||
      candles.length <
        CFG.MIN_CANDLES
    ) {
      return null;
    }

    var closes =
      candles.map(function (c) {
        return c.c;
      });

    var e9 =
      ema(
        closes,
        CFG.EMA_FAST
      );

    var e21 =
      ema(
        closes,
        CFG.EMA_MID
      );

    var e50 =
      ema(
        closes,
        CFG.EMA_SLOW
      );

    var r =
      rsi(
        closes,
        CFG.RSI_PERIOD
      );

    var m =
      macd(closes);

    var momentum =
      roc(
        closes,
        CFG.ROC_PERIOD
      );

    var sr =
      supportResistance(
        candles
      );

    return {
      price:
        closes[
          closes.length - 1
        ],

      ema9: e9,
      ema21: e21,
      ema50: e50,

      rsi: r,

      macd:
        m,

      momentum:
        momentum,

      support:
        sr
          ? sr.support
          : null,

      resistance:
        sr
          ? sr.resistance
          : null
    };
  }
  /* ============================================================
   PART 5/6 — ANALYSIS + SCORING + REPORT + SCAN
   ============================================================ */

  function formatNumber(v, decimals) {
    if (v == null || !isFinite(Number(v))) return null;
    return Number(v).toFixed(decimals == null ? 2 : decimals);
  }


  function analyzeMarket(candles) {
    var result = {
      ok: false,
      signal: "WAIT",
      bullScore: 0,
      bearScore: 0,
      indicators: null,
      reasons: []
    };

    var gate = finalDataGate(candles, state.timeframe);

    if (!gate.ok) {
      result.reasons.push(
        "DATA GATE: " +
        gate.validation +
        " / " +
        gate.freshness
      );
      return result;
    }

    var indicators = calculateIndicators(candles);

    if (!indicators) {
      result.reasons.push("INDICATORS UNAVAILABLE");
      return result;
    }

    result.indicators = indicators;

    var bull = 0;
    var bear = 0;
    var reasons = [];

    /* EMA structure */
    if (
      indicators.ema9 != null &&
      indicators.ema21 != null &&
      indicators.ema50 != null
    ) {
      if (
        indicators.ema9 > indicators.ema21 &&
        indicators.ema21 > indicators.ema50
      ) {
        bull += 25;
        reasons.push("EMA bullish alignment");
      } else if (
        indicators.ema9 < indicators.ema21 &&
        indicators.ema21 < indicators.ema50
      ) {
        bear += 25;
        reasons.push("EMA bearish alignment");
      } else {
        reasons.push("EMA mixed");
      }
    }

    /* Price vs EMA50 */
    if (
      indicators.price != null &&
      indicators.ema50 != null
    ) {
      if (indicators.price > indicators.ema50) {
        bull += 15;
        reasons.push("Price above EMA50");
      } else if (indicators.price < indicators.ema50) {
        bear += 15;
        reasons.push("Price below EMA50");
      }
    }

    /* RSI */
    if (indicators.rsi != null) {
      if (
        indicators.rsi >= 50 &&
        indicators.rsi < 70
      ) {
        bull += 15;
        reasons.push("RSI bullish zone");
      } else if (
        indicators.rsi <= 50 &&
        indicators.rsi > 30
      ) {
        bear += 15;
        reasons.push("RSI bearish zone");
      } else if (indicators.rsi >= 70) {
        reasons.push("RSI overbought");
      } else if (indicators.rsi <= 30) {
        reasons.push("RSI oversold");
      } else {
        reasons.push("RSI neutral");
      }
    }

    /* MACD */
    if (
      indicators.macd &&
      indicators.macd.line != null &&
      indicators.macd.signal != null
    ) {
      if (
        indicators.macd.line >
        indicators.macd.signal &&
        indicators.macd.histogram > 0
      ) {
        bull += 15;
        reasons.push("MACD bullish");
      } else if (
        indicators.macd.line <
        indicators.macd.signal &&
        indicators.macd.histogram < 0
      ) {
        bear += 15;
        reasons.push("MACD bearish");
      } else {
        reasons.push("MACD mixed");
      }
    }

    /* Momentum */
    if (indicators.momentum != null) {
      if (indicators.momentum > 0) {
        bull += 15;
        reasons.push("Momentum positive");
      } else if (indicators.momentum < 0) {
        bear += 15;
        reasons.push("Momentum negative");
      } else {
        reasons.push("Momentum flat");
      }
    }

    /* Support / Resistance */
    if (
      indicators.support != null &&
      indicators.resistance != null &&
      indicators.price != null
    ) {
      var range =
        indicators.resistance -
        indicators.support;

      if (range > 0) {
        var position =
          (indicators.price - indicators.support) /
          range;

        if (position <= 0.35) {
          bull += 15;
          reasons.push("Price near support");
        } else if (position >= 0.65) {
          bear += 15;
          reasons.push("Price near resistance");
        } else {
          reasons.push("Price mid-range");
        }
      }
    }

    var signal = "WAIT";

    if (
      bull >= CFG.MIN_SCORE &&
      bull >= bear + 15
    ) {
      signal = "UP";
    } else if (
      bear >= CFG.MIN_SCORE &&
      bear >= bull + 15
    ) {
      signal = "DOWN";
    } else {
      reasons.push("Confirmation threshold not met");
    }

    result.ok = true;
    result.signal = signal;
    result.bullScore = bull;
    result.bearScore = bear;
    result.reasons = reasons;

    return result;
  }


  function buildReport(item, analysis, gate) {
    var candles =
      item && item.candles
        ? item.candles
        : [];

    var last =
      candles.length
        ? candles[candles.length - 1]
        : null;

    return {
      source:
        item
          ? item.name
          : state.source,

      candleCount:
        candles.length,

      validation:
        gate
          ? gate.validation
          : state.validation,

      freshness:
        gate
          ? gate.freshness
          : "NOT CHECKED",

      latestCandleTime:
        last
          ? last.t
          : null,

      latestPrice:
        last
          ? last.c
          : null,

      analysis:
        analysis || {
          ok: false,
          signal: "WAIT",
          bullScore: 0,
          bearScore: 0,
          indicators: null,
          reasons: []
        },

      inspected:
        discovery.inspected,

      candidates:
        discovery.candidates,

      rejected:
        discovery.rejected
    };
  }


  function runAnalysis(item) {
    if (!item || !item.candles) {
      state.signal = "WAIT";
      state.bullScore = 0;
      state.bearScore = 0;

      return {
        ok: false,
        signal: "WAIT",
        bullScore: 0,
        bearScore: 0,
        indicators: null,
        reasons: [
          "NO VALID PUBLIC CANDLE DATA"
        ]
      };
    }

    var gate =
      finalDataGate(
        item.candles,
        state.timeframe
      );

    if (!gate.ok) {
      state.signal = "WAIT";
      state.bullScore = 0;
      state.bearScore = 0;

      return {
        ok: false,
        signal: "WAIT",
        bullScore: 0,
        bearScore: 0,
        indicators: null,
        reasons: [
          "DATA GATE: " +
          gate.validation +
          " / " +
          gate.freshness
        ]
      };
    }

    var analysis =
      analyzeMarket(item.candles);

    state.signal =
      analysis.signal || "WAIT";

    state.bullScore =
      analysis.bullScore || 0;

    state.bearScore =
      analysis.bearScore || 0;

    return analysis;
  }


  function scanMarket() {
    if (state.scanning) {
      return state.report;
    }

    state.scanning = true;
    state.error = "";
    state.signal = "WAIT";
    state.bullScore = 0;
    state.bearScore = 0;
    state.candles = [];
    state.lastPrice = null;
    state.lastCandleTime = null;
    state.source = "NONE DETECTED";
    state.validation = "NOT SCANNED";
    state.report = null;

    try {
      state.symbol = detectSymbol();
      state.timeframe = detectTimeframe();

      var item =
        discoverPublicMarketData();

      if (!item) {
        var rejected =
          state.report || {};

        state.source =
          rejected.bestRejectedSource ||
          "NONE DETECTED";

        state.validation =
          rejected.validation
            ? rejected.validation +
              " | " +
              (
                rejected.freshness ||
                "NOT CHECKED"
              )
            : "NO VALID CANDLE DATA";

        state.signal =
          "NO DATA / WAIT";

        state.bullScore = 0;
        state.bearScore = 0;

        state.report =
          Object.assign(
            rejected,
            {
              analysis: {
                ok: false,
                signal: "NO DATA / WAIT",
                bullScore: 0,
                bearScore: 0,
                indicators: null,
                reasons: [
                  "No public candle source passed validation and freshness checks"
                ]
              },

              source: state.source,

              candleCount:
                rejected.candleCount || 0,

              validation:
                state.validation,

              freshness:
                rejected.freshness ||
                "NOT CHECKED"
            }
          );

        return state.report;
      }

      state.source =
        item.name ||
        "PUBLIC DATA";

      state.candles =
        item.candles || [];

      state.lastPrice =
        state.candles.length
          ? state.candles[
              state.candles.length - 1
            ].c
          : null;

      state.lastCandleTime =
        state.candles.length
          ? state.candles[
              state.candles.length - 1
            ].t
          : null;

      var gate =
        finalDataGate(
          state.candles,
          state.timeframe
        );

      state.validation =
        gate.validation +
        " | " +
        gate.freshness;

      if (!gate.ok) {
        state.signal =
          "NO DATA / WAIT";

        state.report =
          buildReport(
            item,
            {
              ok: false,
              signal: "NO DATA / WAIT",
              bullScore: 0,
              bearScore: 0,
              indicators: null,
              reasons: [
                "Final data gate failed"
              ]
            },
            gate
          );

        return state.report;
      }

      var analysis =
        runAnalysis(item);

      state.report =
        buildReport(
          item,
          analysis,
          gate
        );

      return state.report;

    } catch (e) {
      state.error =
        e && e.message
          ? e.message
          : String(e);

      state.signal =
        "NO DATA / WAIT";

      state.bullScore = 0;
      state.bearScore = 0;

      state.report = {
        source: state.source,
        candleCount:
          state.candles.length,

        validation:
          state.validation,

        freshness: "ERROR",

        analysis: {
          ok: false,
          signal: "NO DATA / WAIT",
          bullScore: 0,
          bearScore: 0,
          indicators: null,
          reasons: [
            "SCAN ERROR"
          ]
        }
      };

      return state.report;

    } finally {
      state.scanning = false;
    }
  }
/* ============================================================
   PART 6/6 — MANGO UI + DIAGNOSTICS + INITIALIZATION
   ============================================================ */

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }


  function uiValue(v) {
    return v == null || v === ""
      ? "--"
      : esc(v);
  }


  function renderPanel() {
    if (!state.panel) return;

    var ind =
      state.report &&
      state.report.analysis &&
      state.report.analysis.indicators;

    var reasons =
      state.report &&
      state.report.analysis &&
      state.report.analysis.reasons
        ? state.report.analysis.reasons
        : [];

    var report =
      state.report || {};

    var freshness =
      report.freshness ||
      (
        state.validation.indexOf("|") >= 0
          ? state.validation.split("|")[1].trim()
          : "--"
      );

    state.panel.innerHTML =

      '<div style="font-size:18px;font-weight:800;margin-bottom:8px;">' +
        'MANGO BOT <span style="font-size:11px;">v4.1</span>' +
      '</div>' +

      '<div style="font-size:11px;line-height:1.55;">' +

        '<b>DATA SOURCE:</b> ' +
        uiValue(state.source) +
        '<br>' +

        '<b>SYMBOL:</b> ' +
        uiValue(state.symbol) +
        '<br>' +

        '<b>TIMEFRAME:</b> ' +
        uiValue(state.timeframe) +
        '<br>' +

        '<b>CANDLES:</b> ' +
        uiValue(state.candles.length) +
        '<br>' +

        '<b>LATEST PRICE:</b> ' +
        uiValue(
          state.lastPrice != null
            ? formatNumber(state.lastPrice, 5)
            : null
        ) +
        '<br>' +

        '<b>VALIDATION:</b> ' +
        uiValue(state.validation) +
        '<br>' +

        '<b>FRESHNESS:</b> ' +
        uiValue(freshness) +

      '</div>' +

      '<hr style="border:0;border-top:1px solid #333;margin:9px 0;">' +

      '<div style="font-size:12px;">' +

        '<b>EMA 9:</b> ' +
        uiValue(
          ind ? formatNumber(ind.ema9, 5) : null
        ) +
        '<br>' +

        '<b>EMA 21:</b> ' +
        uiValue(
          ind ? formatNumber(ind.ema21, 5) : null
        ) +
        '<br>' +

        '<b>EMA 50:</b> ' +
        uiValue(
          ind ? formatNumber(ind.ema50, 5) : null
        ) +
        '<br>' +

        '<b>RSI:</b> ' +
        uiValue(
          ind ? formatNumber(ind.rsi, 2) : null
        ) +
        '<br>' +

        '<b>MACD:</b> ' +
        uiValue(
          ind && ind.macd
            ? formatNumber(ind.macd.line, 5)
            : null
        ) +
        '<br>' +

        '<b>MACD HIST:</b> ' +
        uiValue(
          ind && ind.macd
            ? formatNumber(ind.macd.histogram, 5)
            : null
        ) +
        '<br>' +

        '<b>MOMENTUM:</b> ' +
        uiValue(
          ind
            ? formatNumber(ind.momentum, 2) + "%"
            : null
        ) +
        '<br>' +

        '<b>SUPPORT:</b> ' +
        uiValue(
          ind
            ? formatNumber(ind.support, 5)
            : null
        ) +
        '<br>' +

        '<b>RESISTANCE:</b> ' +
        uiValue(
          ind
            ? formatNumber(ind.resistance, 5)
            : null
        ) +

      '</div>' +

      '<hr style="border:0;border-top:1px solid #333;margin:9px 0;">' +

      '<div style="font-size:13px;font-weight:800;">' +
        'BULL SCORE: ' +
        esc(state.bullScore) +
        ' / 100' +
        '<br>' +
        'BEAR SCORE: ' +
        esc(state.bearScore) +
        ' / 100' +
      '</div>' +

      '<div style="margin-top:8px;padding:9px;border:1px solid #555;border-radius:8px;text-align:center;font-size:18px;font-weight:900;">' +
        esc(state.signal) +
      '</div>' +

      '<div style="font-size:10px;margin-top:7px;color:#aaa;">' +
        (
          reasons.length
            ? reasons.slice(0, 8).map(esc).join(" • ")
            : "No confirmation data"
        ) +
      '</div>' +

      '<div style="display:flex;gap:6px;margin-top:10px;">' +

        '<button id="mango-scan" style="flex:1;padding:8px;border:0;border-radius:6px;cursor:pointer;">' +
          'SCAN AGAIN' +
        '</button>' +

        '<button id="mango-report" style="flex:1;padding:8px;border:0;border-radius:6px;cursor:pointer;">' +
          'REPORT' +
        '</button>' +

      '</div>' +

      '<button id="mango-close" style="width:100%;margin-top:6px;padding:7px;border:0;border-radius:6px;cursor:pointer;">' +
        'CLOSE' +
      '</button>';

    /*
     * Use event listeners instead of inline handlers.
     */
    var scanBtn =
      document.getElementById(
        "mango-scan"
      );

    var reportBtn =
      document.getElementById(
        "mango-report"
      );

    var closeBtn =
      document.getElementById(
        "mango-close"
      );

    if (scanBtn) {
      scanBtn.addEventListener(
        "click",
        function (e) {
          e.stopPropagation();

          scanMarket();
          renderPanel();
        }
      );
    }

    if (reportBtn) {
      reportBtn.addEventListener(
        "click",
        function (e) {
          e.stopPropagation();

          showDiagnosticReport();
        }
      );
    }

    if (closeBtn) {
      closeBtn.addEventListener(
        "click",
        function (e) {
          e.stopPropagation();

          state.panel.style.display =
            "none";
        }
      );
    }
  }


  function showDiagnosticReport() {
    var r =
      state.report || {};

    var lines = [
      "MANGO BOT v4.1 DIAGNOSTIC",
      "----------------------------",
      "SOURCE: " + state.source,
      "SYMBOL: " + state.symbol,
      "TIMEFRAME: " + state.timeframe,
      "CANDLES: " + state.candles.length,
      "VALIDATION: " + state.validation,
      "SIGNAL: " + state.signal,
      "BULL: " + state.bullScore,
      "BEAR: " + state.bearScore,
      "",
      "DISCOVERY",
      "INSPECTED: " +
        (
          discovery.inspected || 0
        ),
      "CANDIDATES: " +
        (
          discovery.candidates || 0
        ),
      "REJECTED: " +
        (
          discovery.rejected || 0
        )
    ];

    if (
      r.bestRejectedSource
    ) {
      lines.push(
        "",
        "BEST REJECTED SOURCE:",
        r.bestRejectedSource,
        "COUNT: " +
          r.candleCount,
        "VALIDATION: " +
          r.validation,
        "FRESHNESS: " +
          r.freshness
      );
    }

    if (
      discovery.notes &&
      discovery.notes.length
    ) {
      lines.push(
        "",
        "NOTES:"
      );

      for (
        var i = 0;
        i < discovery.notes.length;
        i++
      ) {
        lines.push(
          "- " +
          discovery.notes[i]
        );
      }
    }

    if (state.error) {
      lines.push(
        "",
        "ERROR:",
        state.error
      );
    }

    var text =
      lines.join("\n");

    /*
     * Show report without requiring clipboard
     * permissions.
     */
    var box =
      document.createElement(
        "textarea"
      );

    box.value = text;

    box.style.position =
      "fixed";

    box.style.left =
      "50%";

    box.style.top =
      "50%";

    box.style.transform =
      "translate(-50%,-50%)";

    box.style.width =
      "min(90vw,420px)";

    box.style.height =
      "320px";

    box.style.zIndex =
      "2147483647";

    box.style.background =
      "#111";

    box.style.color =
      "#fff";

    box.style.border =
      "2px solid #39ff88";

    box.style.borderRadius =
      "10px";

    box.style.padding =
      "12px";

    box.style.fontSize =
      "11px";

    document.body.appendChild(
      box
    );

    box.focus();
    box.select();

    setTimeout(
      function () {
        if (
          box &&
          box.parentNode
        ) {
          box.parentNode.removeChild(
            box
          );
        }
      },
      15000
    );
  }


  function createUI() {
    /*
     * Remove previous v4.1 UI only.
     */
    var old =
      document.getElementById(
        "khilji-mango-v41-root"
      );

    if (old) {
      old.remove();
    }

    var root =
      document.createElement(
        "div"
      );

    root.id =
      "khilji-mango-v41-root";

    root.style.position =
      "fixed";

    root.style.left =
      "14px";

    root.style.bottom =
      "14px";

    root.style.zIndex =
      "2147483646";

    root.style.fontFamily =
      "Arial,sans-serif";

    /*
     * Round MANGO BOT button.
     */
    var button =
      document.createElement(
        "button"
      );

    button.textContent =
      "MANGO";

    button.title =
      "MANGO BOT";

    button.style.width =
      "68px";

    button.style.height =
      "68px";

    button.style.borderRadius =
      "50%";

    button.style.border =
      "2px solid #39ff88";

    button.style.background =
      "#07140c";

    button.style.color =
      "#39ff88";

    button.style.fontWeight =
      "900";

    button.style.fontSize =
      "12px";

    button.style.cursor =
      "pointer";

    button.style.boxShadow =
      "0 0 12px rgba(57,255,136,.35)";

    /*
     * Panel.
     */
    var panel =
      document.createElement(
        "div"
      );

    panel.style.position =
      "absolute";

    panel.style.left =
      "0";

    panel.style.bottom =
      "78px";

    panel.style.width =
      "285px";

    panel.style.maxHeight =
      "75vh";

    panel.style.overflow =
      "auto";

    panel.style.display =
      "none";

    panel.style.background =
      "#101010";

    panel.style.color =
      "#eee";

    panel.style.border =
      "1px solid #39ff88";

    panel.style.borderRadius =
      "12px";

    panel.style.padding =
      "12px";

    panel.style.boxSizing =
      "border-box";

    panel.style.boxShadow =
      "0 8px 30px rgba(0,0,0,.5)";

    /*
     * Separate triangle/open handle.
     */
    var triangle =
      document.createElement(
        "button"
      );

    triangle.textContent =
      "▲";

    triangle.title =
      "Open MANGO";

    triangle.style.position =
      "absolute";

    triangle.style.right =
      "-38px";

    triangle.style.top =
      "0";

    triangle.style.width =
      "32px";

    triangle.style.height =
      "32px";

    triangle.style.border =
      "1px solid #39ff88";

    triangle.style.borderRadius =
      "8px";

    triangle.style.background =
      "#07140c";

    triangle.style.color =
      "#39ff88";

    triangle.style.cursor =
      "pointer";

    root.appendChild(
      panel
    );

    root.appendChild(
      button
    );

    root.appendChild(
      triangle
    );

    document.body.appendChild(
      root
    );

    state.panel =
      panel;

    state.button =
      button;

    state.triangle =
      triangle;

    function openPanel() {
      panel.style.display =
        "block";

      scanMarket();

      renderPanel();
    }

    button.addEventListener(
      "click",
      function (e) {
        e.stopPropagation();

        if (
          panel.style.display ===
          "block"
        ) {
          panel.style.display =
            "none";
        } else {
          openPanel();
        }
      }
    );

    triangle.addEventListener(
      "click",
      function (e) {
        e.stopPropagation();

        openPanel();
      }
    );

    panel.addEventListener(
      "click",
      function (e) {
        e.stopPropagation();
      }
    );

    window.__KHILJI_MANGO_V41__.open =
      openPanel;
  }


  function initialize() {
    try {
      createUI();
    } catch (e) {
      state.error =
        e && e.message
          ? e.message
          : String(e);
    }
  }


  /*
   * Bookmarklet can execute either before or
   * after DOMContentLoaded.
   */
  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      {
        once: true
      }
    );
  } else {
    initialize();
  }

})();
