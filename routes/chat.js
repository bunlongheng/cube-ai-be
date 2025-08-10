const express = require("express");
const router = express.Router();

// simple logger for POST bodies
router.use((req, _res, next) => {
    console.log("CHAT request:", {
        method: req.method,
        path: req.path,
        body: req.body,
    });
    next();
});

// POST /chat
router.post("/", async (req, res) => {
    const { query } = req.body || {};
    if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "query is required" });
    }

    // TODO: call Cube AI here. Returning stub so FE can render.
    return res.json({
        message: "ok",
        chart: "bar",
        data: [
            { name: "Jan", value: 65 },
            { name: "Feb", value: 78 },
            { name: "Mar", value: 92 },
            { name: "Apr", value: 85 },
            { name: "May", value: 98 },
            { name: "Jun", value: 87 },
        ],
        sql: "/* generated sql here */",
    });
});

module.exports = router;
