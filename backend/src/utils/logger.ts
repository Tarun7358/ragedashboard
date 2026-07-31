import fs from 'fs';
import path from 'path';

// Log levels
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// Log targets
export type LogTarget = 'bot' | 'error' | 'security' | 'audit' | 'startup';

class LoggerInstance {
  private logDir = path.resolve(process.cwd(), 'logs');
  private streams: Map<LogTarget, fs.WriteStream> = new Map();
  
  // Store original console methods before hijacking to prevent infinite recursion
  private origLog = console.log.bind(console);
  private origWarn = console.warn.bind(console);
  private origError = console.error.bind(console);

  constructor() {
    this.init();
  }

  private init() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    const targets: LogTarget[] = ['bot', 'error', 'security', 'audit', 'startup'];
    for (const target of targets) {
      const filePath = path.join(this.logDir, `${target}.log`);
      const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
      this.streams.set(target, stream);
    }
  }

  private maskSecrets(message: string): string {
    if (typeof message !== 'string') return message;
    
    const secrets = [
      process.env.DISCORD_TOKEN,
      process.env.CLIENT_SECRET,
      process.env.JWT_SECRET,
      process.env.TOKEN_ENCRYPTION_KEY,
      process.env.INTERNAL_SECRET,
      process.env.DASHBOARD_PASSWORD
    ].filter((s): s is string => !!(s && s.length > 5));

    let result = message;
    for (const secret of secrets) {
      const escaped = secret.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      result = result.replace(regex, '[REDACTED]');
    }
    return result;
  }

  private formatMessage(level: LogLevel, message: string, source: string): string {
    const timestamp = new Date().toISOString();
    const cleanMsg = this.maskSecrets(message);
    return `[${timestamp}] [${level}] [${source.toUpperCase()}] ${cleanMsg}`;
  }

  public write(target: LogTarget, level: LogLevel, message: string, source: string = 'system') {
    const formatted = this.formatMessage(level, message, source);
    
    // Output to Console using original console bindings
    const consoleMsg = `${formatted}`;
    if (level === 'ERROR') {
      this.origError(consoleMsg);
    } else if (level === 'WARN') {
      this.origWarn(consoleMsg);
    } else {
      this.origLog(consoleMsg);
    }

    // Write to dedicated target stream
    const stream = this.streams.get(target);
    if (stream) {
      stream.write(formatted + '\n');
    }

    // Also write everything to the primary bot.log (except startup if preferred, but let's replicate all)
    if (target !== 'bot') {
      const mainStream = this.streams.get('bot');
      if (mainStream) {
        mainStream.write(formatted + '\n');
      }
    }
  }

  public close() {
    for (const stream of this.streams.values()) {
      stream.end();
    }
  }
}

const loggerInstance = new LoggerInstance();

export class Logger {
  public static info(message: string, source: string = 'system') {
    loggerInstance.write('bot', 'INFO', message, source);
  }

  public static warn(message: string, source: string = 'system') {
    loggerInstance.write('bot', 'WARN', message, source);
  }

  public static error(message: string, source: string = 'system') {
    loggerInstance.write('error', 'ERROR', message, source);
  }

  public static debug(message: string, source: string = 'system') {
    // Only log debug if explicit LOG_LEVEL=debug is configured
    if (process.env.LOG_LEVEL?.toLowerCase() === 'debug') {
      loggerInstance.write('bot', 'DEBUG', message, source);
    }
  }

  public static security(message: string, source: string = 'system') {
    loggerInstance.write('security', 'WARN', message, source);
  }

  public static audit(message: string, source: string = 'system') {
    loggerInstance.write('audit', 'INFO', message, source);
  }

  public static startup(message: string, source: string = 'system') {
    loggerInstance.write('startup', 'INFO', message, source);
  }

  public static close() {
    loggerInstance.close();
  }
}
