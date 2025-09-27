import { Config as OpenApiConfig } from '@alicloud/openapi-client';
import TranslationClient from '@alicloud/alimt20181012';

import config from '../config';

let cachedClient: TranslationClient | null = null;

export function getTranslationClient(): TranslationClient {
  if (cachedClient) {
    return cachedClient;
  }

  const clientConfig = new OpenApiConfig({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
  });
  clientConfig.endpoint = config.translation.endpoint;

  cachedClient = new TranslationClient(clientConfig);

  return cachedClient;
}
