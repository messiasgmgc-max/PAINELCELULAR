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

## 3. O que Já Está Rodando em Produção vs Repo
- **Stack EvoCRM Full (14 containers, `/opt/phonecenter-crm/`):** rodando com `EVOLUTION_API_URL=http://evolution_api:8080` (`hasEvolutionConfig: true`) e backup diário `03:30 UTC`.
- **Instagram Unified Login (`infra/crm/patches/`):** patch Rails nativo ([instagram_unified_login.rb](../../infra/crm/patches/instagram_unified_login.rb)) + [Dockerfile.crm](../../infra/crm/patches/Dockerfile.crm) + instalador idempotente [apply-instagram-unified.sh](../../infra/crm/patches/apply-instagram-unified.sh) para apps novos Meta sem Página do Facebook. Webhook live validado: `https://api-crm.phonecenter.tech/webhooks/instagram` (Messenger: `/bot`, WhatsApp Cloud: `/webhooks/whatsapp/<+55NUMERO>`).
- **White-Label Atualizado (`infra/crm/branding/`):** sincronizar pasta para `/opt/phonecenter-crm/branding/` na VPS para ativar status real pós-login, badges SLA, `Ctrl+K`, logos atualizados e tema Dark/Light-Navy (além de `Dockerfile` pronto).
- **Suite ERP + Segurança + Automação (`PAINELCELULAR`):** código completo validado com `npm run typecheck` (0 erros) e `npm test` (586/586 testes verdes).

## 4. Ações Rápidas para Ativar 100%
1. Aplicar as migrations SQL pendentes no Supabase (especialmente `20261121_phonecenter_crm_completo.sql`).
2. Abrir `https://app.phonecenter.tech/crm-config`, gerar/copiar o `bridge_token` e `webhook_token` isolados da loja e cadastrar Dashboard App `/crm-sidebar`, MCP Server `/api/crm-bridge/mcp` e Webhooks no `crm.phonecenter.tech`.
3. Aplicar `infra/crm/patches/apply-instagram-unified.sh <CONFIG_ID>` e sincronizar `infra/crm/branding/` na VPS (comandos em `docs/crm/OAUTH-SETUP.md`), e agendar cron diário em `/api/crm-bridge/pos-venda`.

## 5. Log Compacto de Sessões
- **2026-11-20 (Sessão 1):** Infra EvoCRM 14 containers na VPS, SSL, Evolution API vinculada, White-Label Camada 3A e CRM Bridge inicial (Fases 4, 5 parcial, 6).
- **2026-11-21 (Sessão 2):** Correção dos bugs auditados (auth 3 níveis, tokens isolados por loja, CORS allowlist, validação API Mercado Pago, reserva/liberação real de IMEI via `aplicarMudancaEstoque`, rotas públicas, `registrarLog`, paginação/`source_id` em `tickets-ops`), funções matadoras (1-clique enviar chat/venda PDF, Pós-Venda Turbo 9 réguas + OS, proposta quente, 8 tools MCP, IA Vision foto troca, IMEI Luhn, Minha Evolução), Telefonia PABX/Click-to-Call, Suite `/crm-hub`, upgrade White-Label (`Dockerfile`/SLA/`Ctrl+K`), SaaS Multi-Loja `compartilhado`+`isolado`, lazy import browser em `logger.ts`, reestruturação Instagram Unified Login do EvoCRM (`instagram_unified_login.rb`), e 586/586 testes verdes.
