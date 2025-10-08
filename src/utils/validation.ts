/**
 * Validate if a string is a valid URL
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate if a string is a valid RSS/Atom feed URL format
 */
export function isValidFeedUrl(urlString: string): boolean {
  if (!isValidUrl(urlString)) {
    return false;
  }

  // Additional RSS/Atom feed URL validation can be added here
  // For now, we just check if it's a valid HTTP/HTTPS URL
  return true;
}

/**
 * Sanitize feed name by removing invalid characters
 */
export function sanitizeFeedName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*]/g, '');
}
