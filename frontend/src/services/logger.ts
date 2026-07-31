/**
 * Rage Optimiser Enterprise — Logging & Monitoring Service
 */

export interface LogPayload {
  level: 'info' | 'warn' | 'error' | 'fatal';
  source: 'api' | 'websocket' | 'react' | 'auth' | 'system';
  message: string;
  context?: Record<string, any>;
  timestamp: string;
  stack?: string;
}

class EnterpriseLogger {
  private logs: LogPayload[] = [];
  private readonly maxLogs = 200;

  constructor() {
    this.setupGlobalHandlers();
  }

  private setupGlobalHandlers() {
    if (typeof window === 'undefined') return;

    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', {
        reason: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
      }, 'system');
    });

    window.addEventListener('error', (event) => {
      this.error(event.message || 'Global Window Error', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }, 'system');
    });
  }

  public log(level: LogPayload['level'], message: string, context?: Record<string, any>, source: LogPayload['source'] = 'system') {
    const payload: LogPayload = {
      level,
      source,
      message,
      context,
      timestamp: new Date().toISOString(),
      stack: level === 'error' || level === 'fatal' ? new Error().stack : undefined,
    };

    this.logs.unshift(payload);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    if (import.meta.env.DEV) {
      const consoleFn = level === 'error' || level === 'fatal' ? console.error : level === 'warn' ? console.warn : console.log;
      consoleFn(`[${payload.source.toUpperCase()}] ${message}`, context || '');
    }
  }

  public info(message: string, context?: Record<string, any>, source: LogPayload['source'] = 'system') {
    this.log('info', message, context, source);
  }

  public warn(message: string, context?: Record<string, any>, source: LogPayload['source'] = 'system') {
    this.log('warn', message, context, source);
  }

  public error(message: string, context?: Record<string, any>, source: LogPayload['source'] = 'system') {
    this.log('error', message, context, source);
  }

  public getRecentLogs(): LogPayload[] {
    return [...this.logs];
  }
}

export const logger = new EnterpriseLogger();
