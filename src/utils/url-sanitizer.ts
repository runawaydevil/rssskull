import { logger } from './logger/logger.service.js';

/**
 * Sanitize and fix common URL typos and malformations
 * @param raw Raw URL string from user input
 * @returns Sanitized URL or null if invalid
 */
export function sanitizeUrl(raw: string): string | null {
  if (!raw) return null;
  
  let s = raw.trim();
  
  // 1) Corrigir typos comuns de esquema
  s = s.replace(/^htts:\/\//i, 'https://');
  s = s.replace(/^htp:\/\//i, 'http://');
  s = s.replace(/^http:\/\/https:\/\//i, 'https://');
  s = s.replace(/^https:\/\/http:\/\//i, 'https://');
  
  // 2) Corrigir duplicações de protocolo
  s = s.replace(/^(https?:\/\/)+(https?:\/\/)/i, (m) => m.startsWith('https') ? 'https://' : 'http://');
  
  // 3) Corrigir "https://www.htts//"
  s = s.replace(/^https:\/\/www\.htts\/\//i, 'https://www.');
  s = s.replace(/^http:\/\/www\.htts\/\//i, 'http://www.');
  
  // 4) Remover espaços e âncoras/lixo óbvio
  s = s.replace(/\s+/g, '');
  s = s.replace(/[#\s]+$/g, '');
  
  // 5) Garantir que tenha protocolo
  if (!/^https?:\/\//i.test(s)) {
    s = 'https://' + s;
  }
  
  try {
    const u = new URL(s);
    
    // Validar protocolo permitido
    if (!/^https?:$/i.test(u.protocol)) {
      logger.warn(`Invalid protocol in URL: ${raw} → ${u.protocol}`);
      return null;
    }
    
    // Validar hostname não vazio
    if (!u.hostname || u.hostname.trim() === '') {
      logger.warn(`Empty hostname in URL: ${raw}`);
      return null;
    }
    
    return u.toString();
  } catch (error) {
    logger.warn(`Failed to parse URL: ${raw}`, error);
    return null;
  }
}

/**
 * Extract subreddit name from Reddit URL
 * @param url Reddit URL (with or without /r/ prefix)
 * @returns Subreddit name or null
 */
export function extractSubreddit(url: string): string | null {
  try {
    // Tentar extrair de URL completa
    const match = url.match(/reddit\.com\/r\/([^\/?#]+)/i);
    if (match) {
      return match[1] || null;
    }
    
    // Tentar extrair de formato "r/subreddit"
    const rMatch = url.match(/^r\/([^\/?#]+)/i);
    if (rMatch) {
      return rMatch[1] || null;
    }
    
    return null;
  } catch {
    return null;
  }
}
