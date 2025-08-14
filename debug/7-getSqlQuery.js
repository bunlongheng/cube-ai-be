// test-chat-flow.js
require("dotenv").config();
if (typeof fetch === "undefined") global.fetch = (...a) => import("node-fetch").then(m => m.default(...a));
const { randomUUID } = require("crypto");

const BASE = (process.env.CUBE_SESSION_BASE || "https://thryv.cubecloud.dev").replace(/\/+$/, "");
const CHAT_URL = process.env.CUBE_API_URL; // full .../chat/stream-chat-state
const API_KEY = process.env.CUBE_API_KEY; // your Api-Key from Cube Cloud

if (!API_KEY) throw new Error("CUBE_API_KEY missing in .env");
if (!CHAT_URL) throw new Error("CUBE_API_URL missing in .env");

const INPUT = process.argv.slice(2).join(" ") || "Show me appointments by status for next 4 weeks";

const j = s => {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
};

async function getToken() {
    // 1) generate session
    const s = await fetch(`${BASE}/api/v1/embed/generate-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${API_KEY}` },
        body: JSON.stringify({ externalId: "user@example.com", userAttributes: [] }),
    });
    const sTxt = await s.text();
    if (!s.ok) throw new Error(`generate-session ${s.status}: ${sTxt}`);
    const { sessionId } = j(sTxt) || {};
    if (!sessionId) throw new Error("Missing sessionId");

    // 2) exchange session for token
    const t = await fetch(`${BASE}/api/v1/embed/session/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${API_KEY}` },
        body: JSON.stringify({ sessionId }),
    });
    const tTxt = await t.text();
    if (!t.ok) throw new Error(`session/token ${t.status}: ${tTxt}`);
    const { token } = j(tTxt) || {};
    if (!token) throw new Error("Missing token");
    return token;
}

(async () => {
    console.log("NL:", INPUT);

    const token = await getToken();

    // 3) send chat request
    const r = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId: randomUUID(), input: INPUT }),
    });

    const body = await r.text();
    console.log("HTTP:", r.status);
    console.log(body);
})();
