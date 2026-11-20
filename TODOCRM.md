# TODOCRM.md — Plano Mestre & Controle de Execução (PhoneCenterCRM)

> **Leia `AgentsCRM.md` e `docs/crm/STATE.md` antes de iniciar qualquer tarefa.**
> Legenda: `[x]` Concluído · `[/]` Em andamento · `[ ]` Pendente · `[!]` Bloqueado

---

## 📍 ONDE PARAMOS (Resumo Rápido)

- **Fase Atual:** `Fases 0, 1, 3A (White-Label), 4 (Ponte ERP + MCP IA) e 5 (Módulos Exclusivos)` **CONCLUÍDAS!** → Pronto para ativação final das credenciais no Coolify/Supabase e Fase 2 (canais Meta/Google) + Fase 6 (Escala Multi-Loja & Pix).
- **Concluído agora (Rodada Final Fase 5):**
  - Migration SQL criada: `supabase/migrations/20261120_phonecenter_crm_modulos.sql` (`crm_propostas`, `crm_leads_anuncio`, `crm_chat_interno`).
  - **Propostas Comerciais com Link Público & Aceite:** `/api/crm-bridge/propostas`, `/api/publico/proposta/[token]` e página pública `/proposta/[token]` (com logo PhoneCenter, troca, parcelamento 1x–18x, aceite com 1 clique e impressão PDF).
  - **Leads de Anúncio (Meta Ads CTWA + CAPI/ROAS):** captura automática no webhook `/api/crm-bridge/webhooks/evo`, dashboard `/api/crm-bridge/leads-anuncio` e disparo server-side Meta Conversions API (`Purchase`).
  - **Chat Interno da Equipe:** `/api/crm-bridge/chat-interno` com 5 canais (`#geral`, `#vendas`, `#trocas`, `#assistencia`, `#gerencia`).
  - **Gestão Avançada de Conexões & Tickets (Print 2):** `/api/crm-bridge/tickets-ops` (migrar tickets entre conexões, fechar inativos por filtro, fechar todos) + `/api/crm-bridge/conexoes` (reiniciar/desconectar Evolution API).
  - **Dashboard App Lateral (`/crm-sidebar`) turbinado:** agora com **5 abas** (*Estoque*, *Cliente*, *Troca + Link Oficial de Proposta*, *Ranking*, *Ops [Ads CTWA / Chat Equipe / Conexões & Tickets]*).
  - `pnpm typecheck` zerado e 9/9 testes unitários do CRM Bridge passando!
- **Próximo Passo Exato:**
  1. Rodar `supabase/migrations/20261120_phonecenter_crm_modulos.sql` no SQL Editor do Supabase (para criar as 3 novas tabelas).
  2. Configurar no Coolify do `PAINELCELULAR`: `CRM_BRIDGE_SECRET` (obrigatório), `CRM_EVO_ACCESS_TOKEN` (para migrar/fechar tickets em massa), e opcionalmente `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN`.
  3. No `https://crm.phonecenter.tech`: conectar WhatsApp QR (Evolution API já ativa!), cadastrar Dashboard App `/crm-sidebar?token=...`, MCP Server `/api/crm-bridge/mcp` e Webhook `/api/crm-bridge/webhooks/evo?token=...`.
  4. **Próxima etapa sob demanda:** Fase 2 (Instagram Direct, WhatsApp Cloud API Oficial, Google Calendar OAuth) e Fase 6 (Multi-Loja SaaS via Coolify API + Pix/Asaas no chat).

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
- [ ] Configurar canal **Instagram Direct + Comentários** (Meta OAuth + permissões)
- [ ] Configurar canal **Facebook Messenger + Webchat Widget**
- [ ] Configurar **Google Calendar** (OAuth Google Cloud → agendamento de visitas/retiradas no CRM)
- [ ] Configurar **SMTP transacional** (Resend/SMTP) e **Storage S3/R2** (opcional para mídias pesadas)
- [ ] Configurar **Setores de Atendimento** (Vendas, Troca/Upgrade, Assistência/Garantia, Atacado, Financeiro) e **Equipe / RBAC**
- [ ] Configurar **Tags**, **Respostas Rápidas**, **Horário de Funcionamento** e **Pesquisa de Avaliação (CSAT)**

## Fase 3 — White-Label & Identidade Visual PhoneCenterCRM
- [x] Aplicar camada White-Label imediata (`infra/crm/branding/`: `nginx.conf` + `phonecenter-theme.css` + `phonecenter-brand.js` + logos oficiais) ao vivo em `crm.phonecenter.tech`
- [x] Aplicar paleta PhoneCenter (`#090d16`–`#0f172a`, Azul `#0066FF`), logos/favicons e título **PhoneCenterCRM**
- [x] Injetar seletor de status inicial no Login (`Online / Ausente / Offline`) e dock rápido ERP / Link na Bio
- [x] Liberar CSP `frame-src` no Nginx para carregar Dashboard Apps de `https://app.phonecenter.tech`
- [ ] *(Opcional Fase 3B)* Criar fork completo do `evo-ai-frontend-community` com build via GitHub Actions → GHCR para reorganização estrutural da sidebar PT-BR

## Fase 4 — Integração Profunda PhoneCenter ERP (`PAINELCELULAR` ↔ `PhoneCenterCRM`)
- [x] Criar camada **PhoneCenter CRM Bridge** (`/api/crm-bridge/*` com auth timing-safe + CORS + testes unitários)
- [x] **Consulta de Clientes 360º:** `/api/crm-bridge/clientes/lookup` (cadastro + compras + garantias + OS)
- [x] **Consulta de Estoque Vivo:** `/api/crm-bridge/estoque` (busca inteligente com sinônimos + texto pronto WhatsApp)
- [x] **Simulador Troca/Upgrade + Maquininha:** `/api/crm-bridge/simular` (motor `upgradeEngine` + tabela real `taxas_maquininha`)
- [x] **Dashboard App Lateral no Chat (`/crm-sidebar`):** 4 abas (Estoque, Cliente 360º, Troca/Proposta PDF, Ranking) com auto-contexto `postMessage` do EvoCRM
- [x] **MCP Server PhoneCenter (`/api/crm-bridge/mcp`):** JSON-RPC 2.0 com tools `consultar_estoque`, `simular_troca_e_parcelas`, `consultar_cliente_garantia`, `resumo_ranking_vendas`
- [x] **Webhook receptor (`/api/crm-bridge/webhooks/evo`):** registra eventos e referrals de anúncios no ERP

## Fase 5 — Módulos Exclusivos (Superando o Mercado Phone CRM)
- [x] **Ranking de Vendas & Relatório de Vendas Real (ERP):** `/api/crm-bridge/ranking` + aba Ranking no `/crm-sidebar`
- [x] **Gestão de Conexões (Reiniciar/Desconectar EvoAPI):** `/api/crm-bridge/conexoes` + aba Ops
- [x] **Link na Bio com Vitrine Dinâmica de Estoque:** `/bio` + `/api/publico/vitrine`
- [x] **Propostas Comerciais com link público, aceite & PDF:** `crm_propostas` + `/api/crm-bridge/propostas` + `/proposta/[token]`
- [x] **Leads de Anúncio (Meta Ads CTWA + CAPI/ROAS):** `crm_leads_anuncio` + captura automática no webhook + `/api/crm-bridge/leads-anuncio` + Meta CAPI `Purchase`
- [x] **Migrar Tickets entre Conexões & Fechamento em Massa por Filtro:** `/api/crm-bridge/tickets-ops` + painel visual na aba Ops
- [x] **Chat Interno da Equipe:** `crm_chat_interno` + `/api/crm-bridge/chat-interno` (5 canais) + painel visual na aba Ops
- [ ] **Rodízio Inteligente avançado + Kanban Grupos + CRM Academy + Financeiro (Fase 5B/6)**

## Fase 6 — Escala Multi-Loja (SaaS PhoneCenter) & Governança
- [ ] Definir modelo Multi-Loja definitivo:
  - *Opção A:* Provisionamento automatizado de instâncias isoladas por loja via Coolify API (`<slug>.crm.phonecenter.tech`)
  - *Opção B:* Isolamento lógico multi-tenant no fork do CRM + SSO unificado com login do PhoneCenter
- [ ] Integrar **SSO / Link direto** dentro do painel principal `PAINELCELULAR` (botão "Abrir CRM")
- [ ] Integrar **Asaas / Mercado Pago / Pix** para cobrança de sinal/reserva dentro do chat
- [ ] Monitoramento (Uptime Kuma / alertas WhatsApp para queda de instância ou RAM > 85%)
- [ ] Testes E2E completos e documentação final de operação
