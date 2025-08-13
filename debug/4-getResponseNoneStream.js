// debug/getResponseNoneStream.v2.js
require("dotenv").config();
if (typeof fetch === "undefined") global.fetch = (...a) => import("node-fetch").then(m => m.default(...a));
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const get = k => process.env[k];
const toJSON = s => {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
};

const SESSION_BASE = (get("CUBE_SESSION_BASE") || "https://thryv.cubecloud.dev").replace(/\/+$/, "");
const CHAT_URL = get("CUBE_API_URL");
const API_KEY = get("CUBE_API_KEY");

if (!API_KEY) throw new Error("CUBE_API_KEY missing in .env");
if (!CHAT_URL) throw new Error("CUBE_API_URL missing in .env");

async function getToken() {
    // 1) generate-session
    const s = await fetch(`${SESSION_BASE}/api/v1/embed/generate-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${API_KEY}` },
        body: JSON.stringify({ externalId: "user@example.com", userAttributes: [] }),
    });
    const sTxt = await s.text();
    if (!s.ok) throw new Error(`generate-session ${s.status}: ${sTxt}`);
    const sJson = toJSON(sTxt);
    if (!sJson?.sessionId) throw new Error("Missing sessionId");
    // 2) session/token
    const t = await fetch(`${SESSION_BASE}/api/v1/embed/session/token`, {
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

async function chatOnce(input) {
    const token = await getToken();
    const payload = { chatId: randomUUID(), input };

    const r = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });

    // Buffer body
    let raw;
    if (r.body?.getReader) {
        const chunks = [];
        const reader = r.body.getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(Buffer.from(value));
        }
        raw = Buffer.concat(chunks).toString("utf8");
    } else {
        raw = await r.text();
    }

    // Persist raw for inspection
    fs.mkdirSync(path.resolve("debug"), { recursive: true });
    const ndPath = path.resolve("debug", "chat.ndjson");
    fs.writeFileSync(ndPath, raw, "utf8");

    // Parse NDJSON
    const events = [];
    for (const line of raw.split("\n")) {
        const s = line.trim();
        if (!s) continue;
        const obj = toJSON(s);
        if (obj) events.push(obj);
    }

    // Extract useful bits
    let assistant = null;
    let rows = null;
    let chartSpec = null;
    const counts = {};
    for (const e of events) {
        const key = e.type || e.role || "unknown";
        counts[key] = (counts[key] || 0) + 1;
        if (e.role === "assistant" && typeof e.content === "string") assistant = e.content;
        if (e.type === "data" && Array.isArray(e.rows)) rows = e.rows;
        if (e.type === "chartSpec" && e.spec) chartSpec = e.spec;
    }

    return {
        status: r.status,
        saved: ndPath,
        counts,
        assistant,
        rowsSample: Array.isArray(rows) ? rows.slice(0, 5) : null,
        rowsTotal: Array.isArray(rows) ? rows.length : 0,
        chartSpec: chartSpec || null,
    };
}

(async () => {
    const input = process.argv.slice(2).join(" ") || "Show me appointments by status for next 36 months";
    const out = await chatOnce(input);

    // Pretty print
    console.log("\n=== Chat Summary ===");
    console.log("Status:", out.status);
    console.log("Saved NDJSON:", out.saved);
    console.log("Event counts:", out.counts);
    console.log("\nAssistant (last):\n", out.assistant || "(none)");
    console.log("\nRows total:", out.rowsTotal);
    if (out.rowsSample) {
        console.log("Rows sample (first 5):");
        console.dir(out.rowsSample, { depth: null });
    } else {
        console.log("Rows sample: (none)");
    }
    console.log("\nChart spec:");
    console.dir(out.chartSpec, { depth: null });

    // Fail fast if no useful payload
    if (out.status !== 200 || (!out.assistant && !out.rowsTotal && !out.chartSpec)) {
        process.exitCode = 2;
    }
})();
