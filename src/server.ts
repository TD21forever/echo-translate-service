import { WebSocketServer } from 'ws';

import config from './config';
import { NlsTokenProvider } from './clients/nlsTokenProvider';
import { TranslationService } from './services/translationService';
import { SpeechSession } from './services/speechSession';
import { logger } from './utils/logger';

export interface ServerStartupResult {
  server: WebSocketServer;
  port: number;
}

export async function startServer(): Promise<ServerStartupResult> {
  const tokenProvider = new NlsTokenProvider();
  const translationService = new TranslationService();

  const server = new WebSocketServer({ port: config.server.port });
  logger.info('startup', `WebSocket server listening on port ${config.server.port}`);

  let connectionCounter = 0;

  server.on('connection', (socket) => {
    connectionCounter += 1;
    const connectionId = connectionCounter;
    logger.info('websocket', 'Client connected', { connectionId });

    const session = new SpeechSession(socket, connectionId, tokenProvider, translationService);

    session
      .initialize()
      .catch((error) => {
        logger.error('startup', 'Failed to initialize speech session', {
          connectionId,
          error: error instanceof Error ? error.message : 'unknown',
        });
        socket.close(1011, 'Unable to start speech recognition session');
      });
  });

  server.on('error', (error) => {
    logger.error('startup', 'WebSocket server encountered an error', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  });

  return { server, port: config.server.port };
}
