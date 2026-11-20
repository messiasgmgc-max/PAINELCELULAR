# ARCHITECTURE.md — Arquitetura Técnica do PhoneCenterCRM

## 1. Visão Geral da Arquitetura (3 Camadas)

```text
                       Internet / HTTPS (Traefik + Coolify)
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
    https://crm.phonecenter.tech                 https://api-crm.phonecenter.tech
    (PhoneCenterCRM Frontend - Vite/React)       (evocrm_gateway :3030 - Nginx)
                 │                                             │
                 └──────────────────────┬──────────────────────┘
                                        ▼
         ┌────────────────────────────────────────────────────────────┐
         │                 Rede Docker Isolada: evocrm_net            │
         │                                                            │
         │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
         │  │ evo-auth     │  │ evo-crm      │  │ evo-core (Go)    │  │
         │  │ Rails :3001  │  │ Rails :3000  │  │ Agentes :5555    │  │
         │  │ + sidekiq    │  │ + sidekiq    │  └────────┬─────────┘  │
         │  └──────┬───────┘  └──────┬───────┘           │            │
         │         │                 │          ┌────────▼─────────┐  │
         │         │                 │          │ evo-processor    │  │
         │         │                 │          │ FastAPI :8000    │  │
         │         │                 │          └────────┬─────────┘  │
         │         │                 │          ┌────────▼─────────┐  │
         │         │                 │          │ evo-bot-runtime  │  │
         │         │                 │          │ Go/Gin :8080     │  │
         │         │                 │          └──────────────────┘  │
         │         └────────┬────────┴──────────┘                     │
         │                  ▼                                         │
         │     ┌─────────────────────────┐   ┌────────────────────┐   │
         │     │ PostgreSQL 16 + pgvector│   │ Redis (Alpine)     │   │
         │     └─────────────────────────┘   └────────────────────┘   │
         └────────────────────────────────────────────────────────────┘
                   │                                       │
                   ▼ (Webhook / REST)                      ▼ (API / MCP / Embed)
        ┌──────────────────────┐              ┌─────────────────────────────┐
        │ Evolution API (VPS)  │              │ PhoneCenter ERP (Next.js)   │
        │ WhatsApp / Meta / IG │              │ + Supabase + CRM Bridge API │
        └──────────────────────┘              └─────────────────────────────┘
```

---

## 2. Componentes da Stack EvoCRM Community (`v1.0.0-rc2`)

| Container | Imagem Oficial Docker Hub | Stack | Porta Interna | Função |
| :--- | :--- | :--- | :---: | :--- |
| `evocrm_gateway` | `evoapicloud/evo-crm-gateway:1.0.0-rc2` | Nginx | `3030` | Roteador único das APIs (auth, crm, core, processor, bot) |
| `evocrm_frontend` | `evoapicloud/evo-ai-frontend-community:1.0.0-rc2` *(Fase 3: nossa imagem custom)* | React/Vite | `80/5173` | Interface web (suporta runtime env substitution `VITE_*`) |
| `evocrm_auth` | `evoapicloud/evo-auth-service-community:1.0.0-rc2` | Rails 7.1 | `3001` | Login, OAuth2 Doorkeeper, JWT, RBAC, MFA |
| `evocrm_auth_sidekiq` | `evoapicloud/evo-auth-service-community:1.0.0-rc2` | Sidekiq | — | Jobs assíncronos de auth/e-mail |
| `evocrm_crm` | `evoapicloud/evo-ai-crm-community:1.0.0-rc2` | Rails 7.1 | `3000` | Conversas, Contatos, Pipelines, Produtos, Canais, Campanhas |
| `evocrm_crm_sidekiq` | `evoapicloud/evo-ai-crm-community:1.0.0-rc2` | Sidekiq | — | Filas de mensagens, webhooks, automações, disparos |
| `evocrm_core` | `evoapicloud/evo-ai-core-service-community:1.0.0-rc2` | Go/Gin | `5555` | Gestão de Agentes de IA, pastas, credenciais, MCP |
| `evocrm_processor` | `evoapicloud/evo-ai-processor-community:1.0.0-rc2` | Python/FastAPI | `8000` | Execução de agentes IA, LangGraph, RAG vetorial, Tools |
| `evocrm_bot_runtime` | `evoapicloud/evo-bot-runtime:1.0.0-rc2` | Go/Gin | `8080` | Pipeline de bots, debounce de mensagens, dispatch |
| `evocrm_postgres` | `pgvector/pgvector:pg16` | Postgres 16 | `5432` | Banco relacional + embeddings vetoriais (`evocrm`) |
| `evocrm_redis` | `redis:7-alpine` | Redis | `6379` | Filas Sidekiq, cache, ActionCable WebSocket |

### Serviços Opcionais (EvoFlow Analytics)
- `clickhouse` + `rabbitmq` + `evo-flow` (porta `3334`): usados apenas para tracking analítico de jornada de eventos. **Consomem 1.5 GB a 3 GB extras de RAM.**

---

## 3. Perfis de Dimensionamento (Proteção contra OOM na VPS)

| Perfil | RAM Livre Necessária | Containers Ativos | Recomendação |
| :--- | :--- | :--- | :--- |
| **Perfil A — Core Lite (Recomendado p/ VPS 4–8 GB)** | ~2.5 – 3.5 GB | Gateway, Frontend, Auth (+Sidekiq), CRM (+Sidekiq), Core, Processor, Bot Runtime, Postgres pgvector, Redis (`EVO_FLOW_ENABLED=false`) | **Padrão seguro** — 100% do CRM + IA + Canais sem ClickHouse/RabbitMQ |
| **Perfil B — Full Stack (VPS 12–16+ GB)** | ~5.5 – 7.5 GB | Todos do Core Lite + ClickHouse + RabbitMQ + EvoFlow | Ativar apenas se `free -h` confirmar folga real > 8 GB |
| **Perfil C — Ultra Lite (VPS <= 4 GB)** | ~1.5 – 2.2 GB | Sem Processor/Bot/Core (ou processor sob demanda), Sidekiq concurrency=3, swap 4 GB | Fallback emergencial para não derrubar a VPS |

---

## 4. Roteamento de Domínio (Coolify + Traefik)

- **Preferencial (2 subdomínios, padrão oficial EvoCRM):**
  - `https://crm.phonecenter.tech` → `evocrm_frontend`
  - `https://api-crm.phonecenter.tech` → `evocrm_gateway:3030`
- **Alternativa (1 subdomínio único, caso DNS não tenha wildcard ou queira zero novos registros):**
  - `https://crm.phonecenter.tech` → Nginx gateway servindo frontend em `/` e proxy reverso para `/api`, `/auth`, `/cable`, `/webhooks`, `/evoai`, `/processor`.
- **Importante sobre `BACKEND_URL` e `FRONTEND_URL`:**
  - Em `RAILS_ENV=production`, o `evo-crm` **recusa iniciar** se `BACKEND_URL` estiver vazio ou apontar para `localhost`.
  - `MEDIA_HOST_ALLOWLIST` no `evo-bot-runtime` deve conter o host de `BACKEND_URL` (ex: `api-crm.phonecenter.tech`) para a IA conseguir ler áudios/imagens recebidos!

---

## 5. Estratégia Multi-Loja (Single-Tenant vs Multi-Tenant SaaS)

O EvoCRM Community é **single-tenant** por design (uma conta/empresa por stack). Como o PhoneCenter (`PAINELCELULAR`) atende múltiplas lojas:

1. **Fase 1–5 (Produção imediata):** 1 stack dedicada em `crm.phonecenter.tech` atendendo a operação principal (ex: Lucas Imports / PhoneCenter Matriz) + validação real de todas as features e integrações ERP.
2. **Fase 6 (Escala Comercial para Lojas Clientes do PhoneCenter):**
   - **Caminho A (Isolamento Total — Recomendado para SLA/WhatsApp):** Template Docker Compose no Coolify provisionado automaticamente via **Coolify API** por loja pagante (`<slug>.crm.phonecenter.tech`), compartilhando apenas Postgres (bancos separados `evocrm_<loja>`) e Evolution API (instâncias separadas por loja). Zero vazamento de dados entre concorrentes!
   - **Caminho B (Compartilhado Leve para Planos de Entrada):** Isolamento por `Inbox + Team + Pipeline + Custom Role` dentro de uma instância compartilhada com middleware de escopo no fork.

---

## 6. Arquitetura da Ponte PhoneCenter ERP (`CRM Bridge`)

Para entregar tudo que o EvoCRM não oferece nativamente sem sujar/quebrar upgrades do core Rails:
- **Backend Bridge:** Endpoints dedicados em `PAINELCELULAR` (`/api/crm-bridge/*`) protegidos por `X-PhoneCenter-CRM-Key` + assinatura HMAC.
- **Dashboard App Embutido:** Rota `/crm-sidebar` no Next.js carregada via `iframe` nativo do EvoCRM (`dashboard_apps_controller`) dentro da tela de chat, recebendo automaticamente o contexto `{ contact, conversation, currentAgent }` via `postMessage`!
- **MCP Server PhoneCenter:** Endpoint MCP (`/api/crm-bridge/mcp`) registrado em `Admin > McpServers` do EvoCRM para que o Agente de IA consulte estoque, preços, taxas e garantia em tempo real.
