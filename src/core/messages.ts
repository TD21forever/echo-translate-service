import { WebSocket } from 'ws';

export type ServerMessageType =
  | 'started'
  | 'changed'
  | 'completed'
  | 'closed'
  | 'failed'
  | 'begin'
  | 'end'
  | 'error';

export interface ServerMessage<T> {
  readonly type: ServerMessageType;
  readonly data: T;
}

export function sendJsonMessage<T>(socket: WebSocket, type: ServerMessageType, data: T): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const message: ServerMessage<T> = { type, data };
  socket.send(JSON.stringify(message));
}
