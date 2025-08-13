// test-session.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.resolve(process.cwd(), ".env");
const ENV_KEY = "CUBE_SESSION_ID";

function upsertEnvVar(filePath, key, val) {
    let content = "";
    try {
        content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    } catch (_) {}
    const lines = content.split(/\r?\n/);
    const idx = lines.findIndex(l => l.trim().startsWith(`${key}=`));
    const newLine = `${key}=${val}`;
    if (idx >= 0) lines[idx] = newLine;
    else {
        if (lines.length && lines[lines.length - 1] !== "") lines.push("");
        lines.push(newLine);
    }
    fs.writeFileSync(filePath, lines.join("\n"));
}

(async () => {
    try {
        const key = process.env.CUBE_API_KEY;
        if (!key) throw new Error("CUBE_API_KEY is missing in .env");

        const url = "https://thryv.cubecloud.dev/api/v1/embed/generate-session";
        const payload = { externalId: "user@example.com", userAttributes: [] };

        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Api-Key ${key}` },
            body: JSON.stringify(payload),
        });

        const text = await r.text();
        console.log("Status:", r.status);
        console.log("Content-Type:", r.headers.get("content-type"));
        console.log("Response:", text);

        if (!r.ok) {
            process.exitCode = 1;
            return;
        }

        let sessionId;
        try {
            const parsed = JSON.parse(text);
            sessionId = parsed.sessionId;
        } catch {
            // leave undefined
        }
        if (!sessionId) {
            throw new Error("No sessionId in response");
        }

        upsertEnvVar(ENV_PATH, ENV_KEY, sessionId);
        console.log(`Saved ${ENV_KEY} to ${ENV_PATH}`);
    } catch (err) {
        console.error("Error:", err.message);
        process.exitCode = 1;
    }
})();
