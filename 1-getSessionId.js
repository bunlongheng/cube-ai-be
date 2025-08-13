// test-session.js
require("dotenv").config();

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

        console.log("Status:", r.status);
        console.log("Content-Type:", r.headers.get("content-type"));
        console.log("Response:", await r.text());
    } catch (err) {
        console.error("Error:", err.message);
    }
})();
