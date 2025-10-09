// Test setup file
import { afterAll, beforeAll } from 'vitest';

beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.BOT_TOKEN = 'test_token';
  process.env.DATABASE_URL = 'file:./test.db';
});

afterAll(async () => {
  // Cleanup after tests
});
