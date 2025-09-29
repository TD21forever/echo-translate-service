import TranslationClient, {
  TranslateRequest,
  TranslateResponse,
} from '@alicloud/alimt20181012';
import { RuntimeOptions } from '@alicloud/tea-util';

import config from '../config';
import { detectLanguage } from '../utils/languageDetector';
import { logger } from '../utils/logger';
import { getTranslationClient } from '../clients/translationClient';

export interface TranslationMeta {
  connectionId: number;
  eventType: string;
}

export interface TranslationOutcome {
  translatedText: string;
  detectedLanguage: string;
  durationMs: number;
}

export class TranslationService {
  private readonly client: TranslationClient;
  private readonly runtime = new RuntimeOptions({});

  constructor(client: TranslationClient = getTranslationClient()) {
    this.client = client;
  }

  async translate(text: string, meta: TranslationMeta): Promise<TranslationOutcome> {
    if (!text || text.trim().length === 0) {
      return { translatedText: '', detectedLanguage: config.translation.defaultSourceLanguage, durationMs: 0 };
    }

    const detectedLanguage = detectLanguage(text, config.translation.defaultSourceLanguage);

    logger.debug('translation', 'Submitting text for translation', {
      connectionId: meta.connectionId,
      eventType: meta.eventType,
      detectedLanguage,
    });

    const request = new TranslateRequest({
      formatType: 'text',
      sourceLanguage: detectedLanguage,
      targetLanguage: config.translation.targetLanguage,
      sourceText: text,
      scene: config.translation.scene,
    });

    const start = Date.now();

    try {
      const response = (await this.client.translateWithOptions(
        request,
        this.runtime
      )) as TranslateResponse;

      const translatedText = response.body?.data?.translated ?? '';
      const durationMs = Date.now() - start;

      logger.info('translation', 'Translation completed', {
        connectionId: meta.connectionId,
        eventType: meta.eventType,
        detectedLanguage,
        durationMs: Math.round(durationMs),
      });

      return { translatedText: translatedText || '', detectedLanguage, durationMs };
    } catch (error) {
      logger.error('translation', 'Translation failed, returning original text', {
        connectionId: meta.connectionId,
        eventType: meta.eventType,
        error: error instanceof Error ? error.message : 'unknown',
      });

      return { translatedText: text, detectedLanguage, durationMs: Math.round(Date.now() - start) };
    }
  }
}
