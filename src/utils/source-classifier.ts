/**
 * Source classifier for feed URLs
 * Determines whether a URL should use Reddit API, RSS, or is unsupported
 */

export type FeedSource = 'reddit' | 'rss' | 'unsupported';

/**
 * Classify a feed URL to determine its source type
 * @param url The feed URL to classify
 * @returns FeedSource type
 */
export function classifySource(url: string): FeedSource {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '').toLowerCase();
    
    // Reddit (qualquer subdomínio)
    if (h === 'reddit.com' || h.endsWith('.reddit.com')) return 'reddit';
    
    // Feeds explícitos (.rss/.xml/.atom ou ?feed=)
    if (/\.(rss|xml|atom)$/i.test(u.pathname) || u.searchParams.has('feed')) return 'rss';
    
    // Heurística: se contém 'reddit' no host
    if (h.includes('reddit')) return 'reddit';
    
    // Default: RSS genérico (muitos sites servem RSS com Content-Type correto)
    return 'rss';
  } catch {
    return 'unsupported';
  }
}

