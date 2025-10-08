# Production Deployment Guide

Este guia explica como fazer o deploy do RSS Skull Bot v2 em produção.

## Pré-requisitos

- Docker e Docker Compose instalados
- Token do bot do Telegram (obtido via @BotFather)
- Servidor com pelo menos 1GB RAM e 10GB de espaço em disco

## Configuração Rápida

### 1. Preparar Ambiente

```bash
# Clone o repositório
git clone <repository-url>
cd rss-skull-v2

# Copie o arquivo de ambiente
cp .env.production .env

# Edite o arquivo .env com suas configurações
nano .env
```

### 2. Configurar Variáveis de Ambiente

Edite o arquivo `.env` com suas configurações:

```env
# OBRIGATÓRIO: Token do seu bot
BOT_TOKEN=seu_token_aqui

# Configurações opcionais (já têm valores padrão)
NODE_ENV=production
LOG_LEVEL=info
PORT=8916
HOST=0.0.0.0
DATABASE_URL=file:/app/data/production.db
REDIS_HOST=redis
REDIS_PORT=6379
```

### 3. Deploy com Docker Compose

```bash
# Build e start dos serviços
docker-compose -f docker-compose.prod.yml up -d --build

# Verificar se os serviços estão rodando
docker-compose -f docker-compose.prod.yml ps

# Verificar logs
docker-compose -f docker-compose.prod.yml logs -f
```

### 4. Verificar Deployment

```bash
# Teste o health check
curl http://localhost:8916/health

# Deve retornar algo como:
# {"status":"ok","database":true,"redis":true,"timestamp":"..."}
```

## Comandos Úteis

### Gerenciamento de Serviços

```bash
# Parar serviços
docker-compose -f docker-compose.prod.yml down

# Reiniciar serviços
docker-compose -f docker-compose.prod.yml restart

# Ver logs em tempo real
docker-compose -f docker-compose.prod.yml logs -f app

# Ver status dos containers
docker-compose -f docker-compose.prod.yml ps
```

### Backup e Manutenção

```bash
# Backup do banco de dados
docker cp rss-skull-bot-prod:/app/data/production.db ./backup-$(date +%Y%m%d).db

# Limpar logs antigos do Docker
docker system prune -f

# Atualizar para nova versão
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

## Migração de Dados (v1 para v2)

Se você está migrando do RSS Skull Bot v1:

```bash
# 1. Instalar dependências
npm install

# 2. Executar migração
npm run migrate:v1 /caminho/para/banco-antigo.db

# 3. Verificar migração
npm run db:generate
```

Veja `scripts/MIGRATION.md` para detalhes completos.

## Monitoramento

### Health Check

O bot expõe um endpoint de health check em `/health` que retorna:

```json
{
  "status": "ok",
  "database": true,
  "redis": true,
  "timestamp": "2024-10-08T23:30:00.000Z",
  "uptime": 3600,
  "memory": {
    "rss": 50331648,
    "heapTotal": 20971520,
    "heapUsed": 15728640
  }
}
```

### Logs

Os logs são estruturados e incluem:
- Timestamp
- Nível (info, warn, error)
- Mensagem
- Contexto adicional

```bash
# Ver logs específicos
docker-compose -f docker-compose.prod.yml logs app | grep ERROR
docker-compose -f docker-compose.prod.yml logs redis
```

## Solução de Problemas

### Bot não responde

1. Verificar se o token está correto
2. Verificar logs: `docker-compose -f docker-compose.prod.yml logs app`
3. Verificar conectividade: `curl http://localhost:8916/health`

### Erro de banco de dados

1. Verificar se o volume está montado corretamente
2. Verificar permissões do diretório de dados
3. Executar migração se necessário

### Erro de Redis

1. Verificar se o Redis está rodando: `docker-compose -f docker-compose.prod.yml ps redis`
2. Testar conexão: `docker exec rss-skull-redis-prod redis-cli ping`

### Performance

Se o bot estiver lento:

1. Verificar uso de memória: `docker stats`
2. Verificar logs de erro
3. Considerar aumentar recursos do servidor

## Configurações Avançadas

### Webhook (Opcional)

Para usar webhook em vez de polling:

1. Configure um domínio com SSL
2. Adicione `WEBHOOK_URL=https://seu-dominio.com/webhook` no `.env`
3. Configure um reverse proxy (Nginx) se necessário

### Backup Automático

Adicione ao crontab para backup automático:

```bash
# Backup diário às 2:00 AM
0 2 * * * docker cp rss-skull-bot-prod:/app/data/production.db /backups/rss-skull-$(date +\%Y\%m\%d).db
```

### Limites de Recursos

Para limitar recursos do Docker:

```bash
# Editar docker-compose.prod.yml e adicionar:
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '1.0'
```

## Segurança

### Recomendações

1. **Firewall**: Abra apenas as portas necessárias
2. **Updates**: Mantenha o sistema e Docker atualizados
3. **Backup**: Configure backups regulares
4. **Monitoramento**: Configure alertas para falhas
5. **SSL**: Use HTTPS se expor o health check publicamente

### Variáveis Sensíveis

Nunca commite o arquivo `.env` com dados reais. Use:

```bash
# Adicionar ao .gitignore
echo ".env" >> .gitignore
```

## Suporte

Para problemas:

1. Verifique os logs primeiro
2. Consulte a documentação do Telegram Bot API
3. Verifique issues conhecidos no repositório

---

**Nota**: Este deployment é adequado para uso em produção pequena/média. Para alta disponibilidade, considere usar Kubernetes ou Docker Swarm.