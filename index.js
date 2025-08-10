require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const logger = require("./logger");

const app = express();
app.use(cors());
app.use(express.json());

// health stays
app.get("/health", (_req, res) => res.json({ ok: true }));

// new chat route
app.use("/chat", require("./routes/chat"));

// static homepage (optional)
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    logger.info(`API listening on http://localhost:${PORT}`);
});
