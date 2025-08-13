// chat-test-fix.js
require("dotenv").config();
if (typeof fetch === "undefined") global.fetch = (...a) => import("node-fetch").then(m => m.default(...a));

(async () => {
    const { CUBE_API_KEY, CUBE_API_URL } = process.env;
    if (!CUBE_API_KEY) throw new Error("CUBE_API_KEY missing in .env");
    if (!CUBE_API_URL) throw new Error("CUBE_API_URL missing in .env");

    // Use your Cube Cloud app base here - keep both calls on the SAME host
    const SESSION_BASE = process.env.CUBE_SESSION_BASE || "https://thryv.cubecloud.dev";
    const genSessionURL = `${SESSION_BASE}/api/v1/embed/generate-session`;
    const sessionTokenURL = `${SESSION_BASE}/api/v1/embed/session/token`;

    // 1) Always create a fresh session
    const s = await fetch(genSessionURL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${CUBE_API_KEY}` },
        body: JSON.stringify({ externalId: "user@example.com", userAttributes: [] }),
    });
    if (!s.ok) throw new Error(`generate-session ${s.status}: ${await s.text()}`);
    const { sessionId } = await s.json();
    console.log("sessionId:", sessionId);

    // 2) Exchange the session for a token on the SAME base
    const t = await fetch(sessionTokenURL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${CUBE_API_KEY}` },
        body: JSON.stringify({ sessionId }),
    });
    if (!t.ok) throw new Error(`session/token ${t.status}: ${await t.text()}`);
    const { token } = await t.json();
    console.log("token OK");

    // 3) Call chat once (non-stream)
    const payload = {
        chatId: require("crypto").randomUUID?.() || Math.random().toString(36).slice(2),
        input: "Show me appointments by status for next 36 months",
    };
    const r = await fetch(CUBE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });
    console.log("chat status:", r.status);
    console.log("chat response:", await r.text());
})().catch(e => {
    console.error("Error:", e.message);
    process.exit(1);
});
