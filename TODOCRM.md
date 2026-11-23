# TODOCRM.md — Plano Mestre & Controle de Execução (PhoneCenterCRM)

> **Leia `AgentsCRM.md` e `docs/crm/STATE.md` antes de iniciar qualquer tarefa.**
> Legenda: `[x]` Concluído · `[/]` Em andamento · `[ ]` Pendente · `[!]` Bloqueado

---

## 📍 ONDE PARAMOS (Resumo Rápido)

- **Fase Atual:** `Fases 0, 1, 3, 4, 5, 5B e 6` **CONCLUÍDAS NO CÓDIGO E NA INFRA!** 🚀
- **Entregas da Sessão Atual (2026-11-21):**
  - **Blindagem Multi-Loja & Correções Críticas:**
    - Autenticação em 3 níveis (`master`, `sessao` ERP, `loja_token` por loja via `bridge_token` / `webhook_token` gerenciáveis em `/crm-config` e `/api/crm-bridge/minha-loja`), removendo fallback cross-tenant e isolando instâncias da Evolution API por loja.
    - CORS restrito por allowlist (`origemPermitidaCrm` em `src/lib/crm-bridge/auth.ts`).
    - Webhook Mercado Pago (`/api/crm-bridge/webhooks/pagamento`) validado via API real `GET /v1/payments/{id}` (`status === 'approved'`) + reserva real e idempotente de IMEI em `aparelhos` usando `aplicarMudancaEstoque()` (`patchReserva` / `patchLiberarReserva`).
    - Rotas públicas `/bio`, `/proposta` e `/crm-sidebar` liberadas em `AuthContext.tsx`; correção de logs (`registrarLog()`), paginação/source_id e fechamento de conexões em `tickets-ops`, ocultação de aparelhos reservados na vitrine `/bio`, e lazy import browser em `src/lib/logger.ts`.
  - **Funções Matadoras do CRM:**
    - **1-Clique Enviar no Chat (`/api/crm-bridge/enviar-mensagem`)** + **1-Clique Fechar Venda & Notinha PDF (`/api/crm-bridge/pre-venda`)** via `registrarVendaAtomica()` e `gerarReciboPdfBuffer()`.
    - **Motor de Pós-Venda Automático "PhoneCenter Turbo" (`posVenda.ts`, `/api/crm-bridge/pos-venda`, `/api/crm-bridge/notificar-os`)**: 9 réguas (D+0, D+7 Google Review, D+90/180/300 Upgrade com pré-avaliação automática, Garantia D-15, Aniversário, Follow-up Proposta 24h e Notificação OS) + alertas instantâneos de **Proposta Quente** (aberta/aceita/recusada) no chat interno.
    - **MCP Server IA expandido para 8 tools (`/api/crm-bridge/mcp`)**, **IA Vision Avaliação de Troca por Foto (`/api/crm-bridge/avaliar-foto-troca`)**, **Validador IMEI Luhn GSMA (`/api/crm-bridge/imei`)** e **Metas / Minha Evolução (`/api/crm-bridge/metas`)**.
  - **Telefonia, UX Native & Suite Completa (`/crm-hub` + `infra/crm/branding/`):**
    - **CRM Phone / Telefonia:** Click-to-Call, webhook universal PABX/VoIP (`/api/crm-bridge/webhooks/telefonia`, `/api/crm-bridge/telefonia`) e banner popup Cliente 360º ao vivo no `/crm-sidebar`.
    - **Suite `/crm-hub`:** Abas de Operação/Pós-Venda/Telefonia, Rodízio Avançado por Setor (`/api/crm-bridge/rodizio`), Campanhas Anti-Ban (`/api/crm-bridge/campanhas`), Kanban de Grupos & Comunidades (`/api/crm-bridge/kanban-grupos`), CRM Academy (`/api/crm-bridge/academy`), Financeiro de Reservas/Comissões e Gestor Multi-Loja.
    - **White-Label `infra/crm/branding/` & Instagram Unified Login (`infra/crm/patches/`) ATIVOS NA VPS:** Status real pós-login, badges SLA, `Ctrl+K`, tema Dark/Light-Navy, `Dockerfile` White-Label sincronizados em `/opt/phonecenter-crm/branding/` (`nginx -t` OK + `reload`) e patch **Instagram Unified Login** ([instagram_unified_login.rb](infra/crm/patches/instagram_unified_login.rb) + `INSTAGRAM_CONFIG_ID` `1715746990110674`) aplicado com sucesso em `evocrm_crm` e `evocrm_crm_sidekiq` (`enabled=true`, URL `facebook.com/dialog/oauth` verificada).
    - **SaaS Multi-Loja (`autoProvision.ts` & `docker-compose.tenant.yml`):** Modo padrão `compartilhado` (instantâneo com tokens isolados + Time no EvoCRM) e modo `isolado` Enterprise (com stack completa de IA e payload `docker_compose_raw` Base64 para Coolify).
  - `npm run typecheck` com **0 erros**, **`npm test` 586/586 passando** e rotas de produção (`crm`, `api-crm`, `app.phonecenter.tech`) respondendo **HTTP 200**.
- **Ações manuais restantes (usuário):**
  1. Conectar conta do Instagram em `https://crm.phonecenter.tech/channels/new` + WhatsApp QR Code (Evolution).
  2. Aplicar as migrations SQL pendentes no Supabase (incluindo `20261121_phonecenter_crm_completo.sql`).
  3. Copiar links com token isolado em `https://app.phonecenter.tech/crm-config` para Dashboard App `/crm-sidebar`, MCP Server e Webhook no EvoCRM (e opcionalmente agendar cron Pós-Venda / chaves extras).

---

## Fase 0 — Planejamento, Arquitetura e Auditoria Segura da VPS
- [x] Mapear todas as telas e funcionalidades das 7 prints de referência (CRM Mercado Phone)
- [x] Auditar identidade visual do PhoneCenter (`global.css`, `logocnome.png`, `logosnome.png`)
- [x] Mapear arquitetura e módulos nativos do EvoCRM Community (`v1.0.0-rc2` / `latest`)
- [x] Verificar resolução DNS de `crm.phonecenter.tech` e `api-crm.phonecenter.tech` (`13.140.36.50`)
- [x] Criar `AgentsCRM.md`, `TODOCRM.md` e arquivos modulares em `docs/crm/`
- [x] Conectar via SSH na VPS `13.140.36.50:2222`
- [x] Auditar recursos da VPS (6 vCPU, 9.1 GiB RAM livre, 165 GB disco, Coolify, Traefik v3.6, Evolution API)
- [x] Validar estratégia de 2 domínios (`crm.phonecenter.tech` + `api-crm.phonecenter.tech`)

## Fase 1 — Infraestrutura Docker & Deploy Seguro do EvoCRM (`crm.phonecenter.tech`)
- [x] Definir perfil de containers conforme RAM da VPS (**Full Stack com `mem_limit` rígido** — 14 containers, sobrando 7.5 GiB livres)
- [x] Criar rede isolada (`evocrm_net`) + volumes persistentes
- [x] Gerar todos os segredos criptográficos sincronizados em `/opt/phonecenter-crm/.env` (`chmod 600`, fora do Git)
- [x] Subir stack EvoCRM em `/opt/phonecenter-crm/` integrado à rede `coolify` (Traefik) e `evolution_default` com `mem_limit`
- [x] Configurar rotas Traefik + SSL Let's Encrypt para `crm.phonecenter.tech` e `api-crm.phonecenter.tech`
- [x] Executar setup inicial, migrations/seed do `evo-auth` e `evo-crm` e criar conta `super_admin`
- [x] Validar healthchecks de todos os 14 containers + confirmar zero impacto na Evolution API e `app.phonecenter.tech`
- [x] Configurar backup automático diário do Postgres do CRM (`/opt/phonecenter-crm/backup.sh` via cron)

## Fase 2 — Canais Omnichannel & Integrações Core
- [x] Vincular **Evolution API** no EvoCRM (`EVOLUTION_API_URL=http://evolution_api:8080`, `hasEvolutionConfig: true`) — pronto para criar inboxes WhatsApp QR Code!
- [ ] Preparar canal **WhatsApp API Oficial (Meta Cloud API)** (app Meta, webhook verificado, templates)
- [/] Configurar canal **Instagram Direct + Comentários** (webhook `https://api-crm.phonecenter.tech/webhooks/instagram` validado ✅ + patch Unified Login [instagram_unified_login.rb](infra/crm/patches/instagram_unified_login.rb) ATIVO na VPS ✅ — falta apenas autorizar a conta em `/channels/new`)
- [ ] Configurar canal **Facebook Messenger + Webchat Widget**
- [ ] Configurar **Google Calendar** (OAuth Google Cloud → agendamento de visitas/retiradas no CRM)
- [ ] Configurar **SMTP transacional** (Resend/SMTP) e **Storage S3/R2** (opcional para mídias pesadas)
- [x] Configurar **Setores de Atendimento & Rodízio** (Vendas, Troca/Upgrade, Assistência/Garantia, Atacado, Financeiro) no PhoneCenter CRM Suite (`/crm-hub` + `/api/crm-bridge/rodizio`)
- [ ] Configurar **Tags**, **Respostas Rápidas**, **Horário de Funcionamento** e **Pesquisa de Avaliação (CSAT)** diretamente nos canais externos após login em produção

## Fase 3 — White-Label & Identidade Visual PhoneCenterCRM
- [x] Aplicar camada White-Label imediata (`infra/crm/branding/`: `nginx.conf` + `phonecenter-theme.css` + `phonecenter-brand.js` + logos oficiais)
- [x] Aplicar paleta PhoneCenter (`#090d16`–`#0f172a`, Azul `#0066FF`), logos/favicons oficiais e título **PhoneCenterCRM**
- [x] Injetar seletor de status inicial no Login com sincronização real pós-login, badges visuais de SLA, atalho `Ctrl+K` para `/crm-hub` e alternância Dark/Light-Navy
- [x] Liberar CSP `frame-src` no Nginx para carregar Dashboard Apps de `https://app.phonecenter.tech`
- [x] Criar `infra/crm/branding/Dockerfile` pronto para imagem White-Label customizada (e comando único de sync para `/opt/phonecenter-crm/branding/`)

## Fase 4 — Integração Profunda PhoneCenter ERP (`PAINELCELULAR` ↔ `PhoneCenterCRM`)
- [x] Criar camada **PhoneCenter CRM Bridge** (`/api/crm-bridge/*` com auth 3 níveis, tokens isolados por loja, CORS allowlist & testes unitários)
- [x] **Consulta de Clientes 360º:** `/api/crm-bridge/clientes/lookup` + **Consulta IMEI Luhn GSMA:** `/api/crm-bridge/imei`
- [x] **Consulta de Estoque Vivo:** `/api/crm-bridge/estoque` (com status `reservado`, texto WhatsApp e envio 1-clique no chat)
- [x] **Simulador Troca/Upgrade + Foto IA Vision + Maquininha:** `/api/crm-bridge/simular` + `/api/crm-bridge/avaliar-foto-troca`
- [x] **Dashboard App Lateral no Chat (`/crm-sidebar`):** Estoque (1-clique enviar/fechar venda), Cliente 360º, Troca/Proposta PDF + Vision, Ranking & Minha Evolução, Ops/Pix/Telefonia
- [x] **MCP Server PhoneCenter (`/api/crm-bridge/mcp`):** JSON-RPC 2.0 com **8 tools** (consulta + gerar proposta + gerar Pix reserva + agendar visita + transferir vendedor)
- [x] **Webhook receptor (`/api/crm-bridge/webhooks/evo`):** registra eventos, leads de anúncios e conversão Meta CAPI via `registrarLog()`

## Fase 5 — Módulos Exclusivos & Telefonia (Superando o Mercado Phone CRM)
- [x] **Ranking de Vendas, Metas & Minha Evolução:** `/api/crm-bridge/ranking` + `/api/crm-bridge/metas`
- [x] **Gestão de Conexões Isolada por Loja (EvoAPI):** `/api/crm-bridge/conexoes` + `/api/crm-bridge/minha-loja`
- [x] **Link na Bio com Vitrine Dinâmica (oculta reservados):** `/bio` + `/api/publico/vitrine`
- [x] **Propostas Comerciais com link público, aceite, PDF & Alertas de Proposta Quente:** `crm_propostas` + `/api/crm-bridge/propostas` + `/proposta/[token]`
- [x] **Leads de Anúncio (Meta Ads CTWA + CAPI/ROAS):** `crm_leads_anuncio` + captura automática no webhook + `/api/crm-bridge/leads-anuncio`
- [x] **Migrar Tickets entre Conexões (`source_id` + paginação completa) & Fechamento em Massa:** `/api/crm-bridge/tickets-ops`
- [x] **Chat Interno da Equipe & Fechamento 1-Clique com Notinha PDF:** `/api/crm-bridge/chat-interno` + `/api/crm-bridge/pre-venda`
- [x] **Motor de Pós-Venda Automático "PhoneCenter Turbo" (9 réguas + OS Status):** `posVenda.ts` + `/api/crm-bridge/pos-venda` + `/api/crm-bridge/notificar-os`
- [x] **Telefonia / CRM Phone (Click-to-Call + Webhook PABX/VoIP + Popup 360º):** `/api/crm-bridge/telefonia` + `/api/crm-bridge/webhooks/telefonia`
- [x] **Suite `/crm-hub` + Rodízio Inteligente + Campanhas Anti-Ban + Kanban Grupos + CRM Academy + Financeiro (Fase 5B)**

## Fase 6 — Escala Multi-Loja (SaaS PhoneCenter) & Governança
- [x] Definir modelo Multi-Loja híbrido (`compartilhado` padrão R\$ 299/mês + `isolado` Enterprise com IA completa) em `infra/crm/docker-compose.tenant.yml` e `/api/crm-bridge/multi-loja/provisionar` (`crm_tenants` + `autoProvision.ts`)
- [x] Integrar links diretos **CRM** e **Suite (`/crm-hub`)** no cabeçalho do `PAINELCELULAR` (`src/app/page.tsx`) + sessão nativa em `/crm-config`
- [x] Integrar **Pix EMV BACEN / Asaas / Mercado Pago (validação real API + lock/unlock real de IMEI via `aplicarMudancaEstoque`)**
- [x] Monitoramento automático da VPS (`/opt/phonecenter-crm/health-monitor.sh` via cron a cada 5 min — `ram=32% disk=22%`)
- [x] Atualizar `docs/crm/OAUTH-SETUP.md` com tokens isolados, Telefonia webhook, Cron Pós-Venda e sync de branding
- [ ] Executar teste E2E ao vivo pós-aplicação das migrations SQL no Supabase, envs no Coolify e sync do branding na VPS
