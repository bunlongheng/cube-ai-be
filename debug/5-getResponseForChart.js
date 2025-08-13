// 5-getResponseForChart.js
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

// naive SQL detector for fallback
const looksLikeSQL = s => typeof s === "string" && /\bselect\b/i.test(s) && /\bfrom\b/i.test(s);

// deep finder for keys by name
function findByKeyDeep(obj, keyNames = []) {
    const found = [];
    const visit = x => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) {
            for (const v of x) visit(v);
            return;
        }
        for (const [k, v] of Object.entries(x)) {
            if (keyNames.includes(k)) found.push(v);
            visit(v);
        }
    };
    visit(obj);
    return found;
}

async function getToken() {
    const s = await fetch(`${BASE}/api/v1/embed/generate-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${API_KEY}` },
        body: JSON.stringify({ externalId: "user@example.com", userAttributes: [] }),
    });
    const sTxt = await s.text();
    if (!s.ok) throw new Error(`generate-session ${s.status}: ${sTxt}`);
    const sJson = toJSON(sTxt);
    if (!sJson?.sessionId) throw new Error("Missing sessionId");

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

async function chatGetSqlOrQuery(input) {
    const token = await getToken();
    const payload = { chatId: randomUUID(), input };

    const r = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) throw new Error(`chat ${r.status}: ${text}`);

    const events = [];
    const summary = {}; // { [typeOrRole]: count }
    for (const line of text.split("\n")) {
        const s = line.trim();
        if (!s) continue;
        const evt = toJSON(s);
        if (!evt) continue;
        events.push(evt);
        const key = evt.type || evt.role || "unknown";
        summary[key] = (summary[key] || 0) + 1;
    }

    // try common locations for sql or query
    let sqlQuery = null;
    let query = null;

    for (const evt of events) {
        // direct sqlQuery
        if (!sqlQuery && typeof evt.sqlQuery === "string") sqlQuery = evt.sqlQuery;

        // sometimes inside data/meta
        if (!sqlQuery && evt.type === "data" && evt.meta && typeof evt.meta.sqlQuery === "string") {
            sqlQuery = evt.meta.sqlQuery;
        }

        // sometimes chartSpec carries a spec.query (Cube query, not SQL)
        if (!query && evt.type === "chartSpec" && evt.spec && evt.spec.query) {
            query = evt.spec.query;
        }

        // other nesting locations (rare)
        if (!sqlQuery && evt.data && typeof evt.data.sqlQuery === "string") sqlQuery = evt.data.sqlQuery;
        if (!query && evt.data && evt.data.query) query = evt.data.query;
    }

    // deep fallback: look for any field named "sqlQuery" or "query" anywhere
    if (!sqlQuery) {
        const allSqls = findByKeyDeep({ events }, ["sqlQuery"]);
        sqlQuery = allSqls.find(looksLikeSQL) || allSqls.find(v => typeof v === "string");
    }
    if (!query) {
        const allQueries = findByKeyDeep({ events }, ["query"]);
        // pick the one that looks like a Cube query (measures/dimensions/timeDimensions)
        query = allQueries.find(q => q && typeof q === "object" && (q.measures || q.dimensions || q.timeDimensions || q.filters)) || null;
    }

    // last resort: scan any string for SQL-looking content
    if (!sqlQuery) {
        const strings = [];
        const collect = x => {
            if (x == null) return;
            if (typeof x === "string") strings.push(x);
            else if (Array.isArray(x)) x.forEach(collect);
            else if (typeof x === "object") Object.values(x).forEach(collect);
        };
        collect(events);
        sqlQuery = strings.find(looksLikeSQL) || null;
    }

    return { summary, sqlQuery, query, rawNdjson: text };
}

(async () => {
    const input = process.argv.slice(2).join(" ") || "Show me appointments by status for next 4 weeks";
    const { summary, sqlQuery, query } = await chatGetSqlOrQuery(input);

    console.log("Event summary:", summary);

    if (sqlQuery) {
        console.log("\nSQL QUERY:");
        console.log(sqlQuery);
    } else {
        console.log("\nNo sqlQuery found.");
    }

    if (query) {
        console.log("\nCUBE QUERY OBJECT:");
        console.dir(query, { depth: null });
    } else {
        console.log("\nNo Cube query object found.");
    }

    if (!sqlQuery && !query) {
        process.exitCode = 2;
    }
})();
