javascript:(function(){

"use strict";

/*
============================================================
 KHILJI MANGO - QUOTEX DATA DIAGNOSTIC
 Diagnostic Edition
============================================================

 PURPOSE:
 - Find legitimately exposed PUBLIC market/chart data
 - Inspect OHLC/candle structures
 - Detect symbol/timeframe
 - Detect chart libraries
 - Validate candle data
 - Produce a diagnostic report

 SAFETY:
 - NO BUY CLICK
 - NO SELL CLICK
 - NO CALL CLICK
 - NO PUT CLICK
 - NO RANDOM SIGNAL
 - NO TRADE EXECUTION
 - NO NETWORK REQUEST
 - NO CORS BYPASS
 - NO AUTH BYPASS
 - NO PRIVATE STORAGE ACCESS
 - NO TOKEN/PASSWORD/COOKIE SCANNING
============================================================
*/


/* =========================================================
   CONFIG
========================================================= */

const CFG = {

    MIN_CANDLES: 5,

    MAX_CANDLES_TO_INSPECT: 500,

    MAX_WINDOW_KEYS: 1500,

    MAX_OBJECT_DEPTH: 3,

    MAX_ARRAY_LENGTH: 5000,

    SENSITIVE:
        /password|passwd|token|secret|auth|credential|cookie|session|csrf|jwt|private|apikey|api_key/i,

    PUBLIC_STATE_NAMES: [

        "__INITIAL_STATE__",
        "__NEXT_DATA__",
        "__PRELOADED_STATE__",

        "appState",
        "marketState",
        "chartState",
        "chartData",
        "marketData",
        "priceData",
        "historyData",
        "historyCandles",
        "activeCandles",

        "candles",
        "bars",
        "quotes",
        "ohlc",
        "ohlcData",
        "klineData",
        "seriesData"
    ]

};


/* =========================================================
   OLD MANGO UI REMOVE
========================================================= */

try{

    document
        .querySelectorAll(
            '[id^="mango-v"],[id^="MANGO_"],[class*="mango-pro"]'
        )
        .forEach(x=>x.remove());

}catch(e){}


/* =========================================================
   HELPERS
========================================================= */

function safe(fn, fallback=null){

    try{

        return fn();

    }catch(e){

        return fallback;

    }

}


function num(v){

    const n=Number(v);

    return Number.isFinite(n) ? n : null;

}


function isObject(v){

    return v &&
        typeof v==="object";

}


function isSensitiveKey(key){

    return CFG.SENSITIVE.test(String(key));

}


function short(v,max=160){

    try{

        let s=typeof v==="string"
            ? v
            : JSON.stringify(v);

        if(!s) return "";

        return s.length>max
            ? s.slice(0,max)+"..."
            : s;

    }catch(e){

        return String(v);

    }

}


/* =========================================================
   REPORT OBJECT
========================================================= */

const REPORT={

    startedAt:new Date().toISOString(),

    page:{

        url:location.href,

        host:location.host,

        title:document.title,

        readyState:document.readyState

    },

    symbol:{

        value:"UNKNOWN",

        sources:[]

    },

    timeframe:{

        value:"UNKNOWN",

        sources:[]

    },

    libraries:{

        tradingView:false,

        highcharts:false,

        apexcharts:false,

        chartjs:false,

        lightweightCharts:false

    },

    dom:{

        buttons:0,

        tradeLikeButtons:[],

        chartElements:0,

        dataAttributes:[]

    },

    candidates:[],

    validation:{

        arraysInspected:0,

        arraysWithEnoughRows:0,

        validCandleSets:0

    },

    bestData:null,

    conclusion:""

};


/* =========================================================
   SYMBOL DETECTION
========================================================= */

function addSymbol(value,source){

    if(value===null || value===undefined) return;

    const v=String(value).trim();

    if(!v) return;

    if(
        v.length>100 ||
        /password|token|secret/i.test(v)
    ) return;

    REPORT.symbol.sources.push({

        source,

        value:v

    });

    if(
        REPORT.symbol.value==="UNKNOWN"
    ){

        REPORT.symbol.value=v;

    }

}


function detectSymbol(){

    /* TradingView */

    const tv=safe(
        ()=>window.tvWidget
            ?.activeChart
            ?.()
            ?.symbol
            ?.()
    );

    if(tv){

        addSymbol(
            tv,
            "TradingView activeChart.symbol()"
        );

    }


    /* common DOM attributes */

    const selectors=[

        "[data-symbol]",
        "[data-pair]",
        "[data-asset]",
        "[data-ticker]",
        "[data-instrument]",
        "[data-market]"

    ];


    for(const selector of selectors){

        const nodes=safe(
            ()=>Array.from(
                document.querySelectorAll(selector)
            ),
            []
        );

        for(const el of nodes.slice(0,30)){

            for(
                const attr of [
                    "data-symbol",
                    "data-pair",
                    "data-asset",
                    "data-ticker",
                    "data-instrument",
                    "data-market"
                ]
            ){

                const v=el.getAttribute(attr);

                if(v){

                    addSymbol(
                        v,
                        "DOM "+attr
                    );

                }

            }

        }

    }


    /* URL */

    const params=new URLSearchParams(
        location.search
    );


    for(
        const key of [
            "symbol",
            "pair",
            "asset",
            "ticker",
            "instrument"
        ]
    ){

        const v=params.get(key);

        if(v){

            addSymbol(
                v,
                "URL ?"+key
            );

        }

    }

}


/* =========================================================
   TIMEFRAME DETECTION
========================================================= */

function addTimeframe(value,source){

    if(value===null || value===undefined) return;

    const v=String(value).trim();

    if(!v) return;

    REPORT.timeframe.sources.push({

        source,

        value:v

    });

    if(
        REPORT.timeframe.value==="UNKNOWN"
    ){

        REPORT.timeframe.value=v;

    }

}


function detectTimeframe(){

    /* TradingView */

    const tv=safe(
        ()=>window.tvWidget
            ?.activeChart
            ?.()
            ?.resolution
            ?.()
    );

    if(tv){

        addTimeframe(
            tv,
            "TradingView resolution()"
        );

    }


    /* DOM */

    const selectors=[

        "[data-timeframe]",
        "[data-period]",
        "[data-interval]",
        "[data-resolution]"

    ];


    for(const selector of selectors){

        const nodes=safe(
            ()=>Array.from(
                document.querySelectorAll(selector)
            ),
            []
        );

        for(const el of nodes.slice(0,30)){

            for(
                const attr of [
                    "data-timeframe",
                    "data-period",
                    "data-interval",
                    "data-resolution"
                ]
            ){

                const v=el.getAttribute(attr);

                if(v){

                    addTimeframe(
                        v,
                        "DOM "+attr
                    );

                }

            }

        }

    }

}


/* =========================================================
   LIBRARY DETECTION
========================================================= */

function detectLibraries(){

    REPORT.libraries.tradingView=
        !!safe(()=>window.tvWidget);

    REPORT.libraries.highcharts=
        !!safe(()=>window.Highcharts);

    REPORT.libraries.apexcharts=
        !!safe(()=>window.ApexCharts);

    REPORT.libraries.chartjs=
        !!safe(()=>window.Chart);

    REPORT.libraries.lightweightCharts=
        !!safe(()=>window.LightweightCharts);


    /* Extra DOM hints */

    const scripts=safe(
        ()=>Array.from(document.scripts),
        []
    );


    for(const s of scripts){

        const src=s.src||"";

        if(/tradingview/i.test(src))
            REPORT.libraries.tradingView=true;

        if(/highcharts/i.test(src))
            REPORT.libraries.highcharts=true;

        if(/apexcharts/i.test(src))
            REPORT.libraries.apexcharts=true;

        if(/chart\.js/i.test(src))
            REPORT.libraries.chartjs=true;

        if(/lightweight.?charts/i.test(src))
            REPORT.libraries.lightweightCharts=true;

    }

}


/* =========================================================
   DOM INSPECTION
========================================================= */

function inspectDOM(){

    REPORT.dom.buttons=
        document.querySelectorAll(
            "button,[role='button'],.button,.btn"
        ).length;


    const buttons=Array.from(
        document.querySelectorAll(
            "button,[role='button'],.button,.btn"
        )
    );


    const words=[

        "up",
        "down",
        "call",
        "put",
        "buy",
        "sell"

    ];


    for(const b of buttons.slice(0,300)){

        const text=(
            b.innerText ||
            b.textContent ||
            ""
        ).trim();


        const cls=String(
            b.className||""
        );


        const combined=(
            text+" "+cls
        ).toLowerCase();


        if(
            words.some(w=>
                combined.includes(w)
            )
        ){

            REPORT.dom.tradeLikeButtons.push({

                text:text.slice(0,80),

                className:cls.slice(0,150),

                disabled:!!b.disabled,

                visible:!!(
                    b.offsetWidth ||
                    b.offsetHeight
                )

            });

        }

    }


    REPORT.dom.chartElements=
        document.querySelectorAll(
            "canvas,svg,iframe"
        ).length;


    const all=safe(
        ()=>Array.from(
            document.querySelectorAll("*")
        ),
        []
    );


    for(const el of all.slice(0,2000)){

        for(const attr of [
            "data-symbol",
            "data-pair",
            "data-asset",
            "data-ticker",
            "data-timeframe",
            "data-period",
            "data-interval",
            "data-resolution"
        ]){

            const v=el.getAttribute(attr);

            if(v){

                REPORT.dom.dataAttributes.push({

                    tag:el.tagName,

                    attr,

                    value:v

                });

            }

        }

    }

}


/* =========================================================
   CANDLE NORMALIZER
========================================================= */

function normalizeCandle(x){

    if(!x) return null;


    let t=null;
    let o=null;
    let h=null;
    let l=null;
    let c=null;


    /* object format */

    if(isObject(x) && !Array.isArray(x)){

        t=
            x.t ??
            x.time ??
            x.timestamp ??
            x.ts ??
            x.date ??
            x.datetime ??
            x.x;

        o=
            x.o ??
            x.open ??
            x.Open;

        h=
            x.h ??
            x.high ??
            x.High;

        l=
            x.l ??
            x.low ??
            x.Low;

        c=
            x.c ??
            x.close ??
            x.Close;

    }


    /* array format */

    if(Array.isArray(x)){

        if(x.length>=5){

            t=x[0];

            o=x[1];

            h=x[2];

            l=x[3];

            c=x[4];

        }

    }


    /* date string */

    if(
        typeof t==="string" &&
        !Number.isFinite(Number(t))
    ){

        const parsed=Date.parse(t);

        if(Number.isFinite(parsed)){

            t=parsed;

        }

    }


    t=num(t);

    o=num(o);

    h=num(h);

    l=num(l);

    c=num(c);


    /* seconds -> milliseconds */

    if(
        Number.isFinite(t) &&
        t<10000000000
    ){

        t*=1000;

    }


    if(
        !Number.isFinite(t) ||
        !Number.isFinite(o) ||
        !Number.isFinite(h) ||
        !Number.isFinite(l) ||
        !Number.isFinite(c)
    ){

        return null;

    }


    if(o<=0 || h<=0 || l<=0 || c<=0)
        return null;


    if(h<Math.max(o,c))
        return null;

    if(l>Math.min(o,c))
        return null;

    if(h<l)
        return null;


    return {

        t,
        o,
        h,
        l,
        c

    };

}


/* =========================================================
   ARRAY VALIDATION
========================================================= */

function validateArray(arr){

    if(!Array.isArray(arr))
        return null;


    if(
        arr.length<CFG.MIN_CANDLES ||
        arr.length>CFG.MAX_ARRAY_LENGTH
    )
        return null;


    REPORT.validation.arraysInspected++;


    const raw=arr.slice(
        -CFG.MAX_CANDLES_TO_INSPECT
    );


    const normalized=[];

    let invalid=0;

    let duplicates=0;

    const seen=new Set();


    for(const row of raw){

        const candle=
            normalizeCandle(row);


        if(!candle){

            invalid++;

            continue;

        }


        if(seen.has(candle.t)){

            duplicates++;

            continue;

        }


        seen.add(candle.t);

        normalized.push(candle);

    }


    normalized.sort(
        (a,b)=>a.t-b.t
    );


    if(
        normalized.length<
        CFG.MIN_CANDLES
    ){

        return null;

    }


    const now=Date.now();

    let future=0;

    for(const c of normalized){

        if(c.t>now+60000){

            future++;

        }

    }


    return {

        candles:normalized,

        rawLength:arr.length,

        validLength:normalized.length,

        invalid,

        duplicates,

        future,

        firstTimestamp:
            normalized[0].t,

        lastTimestamp:
            normalized[normalized.length-1].t,

        sample:
            normalized
                .slice(-3)

    };

}


/* =========================================================
   CANDIDATE RECORD
========================================================= */

function addCandidate(result,source){

    if(!result) return;


    const candidate={

        source,

        rawLength:
            result.rawLength,

        validLength:
            result.validLength,

        invalid:
            result.invalid,

        duplicates:
            result.duplicates,

        future:
            result.future,

        firstTimestamp:
            result.firstTimestamp,

        lastTimestamp:
            result.lastTimestamp,

        sample:
            result.sample

    };


    REPORT.candidates.push(candidate);

    REPORT.validation.arraysWithEnoughRows++;

    REPORT.validation.validCandleSets++;


    if(
        !REPORT.bestData ||
        candidate.validLength>
        REPORT.bestData.validLength
    ){

        REPORT.bestData={

            ...candidate,

            candles:result.candles

        };

    }

}


/* =========================================================
   DIRECT PUBLIC ARRAYS
========================================================= */

function inspectNamedPublicArrays(){

    for(
        const name of CFG.PUBLIC_STATE_NAMES
    ){

        if(isSensitiveKey(name))
            continue;


        const value=
            safe(()=>window[name]);


        if(!value)
            continue;


        if(Array.isArray(value)){

            const result=
                validateArray(value);


            if(result){

                addCandidate(
                    result,
                    "window."+name
                );

            }

            continue;

        }


        if(isObject(value)){

            inspectObject(
                value,
                name,
                0
            );

        }

    }

}


/* =========================================================
   RECURSIVE PUBLIC OBJECT INSPECTION
========================================================= */

function inspectObject(
    obj,
    path,
    depth
){

    if(
        !obj ||
        depth>CFG.MAX_OBJECT_DEPTH
    )
        return;


    if(Array.isArray(obj)){

        const result=
            validateArray(obj);


        if(result){

            addCandidate(
                result,
                path
            );

        }

        return;

    }


    if(
        typeof obj!=="object"
    )
        return;


    const keys=safe(
        ()=>Object.keys(obj),
        []
    ).slice(0,200);


    for(const key of keys){

        if(isSensitiveKey(key))
            continue;


        let value=
            safe(()=>obj[key]);


        if(value===null ||
           value===undefined)
            continue;


        const childPath=
            path+"."+key;


        if(Array.isArray(value)){

            const keyLooksRelevant=
                /candle|bar|quote|ohlc|kline|history|series|price|data/i
                .test(key);


            if(
                keyLooksRelevant ||
                value.length>=CFG.MIN_CANDLES
            ){

                const result=
                    validateArray(value);


                if(result){

                    addCandidate(
                        result,
                        childPath
                    );

                }

            }

        }


        if(
            value &&
            typeof value==="object" &&
            depth<CFG.MAX_OBJECT_DEPTH
        ){

            /*
             Only descend into objects whose key/path
             looks market/chart related.
            */

            if(
                /market|chart|candle|bar|quote|ohlc|kline|history|series|price|data|store|state/i
                .test(key)
            ){

                inspectObject(
                    value,
                    childPath,
                    depth+1
                );

            }

        }

    }

}


/* =========================================================
   HIGHCHARTS
========================================================= */

function inspectHighcharts(){

    const charts=
        safe(
            ()=>window.Highcharts?.charts,
            []
        );


    if(!Array.isArray(charts))
        return;


    charts.forEach(
        (chart,index)=>{

            if(!chart?.series)
                return;


            chart.series.forEach(
                (series,si)=>{

                    const data=
                        safe(
                            ()=>series.options?.data ||
                                series.data,
                            []
                        );


                    if(!Array.isArray(data))
                        return;


                    const converted=[];


                    for(const p of data){

                        if(
                            Array.isArray(p) &&
                            p.length>=5
                        ){

                            converted.push({

                                t:p[0],
                                o:p[1],
                                h:p[2],
                                l:p[3],
                                c:p[4]

                            });

                        }

                        else if(p?.options){

                            converted.push({

                                t:p.x,

                                o:p.options.open,

                                h:p.options.high,

                                l:p.options.low,

                                c:p.options.close

                            });

                        }

                    }


                    const result=
                        validateArray(
                            converted
                        );


                    if(result){

                        addCandidate(

                            result,

                            "Highcharts chart["+
                            index+
                            "].series["+
                            si+
                            "]"

                        );

                    }

                }
            );

        }
    );

}


/* =========================================================
   TRADINGVIEW
========================================================= */

function inspectTradingView(){

    const widget=
        safe(()=>window.tvWidget);


    if(!widget)
        return;


    const chart=
        safe(
            ()=>widget.activeChart?.()
        );


    if(!chart)
        return;


    const data=
        safe(
            ()=>chart.data?.(),
            null
        );


    if(Array.isArray(data)){

        const result=
            validateArray(data);


        if(result){

            addCandidate(
                result,
                "TradingView public widget"
            );

        }

    }

}


/* =========================================================
   WINDOW PUBLIC ARRAY DISCOVERY
========================================================= */

function inspectWindowArrays(){

    const keys=
        safe(
            ()=>Object.keys(window),
            []
        )
        .slice(
            0,
            CFG.MAX_WINDOW_KEYS
        );


    for(const key of keys){

        if(isSensitiveKey(key))
            continue;


        const value=
            safe(()=>window[key]);


        if(!Array.isArray(value))
            continue;


        if(
            value.length<
            CFG.MIN_CANDLES
        )
            continue;


        /*
        We only test arrays that look like
        public market/chart data by shape or name.
        */

        const nameLooksRelevant=
            /candle|bar|quote|ohlc|kline|history|series|price|chart|market|data/i
            .test(key);


        let shapeLooksRelevant=false;


        if(value.length){

            const sample=
                value[
                    Math.max(
                        0,
                        value.length-1
                    )
                ];


            if(
                Array.isArray(sample) &&
                sample.length>=5
            ){

                shapeLooksRelevant=true;

            }


            if(
                sample &&
                typeof sample==="object" &&
                (
                    "open" in sample ||
                    "o" in sample
                ) &&
                (
                    "close" in sample ||
                    "c" in sample
                )
            ){

                shapeLooksRelevant=true;

            }

        }


        if(
            !nameLooksRelevant &&
            !shapeLooksRelevant
        )
            continue;


        const result=
            validateArray(value);


        if(result){

            addCandidate(
                result,
                "window."+key
            );

        }

    }

}


/* =========================================================
   TIMESTAMP ANALYSIS
========================================================= */

function timestampInfo(){

    if(
        !REPORT.bestData
    )
        return null;


    const first=
        REPORT.bestData.firstTimestamp;

    const last=
        REPORT.bestData.lastTimestamp;


    const now=Date.now();


    return {

        firstISO:
            new Date(first).toISOString(),

        lastISO:
            new Date(last).toISOString(),

        ageSeconds:
            Math.round(
                (now-last)/1000
            ),

        intervalSeconds:
            REPORT.bestData.candles.length>=2
            ?
            Math.round(
                (
                    REPORT.bestData
                        .candles
                        .at(-1)
                        .t
                    -
                    REPORT.bestData
                        .candles
                        .at(-2)
                        .t
                )/1000
            )
            :
            null

    };

}


/* =========================================================
   CANDLE SHAPE SAMPLE
========================================================= */

function candleSummary(){

    if(!REPORT.bestData)
        return null;


    return {

        source:
            REPORT.bestData.source,

        count:
            REPORT.bestData.validLength,

        first:
            REPORT.bestData.candles[0],

        last:
            REPORT.bestData.candles.at(-1),

        previous:
            REPORT.bestData.candles.at(-2) ||
            null

    };

}


/* =========================================================
   FINAL ANALYSIS
========================================================= */

function analyzeResult(){

    if(
        REPORT.bestData
    ){

        REPORT.conclusion=
            "DATA FOUND: PUBLIC OHLC CANDLE DATA WAS DETECTED.";

        return;

    }


    if(
        REPORT.libraries.highcharts ||
        REPORT.libraries.tradingView
    ){

        REPORT.conclusion=
            "CHART LIBRARY DETECTED, BUT VALID PUBLIC OHLC DATA WAS NOT EXPOSED THROUGH THE TESTED INTERFACES.";

        return;

    }


    REPORT.conclusion=
        "NO VALID PUBLIC OHLC CANDLE ARRAY WAS DETECTED.";

}


/* =========================================================
   RUN ALL TESTS
========================================================= */

function runDiagnostic(){

    /*
    Clear old results
    */

    REPORT.candidates=[];

    REPORT.bestData=null;

    REPORT.validation={

        arraysInspected:0,

        arraysWithEnoughRows:0,

        validCandleSets:0

    };


    detectSymbol();

    detectTimeframe();

    detectLibraries();

    inspectDOM();

    inspectTradingView();

    inspectHighcharts();

    inspectNamedPublicArrays();

    inspectWindowArrays();

    analyzeResult();

}


/* =========================================================
   UI
========================================================= */

const root=document.createElement("div");

root.id="MANGO_DIAGNOSTIC_ROOT";


root.style.cssText=`

position:fixed;

top:20px;

right:20px;

width:380px;

max-width:calc(100vw - 30px);

max-height:90vh;

overflow:auto;

background:#0b0f14;

color:#e9f2ff;

z-index:2147483647;

border:2px solid #19ff88;

border-radius:12px;

box-shadow:
0 0 25px rgba(0,255,130,.35);

font-family:
Arial,
sans-serif;

font-size:12px;

padding:14px;

box-sizing:border-box;

`;



function esc(v){

    return String(
        v===undefined||
        v===null
        ?""
        :v
    )
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");

}


function render(){

    const ts=
        timestampInfo();


    const best=
        candleSummary();


    const lib=REPORT.libraries;


    let html="";


    html+=`

<h2 style="
margin:0 0 8px;
color:#19ff88;
">
MANGO DATA DIAGNOSTIC
</h2>

<div style="
color:#aaa;
margin-bottom:12px;
">
NO TRADING • NO RANDOM SIGNAL • DATA TEST ONLY
</div>


<div style="
padding:10px;
background:#111923;
border-radius:8px;
margin-bottom:10px;
">

<b>CONCLUSION</b>

<div style="
margin-top:6px;
color:#fff;
">

${esc(REPORT.conclusion)}

</div>

</div>


<div style="
padding:10px;
background:#111923;
border-radius:8px;
margin-bottom:10px;
">

<b>PAGE</b>

<div>Host:
${esc(REPORT.page.host)}
</div>

<div>Ready:
${esc(REPORT.page.readyState)}
</div>

<div>URL:
${esc(REPORT.page.url)}
</div>

</div>


<div style="
padding:10px;
background:#111923;
border-radius:8px;
margin-bottom:10px;
">

<b>IDENTIFICATION</b>

<div>SYMBOL:
<strong>
${esc(REPORT.symbol.value)}
</strong>
</div>

<div>TIMEFRAME:
<strong>
${esc(REPORT.timeframe.value)}
</strong>
</div>

</div>


<div style="
padding:10px;
background:#111923;
border-radius:8px;
margin-bottom:10px;
">

<b>CHART LIBRARIES</b>

<div>
TradingView:
${lib.tradingView?"YES":"NO"}
</div>

<div>
Highcharts:
${lib.highcharts?"YES":"NO"}
</div>

<div>
ApexCharts:
${lib.apexcharts?"YES":"NO"}
</div>

<div>
Chart.js:
${lib.chartjs?"YES":"NO"}
</div>

<div>
Lightweight Charts:
${lib.lightweightCharts?"YES":"NO"}
</div>

</div>


<div style="
padding:10px;
background:#111923;
border-radius:8px;
margin-bottom:10px;
">

<b>DOM</b>

<div>
Buttons:
${REPORT.dom.buttons}
</div>

<div>
Chart elements:
${REPORT.dom.chartElements}
</div>

<div>
Trade-like buttons found:
${REPORT.dom.tradeLikeButtons.length}
</div>

<div>
Data attributes found:
${REPORT.dom.dataAttributes.length}
</div>

</div>


<div style="
padding:10px;
background:#111923;
border-radius:8px;
margin-bottom:10px;
">

<b>DISCOVERY</b>

<div>
Arrays inspected:
${REPORT.validation.arraysInspected}
</div>

<div>
Candidate arrays:
${REPORT.validation.arraysWithEnoughRows}
</div>

<div>
Valid candle sets:
${REPORT.validation.validCandleSets}
</div>

</div>
`;


    if(best){

        html+=`

<div style="
padding:10px;
background:#102018;
border-radius:8px;
margin-bottom:10px;
border:1px solid #19ff88;
">

<b style="color:#19ff88">
BEST DATA SOURCE
</b>

<div>
Source:
${esc(best.source)}
</div>

<div>
Candles:
<strong>
${best.count}
</strong>
</div>

<div>
Invalid:
${REPORT.bestData.invalid}
</div>

<div>
Duplicates:
${REPORT.bestData.duplicates}
</div>

<div>
Future timestamps:
${REPORT.bestData.future}
</div>

</div>
`;

    }


    if(ts){

        html+=`

<div style="
padding:10px;
background:#111923;
border-radius:8px;
margin-bottom:10px;
">

<b>TIMESTAMP ANALYSIS</b>

<div>
First:
${esc(ts.firstISO)}
</div>

<div>
Last:
${esc(ts.lastISO)}
</div>

<div>
Age:
${ts.ageSeconds}s
</div>

<div>
Last interval:
${ts.intervalSeconds}s
</div>

</div>
`;

    }


    html+=`

<div style="
padding:10px;
background:#111923;
border-radius:8px;
margin-bottom:10px;
">

<b>DATA CANDIDATES</b>

`;



    if(!REPORT.candidates.length){

        html+=`
<div style="color:#ffcc00">
No valid OHLC candidate found.
</div>
`;

    }


    REPORT.candidates
        .slice(0,30)
        .forEach((c,i)=>{

            html+=`

<div style="
margin-top:7px;
padding:7px;
background:#0b1118;
border-radius:6px;
">

<b>#${i+1}</b>

<div>
${esc(c.source)}
</div>

<div>
Raw: ${c.rawLength}
|
Valid: ${c.validLength}
</div>

<div>
Invalid: ${c.invalid}
|
Duplicates: ${c.duplicates}
|
Future: ${c.future}
</div>

</div>

`;

        });


    html+=`</div>`;


    if(best){

        html+=`

<div style="
padding:10px;
background:#111923;
border-radius:8px;
margin-bottom:10px;
">

<b>LAST CANDLES</b>

<pre style="
white-space:pre-wrap;
word-break:break-word;
font-size:11px;
color:#9ee7ff;
">${esc(
JSON.stringify(
best.last,
null,
2
)
)}</pre>

</div>
`;

    }


    html+=`

<div style="
display:flex;
gap:7px;
position:sticky;
bottom:0;
background:#0b0f14;
padding-top:8px;
">

<button id="MANGO_DIAG_RESCAN"
style="
flex:1;
padding:10px;
border:0;
border-radius:7px;
background:#19ff88;
color:#00150a;
font-weight:bold;
cursor:pointer;
touch-action:manipulation;
">
RESCAN
</button>

<button id="MANGO_DIAG_COPY"
style="
flex:1;
padding:10px;
border:0;
border-radius:7px;
background:#fff;
color:#111;
font-weight:bold;
cursor:pointer;
touch-action:manipulation;
">
COPY REPORT
</button>

<button id="MANGO_DIAG_CLOSE"
style="
padding:10px;
border:0;
border-radius:7px;
background:#333;
color:#fff;
font-weight:bold;
cursor:pointer;
touch-action:manipulation;
">
X
</button>

</div>
`;


    root.innerHTML=html;


    const rescan=
        root.querySelector(
            "#MANGO_DIAG_RESCAN"
        );


    const copy=
        root.querySelector(
            "#MANGO_DIAG_COPY"
        );


    const close=
        root.querySelector(
            "#MANGO_DIAG_CLOSE"
        );


    if(rescan){

        rescan.onclick=function(e){

            e.preventDefault();

            e.stopPropagation();

            runDiagnostic();

            render();

        };

    }


    if(copy){

        copy.onclick=function(e){

            e.preventDefault();

            e.stopPropagation();


            const text=
                JSON.stringify(
                    REPORT,
                    function(key,value){

                        if(key==="candles")
                            return undefined;

                        return value;

                    },
                    2
                );


            safe(
                ()=>navigator.clipboard
                    .writeText(text)
            );


            copy.textContent=
                "COPIED";

            setTimeout(
                ()=>copy.textContent=
                    "COPY REPORT",
                1200
            );

        };

    }


    if(close){

        close.onclick=function(e){

            e.preventDefault();

            e.stopPropagation();

            root.remove();

        };

    }

}


/* =========================================================
   START
========================================================= */

document.body.appendChild(root);

runDiagnostic();

render();


/*
============================================================
 IMPORTANT:

 This diagnostic deliberately DOES NOT:

 - click UP
 - click DOWN
 - click CALL
 - click PUT
 - place trades
 - generate random signals
 - fabricate candles
 - intercept private WebSockets
 - bypass authentication
 - bypass CORS
 - read passwords/tokens/cookies

 Its only purpose is to identify whether legitimate
 public OHLC/candle data is available to JavaScript.
============================================================
*/

})();
