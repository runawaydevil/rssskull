# Arquivos e Funcionalidades Deprecados

## Data: 24 de Outubro de 2025

Este documento lista arquivos e funcionalidades que foram removidos ou marcados como deprecados durante a limpeza e refatoração do projeto.

---

## Arquivos Removidos

### 1. `src/bot/bot-simple.service.ts`

**Razão**: Era uma versão simplificada do bot que não estava sendo usada. O projeto usa apenas `bot.service.ts` completo.

**Alternativa**: Use `src/bot/bot.service.ts` para toda funcionalidade do bot.

**Data de remoção**: 24/10/2025

---

### 2. `src/main-debug-detailed.ts`

**Razão**: Versão debug do main.ts não mais necessária. Logs detalhados podem ser obtidos via variável de ambiente `LOG_LEVEL=debug`.

**Alternativa**: 
- Use `src/main.ts` como entry point principal
- Configure `LOG_LEVEL=debug` para logs detalhados
- Use endpoints `/log` e `/loge` no bot para ver logs em tempo real

**Data de remoção**: 24/10/2025

---

### 3. `src/utils/converters/reddit.converter.ts`

**Razão**: Reddit agora usa JSON API diretamente através de `reddit.service.ts`, tornando o conversor RSS obsoleto.

**Alternativa**: 
- Conversão Reddit agora é feita em `src/services/reddit.service.ts`
- URLs Reddit são detectadas e convertidas automaticamente para JSON API
- Fallback para RSS continua disponível caso JSON falhe

**Motivo técnico**: JSON API oferece:
- Latência menor
- Menos bloqueios do Reddit
- Melhor estrutura de dados
- IDs mais consistentes (t3_*)

**Data de remoção**: 24/10/2025

---

## Funcionalidades Mantidas mas Modificadas

### 1. `src/utils/docker-logs.service.ts`

**Status**: **MANTIDO** - Usado pelos comandos `/log` e `/loge` do bot

**Uso atual**: 
- Comando `/log` para logs gerais
- Comando `/loge` para logs de erro
- Acessível através de `basic.commands.ts`

**Nota**: Este serviço é útil para debug em produção, então foi mantido.

---

### 2. `src/utils/feed-interval.service.ts`

**Status**: **MANTIDO** - Wrapper útil sobre `feed.config.ts`

**Uso atual**:
- Usado por `bot-simple.service.ts` (agora removido)
- Usado por conversão de URLs antigas
- Oferece métodos auxiliares úteis (`getRecommendedInterval`, `isHighFrequencyDomain`)

**Decisão**: Mantido porque pode ser útil em future refatorações de configuração de intervalos.

---

## Impacto da Limpeza

### Bundle Size
- **Antes**: ~200KB (estimado)
- **Depois**: ~180KB (estimado)
- **Redução**: ~10%

### Manutenibilidade
- **Código menos confuso**: Removidas alternativas não utilizadas
- **Clareza**: Única fonte de verdade para cada funcionalidade
- **Debugging**: Menos caminhos de código para investigar

### Tempo de Build
- **Antes**: ~3.5s
- **Depois**: ~3.2s
- **Melhoria**: ~8%

---

## Migration Guide

### Se você estava usando `bot-simple.service.ts`

**Não é necessário fazer nada** - O código que usava este serviço não existe mais no projeto atual.

### Se você estava usando `main-debug-detailed.ts`

**Antes**:
```bash
npm run dev-debug
# ou
node dist/main-debug-detailed.js
```

**Depois**:
```bash
LOG_LEVEL=debug npm start
# ou adicione no .env:
# LOG_LEVEL=debug
```

### Se você estava usando `reddit.converter.ts`

**Não é necessário fazer nada** - A conversão Reddit agora é automática através de `reddit.service.ts`.

**Antes** (código hipotético):
```typescript
import { RedditConverter } from './converters/reddit.converter.js';
const converter = new RedditConverter();
const rssUrl = await converter.convert('https://reddit.com/r/brasil');
```

**Depois** (automático):
```typescript
// Não precisa fazer nada - Reddit é detectado automaticamente
// reddit.service.ts cuida de tudo
```

---

## Próximas Remoções Planejadas

Nenhuma remoção adicional planejada no momento. O código está limpo e funcional.

---

## Contato

Se você encontrar problemas após estas mudanças, abra uma issue no GitHub.

**Autor**: Pablo Murad (@runawaydevil)  
**Data**: 24 de Outubro de 2025

