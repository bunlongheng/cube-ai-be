require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const logger = require("./logger");

const app = express();
app.use(cors());
app.use(express.json());

// request/response logger middleware
app.use((req, res, next) => {
    const start = Date.now();

    // redact sensitive fields in logs
    const redact = obj => {
        if (!obj || typeof obj !== "object") return obj;
        const clone = { ...obj };
        for (const key of Object.keys(clone)) {
            if (/(password|token|secret|apikey)/i.test(key)) {
                clone[key] = "[REDACTED]";
            }
        }
        return clone;
    };

    const requestData = {
        method: req.method,
        url: req.originalUrl,
        body: redact(req.body),
        query: redact(req.query),
        params: redact(req.params),
    };

    logger.info(`Incoming request: ${req.method} ${req.originalUrl}`, requestData);

    // capture and log response body
    const originalSend = res.send;
    res.send = function (body) {
        logger.debug(`Response for ${req.method} ${req.originalUrl}`, {
            statusCode: res.statusCode,
            body,
        });
        return originalSend.call(this, body);
    };

    res.on("finish", () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    });

    next();
});

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
