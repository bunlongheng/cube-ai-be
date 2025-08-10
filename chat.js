require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");

const router = express.Router();

router.post("/chat", async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Missing query" });

    const token = jwt.sign(
        {
            iss: process.env.CUBE_JWT_ISS,
            aud: process.env.CUBE_JWT_AUD,
            exp: Math.floor(Date.now() / 1000) + 60 * 60,
        },
        process.env.CUBEJS_API_SECRET
    );

    try {
        const apiRes = await fetch(process.env.CUBE_CHAT_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: query }],
                model: "gpt-4",
            }),
        });

        if (!apiRes.ok) {
            const errorBody = await apiRes.json().catch(() => null);
            throw new Error(errorBody?.error || apiRes.statusText);
        }

        const body = await apiRes.json();
        res.json(body);
    } catch (err) {
        console.error("Cube API error:", err.message);
        res.status(500).json({ error: "Cube Chat API request failed" });
    }
});

module.exports = router;
