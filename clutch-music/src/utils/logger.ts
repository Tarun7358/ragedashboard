import fs from 'fs';
import path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogTarget = 'bot' | 'error' | 'startup';

class LoggerInstance {
  // Resolve logs dir relative to repo root (one level up from clutch-music/)
  private logDir = path.resolve(process.cwd(), '..', 'logs');
  private streams: Map<LogTarget, fs.WriteStream> = new Map();

  // Capture original console bindings before any hijacking
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
    const targets: LogTarget[] = ['bot', 'error', 'startup'];
    for (const t of targets) {
      const filePath = path.join(this.logDir, `${t}.log`);
      this.streams.set(t, fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' }));
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
      result = result.replace(new RegExp(escaped, 'g'), '[REDACTED]');
    }
    return result;
  }

  private fmt(level: LogLevel, message: string, source: string): string {
    const ts = new Date().toISOString();
    return `[${ts}] [MUSIC] [${level}] [${source.toUpperCase()}] ${this.maskSecrets(message)}`;
  }

  public write(target: LogTarget, level: LogLevel, message: string, source: string = 'system') {
    const line = this.fmt(level, message, source);
    if (level === 'ERROR') this.origError(line);
    else if (level === 'WARN') this.origWarn(line);
    else this.origLog(line);

    this.streams.get(target)?.write(line + '\n');
    if (target !== 'bot') this.streams.get('bot')?.write(line + '\n');
  }

  public close() {
    for (const s of this.streams.values()) s.end();
  }
}

const instance = new LoggerInstance();

export class Logger {
  public static info(msg: string, src = 'system') { instance.write('bot', 'INFO', msg, src); }
  public static warn(msg: string, src = 'system') { instance.write('bot', 'WARN', msg, src); }
  public static error(msg: string, src = 'system') { instance.write('error', 'ERROR', msg, src); }
  public static debug(msg: string, src = 'system') {
    if (process.env.LOG_LEVEL?.toLowerCase() === 'debug') instance.write('bot', 'DEBUG', msg, src);
  }
  public static startup(msg: string, src = 'system') { instance.write('startup', 'INFO', msg, src); }
  public static close() { instance.close(); }
}
