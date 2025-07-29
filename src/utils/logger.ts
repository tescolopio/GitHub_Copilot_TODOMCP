import winston from 'winston';
import path from 'path';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR = process.env.LOG_DIR || 'logs';

// Ensure log directory exists
import fs from 'fs-extra';
fs.ensureDirSync(LOG_DIR);

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
    return `${timestamp} [${service || 'MCP'}] ${level}: ${message} ${metaStr}`;
  })
);

export function createLogger(service: string): winston.Logger {
  return winston.createLogger({
    level: LOG_LEVEL,
    format: logFormat,
    defaultMeta: { service },
    transports: [
      // File transport for all logs
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'mcp-server.log'),
        level: 'info',
      }),
      // File transport for errors only
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'error.log'),
        level: 'error',
      }),
      // Console transport with colored output
      new winston.transports.Console({
        format: consoleFormat,
        level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
      }),
    ],
  });
}

export const logger = createLogger('MCPServer');
