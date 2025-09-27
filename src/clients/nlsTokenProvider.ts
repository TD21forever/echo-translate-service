import RPCClient from '@alicloud/pop-core';

import config from '../config';
import { logger } from '../utils/logger';

interface CreateTokenResponse {
  Token?: {
    Id?: string;
    ExpireTime?: string;
  };
}

export class NlsTokenProvider {
  private readonly client: RPCClient;
  private cachedToken: string | null = null;
  private expiryEpochMs = 0;

  constructor() {
    this.client = new RPCClient({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: config.nls.endpoint,
      apiVersion: config.nls.apiVersion,
    });
  }

  async getToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    const isTokenValid = this.cachedToken && now < this.expiryEpochMs - 60_000;

    if (!forceRefresh && isTokenValid) {
      return this.cachedToken as string;
    }

    logger.debug('nls-token', 'Refreshing Alibaba Cloud NLS token');
    const response = (await this.client.request<CreateTokenResponse>(
      'CreateToken',
      {},
      { method: 'POST' }
    )) as CreateTokenResponse;

    const token = response.Token?.Id;
    const expires = response.Token?.ExpireTime;

    if (!token || !expires) {
      throw new Error('Failed to obtain NLS token: missing token or expiry in response');
    }

    this.cachedToken = token;
    this.expiryEpochMs = Date.parse(expires);

    if (Number.isNaN(this.expiryEpochMs)) {
      logger.warn('nls-token', 'Received invalid expiry time, defaulting to 30 minutes');
      this.expiryEpochMs = now + 30 * 60 * 1000;
    }

    logger.info('nls-token', 'Obtained new NLS token', {
      expiresAt: new Date(this.expiryEpochMs).toISOString(),
    });

    return token;
  }
}
