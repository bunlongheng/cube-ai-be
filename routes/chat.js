// routes/chat.js
const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const { message, externalId, userAttributes } = req.body;

        const token = jwt.sign(
            {
                iss: process.env.CUBE_JWT_ISS,
                aud: process.env.CUBE_JWT_AUD,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 300,
            },
            process.env.CUBEJS_API_SECRET
        );

        const sessionRes = await fetch(`${process.env.CUBE_API_URL}/api/v1/embed/generate-session`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                externalId: externalId || "user@example.com",
                userAttributes: userAttributes || [],
            }),
        });

        if (!sessionRes.ok) {
            return res.status(sessionRes.status).send(await sessionRes.text());
        }

        const { sessionId } = await sessionRes.json();

        const chatRes = await fetch(process.env.CUBE_CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionId}`,
            },
            body: JSON.stringify({ message }),
        });

        if (!chatRes.ok) {
            return res.status(chatRes.status).send(await chatRes.text());
        }

        const data = await chatRes.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router; // critical - export the router function
