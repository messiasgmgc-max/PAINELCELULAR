# STATE.md — Estado Vivo do PhoneCenterCRM

> **Regra:** Mantenha este arquivo curto (máx. ~100 linhas). Atualize no fim de toda sessão.

## 1. Infraestrutura & Acessos (Sem Segredos)
- **VPS IP:** `13.140.36.50` · **SSH:** `root@13.140.36.50:2222` ✅
- **OS:** Ubuntu Linux `5.15.0-202-generic` (`vmi3558908`)
- **Hardware Auditado Pós-Deploy (2026-11-20):**
  - **CPU:** `6 vCPUs`
  - **RAM:** `11.68 GiB` total · `3.4 GiB` em uso (36.7%) · **`7.5 GiB` ainda disponíveis**
  - **Disco:** `194 GB` total · `~40 GB` usado · **`~154 GB` livre**
- **Orquestrador:** Coolify `4.7.6` + `coolify-proxy` (`traefik:v3.6`, rede `coolify`, certresolver `letsencrypt`)
- **Apps pré-existentes (100% INTOCADOS):**
  - `PAINELCELULAR` (`https://app.phonecenter.tech` — `HTTP 200`)
  - `evolution_api` (`evoapicloud/evolution-api:latest`, `/root/evolution`, rede `evolution_default`, porta interna `8080` / host `8082`)
  - `evolution_postgres`, `aster-*`

## 2. Domínios & SSL (Ativos)
- `https://crm.phonecenter.tech` → `evocrm_frontend:80` (**HTTP 200 + TLS Let's Encrypt ✅**)
- `https://api-crm.phonecenter.tech` → `evocrm_gateway:3030` (**HTTP 200 + TLS Let's Encrypt ✅**)

## 3. Stack PhoneCenterCRM em Produção (`/opt/phonecenter-crm`)
- Compose versionado (sem segredos): [infra/crm/docker-compose.yml](../../infra/crm/docker-compose.yml)
- Segredos em `/opt/phonecenter-crm/.env` (`chmod 600`, fora do Git)
- **14 containers ativos e saudáveis (Full Stack + EvoFlow + ClickHouse + RabbitMQ + IA Processor + Bot Runtime):**
  `evocrm_pgvector`, `evocrm_redis`, `evocrm_clickhouse`, `evocrm_rabbitmq`, `evocrm_auth`, `evocrm_auth_sidekiq`, `evocrm_crm`, `evocrm_crm_sidekiq`, `evocrm_core`, `evocrm_processor`, `evocrm_bot_runtime`, `evocrm_evoflow`, `evocrm_gateway`, `evocrm_frontend`
- Todos com `mem_limit` rígido e zero portas publicadas no host.
- **Backup diário:** `/opt/phonecenter-crm/backup.sh` agendado via cron (`03:30 UTC`, retenção 7 dias) — primeiro dump testado e validado.

## 4. Bloqueios & Próxima Ação Imediata
- **Ação do Usuário (1 minuto):** Abrir `https://crm.phonecenter.tech` e concluir o **Setup Wizard inicial** (criação da conta `super_admin` do PhoneCenterCRM).
- **Próximas Fases Técnicas (prontas para execução):**
  - **Fase 2:** Conectar `evolution_api` (URL interna `http://evolution_api:8080` ou pública), WhatsApp Cloud API, Instagram Direct, Google Calendar, Setores, Tags e Respostas Rápidas.
  - **Fase 3:** Fork white-label do `evo-ai-frontend-community` com identidade visual **PhoneCenterCRM** (cores `#090d16` / `#0066FF`, logos, login split-screen com `Online/Ausente/Offline`, sidebar PT-BR) + CI/CD via GitHub Actions → GHCR.
  - **Fase 4:** Construir **PhoneCenter CRM Bridge** (`/api/crm-bridge/*`) + **Dashboard App Lateral** (`/crm-sidebar`) + **MCP Server** para IA consultar estoque real do Supabase.

## 5. Log Compacto de Sessões
- **2026-11-20 (Sessão 1):**
  - Criados `AgentsCRM.md`, `TODOCRM.md`, `docs/crm/*` e `infra/crm/docker-compose.yml`.
  - Validado SSH (`13.140.36.50:2222`), auditada VPS, feito deploy completo dos 14 containers em `/opt/phonecenter-crm` com TLS Let's Encrypt em `crm.phonecenter.tech` e `api-crm.phonecenter.tech`.
  - Validados healthchecks internos de todos os serviços (`auth`, `crm`, `core`, `processor`, `bot_runtime`, `evoflow`, `pgvector`, `redis`, `clickhouse`, `rabbitmq`) + `app.phonecenter.tech` e `evolution_api` 100% intactos.
  - Configurado backup automático diário do Postgres (`pg_dump`).
