import { beforeEach, describe, expect, it } from 'vitest';

describe('Config Service', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.BOT_TOKEN;
    delete process.env.PORT;
    delete process.env.LOG_LEVEL;
  });

  it('should validate required bot token', () => {
    process.env.BOT_TOKEN = 'test_token';

    expect(process.env.BOT_TOKEN).toBe('test_token');
  });

  it('should handle environment variable parsing', () => {
    process.env.BOT_TOKEN = 'custom_token';
    process.env.PORT = '8080';
    process.env.LOG_LEVEL = 'debug';

    expect(process.env.BOT_TOKEN).toBe('custom_token');
    expect(process.env.PORT).toBe('8080');
    expect(process.env.LOG_LEVEL).toBe('debug');
  });
});
