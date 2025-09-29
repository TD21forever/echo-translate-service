import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    api: {
      host: '127.0.0.1',
      port: 0,
    },
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
