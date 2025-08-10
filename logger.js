// logger.js
const { createLogger, format, transports } = require("winston");

const logger = createLogger({
    level: "debug",
    format: format.combine(
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.colorize(),
        format.printf(info => `${info.timestamp} [${info.level}]: ${info.message}`)
    ),
    transports: [new transports.Console(), new transports.File({ filename: "cube-api.log", level: "debug" })],
});

// Helper for pretty block logs
logger.box = (title, obj) => {
    const safeStringify = v => {
        try {
            return JSON.stringify(v, null, 2);
        } catch {
            return String(v);
        }
    };
    const line = "─".repeat(32);
    logger.info(`\n┌${line} ${title} ${line}┐\n${safeStringify(obj)}\n└${"─".repeat(title.length + 66)}┘`);
};

module.exports = logger;
