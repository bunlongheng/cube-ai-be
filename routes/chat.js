// routes/chat.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

function getSessionBase() {
    return (process.env.CUBE_SESSION_BASE || "https://thryv.cubecloud.dev").replace(/\/+$/, "");
}

const mask = s => (typeof s === "string" && s.length > 12 ? s.slice(0, 4) + "****" + s.slice(-4) : "****");

async function getChatToken({ apiKey, externalId = "user@example.com", userAttributes = [] }) {
    const base = getSessionBase();

    const s = await fetch(`${base}/api/v1/embed/generate-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${apiKey}` },
        body: JSON.stringify({ externalId, userAttributes }),
    });
    if (!s.ok) throw new Error(`generate-session ${s.status}: ${await s.text()}`);
    const { sessionId } = await s.json();
    if (!sessionId) throw new Error("Missing sessionId");

    const t = await fetch(`${base}/api/v1/embed/session/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${apiKey}` },
        body: JSON.stringify({ sessionId }),
    });
    if (!t.ok) throw new Error(`session/token ${t.status}: ${await t.text()}`);
    const { token } = await t.json();
    if (!token) throw new Error("Missing token");

    return { token, sessionId, base };
}

/**
 * POST /chat
 * Body: {
 *   message: string,
 *   stream?: boolean,
 *   debug?: boolean,
 *   externalId?: string,
 *   userAttributes?: Array<{name,value}>,
 *   chatId?: string
 * }
 */
router.post("/", async (req, res) => {
    try {
        const { message, stream, debug, externalId, userAttributes, chatId } = req.body || {};
        if (!message || typeof message !== "string") return res.status(400).json({ error: "message is required" });

        const { CUBE_API_KEY, CUBE_API_URL } = process.env;
        if (!CUBE_API_KEY || !CUBE_API_URL) {
            return res.status(500).json({ error: "CUBE_API_KEY and CUBE_API_URL are required" });
        }

        const debugFlag = debug === true || debug === "true" || req.query.debug === "true" || String(req.headers["x-debug"] || "").toLowerCase() === "true";

        // 1) token
        const { token, sessionId, base } = await getChatToken({
            apiKey: CUBE_API_KEY,
            externalId: externalId || req.headers["x-user-email"] || "user@example.com",
            userAttributes: Array.isArray(userAttributes) ? userAttributes : [],
        });

        const payload = { chatId: chatId || crypto.randomUUID(), input: message };

        // 2A) Debug mode - return structured JSON (non-stream)
        if (debugFlag) {
            const start = Date.now();
            const chatRes = await fetch(CUBE_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const raw = await chatRes.text();
            const ct = chatRes.headers.get("content-type") || "text/plain";
            let last = null;
            for (const line of raw.split("\n")) {
                const s = line.trim();
                if (!s) continue;
                try {
                    const obj = JSON.parse(s);
                    if (obj.role === "assistant" && typeof obj.content === "string") last = obj.content;
                } catch {}
            }
            return res.status(200).json({
                fe: { sent: { message, externalId: externalId || "user@example.com" } },
                be: {
                    sentToCube: {
                        urls: {
                            generateSession: `${base}/api/v1/embed/generate-session`,
                            sessionToken: `${base}/api/v1/embed/session/token`,
                            chat: CUBE_API_URL,
                        },
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${mask(token)}`,
                        },
                        body: payload,
                    },
                    meta: { sessionId, elapsedMs: Date.now() - start },
                },
                cube: {
                    status: chatRes.status,
                    contentType: ct,
                    raw, // NDJSON string
                },
                assistant: last,
            });
        }

        // 2B) Stream mode - default behavior, proxy SSE to FE
        const upstream = await fetch(CUBE_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });

        if (!upstream.ok || !upstream.body) {
            const txt = await upstream.text();
            return res.status(upstream.status).json({ error: txt || "Chat upstream error" });
        }

        res.status(200);
        res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = upstream.body.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                res.write(Buffer.from(value));
            }
        } finally {
            res.end();
        }
    } catch (e) {
        return res.status(502).json({ error: e.message });
    }
});

module.exports = router;
