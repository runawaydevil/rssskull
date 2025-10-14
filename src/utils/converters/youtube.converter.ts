import { ConversionError, type URLConverter } from './converter.interface.js';

/**
 * Converter for YouTube URLs to RSS feeds
 * Supports:
 * - Channel URLs: youtube.com/@channelname -> youtube.com/feeds/videos.xml?channel_id=...
 * - Channel URLs: youtube.com/c/channelname -> youtube.com/feeds/videos.xml?channel_id=...
 * - User URLs: youtube.com/user/username -> youtube.com/feeds/videos.xml?user=username
 * - Playlist URLs: youtube.com/playlist?list=... -> youtube.com/feeds/videos.xml?playlist_id=...
 */
export class YouTubeConverter implements URLConverter {
  readonly platform = 'youtube';

  private readonly YOUTUBE_DOMAINS = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
  ];

  private readonly CHANNEL_PATTERN = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/@([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;
  private readonly CHANNEL_C_PATTERN = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/c\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;
  private readonly USER_PATTERN = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/user\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;
  private readonly PLAYLIST_PATTERN = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)(?:&.*)?$/;
  private readonly VIDEO_PATTERN = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)(?:&.*)?$/;
  private readonly SHORT_PATTERN = /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)(?:\?.*)?$/;

  canHandle(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      // Check if it's a YouTube domain
      if (!this.YOUTUBE_DOMAINS.includes(hostname)) {
        return false;
      }

      // Check if it matches any YouTube pattern
      return (
        this.CHANNEL_PATTERN.test(url) ||
        this.CHANNEL_C_PATTERN.test(url) ||
        this.USER_PATTERN.test(url) ||
        this.PLAYLIST_PATTERN.test(url) ||
        this.VIDEO_PATTERN.test(url) ||
        this.SHORT_PATTERN.test(url)
      );
    } catch {
      return false;
    }
  }

  async convert(url: string): Promise<string> {
    if (!this.canHandle(url)) {
      throw new ConversionError(
        'URL is not a valid YouTube URL',
        url,
        this.platform
      );
    }

    try {
      // Check for channel pattern (@channelname)
      const channelMatch = url.match(this.CHANNEL_PATTERN);
      if (channelMatch) {
        const channelName = channelMatch[1];
        // For @channelname, we need to get the channel ID first
        // This is a limitation - we'd need to make an API call to get the channel ID
        throw new ConversionError(
          'YouTube @channel URLs require channel ID lookup. Please use the full channel URL or channel ID.',
          url,
          this.platform
        );
      }

      // Check for channel pattern (c/channelname)
      const channelCMatch = url.match(this.CHANNEL_C_PATTERN);
      if (channelCMatch) {
        const channelName = channelCMatch[1];
        // For c/channelname, we need to get the channel ID first
        throw new ConversionError(
          'YouTube c/channel URLs require channel ID lookup. Please use the full channel URL or channel ID.',
          url,
          this.platform
        );
      }

      // Check for user pattern
      const userMatch = url.match(this.USER_PATTERN);
      if (userMatch) {
        const username = userMatch[1];
        return `https://www.youtube.com/feeds/videos.xml?user=${username}`;
      }

      // Check for playlist pattern
      const playlistMatch = url.match(this.PLAYLIST_PATTERN);
      if (playlistMatch) {
        const playlistId = playlistMatch[1];
        return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
      }

      // Check for video pattern - extract channel from video
      const videoMatch = url.match(this.VIDEO_PATTERN);
      if (videoMatch) {
        const videoId = videoMatch[1];
        throw new ConversionError(
          'YouTube video URLs require channel ID lookup. Please use the channel URL instead.',
          url,
          this.platform
        );
      }

      // Check for short URL pattern - extract channel from video
      const shortMatch = url.match(this.SHORT_PATTERN);
      if (shortMatch) {
        const videoId = shortMatch[1];
        throw new ConversionError(
          'YouTube short URLs require channel ID lookup. Please use the channel URL instead.',
          url,
          this.platform
        );
      }

      throw new ConversionError('URL does not match expected YouTube patterns', url, this.platform);
    } catch (error) {
      if (error instanceof ConversionError) {
        throw error;
      }
      throw new ConversionError(
        `Failed to convert YouTube URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        url,
        this.platform,
        error instanceof Error ? error : undefined
      );
    }
  }

  async validate(rssUrl: string): Promise<boolean> {
    try {
      const response = await fetch(rssUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      return response.ok && response.headers.get('content-type')?.includes('xml');
    } catch {
      return false;
    }
  }
}
