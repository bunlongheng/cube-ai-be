// routes/cube.js
const express = require("express");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const logger = require("../logger");

const router = express.Router();

const REST_BASE = (process.env.CUBE_REST_URL || "").trim().replace(/\/+$/, "");
const SECRET = (process.env.CUBEJS_API_SECRET || "").trim();
const LOG_LIMIT = Number(process.env.LOG_BODY_LIMIT || 4000);

const isAbs = u => {
    try {
        new URL(u);
        return true;
    } catch {
        return false;
    }
};
const truncate = (s, max) => (typeof s === "string" && s.length > max ? s.slice(0, max) + `\n...[truncated ${s.length - max} bytes]` : s);
const safeStringify = v => {
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
};
const preview = v => {
    const s = typeof v === "string" ? v : safeStringify(v);
    const one = s.replace(/\s+/g, " ").trim();
    return one.length > 800 ? one.slice(0, 800) + " …" : one;
};

router.post("/load", async (req, res) => {
    const rid = req.headers["x-request-id"]?.toString() || randomUUID();
    const incoming = req.body;

    // Normalize payload
    const queryPayload = incoming?.query != null ? { query: incoming.query } : Array.isArray(incoming) ? incoming : typeof incoming === "object" ? { query: incoming } : null;

    logger.box(`FE -> BE (REST) payload [${rid}]`, { bodyPreview: preview(incoming) });

    if (!queryPayload) return res.status(400).json({ error: "Body must be a Cube query: { query: {...} } or an array" });
    if (!isAbs(REST_BASE)) return res.status(500).json({ error: "CUBE_REST_URL missing or not absolute" });
    if (!SECRET) return res.status(500).json({ error: "CUBEJS_API_SECRET missing" });

    // 5 minute HS256 token (raw JWT, no Bearer)
    const token = jwt.sign({ exp: Math.floor(Date.now() / 1000) + 5 * 60 }, SECRET, { algorithm: "HS256" });
    const url = `${REST_BASE}/load`;

    logger.box(`BE -> Cube REST request [${rid}]`, {
        url,
        method: "POST",
        headers: { Authorization: "***jwt***", "Content-Type": "application/json" },
        bodyPreview: preview(queryPayload),
    });

    try {
        const r = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: token, // Cube REST expects the raw JWT
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-Request-Id": rid,
            },
            body: JSON.stringify(queryPayload),
        });

        const ct = r.headers.get("content-type") || "";
        const text = await r.text();
        const truncated = truncate(text, LOG_LIMIT);

        logger.box(`Cube REST -> BE response [${rid}]`, {
            status: r.status,
            ok: r.ok,
            contentType: ct,
            bodyPreview: preview(truncated),
        });

        // Return parsed JSON if possible
        let json;
        try {
            json = JSON.parse(text);
        } catch {}
        return res.status(r.ok ? 200 : r.status).json(json ?? { raw: truncated, contentType: ct });
    } catch (e) {
        logger.box(`Cube REST call error [${rid}]`, { error: String(e?.message || e) });
        return res.status(500).json({ error: e?.message || String(e) });
    }
});

module.exports = router;
