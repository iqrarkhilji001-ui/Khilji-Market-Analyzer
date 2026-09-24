/**
 * KHILJI Market Analyzer - MANGO BOT v3.1.0
 * Production JavaScript Engine: /public/mango.js
 * Mode: Production
 * 
 * ============================================================================
 * MASTER INSTRUCTION & SAFETY SPECIFICATION:
 * - Real Market Data Integrity: Never fabricate, simulate, randomize, or invent candles.
 * - Live Data Only: Only candles legitimately exposed by the host webpage enter analysis.
 * - Strict Gatekeeper: If reliable OHLC data cannot be obtained, or if symbol/timeframe
 *   cannot be established, or candles are insufficient (<50) or stale, return NO DATA / WAIT.
 * - Absolute Safety: Zero trade execution. Never click or dispatch any broker Buy/Sell/Call/Put controls.
 * - Test Isolation: Sandbox/test arrays (e.g. window.__MANGO_TEST_CANDLES__) are strictly blocked.
 * - Conflicting Major Indicators: Severe counter-trend contradictions force signal to WAIT.
 * ============================================================================
 */

(function () {
  'use strict';

  // 1. DUPLICATE GUARD
  if (window.__MANGO_BOT_LOADED__) {
    if (window.__MANGO_BOT_INSTANCE__ && typeof window.__MANGO_BOT_INSTANCE__.show === 'function') {
      window.__MANGO_BOT_INSTANCE__.show();
    }
    return;
  }
  window.__MANGO_BOT_LOADED__ = true;

  // 2. CONFIGURATION ENGINE
  var config = {
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
    minConfirmationScore: 70,
    minCandlesRequired: 50,
    preferredCandles: 150
  };

  // 3. CANDLE ADAPTERS & DISCOVERY ENGINE
  // Rule: Only access data legitimately exposed on window/DOM.
  // Never attempt unauthorized memory access or credential interception.
  // Test/mock arrays, sandbox feeds, and manual storage are strictly blocked in production.
  function discoverMarketData() {
    var raw = null;
    var sourceName = 'NONE DETECTED';
    var diagnostics = {
      candidatesChecked: 0,
      ohlcCandidates: 0,
      rejectedCandidates: 0,
      notes: []
    };

    // Production isolation: never use test/demo feeds or manually stored candles.
    if (typeof window !== 'undefined') {
      try {
        if (window.__MANGO_TEST_CANDLES__) delete window.__MANGO_TEST_CANDLES__;
      } catch (e) {}
      try {
        if (window.localStorage) {
          window.localStorage.removeItem('mango_candles');
          window.localStorage.removeItem('__MANGO_TEST_CANDLES__');
        }
      } catch (e) {}
    }

    function looksLikeCandle(x) {
      if (!x) return false;
      if (Array.isArray(x)) return x.length >= 5;
      if (typeof x !== 'object') return false;
      var hasO = x.open !== undefined || x.o !== undefined;
      var hasH = x.high !== undefined || x.h !== undefined;
      var hasL = x.low !== undefined || x.l !== undefined;
      var hasC = x.close !== undefined || x.c !== undefined;
      var hasT = x.timestamp !== undefined || x.time !== undefined || x.t !== undefined || x.x !== undefined;
      return hasO && hasH && hasL && hasC && hasT;
    }

    function considerArray(arr, label) {
      diagnostics.candidatesChecked++;
      if (!Array.isArray(arr) || arr.length < 5) {
        diagnostics.rejectedCandidates++;
        return false;
      }
      var sampleCount = Math.min(arr.length, 8);
      var hits = 0;
      for (var q = 0; q < sampleCount; q++) if (looksLikeCandle(arr[q])) hits++;
      if (hits >= Math.min(3, sampleCount)) {
        diagnostics.ohlcCandidates++;
        raw = arr;
        sourceName = label;
        return true;
      }
      diagnostics.rejectedCandidates++;
      return false;
    }

    // Adapter 1: public TradingView widget data, when directly exposed.
    try {
      if (window.tvWidget && typeof window.tvWidget.activeChart === 'function') {
        var tvChart = window.tvWidget.activeChart();
        if (tvChart && Array.isArray(tvChart.data)) {
          considerArray(tvChart.data, 'TradingView Chart Widget');
        }
      }
    } catch (e) { diagnostics.notes.push('TradingView adapter unavailable'); }

    // Adapter 2: public Highcharts series.
    if (!raw) {
      try {
        if (window.Highcharts && Array.isArray(window.Highcharts.charts)) {
          outer: for (var h = 0; h < window.Highcharts.charts.length; h++) {
            var hc = window.Highcharts.charts[h];
            if (!hc || !Array.isArray(hc.series)) continue;
            for (var s = 0; s < hc.series.length; s++) {
              var sData = hc.series[s] && hc.series[s].data;
              if (!Array.isArray(sData) || sData.length < 5) continue;
              var mapped = sData.map(function (pt) {
                if (pt && pt.options && Array.isArray(pt.options)) return pt.options;
                return {
                  t: pt && (pt.x !== undefined ? pt.x : pt.time),
                  o: pt && pt.open,
                  h: pt && pt.high,
                  l: pt && pt.low,
                  c: pt && pt.close
                };
              });
              if (considerArray(mapped, 'Highcharts OHLC Series')) break outer;
            }
          }
        }
      } catch (e) { diagnostics.notes.push('Highcharts adapter unavailable'); }
    }

    // Adapter 3: known public window arrays.
    if (!raw) {
      var candidates = [
        'candles', 'quotes', 'chartData', 'historyCandles', 'activeCandles',
        'currentQuotes', '_candles', 'rawCandles', 'bars', 'ohlcData', 'chartQuotes',
        'klineData', 'ohlc', 'seriesData', 'priceData', 'historyData'
      ];
      for (var i = 0; i < candidates.length && !raw; i++) {
        var key = candidates[i];
        try {
          if (window[key] && Array.isArray(window[key])) considerArray(window[key], 'Window Array: ' + key);
        } catch (e) {}
      }
    }

    // Adapter 4: safe shallow discovery of directly exposed global arrays/objects.
    // We inspect values only; we never call unknown functions, read private storage,
    // intercept network traffic, or traverse arbitrary prototype chains.
    if (!raw) {
      try {
        var keys = Object.keys(window);
        var maxKeys = Math.min(keys.length, 1200);
        for (var wi = 0; wi < maxKeys && !raw; wi++) {
          var wk = keys[wi];
          if (!wk || /password|token|auth|credential|cookie|storage|session/i.test(wk)) continue;
          var val;
          try { val = window[wk]; } catch (e) { continue; }
          if (Array.isArray(val)) {
            if (val.length >= 20 && considerArray(val, 'Window Exposed Array: ' + wk)) break;
          } else if (val && typeof val === 'object') {
            // Only inspect obvious public collection properties; no deep recursive walk.
            var subNames = ['data','candles','bars','quotes','series','ohlc','kline','history'];
            for (var si = 0; si < subNames.length && !raw; si++) {
              var sub;
              try { sub = val[subNames[si]]; } catch (e) { sub = null; }
              if (Array.isArray(sub) && sub.length >= 20) {
                if (considerArray(sub, 'Window Exposed Object: ' + wk + '.' + subNames[si])) break;
              }
            }
          }
        }
      } catch (e) { diagnostics.notes.push('Safe global discovery unavailable'); }
    }

    if (!raw) diagnostics.notes.push('No directly exposed OHLC collection passed structural discovery.');
    return { raw: raw, source: sourceName, diagnostics: diagnostics };
  }

  // Symbol Identification - Strict, No Guessing (document.title is forbidden)
  function identifySymbol() {
    var symbol = 'UNKNOWN';

    // A. Check TradingView widget
    try {
      if (window.tvWidget && typeof window.tvWidget.activeChart === 'function') {
        var tvChart = window.tvWidget.activeChart();
        if (typeof tvChart.symbol === 'function') {
          var s = tvChart.symbol();
          if (s && typeof s === 'string' && s.trim().length > 0) {
            return s.trim().toUpperCase();
          }
        }
      }
    } catch (e) {}

    // B. Check standard active broker DOM selectors (active controls only)
    if (typeof document !== 'undefined') {
      var selectors = [
        '.current-symbol', '.asset-select', '.header__asset-name', '.pairs-item.active',
        '.asset-name', '.active-asset', '.btn-symbol', '.open-chart-asset-name',
        '[data-qa="current-asset"]', '.cq-symbol-select-btn', '.symbols-dropdown',        '[data-testid="ticker-name"]', '.symbol-name'
      ];
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (el && el.textContent) {
          var text = el.textContent.trim();
          var match = text.match(/([A-Z]{3}[\/_][A-Z]{3}|[A-Z]{6}|BTCUSDT|ETHUSDT|[A-Z]{3,4}\/USD)/i);
          if (match) {
            return match[0].toUpperCase().replace('_', '/');
          }
        }
      }

      // C. URL Query String parameter (authoritative page parameter)
      if (window.location && window.location.search) {
        var urlMatch = window.location.search.match(/(?:symbol|pair|asset)=([A-Za-z0-9_]+)/i);
        if (urlMatch) {
          return urlMatch[1].toUpperCase().replace('_', '/');
        }
      }
    }

    return symbol;
  }

  // Timeframe Identification
  // Rule: Must be determined from authoritative source (TV, platform state, DOM selector).
  // Spacing delta is ONLY used as a secondary consistency check.
  function identifyTimeframe(candles) {
    var detectedTf = null;

    // A. Check TradingView widget resolution
    try {
      if (window.tvWidget && typeof window.tvWidget.activeChart === 'function') {
        var tvChart = window.tvWidget.activeChart();
        if (typeof tvChart.resolution === 'function') {
          var res = tvChart.resolution();
          if (res) detectedTf = String(res);
        }
      }
    } catch (e) {}

    // B. Check active DOM timeframe selectors
    if (!detectedTf && typeof document !== 'undefined') {
      var tfSelectors = [
        '.timeframe-select .active', '.time-frame-button.active', '[data-timeframe].active',
        '.timeframe-item.active', '.timer-dropdown .active', '[data-period].active',
        '.dropdown--timeframe .active', '.timeframe--active'
      ];
      for (var i = 0; i < tfSelectors.length; i++) {
        var el = document.querySelector(tfSelectors[i]);
        if (el && el.textContent) {
          var tText = el.textContent.trim();
          if (/^(\d+[smhdM]|\d+\s*[a-zA-Z]+)$/i.test(tText)) {
            detectedTf = tText;
            break;
          }
        }
      }
    }

    // If authoritative timeframe is not established from platform/DOM, do NOT guess.
    if (!detectedTf) {
      return 'UNKNOWN';
    }

    // Secondary consistency check: verify that candle spacing does not contradict detected timeframe
    if (candles && candles.length >= 5) {
      var deltas = [];
      for (var c = candles.length - 1; c > candles.length - 6; c--) {
        var diff = Math.round(Math.abs(candles[c].timestamp - candles[c - 1].timestamp) / 1000);
        if (diff > 0) deltas.push(diff);
      }
      if (deltas.length > 0) {
        var avgSec = Math.round(deltas.reduce(function (a, b) { return a + b; }, 0) / deltas.length);
        // If detected is 1m (~60s) but spacing is > 300s, flag inconsistency
        if ((detectedTf === '1m' || detectedTf === '1') && avgSec > 180) {
          return 'UNKNOWN'; // Mismatch between chart timeframe and candle spacing
        }
      }
    }

    return detectedTf;
  }

  // 4. STRICT OHLC & TIMESTAMP VALIDATION ENGINE
  // Hard rule: Never accept a candle unless all four OHLC values and a valid timestamp exist.
  // Never replace missing values. Reject invalid candles outright.
  function validateAndNormalizeCandles(rawArray) {
    if (!Array.isArray(rawArray) || rawArray.length === 0) {
      return { success: false, reason: 'Empty or non-array raw candle dataset' };
    }

    var validCandles = [];
    var seenTimestamps = {};
    var hasDuplicates = false;

    for (var i = 0; i < rawArray.length; i++) {
      var item = rawArray[i];
      if (!item) continue;

      var rawTime = null;
      var open = NaN, high = NaN, low = NaN, close = NaN;

      if (Array.isArray(item)) {
        if (item.length >= 5) {
          rawTime = item[0];
          open = parseFloat(item[1]);
          high = parseFloat(item[2]);
          low = parseFloat(item[3]);
          close = parseFloat(item[4]);
        }
      } else if (typeof item === 'object') {
        rawTime = item.timestamp !== undefined ? item.timestamp :
                  (item.time !== undefined ? item.time :
                  (item.t !== undefined ? item.t :
                  (item.x !== undefined ? item.x : null)));

        open = item.open !== undefined ? parseFloat(item.open) : (item.o !== undefined ? parseFloat(item.o) : NaN);
        high = item.high !== undefined ? parseFloat(item.high) : (item.h !== undefined ? parseFloat(item.h) : NaN);
        low = item.low !== undefined ? parseFloat(item.low) : (item.l !== undefined ? parseFloat(item.l) : NaN);
        close = item.close !== undefined ? parseFloat(item.close) : (item.c !== undefined ? parseFloat(item.c) : NaN);
      }

      if (!isFinite(open) || open <= 0) continue;
      if (!isFinite(high) || high <= 0) continue;
      if (!isFinite(low) || low <= 0) continue;
      if (!isFinite(close) || close <= 0) continue;

      // OHLC Relationships:
      if (high < open || high < close || high < low || low > open || low > close) {
        continue;
      }

      if (rawTime === null || rawTime === undefined) continue;
      var ts = typeof rawTime === 'number' ? rawTime : (new Date(rawTime)).getTime();
      if (!isFinite(ts) || isNaN(ts) || ts <= 0) continue;

      if (ts < 1e11) {
        ts = ts * 1000;
      }

      if (ts > Date.now() + 60000) {
        continue;
      }

      if (seenTimestamps[ts]) {
        hasDuplicates = true;
        continue;
      }
      seenTimestamps[ts] = true;

      validCandles.push({
        timestamp: ts,
        open: open,
        high: high,
        low: low,
        close: close
      });
    }

    if (validCandles.length < config.minCandlesRequired) {
      return {
        success: false,
        reason: 'Insufficient valid OHLC candles (' + validCandles.length + ' / ' + config.minCandlesRequired + ' required)'
      };
    }

    validCandles.sort(function (a, b) {
      return a.timestamp - b.timestamp;
    });

    return {
      success: true,
      candles: validCandles,
      hasDuplicates: hasDuplicates
    };
  }

  // 5. FRESHNESS VALIDATION ENGINE
  function evaluateFreshness(latestTimestamp, timeframe) {
    if (!latestTimestamp || isNaN(latestTimestamp) || latestTimestamp <= 0) {
      return { state: 'NO DATA', label: 'NO DATA', isLive: false };
    }
    var now = Date.now();
    var diffMs = now - latestTimestamp;
    var diffSec = Math.round(diffMs / 1000);

    var maxAllowedStaleSec = 180;
    if (timeframe === '5s' || timeframe === '10s' || timeframe === '15s') maxAllowedStaleSec = 45;
    else if (timeframe === '30s') maxAllowedStaleSec = 90;
    else if (timeframe === '5m') maxAllowedStaleSec = 600;
    else if (timeframe === '15m') maxAllowedStaleSec = 1800;

    if (diffSec < 0) {
      return { state: 'LIVE', label: 'LIVE (Clock Skew ' + diffSec + 's)', isLive: true };
    }
    if (diffSec <= maxAllowedStaleSec) {
      return { state: 'LIVE', label: 'LIVE (' + diffSec + 's ago)', isLive: true };
    }
    if (diffSec <= maxAllowedStaleSec * 2) {
      return { state: 'RECENT', label: 'RECENT (' + Math.round(diffSec / 60) + 'm ago)', isLive: false };
    }
    return { state: 'STALE', label: 'STALE (' + Math.round(diffSec / 60) + 'm ago)', isLive: false };
  }

  // 6. TECHNICAL INDICATORS (PURE MATHEMATICAL ENGINE)
  function calculateEMA(prices, period) {
    if (!prices || prices.length < period) return null;
    var k = 2 / (period + 1);
    var sum = 0;
    for (var i = 0; i < period; i++) {
      sum += prices[i];
    }
    var ema = sum / period;
    for (var j = period; j < prices.length; j++) {
      ema = (prices[j] * k) + (ema * (1 - k));
    }
    return ema;
    }  function calculateWilderRSI(closes, period) {
    if (!closes || closes.length <= period) return null;

    var gains = [];
    var losses = [];
    for (var i = 1; i < closes.length; i++) {
      var change = closes[i] - closes[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    if (gains.length < period) return null;

    var avgGain = 0;
    var avgLoss = 0;
    for (var j = 0; j < period; j++) {
      avgGain += gains[j];
      avgLoss += losses[j];
    }
    avgGain /= period;
    avgLoss /= period;

    for (var k = period; k < gains.length; k++) {
      avgGain = ((avgGain * (period - 1)) + gains[k]) / period;
      avgLoss = ((avgLoss * (period - 1)) + losses[k]) / period;
    }

    if (avgLoss === 0) return 100;
    var rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  function calculateMACD(closes, fast, slow, signal) {
    if (!closes || closes.length < slow + signal) return null;

    var kFast = 2 / (fast + 1);
    var kSlow = 2 / (slow + 1);
    var kSignal = 2 / (signal + 1);

    var fastSum = 0, slowSum = 0;
    for (var f = 0; f < fast; f++) fastSum += closes[f];
    for (var s = 0; s < slow; s++) slowSum += closes[s];

    var emaFast = fastSum / fast;
    var emaSlow = slowSum / slow;

    for (var p = fast; p < slow; p++) {
      emaFast = (closes[p] * kFast) + (emaFast * (1 - kFast));
    }

    var macdLineHistory = [];
    for (var i = slow; i < closes.length; i++) {
      emaFast = (closes[i] * kFast) + (emaFast * (1 - kFast));
      emaSlow = (closes[i] * kSlow) + (emaSlow * (1 - kSlow));
      macdLineHistory.push(emaFast - emaSlow);
    }

    if (macdLineHistory.length < signal) return null;

    var sigSum = 0;
    for (var g = 0; g < signal; g++) sigSum += macdLineHistory[g];
    var emaSignal = sigSum / signal;

    for (var m = signal; m < macdLineHistory.length; m++) {
      emaSignal = (macdLineHistory[m] * kSignal) + (emaSignal * (1 - kSignal));
    }

    var currentMACD = macdLineHistory[macdLineHistory.length - 1];
    var histogram = currentMACD - emaSignal;

    return {
      macd: currentMACD,
      signal: emaSignal,
      histogram: histogram
    };
  }

  function calculateMomentumROC(closes, period) {
    if (!closes || closes.length <= period) return null;
    var current = closes[closes.length - 1];
    var past = closes[closes.length - 1 - period];
    if (past === 0) return 0;
    return ((current / past) - 1) * 100;
  }

  function calculateSupportResistance(candles, lookback) {
    if (!candles || candles.length < lookback) return null;
    var slice = candles.slice(candles.length - lookback);
    var high = -Infinity;
    var low = Infinity;
    for (var i = 0; i < slice.length; i++) {
      if (slice[i].high > high) high = slice[i].high;
      if (slice[i].low < low) low = slice[i].low;
    }
    return {
      support: low,
      resistance: high
    };
  }

  // 7. CONFIRMATION & SIGNAL PIPELINE
  function runMarketAnalysis() {
    var discovery = discoverMarketData();
    if (!discovery.raw) {
      var noDataSymbol = identifySymbol();
      var noDataTimeframe = identifyTimeframe(null);
      var diagSuffix = discovery.diagnostics && discovery.diagnostics.notes.length
        ? ' ' + discovery.diagnostics.notes[discovery.diagnostics.notes.length - 1]
        : '';
      return {
        status: 'NO_DATA',
        signal: 'NO DATA / WAIT',
        reason: 'No directly exposed, structurally valid OHLC candle collection was found.' + diagSuffix,
        diagnostics: {
          dataSource: 'NONE DETECTED',
          symbol: noDataSymbol,
          timeframe: noDataTimeframe,
          candleCount: 0,
          latestCandleTime: 'N/A',
          latestPrice: 'N/A',
          dataFreshness: 'NO DATA',
          dataValidation: 'FAILED',
          signalStatus: 'NO DATA / WAIT'
        }
      };
    }

    var ohlcResult = validateAndNormalizeCandles(discovery.raw);
    if (!ohlcResult.success) {
      return {
        status: 'VALIDATION_FAILED',
        signal: 'NO DATA / WAIT',
        reason: ohlcResult.reason,
        diagnostics: {
          dataSource: discovery.source,
          symbol: 'UNKNOWN',
          timeframe: 'UNKNOWN',
          candleCount: 0,
          latestCandleTime: 'N/A',
          latestPrice: 'N/A',
          dataFreshness: 'NO DATA',
          dataValidation: 'FAILED',
          signalStatus: 'NO DATA / WAIT'
        }
      };
    }

    var candles = ohlcResult.candles;
    var closes = candles.map(function (c) { return c.close; });
    var latestCandle = candles[candles.length - 1];
    var currentPrice = latestCandle.close;

    var symbol = identifySymbol();
    var timeframe = identifyTimeframe(candles);
    var freshness = evaluateFreshness(latestCandle.timestamp, timeframe);

    var validationState = 'PASSED';
    var failReason = '';
    
    // Symbol & Timeframe Identity Gate
    if (symbol === 'UNKNOWN') {
      validationState = 'FAILED';
      failReason = 'Cannot reliably establish displayed symbol.';
    } else if (timeframe === 'UNKNOWN') {
      validationState = 'FAILED';
      failReason = 'Cannot reliably establish displayed timeframe.';
    } else if (!freshness.isLive) {
      validationState = 'FAILED';
      failReason = 'Candle feed is stale (' + freshness.label + ').';
    }

    // Symbol + Timeframe Feed Association Gate (Section 9)
    if (validationState === 'PASSED' && discovery.source.indexOf('Window Array') === 0) {
      var rawArr = discovery.raw;
      var arrSymbol = rawArr.symbol || rawArr.pair || rawArr.asset || (typeof window !== 'undefined' && (window.currentSymbol || window.activeSymbol));
      if (arrSymbol && typeof arrSymbol === 'string') {
        var cleanArrSym = arrSymbol.toUpperCase().replace('_', '/');
        if (cleanArrSym.indexOf(symbol.replace('/', '')) === -1 && symbol.indexOf(cleanArrSym) === -1) {
          validationState = 'FAILED';
          failReason = 'Window candle array (' + cleanArrSym + ') does not match displayed symbol (' + symbol + ').';
        }
      } else {
        // Anonymous generic array with no verifiable link to the displayed chart
        validationState = 'FAILED';
        failReason = 'Generic candle array cannot be confidently associated with displayed symbol (' + symbol + ').';
      }
    }

    var latestTimeFormatted = new Date(latestCandle.timestamp).toLocaleTimeString();

    if (validationState === 'FAILED') {
      return {
        status: 'IDENTITY_OR_FRESHNESS_FAILED',
        signal: 'NO DATA / WAIT',
        reason: failReason,
        diagnostics: {
          dataSource: discovery.source,
          symbol: symbol,
          timeframe: timeframe,
          candleCount: candles.length,
          latestCandleTime: latestTimeFormatted,
          latestPrice: currentPrice.toFixed(5),
          dataFreshness: freshness.label,
          dataValidation: 'FAILED',
          signalStatus: 'NO DATA / WAIT'        }
      };
    }

    // Indicator Computation
    var ema9 = calculateEMA(closes, config.emaShort);
    var ema21 = calculateEMA(closes, config.emaMedium);
    var ema50 = calculateEMA(closes, config.emaLong);
    var rsi = calculateWilderRSI(closes, config.rsiPeriod);
    var macd = calculateMACD(closes, config.macdFast, config.macdSlow, config.macdSignal);
    var roc = calculateMomentumROC(closes, config.momentumPeriod);
    var sr = calculateSupportResistance(candles, config.srLookback);

    if (ema9 === null || ema21 === null || ema50 === null || rsi === null || macd === null || roc === null || sr === null) {
      return {
        status: 'CALCULATION_FAILED',
        signal: 'NO DATA / WAIT',
        reason: 'Insufficient historical bars to compute 50-period indicators.',
        diagnostics: {
          dataSource: discovery.source,
          symbol: symbol,
          timeframe: timeframe,
          candleCount: candles.length,
          latestCandleTime: latestTimeFormatted,
          latestPrice: currentPrice.toFixed(5),
          dataFreshness: freshness.label,
          dataValidation: 'FAILED',
          signalStatus: 'NO DATA / WAIT'
        }
      };
    }

    // Trend Engine
    var trend = 'NEUTRAL';
    if (ema9 > ema21 && ema21 > ema50 && currentPrice >= ema21) {
      trend = 'BULLISH';
    } else if (ema9 < ema21 && ema21 < ema50 && currentPrice <= ema21) {
      trend = 'BEARISH';
    }

    // Multi-Confirmation Scoring (Total: 100 points)
    var bullScore = 0;
    var bearScore = 0;

    // 1. EMA Alignment (25 pts)
    if (ema9 > ema21 && currentPrice > ema9) {
      bullScore += 25;
    } else if (ema9 < ema21 && currentPrice < ema9) {
      bearScore += 25;
    }

    // 2. Wilder RSI 14 Regime (25 pts)
    if (rsi >= 50 && rsi < config.rsiOverbought) {
      bullScore += 20;
    } else if (rsi <= config.rsiOversold) {
      bullScore += 25;
    } else if (rsi <= 50 && rsi > config.rsiOversold) {
      bearScore += 20;
    } else if (rsi >= config.rsiOverbought) {
      bearScore += 25;
    }

    // 3. MACD Histogram & Momentum (20 pts)
    if (macd.histogram > 0 && macd.macd > macd.signal) {
      bullScore += 20;
    } else if (macd.histogram < 0 && macd.macd < macd.signal) {
      bearScore += 20;
    }

    // 4. Momentum ROC (15 pts)
    if (roc > 0.05) {
      bullScore += 15;
    } else if (roc < -0.05) {
      bearScore += 15;
    }

    // 5. Support / Resistance (15 pts)
    var range = sr.resistance - sr.support;
    if (range > 0) {
      var relPos = (currentPrice - sr.support) / range;
      if (relPos <= 0.25) {
        bullScore += 15;
      } else if (relPos >= 0.75) {
        bearScore += 15;
      }
    }

    var finalScore = Math.max(bullScore, bearScore);
    var finalSignal = 'WAIT';

    // Hard Safety Condition: Conflicting Major Indicators
    var contradiction = false;
    if (bullScore >= config.minConfirmationScore && bullScore > bearScore) {
      if (trend === 'BEARISH' || (macd.histogram < 0 && macd.macd < macd.signal) || roc < -0.15) {
        contradiction = true;
      } else {
        finalSignal = 'UP';
      }
    } else if (bearScore >= config.minConfirmationScore && bearScore > bullScore) {
      if (trend === 'BULLISH' || (macd.histogram > 0 && macd.macd > macd.signal) || roc > 0.15) {
        contradiction = true;
      } else {
        finalSignal = 'DOWN';
      }
    }

    if (contradiction) {
      finalSignal = 'WAIT';
    }

    return {
      status: 'OK',
      signal: finalSignal,
      score: finalScore,
      bullScore: bullScore,
      bearScore: bearScore,
      symbol: symbol,
      timeframe: timeframe,
      currentPrice: currentPrice,
      trend: trend,
      ema9: ema9,
      ema21: ema21,
      ema50: ema50,
      rsi: rsi,
      macd: macd.macd,
      macdSignal: macd.signal,
      macdHistogram: macd.histogram,
      momentumROC: roc,
      support: sr.support,
      resistance: sr.resistance,
      candleCount: candles.length,
      contradiction: contradiction,
      diagnostics: {
        dataSource: discovery.source,
        symbol: symbol,
        timeframe: timeframe,
        candleCount: candles.length,
        latestCandleTime: latestTimeFormatted,
        latestPrice: currentPrice.toFixed(5),
        dataFreshness: freshness.label,
        dataValidation: 'PASSED',
        signalStatus: finalSignal === 'UP' ? 'UP' : (finalSignal === 'DOWN' ? 'DOWN' : 'WAIT')
      }
    };
  }

  // 8. PRODUCTION UI INJECTION & DOM CONTAINER
  var CONTAINER_ID = 'khilji-mango-analyzer-root';
  var prev = document.getElementById(CONTAINER_ID);
  if (prev) prev.remove();

  var root = document.createElement('div');
  root.id = CONTAINER_ID;
  root.style.position = 'fixed';
  root.style.top = '0';
  root.style.left = '0';
  root.style.width = '0';
  root.style.height = '0';
  root.style.zIndex = '2147483647';
  root.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Draggable Left Circular Button (🥭 MANGO)
  var leftBtn = document.createElement('div');
  leftBtn.id = 'mango-circle-btn';
  leftBtn.innerHTML = '🥭<br><span style="font-size:10px;font-weight:900;letter-spacing:0.5px;">MANGO</span>';
  leftBtn.style.position = 'fixed';
  leftBtn.style.left = '20px';
  leftBtn.style.top = '220px';
  leftBtn.style.width = '64px';
  leftBtn.style.height = '64px';
  leftBtn.style.borderRadius = '50%';
  leftBtn.style.backgroundColor = '#1E293B';
  leftBtn.style.border = '2px solid #FFB800';
  leftBtn.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6), 0 0 12px rgba(255,184,0,0.4)';
  leftBtn.style.color = '#FFFFFF';
  leftBtn.style.display = 'flex';
  leftBtn.style.flexDirection = 'column';
  leftBtn.style.alignItems = 'center';
  leftBtn.style.justifyContent = 'center';
  leftBtn.style.cursor = 'grab';
  leftBtn.style.userSelect = 'none';
  leftBtn.style.fontSize = '18px';
  leftBtn.style.zIndex = '2147483647';
  leftBtn.style.transition = 'transform 0.1s ease';

  // Upper Right Scan Button (Triangle)
  var scanTriangle = document.createElement('div');
  scanTriangle.id = 'mango-triangle-btn';
  scanTriangle.style.position = 'fixed';
  scanTriangle.style.right = '24px';
  scanTriangle.style.top = '24px';
  scanTriangle.style.width = '0';
  scanTriangle.style.height = '0';
  scanTriangle.style.borderLeft = '18px solid transparent';
  scanTriangle.style.borderRight = '18px solid transparent';
  scanTriangle.style.borderBottom = '32px solid #FFB800';
  scanTriangle.style.cursor = 'pointer';
  scanTriangle.style.filter = 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))';
  scanTriangle.style.zIndex = '2147483647';
  scanTriangle.title = 'Open KHILJI MANGO Analyzer & Scan';

  // Main Analyzer Panel
  var panel = document.createElement('div');
  panel.id = 'mango-analyzer-panel';
  panel.style.position = 'fixed';
  panel.style.left = '100px';
  panel.style.top = '100px';
  panel.style.width = '350px';
  panel.style.maxHeight = '90vh';
  panel.style.overflowY = 'auto';
  panel.style.backgroundColor = '#0A0F1D';
  panel.style.border = '1px solid #334155';
  panel.style.borderRadius = '12px';  panel.style.boxShadow = '0 20px 40px rgba(0,0,0,0.85), 0 0 20px rgba(255,184,0,0.2)';
  panel.style.color = '#E2E8F0';
  panel.style.padding = '14px';
  panel.style.display = 'none';
  panel.style.zIndex = '2147483647';
  panel.style.boxSizing = 'border-box';

  panel.innerHTML =
    '<!-- Header -->' +
    '<div id="mango-panel-header" style="display:flex;align-items:center;justify-content:space-between;cursor:grab;padding-bottom:10px;border-bottom:1px solid #1E293B;margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:18px;">🥭</span>' +
        '<div>' +
          '<div style="font-weight:900;font-size:12px;letter-spacing:0.8px;color:#FBBF24;">KHILJI MARKET ANALYZER</div>' +
          '<div style="font-size:9px;color:#64748B;font-weight:bold;">MANGO BOT v3.1.0 DIAGNOSTIC</div>' +
        '</div>' +
      '</div>' +
      '<button id="mango-close-btn" style="background:none;border:none;color:#94A3B8;cursor:pointer;font-size:16px;line-height:1;padding:4px;">✕</button>' +
    '</div>' +

    '<!-- Final Signal Card -->' +
    '<div id="mango-signal-card" style="background:#131B2E;border:1px solid #334155;border-radius:8px;padding:10px;text-align:center;margin-bottom:10px;">' +
      '<div style="font-size:10px;font-weight:700;color:#94A3B8;letter-spacing:0.8px;text-transform:uppercase;">FINAL SIGNAL</div>' +
      '<div id="mango-signal-text" style="font-size:22px;font-weight:900;letter-spacing:1px;color:#F59E0B;margin:4px 0;">NO DATA / WAIT</div>' +
      '<div id="mango-signal-sub" style="font-size:10px;color:#94A3B8;">Click Scan Market to analyze host webpage.</div>' +
    '</div>' +

    '<!-- View Tabs -->' +
    '<div style="display:flex;gap:4px;margin-bottom:10px;">' +
      '<button id="mango-tab-analysis" style="flex:1;background:#1E293B;color:#FBBF24;border:1px solid #334155;border-radius:6px;padding:6px;font-size:10px;font-weight:bold;cursor:pointer;">📊 Indicators (All 22)</button>' +
      '<button id="mango-tab-diag" style="flex:1;background:#0F172A;color:#94A3B8;border:1px solid #1E293B;border-radius:6px;padding:6px;font-size:10px;font-weight:bold;cursor:pointer;">🔍 Diagnostics</button>' +
    '</div>' +

    '<!-- Indicators View: Explicitly covers all 22 Required Fields -->' +
    '<div id="mango-view-analysis">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:10px;margin-bottom:10px;">' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">STATUS</div>' +
          '<div id="mango-f-status" style="font-weight:bold;color:#F59E0B;margin-top:2px;">WAIT</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">CONFIRMATION SCORE</div>' +
          '<div id="mango-f-score" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">0%</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">SYMBOL</div>' +
          '<div id="mango-f-symbol" style="font-weight:bold;color:#38BDF8;margin-top:2px;">UNKNOWN</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">TIMEFRAME</div>' +
          '<div id="mango-f-timeframe" style="font-weight:bold;color:#38BDF8;margin-top:2px;">UNKNOWN</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">LATEST PRICE</div>' +
          '<div id="mango-f-price" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">LATEST CANDLE TIME</div>' +
          '<div id="mango-f-time" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">CANDLE COUNT</div>' +
          '<div id="mango-f-count" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">0</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">TREND</div>' +
          '<div id="mango-f-trend" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">NEUTRAL</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">EMA 9</div>' +
          '<div id="mango-f-ema9" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">EMA 21</div>' +
          '<div id="mango-f-ema21" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">EMA 50</div>' +
          '<div id="mango-f-ema50" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">RSI 14</div>' +
          '<div id="mango-f-rsi" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">MACD</div>' +
          '<div id="mango-f-macd" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">MACD SIGNAL</div>' +
          '<div id="mango-f-macd-signal" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">MACD HISTOGRAM</div>' +
          '<div id="mango-f-macd-hist" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">MOMENTUM ROC</div>' +
          '<div id="mango-f-roc" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">SUPPORT</div>' +
          '<div id="mango-f-support" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
        '<div style="background:#131B2E;padding:6px 8px;border-radius:6px;border:1px solid #1E293B;">' +
          '<div style="color:#64748B;">RESISTANCE</div>' +
          '<div id="mango-f-resistance" style="font-weight:bold;color:#E2E8F0;margin-top:2px;">--</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<!-- Diagnostics View -->' +
    '<div id="mango-view-diag" style="display:none;background:#050811;border:1px solid #1E293B;border-radius:6px;padding:8px;font-size:10px;font-family:monospace;margin-bottom:10px;line-height:1.5;">' +
      '<div style="color:#FBBF24;font-weight:bold;border-bottom:1px solid #1E293B;padding-bottom:4px;margin-bottom:6px;">LIVE TELEMETRY DIAGNOSTICS</div>' +
      '<div style="display:grid;grid-template-columns:110px 1fr;gap:4px;">' +
        '<span style="color:#64748B;">DATA SOURCE:</span><span id="mango-d-source" style="font-weight:bold;color:#E2E8F0;">--</span>' +
        '<span style="color:#64748B;">SYMBOL:</span><span id="mango-d-symbol" style="font-weight:bold;color:#38BDF8;">--</span>' +
        '<span style="color:#64748B;">TIMEFRAME:</span><span id="mango-d-timeframe" style="font-weight:bold;color:#38BDF8;">--</span>' +
        '<span style="color:#64748B;">CANDLE COUNT:</span><span id="mango-d-count" style="font-weight:bold;color:#E2E8F0;">--</span>' +
        '<span style="color:#64748B;">LATEST CANDLE:</span><span id="mango-d-time" style="font-weight:bold;color:#E2E8F0;">--</span>' +
        '<span style="color:#64748B;">LATEST PRICE:</span><span id="mango-d-price" style="font-weight:bold;color:#E2E8F0;">--</span>' +
        '<span style="color:#64748B;">DATA FRESHNESS:</span><span id="mango-d-freshness" style="font-weight:bold;color:#E2E8F0;">--</span>' +
        '<span style="color:#64748B;">DATA VALIDATION:</span><span id="mango-d-validation" style="font-weight:bold;color:#E2E8F0;">--</span>' +
        '<span style="color:#64748B;">SIGNAL STATUS:</span><span id="mango-d-signal" style="font-weight:bold;color:#F59E0B;">--</span>' +
      '</div>' +
    '</div>' +

    '<!-- Action Controls -->' +
    '<button id="mango-scan-btn" style="width:100%;background:linear-gradient(135deg, #FFB800 0%, #D97706 100%);color:#0F172A;font-weight:900;border:none;border-radius:8px;padding:10px;font-size:11px;cursor:pointer;letter-spacing:0.8px;">' +
      'SCAN MARKET NOW' +
    '</button>' +

    '<!-- Safety Footer Notice -->' +
    '<div style="text-align:center;font-size:8px;color:#475569;margin-top:8px;">' +
      'Strict Safety: Pure Market Analysis • Zero Auto-Execution • Educational Only' +
    '</div>';

  root.appendChild(leftBtn);
  root.appendChild(scanTriangle);
  root.appendChild(panel);
  document.body.appendChild(root);

  // UI Event Handlers & Elements
  var resText = document.getElementById('mango-signal-text');
  var resSub = document.getElementById('mango-signal-sub');
  var resCard = document.getElementById('mango-signal-card');
  var scanBtn = document.getElementById('mango-scan-btn');
  var closeBtn = document.getElementById('mango-close-btn');

  var fStatus = document.getElementById('mango-f-status');
  var fScore = document.getElementById('mango-f-score');
  var fSymbol = document.getElementById('mango-f-symbol');
  var fTimeframe = document.getElementById('mango-f-timeframe');
  var fPrice = document.getElementById('mango-f-price');
  var fTime = document.getElementById('mango-f-time');
  var fCount = document.getElementById('mango-f-count');
  var fTrend = document.getElementById('mango-f-trend');
  var fEma9 = document.getElementById('mango-f-ema9');
  var fEma21 = document.getElementById('mango-f-ema21');
  var fEma50 = document.getElementById('mango-f-ema50');
  var fRsi = document.getElementById('mango-f-rsi');
  var fMacd = document.getElementById('mango-f-macd');
  var fMacdSignal = document.getElementById('mango-f-macd-signal');
  var fMacdHist = document.getElementById('mango-f-macd-hist');
  var fRoc = document.getElementById('mango-f-roc');
  var fSupport = document.getElementById('mango-f-support');
  var fResistance = document.getElementById('mango-f-resistance');

  var dSource = document.getElementById('mango-d-source');
  var dSymbol = document.getElementById('mango-d-symbol');
  var dTimeframe = document.getElementById('mango-d-timeframe');
  var dCount = document.getElementById('mango-d-count');
  var dTime = document.getElementById('mango-d-time');
  var dPrice = document.getElementById('mango-d-price');
  var dFreshness = document.getElementById('mango-d-freshness');
  var dValidation = document.getElementById('mango-d-validation');
  var dSignal = document.getElementById('mango-d-signal');

  var tabAnalysis = document.getElementById('mango-tab-analysis');
  var tabDiag = document.getElementById('mango-tab-diag');
  var viewAnalysis = document.getElementById('mango-view-analysis');
  var viewDiag = document.getElementById('mango-view-diag');

  function updateDisplay(result) {
    if (result.diagnostics) {
      dSource.textContent = result.diagnostics.dataSource;
      dSymbol.textContent = result.diagnostics.symbol;
      dTimeframe.textContent = result.diagnostics.timeframe;
      dCount.textContent = result.diagnostics.candleCount > 0 ? (result.diagnostics.candleCount + ' candles') : '0';
      dTime.textContent = result.diagnostics.latestCandleTime;
      dPrice.textContent = result.diagnostics.latestPrice;
      dFreshness.textContent = result.diagnostics.dataFreshness;
      dFreshness.style.color = result.diagnostics.dataFreshness.indexOf('LIVE') !== -1 ? '#10B981' : '#EF4444';
      dValidation.textContent = result.diagnostics.dataValidation;
      dValidation.style.color = result.diagnostics.dataValidation === 'PASSED' ? '#10B981' : '#EF4444';
      dSignal.textContent = result.diagnostics.signalStatus;
      dSignal.style.color = result.diagnostics.signalStatus === 'UP' ? '#10B981' : (result.diagnostics.signalStatus === 'DOWN' ? '#EF4444' : '#F59E0B');
    }

    if (result.status !== 'OK') {
      resText.textContent = 'NO DATA / WAIT';
      resText.style.color = '#F59E0B';
      resCard.style.borderColor = '#F59E0B';
      resCard.style.backgroundColor = 'rgba(245, 158, 11, 0.08)';
      resSub.textContent = result.reason || 'Reliable market data cannot be verified.';

      fStatus.textContent = 'WAIT';
      fStatus.style.color = '#F59E0B';
      fScore.textContent = '0%';
      fSymbol.textContent = result.diagnostics ? result.diagnostics.symbol : 'UNKNOWN';
      fTimeframe.textContent = result.diagnostics ? result.diagnostics.timeframe : 'UNKNOWN';
      fPrice.textContent = '--';
      fTime.textContent = '--';      fCount.textContent = '0';
      fTrend.textContent = 'NEUTRAL';
      fEma9.textContent = '--';
      fEma21.textContent = '--';
      fEma50.textContent = '--';
      fRsi.textContent = '--';
      fMacd.textContent = '--';
      fMacdSignal.textContent = '--';
      fMacdHist.textContent = '--';
      fRoc.textContent = '--';
      fSupport.textContent = '--';
      fResistance.textContent = '--';
      return;
    }

    // Success Populated State
    fStatus.textContent = result.signal;
    fStatus.style.color = result.signal === 'UP' ? '#10B981' : (result.signal === 'DOWN' ? '#EF4444' : '#F59E0B');
    fSymbol.textContent = result.symbol;
    fTimeframe.textContent = result.timeframe;
    fPrice.textContent = result.currentPrice.toFixed(5);
    fTime.textContent = result.diagnostics.latestCandleTime;
    fCount.textContent = String(result.candleCount);
    fTrend.textContent = result.trend;
    fTrend.style.color = result.trend === 'BULLISH' ? '#10B981' : (result.trend === 'BEARISH' ? '#EF4444' : '#E2E8F0');

    fScore.textContent = result.score + '%';
    fScore.style.color = result.score >= config.minConfirmationScore ? '#10B981' : '#F59E0B';

    fEma9.textContent = result.ema9 ? result.ema9.toFixed(5) : '--';
    fEma21.textContent = result.ema21 ? result.ema21.toFixed(5) : '--';
    fEma50.textContent = result.ema50 ? result.ema50.toFixed(5) : '--';
    fRsi.textContent = result.rsi !== null ? result.rsi.toFixed(1) : '--';
    fMacd.textContent = result.macd ? result.macd.toFixed(5) : '--';
    fMacdSignal.textContent = result.macdSignal ? result.macdSignal.toFixed(5) : '--';
    fMacdHist.textContent = result.macdHistogram ? result.macdHistogram.toFixed(5) : '--';
    fRoc.textContent = result.momentumROC ? (result.momentumROC.toFixed(2) + '%') : '--';
    fSupport.textContent = result.support ? result.support.toFixed(5) : '--';
    fResistance.textContent = result.resistance ? result.resistance.toFixed(5) : '--';

    if (result.signal === 'UP') {
      resText.textContent = 'CALL / UP ▲';
      resText.style.color = '#10B981';
      resCard.style.borderColor = '#10B981';
      resCard.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
      resSub.textContent = 'Bullish Confirmation (' + result.bullScore + '% Score)';
    } else if (result.signal === 'DOWN') {
      resText.textContent = 'PUT / DOWN ▼';
      resText.style.color = '#EF4444';
      resCard.style.borderColor = '#EF4444';
      resCard.style.backgroundColor = 'rgba(239, 68, 68, 0.12)';
      resSub.textContent = 'Bearish Confirmation (' + result.bearScore + '% Score)';
    } else {
      resText.textContent = 'WAIT / NEUTRAL ⏸';
      resText.style.color = '#F59E0B';
      resCard.style.borderColor = '#F59E0B';
      resCard.style.backgroundColor = 'rgba(245, 158, 11, 0.08)';
      if (result.contradiction) {
        resSub.textContent = 'Hold: Major indicator contradiction detected.';
      } else {
        resSub.textContent = 'Score (' + result.score + '%) below required ' + config.minConfirmationScore + '%';
      }
    }
  }

  function executeScan() {
    scanBtn.style.opacity = '0.7';
    scanBtn.textContent = 'ANALYZING LIVE MARKET...';
    setTimeout(function () {
      try {
        var analysis = runMarketAnalysis();
        updateDisplay(analysis);
      } catch (err) {
        console.error('[MANGO BOT] Scan error:', err);
        updateDisplay({
          status: 'ERROR',
          signal: 'NO DATA / WAIT',
          reason: 'Internal exception during analysis: ' + (err.message || 'unknown error'),
          diagnostics: {
            dataSource: 'ERROR',
            symbol: 'UNKNOWN',
            timeframe: 'UNKNOWN',
            candleCount: 0,
            latestCandleTime: 'N/A',
            latestPrice: 'N/A',
            dataFreshness: 'NO DATA',
            dataValidation: 'FAILED',
            signalStatus: 'NO DATA / WAIT'
          }
        });
      } finally {
        scanBtn.style.opacity = '1';
        scanBtn.textContent = 'SCAN MARKET NOW';
      }
    }, 150);
  }

  function makeDraggable(el, handle) {
    var posX = 0, posY = 0, initialMouseX = 0, initialMouseY = 0;
    var targetHandle = handle || el;

    targetHandle.onmousedown = dragMouseDown;
    targetHandle.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
      e = e || window.event;
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      posX = initialMouseX - e.clientX;
      posY = initialMouseY - e.clientY;
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;
      el.style.top = Math.max(10, el.offsetTop - posY) + 'px';
      el.style.left = Math.max(10, el.offsetLeft - posX) + 'px';
    }

    function dragTouchStart(e) {
      if (e.target.tagName === 'BUTTON') return;
      var touch = e.touches[0];
      initialMouseX = touch.clientX;
      initialMouseY = touch.clientY;
      document.ontouchend = closeTouchDrag;
      document.ontouchmove = touchDrag;
    }

    function touchDrag(e) {
      var touch = e.touches[0];
      posX = initialMouseX - touch.clientX;
      posY = initialMouseY - touch.clientY;
      initialMouseX = touch.clientX;
      initialMouseY = touch.clientY;
      el.style.top = Math.max(10, el.offsetTop - posY) + 'px';
      el.style.left = Math.max(10, el.offsetLeft - posX) + 'px';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }

    function closeTouchDrag() {
      document.ontouchend = null;
      document.ontouchmove = null;
    }
  }

  makeDraggable(leftBtn);
  makeDraggable(panel, document.getElementById('mango-panel-header'));

  tabAnalysis.addEventListener('click', function () {
    viewAnalysis.style.display = 'block';
    viewDiag.style.display = 'none';
    tabAnalysis.style.background = '#1E293B';
    tabAnalysis.style.color = '#FBBF24';
    tabDiag.style.background = '#0F172A';
    tabDiag.style.color = '#94A3B8';
  });

  tabDiag.addEventListener('click', function () {
    viewAnalysis.style.display = 'none';
    viewDiag.style.display = 'block';
    tabDiag.style.background = '#1E293B';
    tabDiag.style.color = '#FBBF24';
    tabAnalysis.style.background = '#0F172A';
    tabAnalysis.style.color = '#94A3B8';
  });

  leftBtn.addEventListener('click', function () {
    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      executeScan();
    } else {
      panel.style.display = 'none';
    }
  });

  scanTriangle.addEventListener('click', function () {
    panel.style.display = 'block';
    executeScan();
  });

  scanBtn.addEventListener('click', executeScan);
  closeBtn.addEventListener('click', function () {
    panel.style.display = 'none';
  });

  window.__MANGO_BOT_INSTANCE__ = {
    show: function () {
      panel.style.display = 'block';
      executeScan();
    },
    hide: function () {
      panel.style.display = 'none';
    },
    scan: executeScan,
    version: '3.1.0-DIAGNOSTIC'
  };

  console.log('[MANGO BOT] KHILJI Market Analyzer v3.1.0 DIAGNOSTIC initialized. Ready on page.');
})();
