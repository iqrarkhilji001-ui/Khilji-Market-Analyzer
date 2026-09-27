/**
 * KHILJI MARKET ANALYZER - MANGO BOT v4.2.0
 * Production JavaScript Engine
 *
 * REAL MARKET DATA ONLY
 * Bridge + Public Page Data
 * NO FAKE / RANDOM / SIMULATED CANDLES
 * NO TRADE EXECUTION
 * UP / DOWN / WAIT ONLY
 */

(function () {
  'use strict';

  /* ============================================================
     1. DUPLICATE GUARD
     ============================================================ */

  if (window.__MANGO_BOT_LOADED__) {
    if (
      window.__MANGO_BOT_INSTANCE__ &&
      typeof window.__MANGO_BOT_INSTANCE__.show === 'function'
    ) {
      window.__MANGO_BOT_INSTANCE__.show();
    }
    return;
  }

  window.__MANGO_BOT_LOADED__ = true;

  /* ============================================================
     2. CONFIG
     ============================================================ */

  var config = {
    bridgeBase: 'http://127.0.0.1:8765',
    emaShort: 9,
    emaMedium: 21,
    emaLong: 50,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    momentumPeriod: 10,
    srLookback: 20,
    minScore: 70,
    minCandles: 50
  };

  /* ============================================================
     3. STATE
     ============================================================ */

  var state = {
    source: 'NONE DETECTED',
    symbol: 'UNKNOWN',
    timeframe: 'UNKNOWN',
    candles: [],
    bridge: false,
    error: '',
    result: null
  };

  /* ============================================================
     4. HELPERS
     ============================================================ */

  function finiteNumber(v) {
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function cleanSymbol(v) {
    if (!v) return 'UNKNOWN';

    return String(v)
      .trim()
      .toUpperCase()
      .replace(/_/g, '/');
  }

  function periodToTimeframe(seconds) {
    var n = Number(seconds);

    if (!isFinite(n) || n <= 0) {
      return 'UNKNOWN';
    }

    if (n < 60) return n + 's';
    if (n % 3600 === 0) return (n / 3600) + 'h';
    if (n % 60 === 0) return (n / 60) + 'm';

    return n + 's';
  }

  function normalizeCandle(c) {
    if (!c || typeof c !== 'object') {
      return null;
    }

    var t =
      c.timestamp !== undefined ? c.timestamp :
      c.time !== undefined ? c.time :
      c.t !== undefined ? c.t :
      c.from !== undefined ? c.from :
      null;

    var o =
      c.open !== undefined ? c.open :
      c.o !== undefined ? c.o :
      null;

    var h =
      c.high !== undefined ? c.high :
      c.h !== undefined ? c.h :
      null;

    var l =
      c.low !== undefined ? c.low :
      c.l !== undefined ? c.l :
      null;

    var cl =
      c.close !== undefined ? c.close :
      c.c !== undefined ? c.c :
      null;

    t = finiteNumber(t);
    o = finiteNumber(o);
    h = finiteNumber(h);
    l = finiteNumber(l);
    cl = finiteNumber(cl);

    if (
      t === null ||
      o === null ||
      h === null ||
      l === null ||
      cl === null
    ) {
      return null;
    }

    if (t < 100000000000) {
      t = t * 1000;
    }

    if (
      o <= 0 ||
      h <= 0 ||
      l <= 0 ||
      cl <= 0
    ) {
      return null;
    }

    if (
      l > o ||
      l > cl ||
      h < o ||
      h < cl ||
      h < l
    ) {
      return null;
    }

    if (t > Date.now() + 60000) {
      return null;
    }

    return {
      timestamp: t,
      open: o,
      high: h,
      low: l,
      close: cl
    };
  }

  function normalizeArray(arr) {
    if (!Array.isArray(arr)) {
      return [];
    }

    var map = {};
    var out = [];

    for (var i = 0; i < arr.length; i++) {
      var c = normalizeCandle(arr[i]);

      if (!c) continue;

      if (!map[c.timestamp]) {
        map[c.timestamp] = true;
        out.push(c);
      }
    }

    out.sort(function (a, b) {
      return a.timestamp - b.timestamp;
    });

    return out;
  }

  /* ============================================================
     5. PAGE SYMBOL / TIMEFRAME
     ============================================================ */

  function pageSymbol() {
    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart === 'function'
      ) {
        var chart = window.tvWidget.activeChart();

        if (chart && typeof chart.symbol === 'function') {
          var s = chart.symbol();

          if (s) {
            return cleanSymbol(s);
          }
        }
      }
    } catch (e) {}

    var selectors = [
      '.current-symbol',
      '.asset-name',
      '.active-asset',
      '.pairs-item.active',
      '[data-qa="current-asset"]',
      '[data-testid="ticker-name"]',
      '.symbol-name'
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);

        if (el && el.textContent) {
          var txt = el.textContent.trim();

          var match = txt.match(
            /[A-Z]{3}[\/_][A-Z]{3}|[A-Z]{6}|[A-Z]{3,6}_OTC/i
          );

          if (match) {
            return cleanSymbol(match[0]);
          }
        }
      } catch (e2) {}
    }

    try {
      var q = new URLSearchParams(window.location.search);

      var urlSymbol =
        q.get('symbol') ||
        q.get('pair') ||
        q.get('asset');

      if (urlSymbol) {
        return cleanSymbol(urlSymbol);
      }
    } catch (e3) {}

    return 'UNKNOWN';
  }

  function pageTimeframe() {
    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart === 'function'
      ) {
        var chart = window.tvWidget.activeChart();

        if (chart && typeof chart.resolution === 'function') {
          var r = chart.resolution();

          if (r) {
            return String(r);
          }
        }
      }
    } catch (e) {}

    var selectors = [
      '.timeframe-select .active',
      '.time-frame-button.active',
      '[data-timeframe].active',
      '.timeframe-item.active',
      '[data-period].active'
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);

        if (el && el.textContent) {
          var txt = el.textContent.trim();

          if (/^\d+[smhdM]?$/i.test(txt)) {
            return txt;
          }
        }
      } catch (e2) {}
    }

    return 'UNKNOWN';
  }

  /* ============================================================
     6. BRIDGE DATA
     ============================================================ */

  async function fetchBridgeStatus() {
    try {
      var response = await fetch(
        config.bridgeBase + '/status?t=' + Date.now(),
        {
          method: 'GET',
          cache: 'no-store'
        }
      );

      if (!response.ok) {
        return null;
      }

      var data = await response.json();

      if (!data || data.ok !== true) {
        return null;
      }

      return data;
    } catch (e) {
      return null;
    }
  }

  async function fetchBridgeCandles() {
    try {
      var response = await fetch(
        config.bridgeBase + '/candles?t=' + Date.now(),
        {
          method: 'GET',
          cache: 'no-store'
        }
      );

      if (!response.ok) {
        return null;
      }

      var data = await response.json();

      if (!Array.isArray(data)) {
        return null;
      }

      var candles = normalizeArray(data);

      if (candles.length < config.minCandles) {
        return null;
      }

      return candles;
    } catch (e) {
      return null;
    }
  }

  async function discoverBridge() {
    var status = await fetchBridgeStatus();

    if (!status) {
      return null;
    }

    var candles = await fetchBridgeCandles();

    if (!candles) {
      return null;
    }

    return {
      candles: candles,
      asset: cleanSymbol(status.asset),
      period: Number(status.period) || 0
    };
  }

  /* ============================================================
     7. PUBLIC PAGE DATA FALLBACK
     ============================================================ */

  function discoverPageCandles() {
    var raw = null;
    var source = 'NONE DETECTED';

    try {
      if (
        window.tvWidget &&
        typeof window.tvWidget.activeChart === 'function'
      ) {
        var chart = window.tvWidget.activeChart();

        if (
          chart &&
          Array.isArray(chart.data) &&
          chart.data.length >= config.minCandles
        ) {
          raw = chart.data;
          source = 'TradingView Chart Widget';
        }
      }
    } catch (e) {}

    if (!raw) {
      try {
        if (
          window.Highcharts &&
          Array.isArray(window.Highcharts.charts)
        ) {
          for (
            var i = 0;
            i < window.Highcharts.charts.length;
            i++
          ) {
            var hc = window.Highcharts.charts[i];

            if (!hc || !Array.isArray(hc.series)) {
              continue;
            }

            for (
              var j = 0;
              j < hc.series.length;
              j++
            ) {
              var data = hc.series[j].data;

              if (
                Array.isArray(data) &&
                data.length >= config.minCandles
              ) {
                raw = data.map(function (p) {
                  return {
                    time: p.x !== undefined ? p.x : p.time,
                    open: p.open,
                    high: p.high,
                    low: p.low,
                    close: p.close
                  };
                });

                source = 'Highcharts OHLC';
                break;
              }
            }

            if (raw) break;
          }
        }
      } catch (e2) {}
    }

    if (!raw) {
      var names = [
        'candles',
        'quotes',
        'chartData',
        'historyCandles',
        'activeCandles',
        '_candles',
        'rawCandles',
        'bars',
        'ohlcData',
        'chartQuotes'
      ];

      for (var n = 0; n < names.length; n++) {
        try {
          var key = names[n];

          if (
            Array.isArray(window[key]) &&
            window[key].length >= config.minCandles
          ) {
            raw = window[key];
            source = 'Window Array: ' + key;
            break;
          }
        } catch (e3) {}
      }
    }

    if (!raw) {
      return null;
    }

    var candles = normalizeArray(raw);

    if (candles.length < config.minCandles) {
      return null;
    }

    return {
      candles: candles,
      source: source
    };
  }

  /* ============================================================
     8. FRESHNESS
     ============================================================ */

  function freshness(timestamp, timeframe) {
    if (!timestamp) {
      return {
        live: false,
        label: 'NO DATA'
      };
    }

    var diff = Math.max(
      0,
      Math.round((Date.now() - timestamp) / 1000)
    );

    var max = 180;

    if (
      timeframe === '5s' ||
      timeframe === '10s' ||
      timeframe === '15s'
    ) {
      max = 45;
    } else if (timeframe === '30s') {
      max = 90;
    } else if (timeframe === '5m') {
      max = 600;
    } else if (timeframe === '15m') {
      max = 1800;
    }

    return {
      live: diff <= max,
      label:
        diff <= max
          ? 'LIVE (' + diff + 's ago)'
          : 'STALE (' + diff + 's ago)'
    };
  }

  /* ============================================================
     9. INDICATORS
     ============================================================ */

  function ema(values, period) {
    if (!values || values.length < period) {
      return null;
    }

    var sum = 0;

    for (var i = 0; i < period; i++) {
      sum += values[i];
    }

    var result = sum / period;
    var k = 2 / (period + 1);

    for (var j = period; j < values.length; j++) {
      result =
        values[j] * k +
        result * (1 - k);
    }

    return result;
  }

  function rsi(values, period) {
    if (!values || values.length <= period) {
      return null;
    }

    var gain = 0;
    var loss = 0;

    for (var i = 1; i <= period; i++) {
      var d = values[i] - values[i - 1];

      if (d > 0) {
        gain += d;
      } else {
        loss += Math.abs(d);
      }
    }

    var avgGain = gain / period;
    var avgLoss = loss / period;

    for (var j = period + 1; j < values.length; j++) {
      var change = values[j] - values[j - 1];

      var g = change > 0 ? change : 0;
      var l = change < 0 ? Math.abs(change) : 0;

      avgGain =
        ((avgGain * (period - 1)) + g) /
        period;

      avgLoss =
        ((avgLoss * (period - 1)) + l) /
        period;
    }

    if (avgLoss === 0) {
      return 100;
    }

    var rs = avgGain / avgLoss;

    return 100 - (100 / (1 + rs));
  }

  function macd(values) {
    if (
      !values ||
      values.length <
        config.macdSlow + config.macdSignal
    ) {
      return null;
    }

    var fast = [];
    var slow = [];

    var kFast =
      2 / (config.macdFast + 1);

    var kSlow =
      2 / (config.macdSlow + 1);

    var fastEma = values[0];
    var slowEma = values[0];

    for (var i = 1; i < values.length; i++) {
      fastEma =
        values[i] * kFast +
        fastEma * (1 - kFast);

      slowEma =
        values[i] * kSlow +
        slowEma * (1 - kSlow);

      if (i >= config.macdSlow - 1) {
        fast.push(fastEma);
        slow.push(slowEma);
      }
    }

    var lines = [];

    for (var j = 0; j < fast.length; j++) {
      lines.push(fast[j] - slow[j]);
    }

    if (lines.length < config.macdSignal) {
      return null;
    }

    var signal =
      lines
        .slice(0, config.macdSignal)
        .reduce(function (a, b) {
          return a + b;
        }, 0) /
      config.macdSignal;

    var kSignal =
      2 / (config.macdSignal + 1);

    for (
      var x = config.macdSignal;
      x < lines.length;
      x++
    ) {
      signal =
        lines[x] * kSignal +
        signal * (1 - kSignal);
    }

    var line =
      lines[lines.length - 1];

    return {
      line: line,
      signal: signal,
      histogram: line - signal
    };
  }

  function momentum(values, period) {
    if (!values || values.length <= period) {
      return null;
    }

    var old =
      values[values.length - 1 - period];

    var current =
      values[values.length - 1];

    if (!old) {
      return null;
    }

    return ((current / old) - 1) * 100;
  }

  function supportResistance(candles) {
    if (
      !candles ||
      candles.length < config.srLookback
    ) {
      return null;
    }

    var slice = candles.slice(
      candles.length - config.srLookback
    );

    var support = Infinity;
    var resistance = -Infinity;

    for (var i = 0; i < slice.length; i++) {
      support = Math.min(
        support,
        slice[i].low
      );

      resistance = Math.max(
        resistance,
        slice[i].high
      );
    }

    return {
      support: support,
      resistance: resistance
    };
  }

  /* ============================================================
     10. ANALYSIS
     ============================================================ */

  function analyze(candles, symbol, timeframe, source) {
    var latest =
      candles[candles.length - 1];

    var closes = candles.map(function (c) {
      return c.close;
    });

    var live = freshness(
      latest.timestamp,
      timeframe
    );

    if (!live.live) {
      return {
        status: 'WAIT',
        signal: 'NO DATA / WAIT',
        reason: 'Candle data is stale.',
        source: source,
        symbol: symbol,
        timeframe: timeframe,
        candleCount: candles.length,
        latest: latest,
        freshness: live.label
      };
    }

    if (
      symbol === 'UNKNOWN' ||
      timeframe === 'UNKNOWN'
    ) {
      return {
        status: 'WAIT',
        signal: 'NO DATA / WAIT',
        reason: 'Symbol or timeframe could not be verified.',
        source: source,
        symbol: symbol,
        timeframe: timeframe,
        candleCount: candles.length,
        latest: latest,
        freshness: live.label
      };
    }

    var ema9 = ema(
      closes,
      config.emaShort
    );

    var ema21 = ema(
      closes,
      config.emaMedium
    );

    var ema50 = ema(
      closes,
      config.emaLong
    );

    var r = rsi(
      closes,
      config.rsiPeriod
    );

    var m = macd(closes);

    var mom = momentum(
      closes,
      config.momentumPeriod
    );

    var sr = supportResistance(
      candles
    );

    if (
      ema9 === null ||
      ema21 === null ||
      ema50 === null ||
      r === null ||
      !m ||
      mom === null ||
      !sr
    ) {
      return {
        status: 'WAIT',
        signal: 'NO DATA / WAIT',
        reason: 'Insufficient data for indicators.',
        source: source,
        symbol: symbol,
        timeframe: timeframe,
        candleCount: candles.length,
        latest: latest,
        freshness: live.label
      };
    }

    var bull = 0;
    var bear = 0;

    var reasons = [];

    /* EMA */
    if (
      ema9 > ema21 &&
      ema21 > ema50
    ) {
      bull += 25;
      reasons.push('EMA bullish alignment');
    } else if (
      ema9 < ema21 &&
      ema21 < ema50
    ) {
      bear += 25;
      reasons.push('EMA bearish alignment');
    }

    /* Price / EMA50 */
    if (latest.close > ema50) {
      bull += 10;
    } else if (latest.close < ema50) {
      bear += 10;
    }

    /* RSI */
    if (
      r >= 50 &&
      r < config.rsiOverbought
    ) {
      bull += 15;
      reasons.push('RSI bullish');
    } else if (
      r <= 50 &&
      r > config.rsiOversold
    ) {
      bear += 15;
      reasons.push('RSI bearish');
    }

    /* MACD */
    if (
      m.line > m.signal &&
      m.histogram > 0
    ) {
      bull += 20;
      reasons.push('MACD bullish');
    } else if (
      m.line < m.signal &&
      m.histogram < 0
    ) {
      bear += 20;
      reasons.push('MACD bearish');
    }

    /* Momentum */
    if (mom > 0) {
      bull += 15;
      reasons.push('Momentum positive');
    } else if (mom < 0) {
      bear += 15;
      reasons.push('Momentum negative');
    }

    /* S/R */
    var range =
      sr.resistance - sr.support;

    if (range > 0) {
      var position =
        (latest.close - sr.support) /
        range;

      if (position <= 0.25) {
        bull += 15;
        reasons.push('Price near support');
      } else if (position >= 0.75) {
        bear += 15;
        reasons.push('Price near resistance');
      }
    }

    var signal = 'WAIT';

    if (
      bull >= config.minScore &&
      bull > bear
    ) {
      signal = 'UP';
    }

    if (
      bear >= config.minScore &&
      bear > bull
    ) {
      signal = 'DOWN';
    }

    /* Severe contradiction => WAIT */
    if (
      signal === 'UP' &&
      (
        m.histogram < 0 ||
        mom < -0.15
      )
    ) {
      signal = 'WAIT';
      reasons.push('Major bullish contradiction');
    }

    if (
      signal === 'DOWN' &&
      (
        m.histogram > 0 ||
        mom > 0.15
      )
    ) {
      signal = 'WAIT';
      reasons.push('Major bearish contradiction');
    }

    return {
      status: 'OK',
      signal: signal,
      source: source,
      symbol: symbol,
      timeframe: timeframe,
      candleCount: candles.length,
      latest: latest,
      freshness: live.label,
      score: Math.max(bull, bear),
      bullScore: bull,
      bearScore: bear,
      ema9: ema9,
      ema21: ema21,
      ema50: ema50,
      rsi: r,
      macd: m.line,
      macdSignal: m.signal,
      macdHistogram: m.histogram,
      momentum: mom,
      support: sr.support,
      resistance: sr.resistance,
      reasons: reasons
    };
  }

  /* ============================================================
     11. MAIN ASYNC SCAN
     ============================================================ */

  async function scanMarket() {
    state.error = '';

    /* First choice: local Bridge */
    var bridge = await discoverBridge();

    if (bridge) {
      var symbol =
        bridge.asset !== 'UNKNOWN'
          ? bridge.asset
          : pageSymbol();

      var timeframe =
        bridge.period > 0
          ? periodToTimeframe(bridge.period)
          : pageTimeframe();

      /*
       * If page has a clearly detected symbol and it conflicts
       * with Bridge asset, do not analyze the wrong instrument.
       */
      var pageSym = pageSymbol();

      if (
        pageSym !== 'UNKNOWN' &&
        symbol !== 'UNKNOWN'
      ) {
        var a = symbol.replace('/', '');
        var b = pageSym.replace('/', '');

        if (
          a !== b &&
          a.indexOf(b) === -1 &&
          b.indexOf(a) === -1
        ) {
          return {
            status: 'WAIT',
            signal: 'NO DATA / WAIT',
            reason:
              'Bridge asset does not match the displayed page asset.',
            source: 'MANGO Bridge',
            symbol: symbol,
            pageSymbol: pageSym,
            timeframe: timeframe,
            candleCount: bridge.candles.length,
            latest:
              bridge.candles[
                bridge.candles.length - 1
              ],
            freshness: 'NOT ANALYZED'
          };
        }
      }

      state.source = 'MANGO Bridge';
      state.bridge = true;
      state.symbol = symbol;
      state.timeframe = timeframe;
      state.candles = bridge.candles;

      var bridgeResult = analyze(
        bridge.candles,
        symbol,
        timeframe,
        'MANGO Bridge'
      );

      state.result = bridgeResult;

      return bridgeResult;
    }

    /* Second choice: public webpage data */
    var page = discoverPageCandles();

    if (page) {
      var pSymbol = pageSymbol();
      var pTimeframe = pageTimeframe();

      state.source = page.source;
      state.bridge = false;
      state.symbol = pSymbol;
      state.timeframe = pTimeframe;
      state.candles = page.candles;

      var pageResult = analyze(
        page.candles,
        pSymbol,
        pTimeframe,
        page.source
      );

      state.result = pageResult;

      return pageResult;
    }

    state.source = 'NONE DETECTED';
    state.bridge = false;
    state.symbol = pageSymbol();
    state.timeframe = pageTimeframe();
    state.candles = [];

    var noData = {
      status: 'WAIT',
      signal: 'NO DATA / WAIT',
      reason:
        'No valid public page candles or local Bridge candles were found.',
      source: 'NONE DETECTED',
      symbol: state.symbol,
      timeframe: state.timeframe,
      candleCount: 0,
      latest: null,
      freshness: 'NO DATA'
    };

    state.result = noData;

    return noData;
  }

  /* ============================================================
     12. UI
     ============================================================ */

  var old =
    document.getElementById(
      'khilji-mango-root'
    );

  if (old) {
    old.remove();
  }

  var root =
    document.createElement('div');

  root.id = 'khilji-mango-root';

  root.style.cssText =
    'position:fixed;' +
    'z-index:2147483647;' +
    'font-family:Arial,sans-serif;';

  var button =
    document.createElement('button');

  button.innerHTML = '🥭<br><b>MANGO</b>';

  button.style.cssText =
    'position:fixed;' +
    'left:20px;' +
    'top:220px;' +
    'width:70px;' +
    'height:70px;' +
    'border-radius:50%;' +
    'border:2px solid #22c55e;' +
    'background:#0f172a;' +
    'color:white;' +
    'font-size:15px;' +
    'font-weight:bold;' +
    'cursor:pointer;';

  var panel =
    document.createElement('div');

  panel.style.cssText =
    'display:none;' +
    'position:fixed;' +
    'left:105px;' +
    'top:100px;' +
    'width:350px;' +
    'max-height:85vh;' +
    'overflow:auto;' +
    'padding:15px;' +
    'box-sizing:border-box;' +
    'background:#07111f;' +
    'color:#e5e7eb;' +
    'border:1px solid #334155;' +
    'border-radius:12px;' +
    'box-shadow:0 15px 40px rgba(0,0,0,.7);';

  panel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
      '<b style="color:#22c55e;">🥭 MANGO BOT v4.2</b>' +
      '<button id="mango-close" style="background:none;border:0;color:#fff;font-size:18px;cursor:pointer;">✕</button>' +
    '</div>' +

    '<div id="mango-signal" style="text-align:center;font-size:22px;font-weight:900;padding:12px;margin-bottom:10px;border:1px solid #334155;border-radius:8px;">NO DATA / WAIT</div>' +

    '<button id="mango-scan" style="width:100%;padding:11px;border:0;border-radius:8px;background:#22c55e;color:#06100a;font-weight:900;cursor:pointer;margin-bottom:10px;">SCAN MARKET</button>' +

    '<div id="mango-info" style="font-family:monospace;font-size:11px;line-height:1.7;">' +
      'DATA SOURCE: --<br>' +
      'SYMBOL: --<br>' +
      'TIMEFRAME: --<br>' +
      'CANDLE COUNT: 0<br>' +
      'LATEST CANDLE: --<br>' +
      'LATEST PRICE: --<br>' +
      'FRESHNESS: --<br>' +
      'VALIDATION: --<br>' +
      'EMA 9: --<br>' +
      'EMA 21: --<br>' +
      'EMA 50: --<br>' +
      'RSI 14: --<br>' +
      'MACD: --<br>' +
      'MACD SIGNAL: --<br>' +
      'MACD HIST: --<br>' +
      'MOMENTUM: --<br>' +
      'SUPPORT: --<br>' +
      'RESISTANCE: --<br>' +
      'BULL SCORE: 0<br>' +
      'BEAR SCORE: 0' +
    '</div>' +

    '<div id="mango-reason" style="margin-top:10px;color:#94a3b8;font-size:11px;">Ready.</div>';

  root.appendChild(button);
  root.appendChild(panel);
  document.body.appendChild(root);

  var signalEl =
    document.getElementById(
      'mango-signal'
    );

  var infoEl =
    document.getElementById(
      'mango-info'
    );

  var reasonEl =
    document.getElementById(
      'mango-reason'
    );

  var scanBtn =
    document.getElementById(
      'mango-scan'
    );

  var closeBtn =
    document.getElementById(
      'mango-close'
    );

  function fmt(v, d) {
    return v === null ||
      v === undefined ||
      !isFinite(Number(v))
      ? '--'
      : Number(v).toFixed(d || 2);
  }

  function display(result) {
    var color = '#f59e0b';

    if (result.signal === 'UP') {
      color = '#22c55e';
    } else if (result.signal === 'DOWN') {
      color = '#ef4444';
    }

    signalEl.textContent =
      result.signal || 'NO DATA / WAIT';

    signalEl.style.color = color;
    signalEl.style.borderColor = color;

    var latest =
      result.latest;

    var latestTime =
      latest
        ? new Date(
            latest.timestamp
          ).toLocaleTimeString()
        : '--';

    var latestPrice =
      latest
        ? fmt(latest.close, 5)
        : '--';

    infoEl.innerHTML =
      'DATA SOURCE: ' +
      (result.source || '--') + '<br>' +

      'SYMBOL: ' +
      (result.symbol || '--') + '<br>' +

      'TIMEFRAME: ' +
      (result.timeframe || '--') + '<br>' +

      'CANDLE COUNT: ' +
      (result.candleCount || 0) + '<br>' +

      'LATEST CANDLE: ' +
      latestTime + '<br>' +

      'LATEST PRICE: ' +
      latestPrice + '<br>' +

      'FRESHNESS: ' +
      (result.freshness || '--') + '<br>' +

      'VALIDATION: ' +
      (
        result.status === 'OK'
          ? 'PASSED'
          : 'FAILED / WAIT'
      ) + '<br>' +

      'EMA 9: ' +
      fmt(result.ema9, 5) + '<br>' +

      'EMA 21: ' +
      fmt(result.ema21, 5) + '<br>' +

      'EMA 50: ' +
      fmt(result.ema50, 5) + '<br>' +

      'RSI 14: ' +
      fmt(result.rsi, 1) + '<br>' +

      'MACD: ' +
      fmt(result.macd, 5) + '<br>' +

      'MACD SIGNAL: ' +
      fmt(result.macdSignal, 5) + '<br>' +

      'MACD HIST: ' +
      fmt(result.macdHistogram, 5) + '<br>' +

      'MOMENTUM: ' +
      fmt(result.momentum, 2) + '%<br>' +

      'SUPPORT: ' +
      fmt(result.support, 5) + '<br>' +

      'RESISTANCE: ' +
      fmt(result.resistance, 5) + '<br>' +

      'BULL SCORE: ' +
      (result.bullScore || 0) + '<br>' +

      'BEAR SCORE: ' +
      (result.bearScore || 0);

    reasonEl.textContent =
      result.reason ||
      (
        result.reasons &&
        result.reasons.length
          ? result.reasons.join(' • ')
          : 'No additional reason.'
      );
  }

  async function executeScan() {
    scanBtn.disabled = true;
    scanBtn.textContent =
      'READING REAL DATA...';

    signalEl.textContent =
      'WAIT...';

    try {
      var result =
        await scanMarket();

      display(result);
    } catch (e) {
      console.error(
        '[MANGO BOT]',
        e
      );

      display({
        status: 'WAIT',
        signal: 'NO DATA / WAIT',
        reason:
          'Bridge/page data could not be read.',
        source: 'ERROR',
        symbol: 'UNKNOWN',
        timeframe: 'UNKNOWN',
        candleCount: 0,
        freshness: 'NO DATA'
      });
    } finally {
      scanBtn.disabled = false;
      scanBtn.textContent =
        'SCAN MARKET';
    }
  }

  button.addEventListener(
    'click',
    function () {
      panel.style.display =
        panel.style.display === 'none'
          ? 'block'
          : 'none';
    }
  );

  closeBtn.addEventListener(
    'click',
    function () {
      panel.style.display =
        'none';
    }
  );

  scanBtn.addEventListener(
    'click',
    executeScan
  );

  window.__MANGO_BOT_INSTANCE__ = {
    show: function () {
      panel.style.display =
        'block';
      executeScan();
    },

    hide: function () {
      panel.style.display =
        'none';
    },

    scan: executeScan,

    version: '4.2.0'
  };

  console.log(
    '[MANGO BOT] v4.2.0 loaded. Bridge + public candle discovery enabled.'
  );

})();
