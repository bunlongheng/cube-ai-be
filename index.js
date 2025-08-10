require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// middlewares
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// routes
app.use("/chat", require("./routes/chat"));

// static homepage
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// 404 json for api paths
app.use((req, res, next) => {
    if (req.path.startsWith("/chat")) return res.status(404).json({ error: "Not found" });
    next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🟢 Cube AI Backend is live on http://localhost:${PORT}`));
