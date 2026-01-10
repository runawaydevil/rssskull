import crypto from 'crypto';

/**
 * Normalize item ID to ensure consistency across different feed sources
 * Priority: id > guid > link > hash(title+link+pubDate)
 */
export function normalizeItemId(item: {
  id?: string;
  guid?: string;
  link?: string;
  title?: string;
  pubDate?: Date;
}): string {
  // 1. If already has ID (Reddit t3_*, etc.), use it
  if (item.id) return item.id;
  
  // 2. If has GUID, use it
  if (item.guid) return item.guid;
  
  // 3. If has link, use it
  if (item.link) return item.link;
  
  // 4. Fallback: hash(title + link + pubDate)
  const composite = `${item.title || ''}|${item.link || ''}|${item.pubDate?.toISOString() || ''}`;
  return `hash:${crypto.createHash('sha256').update(composite).digest('hex').substring(0, 16)}`;
}

