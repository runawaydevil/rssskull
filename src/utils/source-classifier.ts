/**
 * Source classifier for feed URLs
 * Determines whether a URL should use Reddit API, RSS, or is unsupported
 */

export type FeedSource = 'reddit' | 'rss' | 'unsupported';

import { extractSubreddit } from './url-sanitizer.js';

/**
 * Classify a feed URL to determine its source type
 * @param url The feed URL to classify
 * @returns FeedSource type
 */
export function classifySource(url: string): FeedSource {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '').toLowerCase();
    
    // Reddit (qualquer subdomínio) - sempre classificar como Reddit independente de ter .rss
    if (h === 'reddit.com' || h.endsWith('.reddit.com')) return 'reddit';
    
    // Heurística: se contém 'reddit' no host
    if (h.includes('reddit')) return 'reddit';
    
    // Feeds explícitos (.rss/.xml/.atom ou ?feed=) - mas NÃO se for Reddit
    if (/\.(rss|xml|atom)$/i.test(u.pathname) || u.searchParams.has('feed')) return 'rss';
    
    // Default: RSS genérico (muitos sites servem RSS com Content-Type correto)
    return 'rss';
  } catch {
    return 'unsupported';
  }
}

/**
 * Extract subreddit name from Reddit URL
 * @param url Reddit URL
 * @returns Subreddit name or null
 */
export function getSubredditFromUrl(url: string): string | null {
  return extractSubreddit(url);
}

