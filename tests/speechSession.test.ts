import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { EventEmitter } from 'events';
import type { WebSocket as WebSocketType } from 'ws';
import dns from 'node:dns';

const originalLookup = dns.lookup;
dns.lookup = ((hostname: any, options: any, callback: any) => {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  if (hostname === 'localhost') {
    return process.nextTick(() => callback(null, '127.0.0.1', 4));
  }

  return originalLookup.call(dns, hostname, options, callback);
}) as typeof dns.lookup;

if (dns.promises) {
  const originalLookupPromise = dns.promises.lookup;
  dns.promises.lookup = (async (hostname: any, options: any) => {
    if (hostname === 'localhost') {
      return { address: '127.0.0.1', family: 4 };
    }
    return originalLookupPromise.call(dns.promises, hostname, options);
  }) as typeof dns.promises.lookup;
}

process.env.ALI_ACCESS_KEY_ID = 'test-id';
process.env.ALI_ACCESS_KEY_SECRET = 'test-secret';
process.env.ALI_NLS_APP_KEY = 'test-app-key';

vi.mock('alibabacloud-nls', () => ({
  default: {
    SpeechTranscription: vi.fn(),
  },
}));

import { SpeechSession } from '../src/services/speechSession';
import type { TranslationService } from '../src/services/translationService';
import type { NlsTokenProvider } from '../src/clients/nlsTokenProvider';
import type { SpeechTranscription as SpeechTranscriptionType } from 'alibabacloud-nls';
import { sendJsonMessage } from '../src/core/messages';

vi.mock('../src/core/messages', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/core/messages')>();
  return {
    ...mod,
    sendJsonMessage: vi.fn(mod.sendJsonMessage),
  };
});

const READY_STATE_OPEN = 1;
const READY_STATE_CLOSED = 3;

class FakeWebSocket extends EventEmitter {
  public readyState = READY_STATE_OPEN;
  public sent: Array<{ type: string; data: unknown }> = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = READY_STATE_CLOSED;
    this.emit('close');
  }
}

class FakeTranscription extends EventEmitter implements SpeechTranscriptionType {
  public started = false;
  public audioChunks: Buffer[] = [];

  async start(): Promise<void> {
    this.started = true;
  }

  async close(): Promise<void> {
    this.emit('closed');
  }

  ctrl(): void {}

  shutdown(): void {}

  sendAudio(data: Buffer): boolean {
    this.audioChunks.push(data);
    return true;
  }
}

describe('SpeechSession', () => {
  const translateMock = vi.fn<TranslationService['translate']>();
  const tokenProviderMock = {
    getToken: vi.fn<Required<NlsTokenProvider>['getToken']>().mockResolvedValue('token'),
  } as unknown as NlsTokenProvider;

  let socket: FakeWebSocket;
  let transcription: FakeTranscription;

  beforeEach(() => {
    vi.clearAllMocks();
    socket = new FakeWebSocket();
    transcription = new FakeTranscription();
    translateMock.mockResolvedValue({
      translatedText: '你好',
      detectedLanguage: 'zh',
      durationMs: 5,
    });
  });

  it('buffers audio before transcription starts and flushes after initialization', async () => {
    const session = new SpeechSession(
      socket as unknown as WebSocketType,
      1,
      tokenProviderMock,
      { translate: translateMock } as unknown as TranslationService,
      {
        transcriptionFactory: () => transcription,
      }
    );

    const audioChunk = Buffer.from([1, 2, 3, 4]);
    socket.emit('message', audioChunk);
    expect(transcription.audioChunks).toHaveLength(0);

    await session.initialize();

    expect(tokenProviderMock.getToken).toHaveBeenCalledTimes(1);
    expect(transcription.started).toBe(true);
    expect(transcription.audioChunks).toHaveLength(1);
    expect(transcription.audioChunks[0]).toEqual(audioChunk);

    expect(sendJsonMessage).toHaveBeenCalledWith(socket, 'started', {
      message: 'Speech recognition started',
    });
  });

  it('translates recognition results and sends them to client', async () => {
    const session = new SpeechSession(
      socket as unknown as WebSocketType,
      2,
      tokenProviderMock,
      { translate: translateMock } as unknown as TranslationService,
      {
        transcriptionFactory: () => transcription,
      }
    );

    await session.initialize();

    const payload = JSON.stringify({ payload: { result: 'hello' } });
    transcription.emit('changed', payload);

    await vi.waitFor(() => {
      expect(translateMock).toHaveBeenCalledWith('hello', {
        connectionId: 2,
        eventType: 'changed',
      });
    });

    await vi.waitFor(() => {
      expect(sendJsonMessage).toHaveBeenCalledWith(socket, 'changed', expect.objectContaining({
        result: '你好',
        detectedLanguage: 'zh',
        isTranslated: true,
      }));
    });

    const calls = (sendJsonMessage as unknown as Mock).mock.calls;
    const immediate = calls.find((call) => call[1] === 'changed' && call[2]?.isTranslated === false);
    expect(immediate).toBeTruthy();
    expect(immediate?.[2]).toMatchObject({
      result: 'hello',
      source: 'hello',
      isFinal: false,
      isTranslated: false,
    });
  });
});
