// logger.js
const log = require("node-color-log");

log.setLevel(process.env.LOG_LEVEL || "debug");
// log.enableFileAndLine(true); // uncomment if you want file:line in logs

const ts = () => {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const serialize = meta => {
    if (!meta || typeof meta !== "object" || !Object.keys(meta).length) return "";
    try {
        return ` ${JSON.stringify(meta)}`;
    } catch {
        return " [meta:unserializable]";
    }
};

const emit = (level, message, meta) => {
    const line = `${ts()} [${level}]: ${message}${serialize(meta)}`;
    if (typeof log[level] === "function") log[level](line);
    else log.info(line);
};

module.exports = {
    info: (m, meta) => emit("info", m, meta), // blue
    success: (m, meta) => emit("success", m, meta), // green
    warn: (m, meta) => emit("warn", m, meta), // yellow
    error: (m, meta) => emit("error", m, meta), // red
    debug: (m, meta) => emit("debug", m, meta), // magenta
};
