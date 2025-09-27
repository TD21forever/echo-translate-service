declare module '@alicloud/pop-core' {
  export interface RPCClientConfig {
    accessKeyId: string;
    accessKeySecret: string;
    endpoint: string;
    apiVersion: string;
  }

  export interface RequestOptions {
    method?: string;
    protocol?: string;
    format?: string;
  }

  export default class RPCClient {
    constructor(config: RPCClientConfig);
    request<T = unknown>(
      action: string,
      parameters?: Record<string, unknown>,
      options?: RequestOptions
    ): Promise<T>;
  }
}
