// logger.js
const fs = require("fs");
const path = require("path");
const { createLogger, format, transports } = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");

const LOG_DIR = path.join(__dirname, "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const baseFormat = format.combine(
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
        return `${timestamp} [${level}]: ${stack || message}${metaString}`;
    })
);

const logger = createLogger({
    level: process.env.LOG_LEVEL || "debug",
    defaultMeta: { app: "cube-ai-be" },
    format: baseFormat,
    transports: [
        new transports.Console({
            format: format.combine(process.stdout.isTTY ? format.colorize({ all: true }) : format.uncolorize()),
        }),
        new DailyRotateFile({
            dirname: LOG_DIR,
            filename: "cube-api-%DATE%.log",
            datePattern: "YYYY-MM-DD",
            zippedArchive: true,
            maxSize: "20m",
            maxFiles: "14d",
            format: format.uncolorize(),
        }),
    ],
    exceptionHandlers: [
        new DailyRotateFile({
            dirname: LOG_DIR,
            filename: "exceptions-%DATE%.log",
            datePattern: "YYYY-MM-DD",
            zippedArchive: true,
            maxSize: "20m",
            maxFiles: "14d",
            format: format.uncolorize(),
        }),
    ],
    rejectionHandlers: [
        new DailyRotateFile({
            dirname: LOG_DIR,
            filename: "rejections-%DATE%.log",
            datePattern: "YYYY-MM-DD",
            zippedArchive: true,
            maxSize: "20m",
            maxFiles: "14d",
            format: format.uncolorize(),
        }),
    ],
    exitOnError: false,
});

module.exports = logger;
