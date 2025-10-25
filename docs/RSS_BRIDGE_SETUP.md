# RSS-Bridge Setup para Instagram

## Visão Geral

Este documento explica como configurar e usar o RSS-Bridge para Instagram e outras redes sociais no RSS Skull Bot.

---

## O que é RSS-Bridge?

RSS-Bridge é um projeto que cria feeds RSS a partir de sites que não possuem feeds nativos, incluindo:
- Instagram (usuários e hashtags)
- Facebook
- Twitter/X
- YouTube
- E muitas outras plataformas

No RSS Skull Bot, ele é usado como um "proxy" que converte URLs de redes sociais em feeds RSS válidos.

---

## Pré-requisitos

1. Docker e Docker Compose instalados
2. Acesso a uma conta Instagram (para obter cookies)
3. Arquivo `.env` configurado

---

## Setup Passo a Passo

### 1. Obter Cookies do Instagram

**Importante**: Os cookies são necessários para que o Instagram Bridge funcione.

#### Método 1: Via Navegador (Chrome/Firefox)

1. Abra o Instagram no navegador e faça login
2. Pressione F12 para abrir DevTools
3. Vá em **Application** (Chrome) ou **Storage** (Firefox)
4. Clique em **Cookies** → `https://www.instagram.com`
5. Encontre os seguintes cookies:
   - `sessionid` - Copie o valor
   - `ds_user_id` - Copie o valor

#### Método 2: Via Extensão do Navegador

Use uma extensão como "Cookie-Editor" para exportar todos os cookies do Instagram.

### 2. Configurar Variáveis de Ambiente

Edite o arquivo `.env` (ou `.env.example` como base):

```bash
# RSS-Bridge Configuration
RSS_BRIDGE_HOST=http://rss-bridge:80

# Instagram Bridge Credentials
INSTAGRAM_SESSION_ID=sua_session_id_aqui
INSTAGRAM_DS_USER_ID=seu_ds_user_id_aqui
```

**⚠️ SEGURANÇA**: Nunca commite o arquivo `.env` com valores reais!

### 3. Subir o RSS-Bridge

O RSS-Bridge já está configurado no `docker-compose.yml`. Basta executar:

```bash
docker compose up -d
```

Isso vai subir:
- Redis
- RSS-Bridge (porta 3000)
- RSS Skull Bot

### 4. Verificar se RSS-Bridge Está Funcionando

Acesse no navegador:
```
http://localhost:3000
```

Você deve ver a interface web do RSS-Bridge.

### 5. Testar Instagram Bridge

Teste direto na interface:
```
http://localhost:3000/?action=display&bridge=Instagram&u=instagram&format=Atom
```

Ou use o bot:
```
/add nome_instagram https://instagram.com/nome_usuario
```

---

## Como Funciona

### Arquitetura

```
Usuário do Bot
    ↓
Telegram Command (/add)
    ↓
Provider Registry
    ↓
Instagram Provider
    ↓
RSS-Bridge (converte URL Instagram → RSS)
    ↓
Bot processa feed RSS
    ↓
Notificação enviada ao usuário
```

### Fluxo de Conversão

1. **Usuário digita**: `/add instagram https://instagram.com/natgeo`
2. **Bot detecta**: URL é Instagram (via `InstagramProvider.canHandle()`)
3. **Bot converte**: URL → RSS-Bridge endpoint
   ```
   http://rss-bridge:80/?action=display&bridge=Instagram&u=natgeo&format=Atom
   ```
4. **Bot armazena**: URL do RSS-Bridge como `rssUrl` no banco
5. **Bot agenda**: Polling a cada 12 minutos (configurado no provider)
6. **Bot processa**: Feed RSS normal como qualquer outro feed

---

## Suportando Novas Redes Sociais

O sistema é extensível. Para adicionar uma nova rede:

### 1. Criar Provider

Crie `src/providers/seunetwork.provider.ts`:

```typescript
import { logger } from '../utils/logger/logger.service.js';
import type { SocialBridgeProvider } from './social-provider.interface.js';

export class SeuNetworkProvider implements SocialBridgeProvider {
  name = 'seunetwork';
  private readonly bridgeHost = process.env.RSS_BRIDGE_HOST || 'http://rss-bridge:80';

  canHandle(inputUrl: string): boolean {
    return inputUrl.includes('seunetwork.com');
  }

  buildFeedUrl(inputUrl: string): string {
    // Implementar conversão de URL para RSS-Bridge
    return `${this.bridgeHost}/?action=display&bridge=SuaNetwork&...&format=Atom`;
  }

  async healthCheck(): Promise<boolean> {
    // Implementar health check
    return true;
  }

  getCacheTTL(): number {
    return 3600000; // 1h
  }

  getPollInterval(): number {
    return 10; // 10 min
  }

  getPriority(): number {
    return 1; // Alta prioridade
  }
}
```

### 2. Registrar no Registry

Edite `src/providers/provider-registry.ts`:

```typescript
import { SeuNetworkProvider } from './seunetwork.provider.js';

constructor() {
  this.registerProvider(new InstagramProvider());
  this.registerProvider(new SeuNetworkProvider()); // Adicionar aqui
}
```

### 3. Compilar e Testar

```bash
npm run build
npm start
```

---

## Troubleshooting

### Problema: Instagram Bridge retorna 401

**Causa**: Cookies expirados ou inválidos

**Solução**:
1. Obter novos cookies do Instagram
2. Atualizar `.env` com novos valores
3. Reiniciar containers: `docker compose restart`

### Problema: RSS-Bridge não está acessível

**Causa**: Container não iniciou ou porta bloqueada

**Solução**:
```bash
# Verificar logs
docker compose logs rss-bridge

# Verificar se container está rodando
docker ps | grep rss-bridge

# Reiniciar se necessário
docker compose restart rss-bridge
```

### Problema: Feed Instagram não tem novos posts

**Causa**: Cache muito longo ou poll interval muito grande

**Solução**:
- Insta cache_timeout está em 3600s (1h) no `config.ini.php`
- Bot poll está em 12 min por padrão
- Reduzir conforme necessário

### Problema: Rate limit 429

**Causa**: Muitas requisições ao Instagram

**Solução**:
- Aumentar `cache_timeout` no `config.ini.php` (ex: 7200s = 2h)
- Reduzir frequência de polling no bot
- Implementar retry com backoff

---

## Configurações Avançadas

### Cache Timeout Personalizado

Edite `rss-bridge/config/config.ini.php`:

```ini
[InstagramBridge]
cache_timeout = 7200  ; 2 horas (mais conservador)
```

### Polling Interval Personalizado

Configure no provider:

```typescript
getPollInterval(): number {
  return 15; // 15 minutos para feed lento
}
```

### Whitelist de Bridges

Se quiser habilitar apenas bridges específicas:

```ini
[system]
whitelist_mode = true
```

E liste as bridges em `src/utils/whitelist.php` (se necessário).

---

## Monitoramento

### Health Check

O bot verifica automaticamente a saúde das bridges a cada 5 minutos.

Verificar status via endpoint:
```bash
curl http://localhost:8916/bridge-status
```

### Logs

Ver logs do RSS-Bridge:
```bash
docker compose logs -f rss-bridge
```

Ver logs do bot:
```bash
docker compose logs -f rss-skull-bot
```

### Métricas

O bot registra:
- Latência publish→notify por bridge
- Taxa de sucesso vs falhas
- Status de autenticação

Acesse via:
```bash
curl http://localhost:8916/stats
```

---

## Segurança

### ⚠️ IMPORTANTE

1. **Nunca logue cookies**: Cookies nunca aparecem em logs do bot
2. **Use secrets**: Cookies ficam em `.env` (não versionado)
3. **Rotacione cookies**: Renove quando expirarem (geralmente a cada 30 dias)
4. **Restrinja acesso**: RSS-Bridge só deve ser acessível internamente

### Renovação de Cookies

Os cookies do Instagram expiram periodicamente. Quando isso acontecer:

1. Bot detecta erro 401
2. Log de erro é registrado
3. Alertas são enviados (se configurado)
4. Usuário deve renovar cookies manualmente

**Como renovar**:
1. Obter novos cookies (mesmo processo inicial)
2. Atualizar `.env`
3. Reiniciar containers

---

## Limitações Conhecidas

1. **Instagram**: Rate limits são rígidos; use cache_timeout alto
2. **Facebook**: Requer autenticação OAuth (complexo)
3. **Twitter**: Rate limits muito restritivos na API pública
4. **YouTube**: Funciona melhor via conversor direto

---

## Suporte

Para problemas:
1. Verifique logs do RSS-Bridge
2. Verifique logs do bot
3. Verifique status via `/bridge-status`
4. Abra issue no GitHub se persistir

---

**Última atualização**: 24 de Outubro de 2025  
**Autor**: Pablo Murad (@runawaydevil)

