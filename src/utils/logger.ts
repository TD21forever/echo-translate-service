import config from '../config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type Serializable = Record<string, unknown> | unknown[];

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentLevelPriority = LEVEL_PRIORITY[config.logLevel];

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= currentLevelPriority;
}

function formatMeta(meta?: Serializable): string {
  if (meta === undefined) {
    return '';
  }

  try {
    return ` | ${JSON.stringify(meta)}`;
  } catch (error) {
    return ` | meta: ${String(error)}`;
  }
}

function log(level: LogLevel, category: string, message: string, meta?: Serializable): void {
  if (!shouldLog(level)) {
    return;
  }

  const timestamp = new Date().toISOString();
  const output = `[${timestamp}] [${category}] ${message}${formatMeta(meta)}`;

  switch (level) {
    case 'debug':
    case 'info':
      console.log(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  debug(category: string, message: string, meta?: Serializable): void {
    log('debug', category, message, meta);
  },
  info(category: string, message: string, meta?: Serializable): void {
    log('info', category, message, meta);
  },
  warn(category: string, message: string, meta?: Serializable): void {
    log('warn', category, message, meta);
  },
  error(category: string, message: string, meta?: Serializable): void {
    log('error', category, message, meta);
  },
};
