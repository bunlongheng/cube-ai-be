require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const logger = require("./logger");

const app = express();
app.use(cors());
app.use(express.json());

// Request/Response logging middleware
app.use((req, res, next) => {
    const start = Date.now();

    const redact = o => {
        if (!o || typeof o !== "object") return o;
        const c = { ...o };
        for (const k of Object.keys(c)) if (/(password|token|secret|apikey)/i.test(k)) c[k] = "[REDACTED]";
        return c;
    };

    const originalSend = res.send;
    res.send = function (body) {
        logger.debug(`Response for ${req.method} ${req.originalUrl}`, { statusCode: res.statusCode, body });
        return originalSend.call(this, body);
    };

    res.on("finish", () => {
        const ms = Date.now() - start;
        const line = `${req.method} ${req.originalUrl} ${res.statusCode} - ${ms}ms`;
        const meta = { body: redact(req.body), query: req.query, params: req.params };
        if (res.statusCode >= 400) logger.error(line, meta);
        else logger.success(line, meta);
    });

    next();
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Chat route
app.use("/chat", require("./routes/chat"));

// Static homepage (optional)
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    logger.info(`API listening on http://localhost:${PORT}`);
});
