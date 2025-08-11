// routes/chat.js
const express = require("express");
const jwt = require("jsonwebtoken");
const logger = require("../logger");

const router = express.Router();

/**
 * POST /chat
 * Body: { message: string, externalId?: string, userAttributes?: Array<{name,value}>, stream?: boolean }
 */
router.post("/", async (req, res) => {
    try {
        const { message, externalId, userAttributes, stream } = req.body || {};
        if (!message || typeof message !== "string") {
            return res.status(400).json({ error: "message is required" });
        }

        // 1) Sign JWT with your secret
        const now = Math.floor(Date.now() / 1000);
        const token = jwt.sign(
            {
                iss: process.env.CUBE_JWT_ISS,
                aud: process.env.CUBE_JWT_AUD,
                iat: now,
                exp: now + 300,
            },
            process.env.CUBEJS_API_SECRET
        );

        // 2) Create session (private embed API)
        const sessionUrl = `${process.env.CUBE_API_URL}/api/v1/embed/generate-session`;
        const sessionPayload = {
            externalId: externalId || "user@example.com",
            userAttributes: userAttributes || [],
        };

        logger.debug("Payload to Cube Session API", {
            url: sessionUrl,
            headers: { "Content-Type": "application/json", Authorization: "Bearer ****" },
            body: sessionPayload,
        });

        const sessionRes = await fetch(sessionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(sessionPayload),
        });

        if (!sessionRes.ok) {
            const text = await sessionRes.text(); // read once
            logger.error("Cube Session API Error", { status: sessionRes.status, text });
            return res.status(sessionRes.status).send(text);
        }

        const { sessionId } = await sessionRes.json();
        if (!sessionId) {
            logger.error("Cube Session API Error - missing sessionId");
            return res.status(502).json({ error: "Missing sessionId from Cube" });
        }
        logger.success("Cube session created", { sessionId: "***" });

        // 3) Call public chat stream endpoint with sessionId
        const chatUrl = process.env.CUBE_CHAT_URL;
        const chatPayload = { message };

        logger.debug("Payload to Cube Chat API", {
            url: chatUrl,
            headers: { "Content-Type": "application/json", Authorization: "Bearer ****" },
            body: chatPayload,
        });

        // Stream mode
        if (stream === true || stream === "true") {
            const upstream = await fetch(chatUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${sessionId}`,
                },
                body: JSON.stringify(chatPayload),
            });

            if (!upstream.ok || !upstream.body) {
                const text = await upstream.text();
                logger.error("Cube Chat API Error", { status: upstream.status, text });
                return res.status(upstream.status).send(text);
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
            } catch (e) {
                logger.error("Stream proxy error", { error: e.message });
            } finally {
                res.end();
            }
            return;
        }

        // Non-stream mode
        const chatRes = await fetch(chatUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionId}`,
            },
            body: JSON.stringify(chatPayload),
        });

        if (!chatRes.ok) {
            const text = await chatRes.text();
            logger.error("Cube Chat API Error", { status: chatRes.status, text });
            return res.status(chatRes.status).send(text);
        }

        const data = await chatRes.json();
        return res.json(data);
    } catch (err) {
        logger.error("Unexpected error in /chat route", { error: err.message });
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
