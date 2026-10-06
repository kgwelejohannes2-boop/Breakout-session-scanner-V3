# breakout-session-scanner-v3

Mobile-first Node/Express trading analyzer using Twelve Data.

## Strategy
- Draws Asian session high/low (00:00–08:00 UTC)
- Draws London session high/low (08:00–16:00 UTC)
- Draws New York session high/low (13:30–21:00 UTC)
- BUY when a 15-minute candle closes above Asian resistance
- SELL when a 15-minute candle closes below Asian support
- Forex: TP1 5 pips, SL 2 pips
- Metals/indices: TP1 20 points, SL 10 points
- Supports Forex, XAU/XAG and common index aliases (availability/naming depends on Twelve Data plan)

## Run
1. `npm install`
2. Set `TWELVE_DATA_API_KEY` in `.env` or Render Environment.
3. `npm start`

## Next planned module
Economic-calendar/session-quality filter. This needs a suitable economic-calendar data source/entitlement and is intentionally not faked in V2.

Keep API keys server-side. Trading signals are rules-based decision support, not guaranteed outcomes.


## V2 economic/session quality
V2 ranks Asian, London and New York for the selected instrument. It always uses an instrument/session profile. For live economic-event weighting, add `TRADING_ECONOMICS_API_KEY` to your environment. Medium/high-impact relevant events are shown in the scanner and increase the rating of the session in which they occur. The Twelve Data key remains `TWELVE_DATA_API_KEY`.
