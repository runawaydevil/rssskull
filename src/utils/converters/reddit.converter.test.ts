import { describe, expect, it } from 'vitest';
import { ConversionError } from './converter.interface.js';
import { RedditConverter } from './reddit.converter.js';

describe('RedditConverter', () => {
  const converter = new RedditConverter();

  describe('canHandle', () => {
    it('should handle valid subreddit URLs', () => {
      expect(converter.canHandle('https://reddit.com/r/programming')).toBe(true);
      expect(converter.canHandle('https://www.reddit.com/r/javascript/')).toBe(true);
      expect(converter.canHandle('https://old.reddit.com/r/typescript')).toBe(true);
      expect(converter.canHandle('https://new.reddit.com/r/node')).toBe(true);
    });

    it('should handle valid user URLs', () => {
      expect(converter.canHandle('https://reddit.com/u/username')).toBe(true);
      expect(converter.canHandle('https://www.reddit.com/user/testuser/')).toBe(true);
      expect(converter.canHandle('https://old.reddit.com/u/test-user')).toBe(true);
    });

    it('should reject non-Reddit URLs', () => {
      expect(converter.canHandle('https://youtube.com/watch?v=123')).toBe(false);
      expect(converter.canHandle('https://twitter.com/user')).toBe(false);
      expect(converter.canHandle('https://example.com')).toBe(false);
    });

    it('should reject invalid Reddit URLs', () => {
      expect(converter.canHandle('https://reddit.com/invalid')).toBe(false);
      expect(converter.canHandle('https://reddit.com/r/')).toBe(false);
      expect(converter.canHandle('invalid-url')).toBe(false);
    });
  });

  describe('convert', () => {
    it('should convert subreddit URLs to RSS format', async () => {
      const result = await converter.convert('https://reddit.com/r/programming');
      expect(result).toBe('https://www.reddit.com/r/programming.rss');
    });

    it('should convert user URLs to RSS format', async () => {
      const result = await converter.convert('https://reddit.com/u/testuser');
      expect(result).toBe('https://www.reddit.com/u/testuser.rss');
    });

    it('should handle URLs with query parameters', async () => {
      const result = await converter.convert('https://reddit.com/r/programming?sort=hot');
      expect(result).toBe('https://www.reddit.com/r/programming.rss');
    });

    it('should throw ConversionError for invalid URLs', async () => {
      await expect(converter.convert('https://youtube.com/watch?v=123')).rejects.toThrow(
        ConversionError
      );
    });
  });

  describe('extractSubredditName', () => {
    it('should extract subreddit names correctly', () => {
      expect(converter.extractSubredditName('https://reddit.com/r/programming')).toBe(
        'programming'
      );
      expect(converter.extractSubredditName('https://www.reddit.com/r/javascript/')).toBe(
        'javascript'
      );
      expect(converter.extractSubredditName('https://reddit.com/u/user')).toBe(null);
    });
  });

  describe('extractUsername', () => {
    it('should extract usernames correctly', () => {
      expect(converter.extractUsername('https://reddit.com/u/testuser')).toBe('testuser');
      expect(converter.extractUsername('https://www.reddit.com/user/test-user/')).toBe('test-user');
      expect(converter.extractUsername('https://reddit.com/r/programming')).toBe(null);
    });
  });
});
