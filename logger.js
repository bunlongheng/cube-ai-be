// logger.js
const { createLogger, format, transports } = require("winston");

const colorizer = format.colorize();

const logger = createLogger({
    level: process.env.LOG_LEVEL || "debug",
    format: format.combine(
        format.errors({ stack: true }),
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.splat(),
        format.printf(({ timestamp, level, message, stack, ...meta }) => {
            let metaString = "";
            try {
                metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
            } catch {
                metaString = " [meta:unserializable]";
            }
            // Apply colors to level for easy spotting
            return `${timestamp} ${colorizer.colorize(level, `[${level}]`)}: ${stack || message}${metaString}`;
        })
    ),
    transports: [new transports.Console()],
    exitOnError: false,
});

module.exports = logger;
