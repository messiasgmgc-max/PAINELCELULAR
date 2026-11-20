# VPS-DEPLOY.md — Runbook Seguro de Deploy Docker / Coolify

> **REGRA ZERO:** NUNCA altere, pare ou remova containers já existentes na VPS (`13.140.36.50`) — especialmente Coolify, Traefik e Evolution API.

---

## 1. Auditoria Pré-Voo Obrigatória (Somente Leitura)

Assim que o acesso SSH (`13.140.36.50:2222`) estiver validado, executar exatamente este bloco diagnóstico:

```bash
echo "=== OS & UPTIME ===" && uname -a && uptime
echo "=== CPU & RAM & SWAP ===" && nproc && free -h && swapon --show
echo "=== DISK ===" && df -h / /var/lib/docker 2>/dev/null || df -h
echo "=== DOCKER CONTAINERS ===" && docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
echo "=== DOCKER STATS (1-SHOT) ===" && docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
echo "=== DOCKER NETWORKS ===" && docker network ls
echo "=== COOLIFY PROXY ===" && ls -la /data/coolify/proxy /data/coolify/proxy/dynamic 2>/dev/null
echo "=== LISTENING PORTS ===" && ss -tulpn | head -n 40
```

### Critérios de Go / No-Go
- **Disco livre:** mínimo **15 GB livres** em `/` ou `/var/lib/docker` (imagens EvoCRM consomem ~4–5 GB).
- **RAM disponível:**
  - `>= 10 GB livre` → Pode subir **Perfil B (Full)** ou **Perfil A (Core Lite)** com folga.
  - `4 GB a 9 GB livre` → Subir **Perfil A (Core Lite)** sem ClickHouse/RabbitMQ/EvoFlow + garantir Swap >= 4 GB.
  - `< 4 GB livre` → **PARAR e avisar o usuário** antes de subir (recomendar upgrade de RAM ou **Perfil C Ultra Lite**).
- **Conflito de portas:** Não publicar nenhuma porta no host (`ports:`) nos containers de produção! Toda exposição HTTP/HTTPS deve passar **exclusivamente pelo Traefik do Coolify** via labels + rede `coolify` (ou rede externa identificada na auditoria).

---

## 2. Estratégia de Deploy (Coolify vs `/opt/phonecenter-crm`)

### Opção Recomendada: Stack Docker Compose no Coolify (ou `/opt/phonecenter-crm` conectado à rede do Traefik)
- **Diretório padrão na VPS (se fora do Coolify UI):** `/opt/phonecenter-crm/`
  - `docker-compose.yml` (usando imagens pré-compiladas `evoapicloud/*:1.0.0-rc2` — **NUNCA build na VPS**)
  - `.env` (permissão `chmod 600 .env`, fora de qualquer repo Git)
  - `backups/` (script cron diário de `pg_dump`)
- **Se via Coolify UI:** Criar novo projeto `PhoneCenterCRM` → Resource `Docker Compose` → colar compose limpo com variáveis em Coolify Secrets + domínios configurados diretamente no Traefik.

---

## 3. Mapa de Segredos Sincronizados (OBRIGATÓRIO)

Cada segredo abaixo deve ser gerado **uma única vez** na VPS e replicado identicamente nos serviços indicados:

| Variável | Como gerar na VPS | Serviços que exigem o MESMO valor |
| :--- | :--- | :--- |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` | `postgres`, `auth`, `auth_sidekiq`, `crm`, `crm_sidekiq`, `core`, `processor` |
| `REDIS_PASSWORD` | `openssl rand -hex 24` | `redis`, `auth`, `auth_sidekiq`, `crm`, `crm_sidekiq`, `processor`, `bot_runtime` |
| `SECRET_KEY_BASE` | `openssl rand -hex 64` | `auth`, `auth_sidekiq`, `crm`, `crm_sidekiq`, `core`, `processor` |
| `JWT_SECRET_KEY` | `openssl rand -hex 32` | `auth`, `auth_sidekiq`, `crm`, `crm_sidekiq`, `core` |
| `DOORKEEPER_JWT_SECRET_KEY` | `openssl rand -hex 64` | `auth`, `auth_sidekiq` |
| `EVOAI_CRM_API_TOKEN` | `openssl rand -hex 32` | `auth`, `auth_sidekiq`, `crm`, `crm_sidekiq`, `processor` |
| `ENCRYPTION_KEY` | `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` (ou base64 32 bytes URL-safe) | `core`, `processor`, e como `EVO_AI_ENCRYPTION_KEY` em `crm` + `crm_sidekiq` |
| `BOT_RUNTIME_SECRET` | `openssl rand -hex 32` | `crm`, `crm_sidekiq`, `bot_runtime` |
| `AI_PROCESSOR_API_KEY` | `openssl rand -hex 32` | `processor`, `bot_runtime` |

---

## 4. Variáveis Críticas de Produção

```env
RAILS_ENV=production
FRONTEND_URL=https://crm.phonecenter.tech
BACKEND_URL=https://api-crm.phonecenter.tech
AUTH_SERVICE_URL=https://api-crm.phonecenter.tech
CORS_ORIGINS=https://crm.phonecenter.tech,https://api-crm.phonecenter.tech
MEDIA_HOST_ALLOWLIST=api-crm.phonecenter.tech,crm.phonecenter.tech

# Frontend runtime injection (substituído no entrypoint sem rebuild!)
VITE_APP_ENV=production
VITE_API_URL=https://api-crm.phonecenter.tech
VITE_AUTH_API_URL=https://api-crm.phonecenter.tech
VITE_WS_URL=https://api-crm.phonecenter.tech
VITE_EVOAI_API_URL=https://api-crm.phonecenter.tech
VITE_AGENT_PROCESSOR_URL=https://api-crm.phonecenter.tech

# Proteção de recursos na VPS
RAILS_MAX_THREADS=5
SIDEKIQ_CONCURRENCY=5
EVO_FLOW_ENABLED=false
DISABLE_TELEMETRY=true
MFA_ISSUER=PhoneCenterCRM
ORGANIZATION_NAME=PhoneCenterCRM
```

*(Nota: se `api-crm.phonecenter.tech` não tiver DNS configurado, verificar `nslookup api-crm.phonecenter.tech` ou rotear no mesmo host `crm.phonecenter.tech` via gateway Nginx).*

---

## 5. Limites de Memória Recomendados (Perfil Core Lite)

Aplicar `mem_limit` em cada serviço no `docker-compose.yml` para impedir que um pico derrube Coolify/Evolution API:

- `evocrm_postgres`: `512m`
- `evocrm_redis`: `256m`
- `evocrm_auth`: `512m` | `evocrm_auth_sidekiq`: `384m`
- `evocrm_crm`: `768m` | `evocrm_crm_sidekiq`: `512m`
- `evocrm_core`: `256m`
- `evocrm_processor`: `768m`
- `evocrm_bot_runtime`: `256m`
- `evocrm_gateway`: `128m`
- `evocrm_frontend`: `128m`
- **Teto total somado (pior caso):** ~4.5 GB (consumo típico em repouso: ~1.8–2.6 GB).

---

## 6. Ordem de Subida, Seed e Validação

1. Subir infra primeiro: `docker compose up -d evocrm_postgres evocrm_redis` e aguardar `healthy`.
2. Subir `evocrm_auth` primeiro (cria tabelas e seeds RBAC — `evo-crm` depende do usuário criado pelo `evo-auth`).
3. Subir `evocrm_crm`, `evocrm_auth_sidekiq`, `evocrm_crm_sidekiq`.
4. Subir `evocrm_core`, `evocrm_processor`, `evocrm_bot_runtime`.
5. Subir `evocrm_gateway` e `evocrm_frontend`.
6. Validar healthchecks:
   - `curl -sSf https://crm.phonecenter.tech/`
   - `curl -sSf https://api-crm.phonecenter.tech/health/live`
   - Verificar `docker ps` e `free -h` para confirmar que Coolify + Evolution API continuam 100% intactos.

---

## 7. Rollback Seguro (Zero Impacto no Restante da VPS)

Se qualquer coisa apresentar anomalia de memória ou erro:
```bash
cd /opt/phonecenter-crm
docker compose down   # NUNCA usar -v se já houver dados!
```
Isso remove apenas os containers do `phonecenter-crm`, deixando Coolify, Traefik, Evolution API e todos os outros apps intactos.
