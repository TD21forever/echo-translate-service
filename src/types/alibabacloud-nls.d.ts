declare module 'alibabacloud-nls' {
  import { EventEmitter } from 'events';

  export interface SpeechTranscriptionConfig {
    url: string;
    appkey: string;
    token: string;
  }

  export type SpeechTranscriptionEvent =
    | 'started'
    | 'changed'
    | 'completed'
    | 'closed'
    | 'failed'
    | 'begin'
    | 'end'
    | 'TranscriptionCompleted'
    | 'TaskFailed';

  export class SpeechTranscription extends EventEmitter {
    constructor(config: SpeechTranscriptionConfig);
    start(
      params: Record<string, unknown>,
      enablePing?: boolean,
      pingInterval?: number
    ): Promise<void>;
    close(payload?: Record<string, unknown>): Promise<void>;
    ctrl(payload: Record<string, unknown>): void;
    shutdown(): void;
    sendAudio(data: Buffer): boolean;
  }

  const nls: {
    SpeechTranscription: typeof SpeechTranscription;
  };

  export default nls;
}
