# STATE.md — Estado Vivo do PhoneCenterCRM

> **Regra:** Mantenha este arquivo curto (máx. ~100 linhas). Atualize no fim de toda sessão.

## 1. Infraestrutura & Acessos (Sem Segredos)
- **VPS IP:** `13.140.36.50` · **SSH:** `root@13.140.36.50:2222` ✅
- **Orquestrador:** Coolify `4.7.6` + `coolify-proxy` (`traefik:v3.6`, rede `coolify`, certresolver `letsencrypt`)
- **Apps pré-existentes (100% INTOCADOS):** `app.phonecenter.tech` (`PAINELCELULAR`), `evolution_api` (v2.3.7, rede `evolution_default`), `evolution_postgres`, `aster-*`
- **Monitoramento VPS:** `/opt/phonecenter-crm/health-monitor.sh` ativo a cada 5 min

## 2. Domínios & Endpoints Ativos
- **CRM (White-Label PhoneCenterCRM):** `https://crm.phonecenter.tech` (`HTTP 200` + TLS ✅)
- **CRM API Gateway:** `https://api-crm.phonecenter.tech` (`HTTP 200` + TLS ✅)
- **PhoneCenter ERP:** `https://app.phonecenter.tech` (`HTTP 200` + TLS ✅)
- **Suite Gerencial PhoneCenter CRM (`/crm-hub`):** `https://app.phonecenter.tech/crm-hub` *(Pós-Venda Turbo, Telefonia, Rodízio, Campanhas Anti-Ban, Kanban Grupos, Academy, Financeiro, Multi-Loja)*
- **Configuração Isolada por Loja (`/crm-config`):** `https://app.phonecenter.tech/crm-config` *(sessão ERP nativa + `bridge_token` / `webhook_token` isolados + Pós-Venda + SLA + Telefonia)*
- **Dashboard App Lateral (`/crm-sidebar`):** `https://app.phonecenter.tech/crm-sidebar?loja_id=<LOJA>&token=<BRIDGE_TOKEN_LOJA>` *(Estoque 1-clique + Reserva IMEI + Troca/Vision + Ranking/Evolução + Telefonia/Pix/Ops)*
- **Proposta Pública (`/proposta/<token>`)** & **Link na Bio (`/bio`)**: rotas públicas liberadas em `AuthContext.tsx` (vitrine `/bio` oculta aparelhos reservados)
- **MCP Server IA (JSON-RPC 2.0, 8 tools):** `https://app.phonecenter.tech/api/crm-bridge/mcp`
- **APIs CRM Bridge (`/api/crm-bridge/*`):**
  - Core & Segurança: `health`, `minha-loja`, `config-loja`, `estoque`, `clientes/lookup`, `imei`, `simular`, `avaliar-foto-troca`
  - Vendas & Pós-Venda: `enviar-mensagem`, `pre-venda`, `propostas`, `pix-reserva`, `ranking`, `metas`, `pos-venda`, `notificar-os`
  - Canais, Operação & SaaS: `conexoes`, `tickets-ops`, `chat-interno`, `leads-anuncio`, `rodizio`, `campanhas`, `kanban-grupos`, `academy`, `telefonia`, `multi-loja/provisionar`
  - Webhooks: `webhooks/evo`, `webhooks/pagamento` (validação real API MP), `webhooks/telefonia`
- **Migrations SQL no Supabase:** `20261120_phonecenter_crm_modulos.sql`, `20261120_phonecenter_crm_fase6.sql`, `20261120_phonecenter_crm_loja_configs.sql`, **`20261121_phonecenter_crm_completo.sql`** *(rodar no SQL Editor)*
- **Gate & Multi-Loja SaaS:** exclusivo do plano `avancado` (R\$ 299/mês) + `vitalicio` + `super_admin`; provisionamento padrão `compartilhado` (tokens isolados + Time EvoCRM) e `isolado` Enterprise (`infra/crm/docker-compose.tenant.yml` via Coolify API).

## 3. O que Já Está Rodando em Produção
- **Stack EvoCRM Full (14 containers, `/opt/phonecenter-crm/`):** rodando com `EVOLUTION_API_URL=http://evolution_api:8080` (`hasEvolutionConfig: true`) e backup diário `03:30 UTC`.
- **Instagram Unified Login ATIVO em Produção (`infra/crm/patches/`):** patch Rails [instagram_unified_login.rb](../../infra/crm/patches/instagram_unified_login.rb) + `INSTAGRAM_CONFIG_ID` (`1715746990110674`) aplicados via [apply-instagram-unified.sh](../../infra/crm/patches/apply-instagram-unified.sh) em `evocrm_crm` e `evocrm_crm_sidekiq` (`enabled=true`, `evocrm_crm` `healthy`, `graph.facebook.com/v25.0`). Webhooks validados ao vivo: `https://api-crm.phonecenter.tech/webhooks/instagram` (`200 OK`), `/bot` (`200 OK`).
- **White-Label Atualizado ATIVO em `crm.phonecenter.tech`:** [infra/crm/branding/](../../infra/crm/branding/) sincronizado em `/opt/phonecenter-crm/branding/` e validado com `nginx -t` + `nginx -s reload` (badges SLA, launcher `Ctrl+K`, status real pós-login, logos oficiais, Dark/Light-Navy).
- **Suite ERP + CRM Bridge (`app.phonecenter.tech`):** rotas `/crm-hub`, `/crm-config`, `/crm-sidebar` e `/api/crm-bridge/health` respondendo `HTTP 200` com `configured: true`. Código validado com `npm run typecheck` (0 erros) e `npm test` (586/586 verdes).

## 4. Ações Rápidas para Ativar 100%
1. Conectar conta do Instagram em `https://crm.phonecenter.tech/channels/new` e WhatsApp QR Code (Evolution).
2. Aplicar as migrations SQL pendentes no Supabase (especialmente `20261121_phonecenter_crm_completo.sql`).
3. Abrir `https://app.phonecenter.tech/crm-config`, copiar os links com `bridge_token` e `webhook_token` isolados da loja e cadastrar Dashboard App `/crm-sidebar`, MCP Server e Webhook no `crm.phonecenter.tech`.

## 5. Log Compacto de Sessões
- **2026-11-20 (Sessão 1):** Infra EvoCRM 14 containers na VPS, SSL, Evolution API vinculada, White-Label Camada 3A e CRM Bridge inicial (Fases 4, 5 parcial, 6).
- **2026-11-21 (Sessão 2):** Correções/blindagem multi-loja, funções matadoras (1-clique chat/PDF, Pós-Venda Turbo, 8 tools MCP, IA Vision, IMEI Luhn, Telefonia), Suite `/crm-hub`, SaaS Multi-Loja e patch Instagram Unified Login (`instagram_unified_login.rb`), 586/586 testes verdes.
- **2026-11-23 (Sessão 3):** Ativado na VPS `13.140.36.50:2222` o patch **Instagram Unified Login** (`CONFIG_ID` `1715746990110674`, smoke-check Rails `enabled=true` + URL `facebook.com/dialog/oauth` OK) e atualizado **White-Label** `/opt/phonecenter-crm/branding/` (`nginx -t` OK + `reload`), além de validação HTTPS `200 OK` em `crm`, `api-crm` e `app.phonecenter.tech` (`/crm-hub`, `/crm-config`, `/crm-sidebar`).
