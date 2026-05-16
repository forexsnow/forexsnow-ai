ForexSnow Live 5 Minute AI Dashboard

What this package does:
1. Runs a Node backend.
2. Refreshes forex rankings every 5 minutes.
3. Pulls public FX reference data.
4. Uses live market pricing, last-known market pricing, momentum, and Confidence Evolution scoring to create AI assisted forex plays.
5. Creates top bullish and bearish plays, last price, stop loss, take profit exit, get out point, confidence, and market status.
6. Keeps a cached memory history for learning and outcome tracking.
7. Uses last known market prices when live data is delayed instead of generating fake fallback prices.
8. Tracks historical plays, OPEN / WIN / LOSS status, and performance analytics.

Important:
Your current DreamHost plan is shared hosting.
Shared hosting is good for the public website, but not ideal for this Node backend.

Recommended setup:
1. Keep forexsnow.com frontend on DreamHost.
2. Deploy this full backend package on Railway, Render, or a DreamHost VPS.
3. Point api.forexsnow.com to the backend later.
4. Update the frontend API base when the backend is live.

Local test:
1. Install Node.js.
2. Open this folder in terminal.
3. Run npm install.
4. Run npm start.
5. Open http://localhost:3000

Railway / Render setup:
1. Create a new Web Service.
2. Upload or connect this folder.
3. Build command: npm install
4. Start command: npm start
5. Add environment variables later if needed.

Files:
server.js
package.json
trade-history.json
index.html
style.css
app.js

Risk notice:
ForexSnow is informational only. It is not financial advice.
Always manage risk responsibly.
