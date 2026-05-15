ForexSnow Live 8 Minute AI Dashboard

What this package does:
1. Runs a Node backend.
2. Refreshes forex rankings every 8 minutes.
3. Pulls public FX reference data.
4. Uses market theme inputs and scoring logic to create AI assisted trade setups.
5. Creates top pick, entry zone, stop loss, take profit exit, get out point, and warnings.
6. Keeps a cached snapshot visible if a live source fails.

Important:
Your current DreamHost plan is shared hosting.
Shared hosting is good for the public website, but not ideal for this Node backend.

Recommended setup:
1. Keep forexsnow.com frontend on DreamHost.
2. Deploy this full package on Render, Railway, or a DreamHost VPS.
3. Point api.forexsnow.com to the backend later.
4. Update the frontend API base when the backend is live.

Local test:
1. Install Node.js.
2. Open this folder in terminal.
3. Run npm install.
4. Run npm start.
5. Open http://localhost:3000

Render setup:
1. Create a new Web Service.
2. Upload or connect this folder.
3. Build command: npm install
4. Start command: npm start
5. Add environment variables later if needed.

Files:
server.js
package.json
.env.example
public/index.html
public/style.css
public/app.js

Risk notice:
ForexSnow is informational only. It is not financial advice.
