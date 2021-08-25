type LogLevel = "debug" | "info" | "warn" | "error";
export class Logger {
  prefix: string;
  ignoreLevel: LogLevel[];
  constructor(prefix: string = "", ignoreLevel: LogLevel[] = []) {
    this.prefix = prefix;
    this.ignoreLevel = ignoreLevel;
  }
  setPrefix(prefix: string) {
    return new Logger(prefix, this.ignoreLevel);
  }

  debug(...msg: any[]): void {
    this.log("debug", ...msg);
  }
  info(...msg: any[]): void {
    this.log("info", ...msg);
  }
  warn(...msg: any[]): void {
    this.log("warn", ...msg);
  }
  error(...msg: any[]): void {
    this.log("error", ...msg);
  }
  log(level: LogLevel, ...msg: any[]): void {
    if (this.ignoreLevel.includes(level)) {
      return;
    }
    console.log(`[${level.toUpperCase()}]`, `[${this.prefix}]`, ...msg);
  }

  time(level: LogLevel, msg: string): () => void {
    if (this.ignoreLevel.includes(level)) {
      return () => {};
    }
    const formattedMsg = `[${level.toUpperCase()}] [${this.prefix}] ${msg}`;
    console.time(formattedMsg);
    return () => this.timeEnd(formattedMsg);
  }

  timeEnd(formattedMsg: string | null): void {
    if (formattedMsg === null) {
      return;
    }
    console.timeEnd(formattedMsg);
  }
}
