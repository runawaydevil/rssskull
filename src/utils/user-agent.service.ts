import { logger } from './logger/logger.service.js';

export interface BrowserProfile {
  name: string;
  userAgent: string;
  headers: Record<string, string>;
  weight: number; // Probabilidade de uso (1-10)
}

export interface UserAgentSession {
  profile: BrowserProfile;
  startTime: number;
  requestCount: number;
  maxRequests: number; // Quantos requests antes de trocar
}

export class UserAgentService {
  private currentSession: UserAgentSession | null = null;

  // Pool de browsers reais com headers consistentes
  private browserProfiles: BrowserProfile[] = [
    // Chrome (mais comum)
    {
      name: 'Chrome 120 Windows',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      weight: 8,
    },
    {
      name: 'Chrome 119 macOS',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      weight: 7,
    },
    // Firefox
    {
      name: 'Firefox 121 Windows',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      weight: 6,
    },
    {
      name: 'Firefox 120 macOS',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      weight: 5,
    },
    // Safari
    {
      name: 'Safari 17 macOS',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
      },
      weight: 4,
    },
    // Edge
    {
      name: 'Edge 120 Windows',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      weight: 3,
    },
    // Chrome Mobile (para variedade)
    {
      name: 'Chrome Mobile Android',
      userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      weight: 2,
    },
  ];

  /**
   * Get headers for a request (mantém sessão ou cria nova)
   */
  getHeaders(url: string): Record<string, string> {
    // Verifica se precisa de nova sessão
    if (this.needsNewSession()) {
      this.startNewSession();
    }

    if (!this.currentSession) {
      this.startNewSession();
    }

    // Incrementa contador da sessão
    this.currentSession!.requestCount++;

    // Headers base da sessão atual
    const headers = { ...this.currentSession!.profile.headers };

    // Adiciona headers específicos para RSS/Atom
    headers['Accept'] = 'application/atom+xml, application/rss+xml, text/xml;q=0.9, */*;q=0.8';

    // Headers específicos por domínio com variação aleatória
    if (url.includes('reddit.com')) {
      headers['Referer'] = 'https://www.reddit.com/';
      // Variação aleatória de Accept-Language
      const languages = [
        'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
        'en-US,en;q=0.9',
        'en-US,en;q=0.9,pt;q=0.8',
        'en-US,en;q=0.9,es;q=0.8',
      ];
      headers['Accept-Language'] = languages[Math.floor(Math.random() * languages.length)]!;
      // User-Agent específico para Reddit
      headers['User-Agent'] = 'PortalIdeaFeedBot/1.0 (+https://portalidea.com.br)';
    } else if (url.includes('youtube.com')) {
      headers['Referer'] = 'https://www.youtube.com/';
    } else if (url.includes('github.com')) {
      headers['Referer'] = 'https://github.com/';
    }

    // Adicionar variação aleatória em headers comuns
    const acceptEncodings = ['gzip, deflate, br', 'gzip, deflate', 'gzip', 'deflate'];
    headers['Accept-Encoding'] = acceptEncodings[Math.floor(Math.random() * acceptEncodings.length)]!;
    
    // Variação aleatória de Connection
    headers['Connection'] = Math.random() > 0.5 ? 'keep-alive' : 'close';
    
    // Variação aleatória de Cache-Control
    const cacheControls = ['no-cache', 'max-age=0', 'no-store'];
    headers['Cache-Control'] = cacheControls[Math.floor(Math.random() * cacheControls.length)]!;

    logger.debug(`Using User-Agent: ${this.currentSession!.profile.name}`, {
      url: this.extractDomain(url),
      sessionRequests: this.currentSession!.requestCount,
      maxRequests: this.currentSession!.maxRequests,
    });

    return headers;
  }

  /**
   * Verifica se precisa de nova sessão
   */
  private needsNewSession(): boolean {
    if (!this.currentSession) return true;

    // Sessão expirou por número de requests
    if (this.currentSession.requestCount >= this.currentSession.maxRequests) {
      return true;
    }

    // Sessão expirou por tempo (20 minutos para rotação dinâmica)
    const sessionAge = Date.now() - this.currentSession.startTime;
    const maxSessionTime = 20 * 60 * 1000; // 20 minutos exatos
    if (sessionAge > maxSessionTime) {
      return true;
    }

    return false;
  }

  /**
   * Inicia nova sessão com browser profile
   */
  private startNewSession(): void {
    const profile = this.selectBrowserProfile();
    
    // Número de requests por sessão (baseado em 20 minutos)
    const maxRequests = 3; // 3 requests por sessão de 20 minutos

    this.currentSession = {
      profile,
      startTime: Date.now(),
      requestCount: 0,
      maxRequests,
    };

    // Não mantém histórico para evitar padrões detectáveis
    // Cada seleção é completamente independente

    logger.info(`Started new browser session: ${profile.name}`, {
      maxRequests,
      sessionDuration: '20 minutes',
    });
  }

  /**
   * Seleciona browser profile totalmente aleatório (sem padrões)
   */
  private selectBrowserProfile(): BrowserProfile {
    // Seleção completamente aleatória - sem pesos, sem histórico
    const randomIndex = Math.floor(Math.random() * this.browserProfiles.length);
    return this.browserProfiles[randomIndex]!;
  }

  /**
   * Extrai domínio da URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get current session info for debugging
   */
  getCurrentSessionInfo(): any {
    if (!this.currentSession) {
      return { status: 'no_session' };
    }

    return {
      browser: this.currentSession.profile.name,
      requests: this.currentSession.requestCount,
      maxRequests: this.currentSession.maxRequests,
      sessionAge: Date.now() - this.currentSession.startTime,
    };
  }

  /**
   * Force new session (para testes)
   */
  forceNewSession(): void {
    this.currentSession = null;
    logger.info('Forced new browser session');
  }

  /**
   * Get stats sobre uso de browsers
   */
  getStats(): Record<string, any> {
    const stats = {
      currentSession: this.getCurrentSessionInfo(),
      availableProfiles: this.browserProfiles.length,
      profileNames: this.browserProfiles.map(p => p.name),
      selectionMethod: 'completely_random',
    };

    return stats;
  }
}

// Singleton instance
export const userAgentService = new UserAgentService();