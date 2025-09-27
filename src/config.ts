import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface NlsConfig {
  readonly endpoint: string;
  readonly apiVersion: string;
  readonly appKey: string;
  readonly wsUrl: string;
}

export interface TranslationConfig {
  readonly endpoint: string;
  readonly scene: string;
  readonly defaultSourceLanguage: string;
  readonly targetLanguage: string;
}

export interface ServerConfig {
  readonly port: number;
  readonly pingIntervalMs: number;
}

export interface AppConfig {
  readonly accessKeyId: string;
  readonly accessKeySecret: string;
  readonly nls: NlsConfig;
  readonly translation: TranslationConfig;
  readonly server: ServerConfig;
  readonly logLevel: LogLevel;
}

class MissingEnvError extends Error {
  constructor(variable: string) {
    super(`Required environment variable ${variable} is not set`);
    this.name = 'MissingEnvError';
  }
}

function readEnv(variable: string, fallback?: string): string {
  const value = process.env[variable] ?? fallback;
  if (!value || value.trim().length === 0) {
    throw new MissingEnvError(variable);
  }

  return value.trim();
}

function readInt(variable: string, fallback: number): number {
  const raw = process.env[variable];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${variable} must be a valid integer, received: ${raw}`);
  }

  return parsed;
}

function readLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? '').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }

  return 'info';
}

const config: AppConfig = {
  accessKeyId: readEnv('ALI_ACCESS_KEY_ID'),
  accessKeySecret: readEnv('ALI_ACCESS_KEY_SECRET'),
  nls: {
    endpoint: process.env.ALI_NLS_ENDPOINT?.trim() || 'http://nls-meta.cn-shanghai.aliyuncs.com',
    apiVersion: process.env.ALI_NLS_API_VERSION?.trim() || '2019-02-28',
    appKey: readEnv('ALI_NLS_APP_KEY'),
    wsUrl: process.env.ALI_NLS_WS_URL?.trim() || 'wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1',
  },
  translation: {
    endpoint: process.env.ALI_TRANSLATION_ENDPOINT?.trim() || 'mt.aliyuncs.com',
    scene: process.env.ALI_TRANSLATION_SCENE?.trim() || 'general',
    defaultSourceLanguage: process.env.ALI_TRANSLATION_SOURCE_LANGUAGE?.trim() || 'auto',
    targetLanguage: process.env.ALI_TRANSLATION_TARGET_LANGUAGE?.trim() || 'zh',
  },
  server: {
    port: readInt('SERVER_PORT', 3000),
    pingIntervalMs: readInt('NLS_PING_INTERVAL_MS', 6000),
  },
  logLevel: readLogLevel(),
};

export default config;
