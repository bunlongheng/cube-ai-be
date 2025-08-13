// routes/chat.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

async function getChatToken({ apiKey, chatUrl, externalId = "user@example.com", userAttributes = [] }) {
    const origin = new URL(chatUrl).origin;

    // 1) generate session
    const s = await fetch(`${origin}/api/v1/embed/generate-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${apiKey}` },
        body: JSON.stringify({ externalId, userAttributes }),
    });
    if (!s.ok) throw new Error(`generate-session ${s.status}: ${await s.text()}`);
    const { sessionId } = await s.json();
    if (!sessionId) throw new Error("Missing sessionId");

    // 2) exchange for token
    const t = await fetch(`${origin}/api/v1/embed/session/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${apiKey}` },
        body: JSON.stringify({ sessionId }),
    });
    if (!t.ok) throw new Error(`session/token ${t.status}: ${await t.text()}`);
    const { token } = await t.json();
    if (!token) throw new Error("Missing token");
    return token;
}

/**
 * POST /chat
 * Body: { message: string, stream?: boolean, externalId?: string, userAttributes?: Array<{name,value}>, chatId?: string }
 */
router.post("/", async (req, res) => {
    try {
        const { message, stream, externalId, userAttributes, chatId } = req.body || {};
        if (!message || typeof message !== "string") return res.status(400).json({ error: "message is required" });

        const { CUBE_API_KEY, CUBE_API_URL } = process.env;
        if (!CUBE_API_KEY || !CUBE_API_URL) return res.status(500).json({ error: "CUBE_API_KEY and CUBE_API_URL are required" });

        const token = await getChatToken({
            apiKey: CUBE_API_KEY,
            chatUrl: CUBE_API_URL,
            externalId,
            userAttributes,
        });

        const payload = { chatId: chatId || crypto.randomUUID(), input: message };
        const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

        // stream mode
        if (stream === true || stream === "true") {
            const upstream = await fetch(CUBE_API_URL, {
                method: "POST",
                headers: { ...headers, Accept: "text/event-stream" },
                body: JSON.stringify(payload),
            });
            if (!upstream.ok || !upstream.body) return res.status(upstream.status).send(await upstream.text());

            res.status(200);
            res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const reader = upstream.body.getReader();
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                res.write(Buffer.from(value));
            }
            return res.end();
        }

        // non-stream: collect NDJSON and return last assistant chunk
        const chatRes = await fetch(CUBE_API_URL, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });
        if (!chatRes.ok || !chatRes.body) return res.status(chatRes.status).send(await chatRes.text());

        const reader = chatRes.body.getReader();
        const chunks = [];
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(Buffer.from(value));
        }
        const text = Buffer.concat(chunks).toString("utf8");
        let last = null;
        for (const line of text.split("\n")) {
            const s = line.trim();
            if (!s) continue;
            try {
                const obj = JSON.parse(s);
                if (obj.role === "assistant" && typeof obj.content === "string") last = obj.content;
            } catch {}
        }
        return res.json(last ? { content: last } : { stream: text });
    } catch (e) {
        return res.status(502).json({ error: e.message });
    }
});

module.exports = router;
