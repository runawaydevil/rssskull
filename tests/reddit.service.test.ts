/**
 * Unit tests for Reddit Service
 * Tests JSON API parsing, ID generation, and .rss detection
 */

import { describe, it, expect } from '@jest/globals';
import { redditService } from '../src/services/reddit.service.js';

describe('RedditService', () => {
  describe('isRedditUrl', () => {
    it('should detect Reddit URLs with /r/', () => {
      expect(redditService.isRedditUrl('https://reddit.com/r/brasil')).toBe(true);
      expect(redditService.isRedditUrl('https://www.reddit.com/r/brasil')).toBe(true);
    });

    it('should detect Reddit URLs with .rss', () => {
      expect(redditService.isRedditUrl('https://reddit.com/r/brasil.rss')).toBe(true);
      expect(redditService.isRedditUrl('https://www.reddit.com/r/brasil/.rss')).toBe(true);
    });

    it('should detect Reddit URLs with .json', () => {
      expect(redditService.isRedditUrl('https://reddit.com/r/brasil.json')).toBe(true);
    });

    it('should not detect non-Reddit URLs', () => {
      expect(redditService.isRedditUrl('https://github.com/user/repo')).toBe(false);
      expect(redditService.isRedditUrl('https://youtube.com')).toBe(false);
    });
  });

  describe('extractSubreddit', () => {
    it('should extract subreddit name from URL', () => {
      expect(redditService.extractSubreddit('https://reddit.com/r/brasil')).toBe('brasil');
      expect(redditService.extractSubreddit('https://reddit.com/r/brasil.rss')).toBe('brasil');
      expect(redditService.extractSubreddit('https://reddit.com/r/python')).toBe('python');
    });

    it('should return null for invalid URLs', () => {
      expect(redditService.extractSubreddit('https://github.com')).toBe(null);
    });
  });

  describe('convertPostsToRSSItems', () => {
    it('should convert Reddit posts to RSS items with t3_ IDs', () => {
      const mockPosts = [
        {
          id: 't3_abc123',
          title: 'Test Post',
          url: 'https://example.com',
          permalink: '/r/test/comments/abc123',
          created_utc: 1699000000,
          author: 'testuser',
          subreddit: 'test',
          score: 100,
          num_comments: 5,
        },
      ];

      // Access private method via type assertion
      const result = (redditService as any).convertPostsToRSSItems(mockPosts);
      
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('reddit_t3_abc123');
      expect(result[0]?.title).toBe('Test Post');
      expect(result[0]?.pubDate).toBeInstanceOf(Date);
    });
  });
});

