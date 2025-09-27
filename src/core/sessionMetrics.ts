export interface SessionMetricsSnapshot {
  audioChunks: number;
  translations: number;
}

export class SessionMetrics {
  private counters: SessionMetricsSnapshot = {
    audioChunks: 0,
    translations: 0,
  };

  incrementAudioChunks(): void {
    this.counters.audioChunks += 1;
  }

  incrementTranslations(): void {
    this.counters.translations += 1;
  }

  snapshot(): SessionMetricsSnapshot {
    return { ...this.counters };
  }
}
