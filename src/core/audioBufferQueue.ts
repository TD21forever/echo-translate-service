import type { RawData } from 'ws';

function normalizeToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data.map((item) => Buffer.from(item)));
  }

  if (typeof data === 'string') {
    return Buffer.from(data, 'utf-8');
  }

  return Buffer.from([]);
}

export class AudioBufferQueue {
  private readonly queue: Buffer[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 32) {
    this.maxSize = maxSize;
  }

  enqueue(data: RawData): void {
    if (this.queue.length >= this.maxSize) {
      return;
    }

    this.queue.push(normalizeToBuffer(data));
  }

  drain(): Buffer[] {
    if (this.queue.length === 0) {
      return [];
    }

    const buffers = this.queue.splice(0, this.queue.length);
    return buffers;
  }

  clear(): void {
    this.queue.length = 0;
  }

  get size(): number {
    return this.queue.length;
  }
}

export function toAudioBuffer(data: RawData): Buffer {
  return normalizeToBuffer(data);
}
