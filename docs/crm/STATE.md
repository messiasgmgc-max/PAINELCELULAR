# STATE.md — Estado Vivo do PhoneCenterCRM

> **Regra:** Mantenha este arquivo curto (máx. ~100 linhas). Atualize no fim de toda sessão.

## 1. Infraestrutura & Acessos (Sem Segredos)
- **VPS IP:** `13.140.36.50` · **SSH:** `root@13.140.36.50:2222` ✅
- **Hardware Pós-Deploy (2026-11-20):** `6 vCPUs` · `3.4 / 11.68 GiB RAM` (`7.5 GiB` livres) · `~154 GB` disco livre
- **Orquestrador:** Coolify `4.7.6` + `coolify-proxy` (`traefik:v3.6`, rede `coolify`, certresolver `letsencrypt`)
- **Apps pré-existentes (100% INTOCADOS):** `app.phonecenter.tech` (`PAINELCELULAR`), `evolution_api` (v2.3.7, rede `evolution_default`), `evolution_postgres`, `aster-*`

## 2. Domínios & Endpoints Ativos
- **CRM (White-Label PhoneCenterCRM):** `https://crm.phonecenter.tech` (`HTTP 200` + TLS ✅)
- **CRM API Gateway:** `https://api-crm.phonecenter.tech` (`HTTP 200` + TLS ✅)
- **PhoneCenter ERP:** `https://app.phonecenter.tech` (`HTTP 200` + TLS ✅)
- **Dashboard App Lateral (Chat):** `https://app.phonecenter.tech/crm-sidebar?token=<CRM_BRIDGE_SECRET>` *(5 abas: Estoque, Cliente, Troca/Proposta, Ranking, Ops)*
- **Proposta Pública (com Aceite + PDF):** `https://app.phonecenter.tech/proposta/<token>`
- **Link na Bio + Vitrine:** `https://app.phonecenter.tech/bio`
- **MCP Server IA (JSON-RPC 2.0):** `https://app.phonecenter.tech/api/crm-bridge/mcp`
- **CRM Bridge REST APIs:** `/api/crm-bridge/{health,estoque,clientes/lookup,simular,propostas,ranking,leads-anuncio,chat-interno,conexoes,tickets-ops,pix-reserva,multi-loja/provisionar,webhooks/evo,webhooks/pagamento}`
- **Migrations SQL pendentes no Supabase:** `20261120_phonecenter_crm_modulos.sql` e `20261120_phonecenter_crm_fase6.sql`
- **Monitoramento VPS:** `/opt/phonecenter-crm/health-monitor.sh` ativo a cada 5 min (`ram=32% disk=22% evo=running`)

## 3. O que Já Está Rodando em Produção
- **Stack EvoCRM Full (14 containers, `/opt/phonecenter-crm/`):** todos saudáveis com `mem_limit`, backup diário `03:30 UTC`.
- **Evolution API já conectada no CRM:** `EVOLUTION_API_URL=http://evolution_api:8080` + `EVOLUTION_ADMIN_SECRET` configurados (`hasEvolutionConfig: true` ✅).
- **White-Label PhoneCenterCRM (Camada 3A ativa):** `infra/crm/branding/` aplicado no `evocrm_frontend` com paleta `#090d16` / `#0066FF`, logos oficiais PhoneCenter, CSP `frame-src` liberado para `app.phonecenter.tech`, seletor `Online/Ausente/Offline` no login e dock rápido ERP/Bio.
- **Ponte PhoneCenter ERP + MCP + Sidebar + Bio (Fase 4 + parte da 5):** implementados e testados em `PAINELCELULAR` (0 erros TS, testes verdes).

## 4. Ações Rápidas para Ativar 100% no Painel
1. Definir `CRM_BRIDGE_SECRET=<chave-forte>` nas variáveis de ambiente do app `PAINELCELULAR` no Coolify (e opcionalmente `CRM_DEFAULT_LOJA_ID`).
2. No **PhoneCenterCRM (`crm.phonecenter.tech`)**:
   - **Canais:** criar inbox WhatsApp (Evolution API já está `hasEvolutionConfig: true`!) e escanear QR Code.
   - **Dashboard Apps:** cadastrar `https://app.phonecenter.tech/crm-sidebar?token=<CRM_BRIDGE_SECRET>` como App Lateral do atendimento!
   - **Admin > MCP Servers:** cadastrar `https://app.phonecenter.tech/api/crm-bridge/mcp` com header `X-PhoneCenter-CRM-Key: <CRM_BRIDGE_SECRET>` para a IA consultar estoque, troca, parcelas e garantias!
   - **Webhooks:** apontar eventos do CRM para `https://app.phonecenter.tech/api/crm-bridge/webhooks/evo?token=<CRM_BRIDGE_SECRET>`.

## 5. Log Compacto de Sessões
- **2026-11-20 (Sessão 1):**
  - Docs modulares criados (`AgentsCRM.md`, `TODOCRM.md`, `docs/crm/*`).
  - Stack 14 containers EvoCRM subida em `/opt/phonecenter-crm/` com SSL em `crm.phonecenter.tech` e `api-crm.phonecenter.tech` + backup cron diário.
  - Evolution API (`http://evolution_api:8080`) vinculada automaticamente (`hasEvolutionConfig: true`).
  - White-label PhoneCenterCRM (`infra/crm/branding/`) aplicado ao vivo em `crm.phonecenter.tech`.
  - Construídos e testados no `PAINELCELULAR`: `/api/crm-bridge/{health,estoque,clientes/lookup,simular,ranking,conexoes,webhooks/evo,mcp}`, `/api/publico/vitrine`, `/crm-sidebar` (Dashboard App 4 abas) e `/bio` (Link na Bio + Vitrine).
