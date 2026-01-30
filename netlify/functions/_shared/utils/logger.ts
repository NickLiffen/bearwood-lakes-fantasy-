// Structured logging utility for Netlify Functions
// Provides consistent log format with request correlation IDs

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Get current log level from environment
 * Default: 'info' in production, 'debug' in development
 */
function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
  if (['debug', 'info', 'warn', 'error'].includes(envLevel)) {
    return envLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  const configuredLevel = getLogLevel();
  return LOG_LEVELS[level] >= LOG_LEVELS[configuredLevel];
}

/**
 * Format a log entry as JSON for structured logging
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Create a log entry and output it
 */
function log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    };
  }

  const formatted = formatLogEntry(entry);

  switch (level) {
    case 'debug':
    case 'info':
      console.log(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

/**
 * Logger instance with request context
 */
export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  /**
   * Set the request ID for this logger
   */
  setRequestId(requestId: string): this {
    this.context.requestId = requestId;
    return this;
  }

  /**
   * Set the user ID for this logger
   */
  setUserId(userId: string): this {
    this.context.userId = userId;
    return this;
  }

  /**
   * Set the endpoint for this logger
   */
  setEndpoint(endpoint: string): this {
    this.context.endpoint = endpoint;
    return this;
  }

  debug(message: string, context?: LogContext): void {
    log('debug', message, { ...this.context, ...context });
  }

  info(message: string, context?: LogContext): void {
    log('info', message, { ...this.context, ...context });
  }

  warn(message: string, context?: LogContext): void {
    log('warn', message, { ...this.context, ...context });
  }

  error(message: string, error?: Error, context?: LogContext): void {
    log('error', message, { ...this.context, ...context }, error);
  }
}

/**
 * Create a new logger instance
 */
export function createLogger(context?: LogContext): Logger {
  return new Logger(context);
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract request ID from headers or generate a new one
 */
export function getRequestId(headers: Record<string, string | undefined>): string {
  return headers['x-request-id'] || generateRequestId();
}
