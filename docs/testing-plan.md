# 测试方案（WebSocket & 单元测试）

## 测试目标

1. 确认 WebSocket 生命周期（连接、消息、关闭）行为符合预期。
2. 验证 `SpeechSession` 在识别前缓冲、识别中转发、识别后收尾的流程正确。
3. 模拟阿里云 SDK 交互，确保翻译失败、Token 过期等异常路径可回退且日志正确。
4. 为后续接入真实音频流提供快速回归手段。

## 建议工具

- 测试框架：`vitest` 或 `jest`（推荐 vitest，轻量且原生支持 ESM/TS）。
- WebSocket Mock：`ws` 提供的 `WebSocketServer` 可在测试中启动内存服务器。
- 语音/翻译 SDK Mock：使用 `vi.mock`/`jest.mock` 模拟 `alibabacloud-nls` 与 `@alicloud/alimt20181012`。

## 单测拆分

| 用例 | 场景 | 断言重点 |
| ---- | ---- | -------- |
| `SpeechSession` 初始化 | Token 正常返回 | `started` 消息发送、缓冲区被清空 |
| 音频缓冲 | NLS 未 ready，音频先到 | 缓冲队列长度、ready 后是否全部转发 |
| 翻译成功 | `translationService.translate` 正常 | 返回的 `changed`/`end` 包含译文与语言标记 |
| 翻译失败回退 | 模拟抛错 | `error` 日志、消息 payload 中回退原文 |
| Token 过期重取 | 人为设定过期时间 | 新 token 请求次数、日志信息 |
| WebSocket 关闭 | 主动关闭连接 | `close` 调用后是否释放资源、打印 metrics |

### 伪代码示例（Vitest）

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { SpeechSession } from '../src/services/speechSession';

vi.mock('alibabacloud-nls', () => ({
  default: {
    SpeechTranscription: vi.fn().mockImplementation(() => mockTranscription),
  },
}));

it('flushes buffered audio after transcription starts', async () => {
  const session = new SpeechSession(mockSocket, 1, mockTokenProvider, mockTranslationService);
  session['socket'].emit('message', Buffer.alloc(10));
  await session.initialize();
  expect(mockTranscription.sendAudio).toHaveBeenCalled();
});
```

> 说明：真实测试时需替换为项目内的 mock 实现，并断言消息通过 `JSON.parse` 校验。

## 集成测试建议

1. 启动本地服务：`npm run dev`。
2. 编写测试客户端脚本：
   ```bash
   node scripts/ws-smoke-test.js
   ```
   - 建立连接
   - 发送 2~3 个模拟音频包（可使用空白 PCM 或随机字节）
   - 期待 `started` / `error` 反馈

3. 若需要更真实的验证，可准备 3~5 秒的 16kHz PCM 小音频（可选）。
   - 可以通过 ffmpeg 生成：
     ```bash
     ffmpeg -i sample.wav -f s16le -acodec pcm_s16le -ar 16000 -ac 1 sample.pcm
     ```
   - 然后按 3200 字节/帧分片发送，模拟 100ms 音频块。

## 回归策略

- 每次改动核心流程（会话、翻译、配置）后，至少执行一次 `npm run lint` + 单测命令。
- 发布前进行一次集成冒烟，确认服务在真实密钥下可与阿里云侧正常握手。

## 音频样本说明

- 若已有真实录音，可截取少量片段作为测试；
- 若不便提供真实音频，可使用白噪声或静音 PCM，主要用于验证 WebSocket 流程；
- 推荐保留一个公开的“测试音频”目录（例如 `fixtures/audio/`），方便团队共享。
