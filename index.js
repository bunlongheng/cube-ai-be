require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const logger = require("./logger");

const app = express();
app.use(cors());
app.use(express.json());

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// mount Cube REST route
app.use("/cube", require("./routes/cube"));

// static homepage (optional)
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    logger.info(`API listening on http://localhost:${PORT}`);
});
