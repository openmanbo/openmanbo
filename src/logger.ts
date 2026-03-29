type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const activeLogLevel = resolveActiveLogLevel();

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}

export function createLogger(scope: string, bindings?: LogMeta): Logger {
  return {
    debug(message, meta) {
      writeLog("debug", scope, message, bindings, meta);
    },
    info(message, meta) {
      writeLog("info", scope, message, bindings, meta);
    },
    warn(message, meta) {
      writeLog("warn", scope, message, bindings, meta);
    },
    error(message, meta) {
      writeLog("error", scope, message, bindings, meta);
    },
  };
}

function resolveActiveLogLevel(): LogLevel {
  const value = (
    process.env.OPENMANBO_LOG_LEVEL ??
    process.env.LOG_LEVEL ??
    "info"
  ).toLowerCase();

  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }

  return "info";
}

function writeLog(
  level: LogLevel,
  scope: string,
  message: string,
  bindings?: LogMeta,
  meta?: LogMeta,
): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[activeLogLevel]) {
    return;
  }

  const payload = normalizeMeta(bindings, meta);
  const serialized = payload ? ` ${JSON.stringify(payload)}` : "";
  const line = `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${message}${serialized}\n`;

  if (level === "warn" || level === "error") {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

function normalizeMeta(...parts: Array<LogMeta | undefined>): LogMeta | undefined {
  const entries = parts
    .filter((part): part is LogMeta => Boolean(part))
    .flatMap((part) => Object.entries(part));

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries.map(([key, value]) => [key, sanitizeValue(value)]));
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]),
    );
  }

  return value;
}