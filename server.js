import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>ForexSnow AI</title>
        <style>
          body {
            font-family: Arial;
            background: #0f172a;
            color: white;
            padding: 40px;
          }
          h1 {
            color: #38bdf8;
          }
          .card {
            background: #1e293b;
            padding: 20px;
            border-radius: 12px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <h1>ForexSnow AI Backend Live</h1>
        <div class="card">
          Railway deployment is working successfully.
        </div>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ForexSnow AI backend"
  });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
