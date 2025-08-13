// test-metric-rows.js
// Purpose: call Cube Chat once (non-stream), parse NDJSON, print only rows (+ optional annotation)
require("dotenv").config();
if (typeof fetch === "undefined") global.fetch = (...a) => import("node-fetch").then(m => m.default(...a));
const { randomUUID } = require("crypto");

const BASE = (process.env.CUBE_SESSION_BASE || "https://thryv.cubecloud.dev").replace(/\/+$/, "");
const CHAT_URL = process.env.CUBE_API_URL;
const API_KEY = process.env.CUBE_API_KEY;

if (!API_KEY) throw new Error("CUBE_API_KEY missing in .env");
if (!CHAT_URL) throw new Error("CUBE_API_URL missing in .env");

const toJSON = s => {
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
    const sJson = toJSON(sTxt);
    if (!sJson?.sessionId) throw new Error("Missing sessionId");

    // 2) exchange for token
    const t = await fetch(`${BASE}/api/v1/embed/session/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${API_KEY}` },
        body: JSON.stringify({ sessionId: sJson.sessionId }),
    });
    const tTxt = await t.text();
    if (!t.ok) throw new Error(`session/token ${t.status}: ${tTxt}`);
    const tJson = toJSON(tTxt);
    if (!tJson?.token) throw new Error("Missing token");
    return tJson.token;
}

async function chatRowsOnly(input) {
    const token = await getToken();
    const payload = { chatId: randomUUID(), input };

    // Chat request - non-stream, but response is NDJSON lines
    const r = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) throw new Error(`chat ${r.status}: ${text}`);

    // Parse NDJSON and keep only rows (+ annotation if present)
    let lastRows = null;
    let lastAnnotation = null;

    for (const line of text.split("\n")) {
        const s = line.trim();
        if (!s) continue;
        const evt = toJSON(s);
        if (!evt) continue;

        if (evt.type === "data") {
            if (Array.isArray(evt.rows)) lastRows = evt.rows;
            if (evt.annotation) lastAnnotation = evt.annotation;
        }
    }

    return { rows: lastRows, annotation: lastAnnotation };
}

(async () => {
    const input = process.argv.slice(2).join(" ") || "Show me appointments by status for next 36 months";
    const { rows, annotation } = await chatRowsOnly(input);

    if (!rows) {
        console.error("No rows returned. Check your prompt or agent config.");
        process.exit(2);
    }

    // Print only what you need for metric rendering
    console.log("ROWS:");
    console.dir(rows, { depth: null, maxArrayLength: null });

    // Uncomment if you also want column labels/types
    if (annotation) {
        console.log("\nANNOTATION:");
        console.dir(annotation, { depth: null });
    }
})();
