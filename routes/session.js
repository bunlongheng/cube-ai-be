// routes/session.js
const express = require("express");
const router = express.Router();

const SESSION_URL = "https://thryv.cubecloud.dev/api/v1/embed/generate-session";

router.get("/session", async (req, res) => {
    try {
        const key = process.env.CUBE_API_KEY;
        if (!key) return res.status(500).json({ error: "CUBE_API_KEY is required" });

        const r = await fetch(SESSION_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Api-Key ${key}` },
            body: JSON.stringify({ externalId: "user@example.com", userAttributes: [] }),
        });

        const text = await r.text();
        res.status(r.status)
            .type(r.headers.get("content-type") || "application/json")
            .send(text);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
