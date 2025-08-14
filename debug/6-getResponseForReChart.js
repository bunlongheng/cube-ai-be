// test-nl-chat-only.js
require("dotenv").config();
if (typeof fetch === "undefined") global.fetch = (...a) => import("node-fetch").then(m => m.default(...a));
const { randomUUID } = require("crypto");

const CHAT_URL = process.env.CUBE_API_URL; // .../chat/stream-chat-state
const API_KEY = process.env.CUBE_API_KEY; // Embed Api-Key for session+token
const BASE = (process.env.CUBE_SESSION_BASE || "https://thryv.cubecloud.dev").replace(/\/+$/, "");

if (!CHAT_URL) throw new Error("CUBE_API_URL missing in .env");
if (!API_KEY) throw new Error("CUBE_API_KEY missing in .env");

const INPUT = process.argv.slice(2).join(" ") || "Show the monthly appointment counts for the last 24 months for business ID 11zf55br5p8vdnrt, grouped by appointment status, including only one-on-one appointments.";

const j = s => {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
};

// 1) session -> token (for Chat auth)
async function getToken() {
    const s = await fetch(`${BASE}/api/v1/embed/generate-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${API_KEY}` },
        body: JSON.stringify({ externalId: "user@example.com", userAttributes: [] }),
    });
    const sTxt = await s.text();
    if (!s.ok) throw new Error(`generate-session ${s.status}: ${sTxt}`);
    const { sessionId } = j(sTxt) || {};
    if (!sessionId) throw new Error("Missing sessionId");

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

// Try to pull rows and annotation out of a single NDJSON event
function extractFromEvent(evt) {
    if (!evt || typeof evt !== "object") return {};
    // standard data event
    if (evt.type === "data") {
        const rows = Array.isArray(evt.rows) ? evt.rows : Array.isArray(evt.data) ? evt.data : null;
        const annotation = evt.annotation || evt.meta?.annotation || null;
        const sqlQuery = evt.sqlQuery || evt.meta?.sqlQuery || null;
        return { rows, annotation, sqlQuery };
    }
    // sometimes assistant content carries a JSON blob
    if (evt.role === "assistant" && typeof evt.content === "string") {
        const x = j(evt.content);
        if (x) {
            const rows = Array.isArray(x.rows) ? x.rows : Array.isArray(x.data) ? x.data : null;
            const annotation = x.annotation || x.meta?.annotation || null;
            const sqlQuery = x.sqlQuery || x.meta?.sqlQuery || null;
            return { rows, annotation, sqlQuery };
        }
    }
    return {};
}

(async () => {
    console.log("NL message:", INPUT);

    const token = await getToken();
    const payload = { chatId: randomUUID(), input: INPUT };

    const r = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });

    const nd = await r.text();
    if (!r.ok) {
        console.error("Chat error:", r.status, nd.slice(0, 400));
        process.exit(2);
    }

    let rows = null;
    let annotation = null;
    let sqlQuery = null;
    let events = 0;

    for (const line of nd.split("\n")) {
        const s = line.trim();
        if (!s) continue;
        const evt = j(s);
        if (!evt) continue;
        events++;

        const got = extractFromEvent(evt);
        if (got.annotation && !annotation) annotation = got.annotation;
        if (got.sqlQuery && !sqlQuery) sqlQuery = got.sqlQuery;
        if (Array.isArray(got.rows) && got.rows.length) rows = got.rows; // keep latest non-empty
    }

    if (!rows || !rows.length) {
        console.error("No tabular rows found in Chat NDJSON. events:", events);
        process.exit(3);
    }

    // Print clean JSON you can feed into FE
    console.log(JSON.stringify({ rows, meta: { source: "chat_ndjson", events, annotation, sqlQuery } }, null, 2));
})();
