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
  private sessionHistory: string[] = []; // Últimos user-agents usados

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

    // Adiciona headers específicos para RSS
    headers['Accept'] = 'application/rss+xml, application/xml, text/xml, application/atom+xml, ' + headers['Accept'];

    // Headers específicos por domínio
    if (url.includes('reddit.com')) {
      headers['Referer'] = 'https://www.reddit.com/';
      // Reddit gosta de Accept-Language mais específico
      headers['Accept-Language'] = 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7';
    } else if (url.includes('youtube.com')) {
      headers['Referer'] = 'https://www.youtube.com/';
    } else if (url.includes('github.com')) {
      headers['Referer'] = 'https://github.com/';
    }

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

    // Sessão expirou por tempo (2-6 horas)
    const sessionAge = Date.now() - this.currentSession.startTime;
    const maxSessionTime = 2 * 60 * 60 * 1000 + Math.random() * 4 * 60 * 60 * 1000; // 2-6h
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
    
    // Número aleatório de requests por sessão (10-50)
    const maxRequests = 10 + Math.floor(Math.random() * 40);

    this.currentSession = {
      profile,
      startTime: Date.now(),
      requestCount: 0,
      maxRequests,
    };

    // Adiciona ao histórico
    this.sessionHistory.push(profile.userAgent);
    if (this.sessionHistory.length > 10) {
      this.sessionHistory.shift(); // Mantém só os últimos 10
    }

    logger.info(`Started new browser session: ${profile.name}`, {
      maxRequests,
      sessionDuration: '2-6 hours',
    });
  }

  /**
   * Seleciona browser profile baseado em peso e histórico
   */
  private selectBrowserProfile(): BrowserProfile {
    // Filtra profiles que não foram usados recentemente
    const availableProfiles = this.browserProfiles.filter(profile => 
      !this.sessionHistory.slice(-3).includes(profile.userAgent) // Evita últimos 3
    );

    // Se todos foram usados recentemente, usa todos
    const profiles = availableProfiles.length > 0 ? availableProfiles : this.browserProfiles;

    // Seleção baseada em peso
    const totalWeight = profiles.reduce((sum, profile) => sum + profile.weight, 0);
    let random = Math.random() * totalWeight;

    for (const profile of profiles) {
      random -= profile.weight;
      if (random <= 0) {
        return profile;
      }
    }

    // Fallback (não deveria acontecer)
    if (profiles.length === 0) {
      return this.browserProfiles[0]!;
    }
    return profiles[0]!;
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
      recentUserAgents: this.sessionHistory.slice(-3),
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
      sessionHistory: this.sessionHistory.length,
    };

    return stats;
  }
}

// Singleton instance
export const userAgentService = new UserAgentService();