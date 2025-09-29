import { WebSocket, RawData } from 'ws';
import Nls from 'alibabacloud-nls';
import type { SpeechTranscription as SpeechTranscriptionType } from 'alibabacloud-nls';

import config from '../config';
import { NlsTokenProvider } from '../clients/nlsTokenProvider';
import { TranslationService, TranslationOutcome } from './translationService';
import { logger } from '../utils/logger';
import { AudioBufferQueue, toAudioBuffer } from '../core/audioBufferQueue';
import { SessionMetrics } from '../core/sessionMetrics';
import { sendJsonMessage } from '../core/messages';
import { normalizeJapaneseText } from '../middleware/japaneseNormalizer';

const { SpeechTranscription } = Nls;

type SpeechTranscriptionFactory = (token: string) => SpeechTranscriptionType;

interface SpeechSessionOptions {
  transcriptionFactory?: SpeechTranscriptionFactory;
}

const TRANSCRIPTION_PARAMS = {
  format: 'pcm', // 音频格式
  sample_rate: 16000,
  enable_punctuation_prediction: true,
  enable_inverse_text_normalization: true,
  enable_semantic_sentence_detection: config.recognition.enableSemanticSentenceDetection,
  enable_intermediate_result: true,
  enable_words: true,
};

function extractRecognitionResult(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.payload?.result ?? '';
  } catch (error) {
    logger.warn('speech', 'Failed to parse recognition payload', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return '';
  }
}

export class SpeechSession {
  private transcription: SpeechTranscriptionType | null = null;
  private readonly metrics = new SessionMetrics();
  private readonly audioQueue: AudioBufferQueue;
  private isReady = false;
  private closed = false;
  private readonly transcriptionFactory: SpeechTranscriptionFactory;
  private readonly translationCache = new Map<string, Promise<TranslationOutcome>>();
  private lastTranslatedSource = '';
  private lastSourceText = '';

  constructor(
    private readonly socket: WebSocket,
    private readonly connectionId: number,
    private readonly tokenProvider: NlsTokenProvider,
    private readonly translationService: TranslationService,
    options: SpeechSessionOptions = {}
  ) {
    this.transcriptionFactory =
      options.transcriptionFactory ??
      ((token) =>
        new SpeechTranscription({
          url: config.nls.wsUrl,
          appkey: config.nls.appKey,
          token,
        }));
    this.audioQueue = new AudioBufferQueue(config.recognition.bufferMaxChunks);
    this.setupSocketHandlers();
  }

  async initialize(): Promise<void> {
    const token = await this.tokenProvider.getToken();

    this.transcription = this.transcriptionFactory(token);

    this.attachTranscriptionListeners(this.transcription);

    try {
      await this.transcription.start(TRANSCRIPTION_PARAMS, true, config.server.pingIntervalMs);
      this.isReady = true;
      this.flushBufferedAudio();
      logger.info('speech', 'Speech transcription started', { connectionId: this.connectionId });
      sendJsonMessage(this.socket, 'started', { message: 'Speech recognition started' });
    } catch (error) {
      logger.error('speech', 'Failed to start speech transcription', {
        connectionId: this.connectionId,
        error: error instanceof Error ? error.message : 'unknown',
      });

      sendJsonMessage(this.socket, 'error', {
        message: 'Unable to start speech recognition service',
      });

      throw error;
    }
  }

  private setupSocketHandlers(): void {
    this.socket.on('message', (data: RawData) => {
      this.metrics.incrementAudioChunks();

      if (!this.isReady) {
        this.audioQueue.enqueue(data);
        return;
      }

      const buffer = toAudioBuffer(data);
      this.forwardAudio(buffer);
    });

    this.socket.on('close', () => {
      this.closed = true;
      void this.shutdown();
    });

    this.socket.on('error', (error: Error) => {
      logger.error('websocket', 'Client connection error', {
        connectionId: this.connectionId,
        error: error.message,
      });
    });
  }

  private attachTranscriptionListeners(transcription: SpeechTranscriptionType): void {
    transcription.on('started', (msg: string) => {
      logger.debug('speech', 'Transcription session started', {
        connectionId: this.connectionId,
        raw: msg,
      });
    });

    transcription.on('changed', async (msg: string) => {
      const result = extractRecognitionResult(msg);
      if (!result) {
        return;
      }

      await this.handleRecognition(result, 'changed');
    });

    transcription.on('end', async (msg: string) => {
      const result = extractRecognitionResult(msg);
      if (!result) {
        return;
      }

      await this.handleRecognition(result, 'end');
    });

    transcription.on('completed', async (msg: string) => {
      const result = extractRecognitionResult(msg);
      if (!result) {
        return;
      }

      await this.handleRecognition(result, 'completed');
    });

    transcription.on('closed', () => {
      logger.info('speech', 'Transcription session closed', { connectionId: this.connectionId });
      sendJsonMessage(this.socket, 'closed', { message: 'Speech recognition session closed' });
    });

    transcription.on('failed', (msg: string) => {
      const result = extractRecognitionResult(msg);
      logger.error('speech', 'Transcription failed', {
        connectionId: this.connectionId,
        details: result,
      });
      sendJsonMessage(this.socket, 'error', {
        message: 'Speech recognition failed',
        details: result,
      });
    });
  }

  private async handleRecognition(result: string, eventType: 'changed' | 'end' | 'completed'): Promise<void> {

    const { normalizedText } = normalizeJapaneseText(result);
    const textForTranslation = normalizedText || result;
    const shouldTranslate = this.shouldTranslateChanged(textForTranslation, eventType);
    logger.debug('speech', 'Should translate', {
      connectionId: this.connectionId,
      eventType,
      source: result,
      normalizedText,
      textForTranslation,
      shouldTranslate,
    });
    if (textForTranslation === this.lastSourceText) {
      return;
    }
    
    this.metrics.incrementTranslations();

    if (shouldTranslate) {
      const translation = await this.resolveTranslation(result, textForTranslation, eventType);
      this.lastTranslatedSource = result;
      sendJsonMessage(this.socket, eventType, {
        result: translation.translatedText,
        source: result,
        detectedLanguage: translation.detectedLanguage,
        isTranslated: true,
        latencyMs: translation.durationMs,
      });
      
      logger.debug('translation', 'Translation completed', {
        connectionId: this.connectionId,
        result: translation.translatedText,
      });
    }
  }

  private shouldTranslateChanged(normalizedResult: string, eventType: 'changed' | 'end' | 'completed'): boolean {

    if (normalizedResult === this.lastSourceText) {
      return false;
    }

    if (eventType === 'end' || eventType === 'completed') {
      return true;
    }

    if (
      normalizedResult.startsWith(this.lastTranslatedSource) &&
      normalizedResult.length - this.lastTranslatedSource.length < config.recognition.minChangedCharsDelta
    ) {
      return false;
    }

    return true;
  }

  private resolveTranslation(
    _rawResult: string,
    normalizedResult: string,
    eventType: 'changed' | 'end' | 'completed'
  ): Promise<TranslationOutcome> {
    const cacheKey = `${eventType}:${normalizedResult}`;
    const cached = this.translationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const promise = this.translationService
      .translate(normalizedResult, {
        connectionId: this.connectionId,
        eventType,
      })
      .finally(() => {
        this.translationCache.delete(cacheKey);
      });

    this.translationCache.set(cacheKey, promise);
    return promise;
  }

  private forwardAudio(buffer: Buffer): void {
    if (!this.transcription) {
      return;
    }

    const success = this.transcription.sendAudio(buffer);
    if (!success) {
      logger.warn('speech', 'Failed to forward audio chunk to transcription service', {
        connectionId: this.connectionId,
      });
      sendJsonMessage(this.socket, 'error', {
        message: 'Unable to forward audio chunk to recognition service',
      });
    }
  }

  private flushBufferedAudio(): void {
    const buffered = this.audioQueue.drain();
    if (buffered.length === 0) {
      return;
    }

    logger.debug('speech', 'Flushing buffered audio chunks', {
      connectionId: this.connectionId,
      count: buffered.length,
    });

    for (const chunk of buffered) {
      this.forwardAudio(chunk);
    }
  }

  private async shutdown(): Promise<void> {
    if (this.transcription) {
      try {
        await this.transcription.close();
      } catch (error) {
        logger.warn('speech', 'Error closing transcription session', {
          connectionId: this.connectionId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
      this.transcription.shutdown();
      this.transcription = null;
    }

    logger.info('session', 'Client disconnected', {
      connectionId: this.connectionId,
      metrics: this.metrics.snapshot(),
      closed: this.closed,
    });
  }
}
