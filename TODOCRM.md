# TODOCRM.md — Plano Mestre & Controle de Execução (PhoneCenterCRM)

> **Leia `AgentsCRM.md` e `docs/crm/STATE.md` antes de iniciar qualquer tarefa.**
> Legenda: `[x]` Concluído · `[/]` Em andamento · `[ ]` Pendente · `[!]` Bloqueado

---

## 📍 ONDE PARAMOS (Resumo Rápido)

- **Fase Atual:** `Fase 0 — Auditoria da VPS & Planejamento` (quase concluída)
- **Concluído agora:**
  - Pesquisa completa do `evolution-foundation/evo-crm-community` (`v1.0.0-rc2`), stack Docker, serviços, módulos nativos e licença Apache 2.0.
  - Mapeamento 100% dos módulos das 7 prints do CRM Mercado Phone + análise de identidade visual do PhoneCenter.
  - Validação de DNS: `crm.phonecenter.tech` já resolve para `13.140.36.50` e o Traefik/Coolify já responde na porta 443.
  - Criação de toda a documentação modular (`AgentsCRM.md`, `TODOCRM.md`, `docs/crm/*`).
- **Bloqueio Atual (`[!]`):**
  - Acesso SSH em `13.140.36.50:2222` retornou `Authentication failed` para os usuários testados (`root`, `ubuntu`, `messias`). Pausamos tentativas para evitar bloqueio por `fail2ban`.
- **Próximo Passo Exato:**
  1. Receber do usuário o **usuário SSH correto** (e confirmação da senha/chave) para `13.140.36.50:2222`.
  2. Executar auditoria read-only na VPS (`free -h`, `df -h`, `docker ps`, redes Coolify/Traefik, Evolution API).
  3. Definir perfil de deploy (**Core Lite** vs **Full**) e subir EvoCRM em `crm.phonecenter.tech` sem impactar nada existente.

---

## Fase 0 — Planejamento, Arquitetura e Auditoria Segura da VPS
- [x] Mapear todas as telas e funcionalidades das 7 prints de referência (CRM Mercado Phone)
- [x] Auditar identidade visual do PhoneCenter (`global.css`, `logocnome.png`, `logosnome.png`)
- [x] Mapear arquitetura e módulos nativos do EvoCRM Community (`v1.0.0-rc2`)
- [x] Verificar resolução DNS de `crm.phonecenter.tech` (`13.140.36.50`)
- [x] Criar `AgentsCRM.md`, `TODOCRM.md` e arquivos modulares em `docs/crm/`
- [!] Conectar via SSH na VPS `13.140.36.50:2222` *(aguardando usuário SSH correto)*
- [ ] Auditar recursos da VPS (CPU, RAM, Swap, Disco, `docker ps`, Coolify, Traefik, Evolution API, portas)
- [ ] Verificar DNS de `api-crm.phonecenter.tech` (ou confirmar estratégia de domínio único via gateway)

## Fase 1 — Infraestrutura Docker & Deploy Seguro do EvoCRM (`crm.phonecenter.tech`)
- [ ] Definir perfil de containers conforme RAM da VPS (**Core Lite** vs **Full com EvoFlow/ClickHouse**)
- [ ] Criar rede isolada + volumes persistentes (`evocrm_pgdata`, `evocrm_redis`, `evocrm_storage`, `evocrm_processor_logs`)
- [ ] Gerar todos os segredos criptográficos sincronizados (`SECRET_KEY_BASE`, `JWT_SECRET_KEY`, `EVOAI_CRM_API_TOKEN`, `DOORKEEPER_JWT_SECRET_KEY`, `ENCRYPTION_KEY`, `BOT_RUNTIME_SECRET`)
- [ ] Subir stack EvoCRM (via Coolify Docker Compose ou `/opt/phonecenter-crm` integrado à rede do Traefik) com limites de memória (`mem_limit`)
- [ ] Configurar rotas Traefik + SSL Let's Encrypt para `crm.phonecenter.tech` (e `api-crm.phonecenter.tech`)
- [ ] Executar setup inicial, migrations/seed do `evo-auth` e `evo-crm` e criar conta `super_admin`
- [ ] Validar healthchecks de todos os containers + garantir zero impacto na Evolution API e apps existentes
- [ ] Configurar backup automático diário do Postgres do CRM (`pg_dump` comprimido)

## Fase 2 — Canais Omnichannel & Integrações Core
- [ ] Conectar **WhatsApp (QR Code)** via **Evolution API** já rodando na VPS
- [ ] Preparar canal **WhatsApp API Oficial (Meta Cloud API)** (app Meta, webhook verificado, templates)
- [ ] Configurar canal **Instagram Direct + Comentários** (Meta OAuth + permissões)
- [ ] Configurar canal **Facebook Messenger + Webchat Widget**
- [ ] Configurar **Google Calendar** (OAuth Google Cloud → agendamento de visitas/retiradas no CRM)
- [ ] Configurar **SMTP transacional** (Resend/SMTP) e **Storage S3/R2** (opcional para mídias pesadas)
- [ ] Configurar **Setores de Atendimento** (Vendas, Troca/Upgrade, Assistência/Garantia, Atacado, Financeiro) e **Equipe / RBAC**
- [ ] Configurar **Tags**, **Respostas Rápidas**, **Horário de Funcionamento** e **Pesquisa de Avaliação (CSAT)**

## Fase 3 — White-Label & Identidade Visual PhoneCenterCRM
- [ ] Criar fork do `evo-ai-frontend-community` (`phonecenter-crm-frontend`) preservando `LICENSE` e `NOTICE`
- [ ] Aplicar paleta PhoneCenter (Dark Slate/Navy `#090d16`–`#0f172a`, Azul `#0066FF`, glassmorphism) e modo claro/escuro opcional
- [ ] Substituir logos, favicons, títulos e copy por **PhoneCenterCRM** (`logocnome.png`, `logosnome.png`)
- [ ] Construir tela de **Login split-screen** estilo PhoneCenterCRM com seletor de status inicial (`Online / Ausente / Offline` integrado ao rodízio)
- [ ] Reorganizar menu lateral em PT-BR espelhando a estrutura validada (Principal, Kanban, CRM, Ferramentas, Campanhas, Sistema)
- [ ] Configurar pipeline de build/deploy da imagem customizada do frontend no Coolify (sem build pesado na VPS se RAM limitada — build via GitHub Actions → GHCR!)

## Fase 4 — Integração Profunda PhoneCenter ERP (`PAINELCELULAR` ↔ `PhoneCenterCRM`)
- [ ] Criar camada **PhoneCenter CRM Bridge** (API autenticada por API Key/HMAC entre CRM e `PAINELCELULAR`/Supabase)
- [ ] **Sincronização de Clientes:** `clientes` (ERP) ↔ Contatos (CRM) com CPF, histórico de compras, aparelhos e garantia ativa
- [ ] **Sincronização de Produtos/Estoque:** `aparelhos` (ERP) ↔ Catálogo de Produtos (CRM) com modelo, GB, cor, saúde bateria, preço à vista/parcelado
- [ ] **Dashboard App Lateral no Chat:** Embed responsivo dentro da conversa do CRM mostrando:
  - Estoque pesquisável em tempo real
  - **Calculadora de Upgrade / Troca** (com aparelho usado na entrada)
  - **Simulador de Parcelas / Taxas da Maquininha**
  - Botão **Gerar Proposta PDF** e enviar direto no WhatsApp
  - Botão **Criar/Emitir Notinha de Venda** direto no PhoneCenter ERP
- [ ] **Agente de IA Vendedor PhoneCenter (MCP / Custom Tools):**
  - Tool `buscar_estoque` (consulta aparelhos disponíveis em tempo real)
  - Tool `simular_parcelamento` (calcula parcelas conforme taxas da loja)
  - Tool `consultar_garantia_os` (consulta histórico por CPF/telefone)
  - Tool `agendar_visita` (cria evento no Google Calendar + tarefa no CRM)
  - Transbordo automático para humano ao detectar intenção de fechamento/troca

## Fase 5 — Módulos Exclusivos (Superando o Mercado Phone CRM)
- [ ] **Propostas Comerciais PDF:** CRUD de propostas vinculadas a oportunidades + link público + aceite
- [ ] **Relatório de Vendas, Ranking de Vendas & Minha Evolução:** Gamificação + metas + conversão real (Lead CRM → Venda ERP)
- [ ] **Leads de Anúncio (Meta Ads CTWA + CAPI):** Captura de `referral`/anúncio, dashboard de origem e cálculo de ROAS real
- [ ] **Rodízio Inteligente:** Distribuição round-robin por setor respeitando `Online/Ausente/Offline`, limite de chats simultâneos e expediente
- [ ] **Gestão Avançada de Conexões & Tickets:** Migrar tickets entre conexões, fechar tickets de conexões removidas, encerramento em massa por filtro, reiniciar sessão EvoAPI
- [ ] **Kanban Avançado:** Visão por Funil, Visão Geral, Visão por Setores e Kanban de Grupos
- [ ] **Campanhas & Listas:** Segmentação por tags/clientes/garantia vencendo + disparo seguro com cadência/anti-ban
- [ ] **Chat Interno da Equipe** + **Link na Bio com Vitrine Dinâmica** + **CRM Academy** + **Auditoria/Registros** + **Financeiro**

## Fase 6 — Escala Multi-Loja (SaaS PhoneCenter) & Governança
- [ ] Definir modelo Multi-Loja definitivo:
  - *Opção A:* Provisionamento automatizado de instâncias isoladas por loja via Coolify API (`<slug>.crm.phonecenter.tech`)
  - *Opção B:* Isolamento lógico multi-tenant no fork do CRM + SSO unificado com login do PhoneCenter
- [ ] Integrar **SSO / Link direto** dentro do painel principal `PAINELCELULAR` (botão "Abrir CRM")
- [ ] Integrar **Asaas / Mercado Pago / Pix** para cobrança de sinal/reserva dentro do chat
- [ ] Monitoramento (Uptime Kuma / alertas WhatsApp para queda de instância ou RAM > 85%)
- [ ] Testes E2E completos e documentação final de operação
