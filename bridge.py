import asyncio
import logging
import os
from aiohttp import web
from pyquotex.stable_api import Quotex

logging.basicConfig(level=logging.INFO)

ASSET = os.getenv("QUOTEX_ASSET", "USDCAD")
PERIOD = int(os.getenv("QUOTEX_PERIOD", "60"))

EMAIL = os.getenv("QUOTEX_EMAIL")
PASSWORD = os.getenv("QUOTEX_PASSWORD")

HOST = "127.0.0.1"
PORT = 8765

candles = {}


def normalize_candle(c):
    if not isinstance(c, dict):
        return None

    try:
        t = int(c.get("time", c.get("timestamp", c.get("from"))))
        o = float(c.get("open"))
        h = float(c.get("high"))
        l = float(c.get("low"))
        cl = float(c.get("close"))

        if not (l <= o <= h and l <= cl <= h):
            return None

        return {
            "time": t,
            "open": o,
            "high": h,
            "low": l,
            "close": cl
        }
    except Exception:
        return None


def add_candles(data):
    if not isinstance(data, dict):
        return

    for value in data.values():
        c = normalize_candle(value)

        if c:
            candles[c["time"]] = c


async def load_history(client):
    logging.info("Loading historical candles...")

    data = await client.get_historical_candles(
        asset=ASSET,
        amount_of_seconds=PERIOD * 200,
        period=PERIOD,
        max_workers=2
    )

    if isinstance(data, dict):
        add_candles(data)

    logging.info("Historical candles loaded: %s", len(candles))


async def realtime_loop(client):
    logging.info("Starting realtime candle stream...")

    await client.start_candles_stream(ASSET, PERIOD)

    while True:
        try:
            data = await client.get_realtime_candles(ASSET)

            if isinstance(data, dict):
                add_candles(data)

            await asyncio.sleep(1)

        except Exception as e:
            logging.warning("Realtime error: %s", e)
            await asyncio.sleep(3)


async def root(request):
    return web.json_response({
        "ok": True,
        "service": "MANGO Bridge",
        "asset": ASSET,
        "period": PERIOD
    })


async def status(request):
    return web.json_response({
        "ok": True,
        "asset": ASSET,
        "period": PERIOD,
        "candle_count": len(candles)
    })


async def candles_api(request):
    data = sorted(
        candles.values(),
        key=lambda x: x["time"]
    )

    return web.json_response(data[-500:])


async def health(request):
    return web.json_response({
        "ok": True,
        "candle_count": len(candles)
    })


async def main():
    if not EMAIL or not PASSWORD:
        raise RuntimeError(
            "QUOTEX_EMAIL and QUOTEX_PASSWORD are not configured."
        )

    client = Quotex(
        email=EMAIL,
        password=PASSWORD,
        asset_default=ASSET,
        period_default=PERIOD
    )

    ok, reason = await client.connect()

    if not ok:
        raise RuntimeError(
            f"Quotex connection failed: {reason}"
        )

    logging.info("Quotex connected.")

    await load_history(client)

    if len(candles) < 50:
        logging.warning(
            "Not enough candle data: %s",
            len(candles)
        )

    app = web.Application()

    app.router.add_get("/", root)
    app.router.add_get("/status", status)
    app.router.add_get("/candles", candles_api)
    app.router.add_get("/health", health)

    runner = web.AppRunner(app)
    await runner.setup()

    site = web.TCPSite(
        runner,
        HOST,
        PORT
    )

    await site.start()

    logging.info(
        "MANGO Bridge running at http://%s:%s",
        HOST,
        PORT
    )

    try:
        await realtime_loop(client)

    finally:
        await client.close()
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
