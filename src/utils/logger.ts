import pino from 'pino';

export function createLogger(name: string) {
    return pino({
        name,
        level: process.env.LOG_LEVEL || 'info',
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
            level: (label) => {
                return { level: label };
            },
        },
    });
}

// Create default logger instance
export const logger = createLogger('openai-codex-mcp');