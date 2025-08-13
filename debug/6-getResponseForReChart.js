// 5-getResponseForChart.js
require("dotenv").config();
if (typeof fetch === "undefined") global.fetch = (...a) => import("node-fetch").then(m => m.default(...a));
const { randomUUID } = require("crypto");

const BASE = (process.env.CUBE_SESSION_BASE || "https://thryv.cubecloud.dev").replace(/\/+$/, "");
const CHAT_URL = process.env.CUBE_API_URL;
const API_KEY = process.env.CUBE_API_KEY;

if (!API_KEY) throw new Error("CUBE_API_KEY missing in .env");
if (!CHAT_URL) throw new Error("CUBE_API_URL missing in .env");

// simple argv parser for --xKey, --seriesKey, --valueKey, message after --
const argv = process.argv.slice(2);
const arg = name => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
};
const X_OVERRIDE = arg("--xKey");
const SERIES_OVERRIDE = arg("--seriesKey");
const VALUE_OVERRIDE = arg("--valueKey");
const msgIndex = Math.max(argv.lastIndexOf("--"), -1);
const INPUT = msgIndex >= 0 ? argv.slice(msgIndex + 1).join(" ") : argv.join(" ");
const MESSAGE = INPUT || "Show me appointments by status for next 4 weeks";

const toJSON = s => {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
};

async function getToken() {
    const s = await fetch(`${BASE}/api/v1/embed/generate-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${API_KEY}` },
        body: JSON.stringify({ externalId: "user@example.com", userAttributes: [] }),
    });
    const sTxt = await s.text();
    if (!s.ok) throw new Error(`generate-session ${s.status}: ${sTxt}`);
    const { sessionId } = toJSON(sTxt) || {};
    if (!sessionId) throw new Error("Missing sessionId");

    const t = await fetch(`${BASE}/api/v1/embed/session/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${API_KEY}` },
        body: JSON.stringify({ sessionId }),
    });
    const tTxt = await t.text();
    if (!t.ok) throw new Error(`session/token ${t.status}: ${tTxt}`);
    const { token } = toJSON(tTxt) || {};
    if (!token) throw new Error("Missing token");
    return token;
}

// Heuristics to pick x, series, value fields from annotation and sample row
function inferKeys(annotation, rows) {
    if (X_OVERRIDE || SERIES_OVERRIDE || VALUE_OVERRIDE) {
        return { xKey: X_OVERRIDE, seriesKey: SERIES_OVERRIDE, valueKey: VALUE_OVERRIDE };
    }
    const annDims = Object.keys(annotation?.dimensions || {});
    const annMeasures = Object.keys(annotation?.measures || {});
    const sample = rows?.[0] || {};

    // prefer time dimension key containing ".date" or ".month"
    let xKey = annDims.find(k => /\.date(\.|$)|\.month$/.test(k));
    // otherwise first dimension key from annotation
    if (!xKey) xKey = annDims[0];
    // series dimension is a non-time dimension different from xKey
    let seriesKey = annDims.find(k => k !== xKey) || annDims[0];

    // if xKey equals seriesKey, try to swap
    if (seriesKey === xKey) {
        const alt = annDims.find(k => k !== xKey);
        if (alt) seriesKey = alt;
    }

    // value key choose first measure
    let valueKey = annMeasures[0];

    // fallbacks from sample row keys
    const rowKeys = Object.keys(sample);
    if (!xKey) xKey = rowKeys.find(k => /\.date(\.|$)|\.month$/.test(k)) || rowKeys[0];
    if (!seriesKey) seriesKey = rowKeys.find(k => k !== xKey && !annMeasures.includes(k)) || rowKeys[1];
    if (!valueKey) valueKey = rowKeys.find(k => annMeasures.includes(k)) || rowKeys.find(k => typeof sample[k] === "number" || !isNaN(+sample[k]));

    return { xKey, seriesKey, valueKey };
}

function coerceNumber(v) {
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

async function getRechartsPayload(message) {
    const token = await getToken();
    const payload = { chatId: randomUUID(), input: message };

    const r = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) throw new Error(`chat ${r.status}: ${text}`);

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

    if (!lastRows || lastRows.length === 0) {
        return { data: [], meta: { reason: "no_rows" } };
    }

    const { xKey, seriesKey, valueKey } = inferKeys(lastAnnotation, lastRows);

    const data = lastRows.map(row => ({
        x: row?.[xKey],
        series: row?.[seriesKey],
        value: coerceNumber(row?.[valueKey]),
        // keep originals too in case FE wants raw keys
        _raw: row,
    }));

    return {
        data,
        meta: {
            xKey,
            seriesKey,
            valueKey,
            count: data.length,
            annotation: lastAnnotation || null,
        },
    };
}

(async () => {
    const out = await getRechartsPayload(MESSAGE);
    console.log(JSON.stringify(out, null, 2));
})();
