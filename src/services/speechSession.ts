import { WebSocket, RawData } from 'ws';
import Nls from 'alibabacloud-nls';
import type { SpeechTranscription as SpeechTranscriptionType } from 'alibabacloud-nls';

import config from '../config';
import { NlsTokenProvider } from '../clients/nlsTokenProvider';
import { TranslationService } from './translationService';
import { logger } from '../utils/logger';
import { AudioBufferQueue, toAudioBuffer } from '../core/audioBufferQueue';
import { SessionMetrics } from '../core/sessionMetrics';
import { sendJsonMessage } from '../core/messages';

const { SpeechTranscription } = Nls;

const TRANSCRIPTION_PARAMS = {
  format: 'pcm',
  sample_rate: 16000,
  enable_punctuation_prediction: true,
  enable_inverse_text_normalization: true,
  enable_voice_detection: true,
  max_start_silence: 10000,
  max_end_silence: 800,
  enable_words: false,
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
  private readonly audioQueue = new AudioBufferQueue();
  private isReady = false;
  private closed = false;

  constructor(
    private readonly socket: WebSocket,
    private readonly connectionId: number,
    private readonly tokenProvider: NlsTokenProvider,
    private readonly translationService: TranslationService
  ) {
    this.setupSocketHandlers();
  }

  async initialize(): Promise<void> {
    const token = await this.tokenProvider.getToken();

    this.transcription = new SpeechTranscription({
      url: config.nls.wsUrl,
      appkey: config.nls.appKey,
      token,
    });

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

      await this.handleTranslation(result, 'changed');
    });

    transcription.on('end', async (msg: string) => {
      const result = extractRecognitionResult(msg);
      if (!result) {
        return;
      }

      await this.handleTranslation(result, 'end');
    });

    transcription.on('completed', async (msg: string) => {
      const result = extractRecognitionResult(msg);
      if (!result) {
        return;
      }

      await this.handleTranslation(result, 'completed');
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

  private async handleTranslation(result: string, eventType: 'changed' | 'end' | 'completed'): Promise<void> {
    this.metrics.incrementTranslations();
    logger.debug('translation', 'Processing recognition result', {
      connectionId: this.connectionId,
      eventType,
      textPreview: result.slice(0, 60),
    });

    const translation = await this.translationService.translate(result, {
      connectionId: this.connectionId,
      eventType,
    });

    sendJsonMessage(this.socket, eventType, {
      result: translation.translatedText,
      detectedLanguage: translation.detectedLanguage,
    });
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
