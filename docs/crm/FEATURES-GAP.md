# FEATURES-GAP.md — Matriz Mercado Phone CRM vs EvoCRM vs PhoneCenterCRM

> Mapeamento completo baseado nas **7 prints** do CRM Mercado Phone (`crm.mercadophone.tech`) comparado ao **EvoCRM Community `v1.0.0-rc2`** + diferenciais exclusivos do **PhoneCenterCRM**.
> Legenda: `✅ Nativo` (EvoCRM já tem) · `🔧 Adaptar` (EvoCRM tem base, customizar UX/config) · `🚀 Construir` (Não existe no EvoCRM — nós entregaremos via Fork / CRM Bridge / Dashboard App / MCP).

---

## 1. Tela de Login & Autenticação (Print 7)

| Funcionalidade | Status | Como será entregue no PhoneCenterCRM |
| :--- | :---: | :--- |
| Login e-mail/senha + Esqueceu senha + Termos/Privacidade | ✅ Nativo | `evo-auth-service-community` |
| Layout split-screen com identidade visual + canais orbitando | 🔧 Adaptar | Fork frontend (`docs/crm/BRANDING.md`) com logo PhoneCenter + WhatsApp/IG/PhoneCenter ERP |
| Seletor **"Entrar como: Online / Ausente / Offline"** (bloqueia rodízio se Ausente/Offline) | 🚀 Construir | Chamada pós-login na API de disponibilidade do agente (`availability_status`) antes de redirecionar para `/tickets` |
| SSO opcional com login do PhoneCenter ERP | 🚀 Construir | Fase 6 — OAuth2 / token bridge com Supabase Auth |

---

## 2. Seção PRINCIPAL (Print 6)

| Módulo | Status | Detalhamento |
| :--- | :---: | :--- |
| **Dashboard** | ✅ Nativo | Métricas de atendimento, tempo médio, conversas por agente/inbox + widgets de vendas ERP (Fase 5) |
| **Atendimentos (Inbox Omnichannel)** | ✅ Nativo | Lista de conversas com abas (*Atendendo / Aguardando / Meus*), busca por nome/telefone/CPF/e-mail, filtros rápidos (Filas, Etiquetas, Conexões, Atendentes, Não lidas) |
| **Badges de SLA / Atraso nos cards** (`7d`, `8d`, alerta vermelho) | 🔧 Adaptar | Customização visual no card da conversa no fork frontend + regras de SLA |
| **Notificações desktop/push + som** (banner "Ativar Notificações") | ✅ Nativo | `notification_settings` + `ENABLE_PUSH_RELAY_SERVER=true` |
| **Filtros de atendimentos (salvos)** | ✅ Nativo | `custom_filters_controller.rb` |
| **Rodízios (Round-Robin avançado)** | 🔧 Adaptar | EvoCRM possui `assignable_agents` + auto-assignment por inbox; vamos adicionar painel dedicado de regras de rodízio (por setor, horário, limite simultâneo, status Online) |
| **Contatos** | ✅ Nativo | `contacts_controller.rb` + campos customizados (`CPF`, `modelo_atual`, `garantia`, `origem_anuncio`) + sync bidirecional com tabela `clientes` do PhoneCenter ERP |
| **Agenda & Tarefas** | 🔧 Adaptar | `pipeline_tasks_controller.rb` + `scheduled_actions` + integração bidirecional **Google Calendar** |
| **CRM Academy** | 🔧 Adaptar | Adaptar tela nativa `Tutorials` do EvoCRM com vídeos/guias de treinamento de vendas PhoneCenter |

---

## 3. Seção KANBAN (Print 4)

| Módulo | Status | Detalhamento |
| :--- | :---: | :--- |
| **Kanban (Funil de Vendas)** | ✅ Nativo | `pipelines_controller.rb` + `pipeline_stages` + `pipeline_items` (arrastar cards com valor, contato, conversa vinculada) |
| **Kanban Visão Geral** | 🔧 Adaptar | Agregação de todos os pipelines com totais R$ por etapa |
| **Kanban Setores** | 🔧 Adaptar | Filtro/agrupamento nativo por `teams` (Vendas, Troca, Assistência, Atacado) |
| **Kanban Grupos** | 🚀 Construir | Visão kanban específica para conversas/grupos de WhatsApp (ex: grupos de atacado/fornecedores) |

---

## 4. Seção CRM (Print 4)

| Módulo | Status | Detalhamento |
| :--- | :---: | :--- |
| **Cadastros do CRM** | ✅ Nativo | `contact_companies`, `custom_attribute_definitions`, `crm_forms`, origens e motivos de perda |
| **Produtos** | 🔧 Adaptar | `products_controller.rb` sincronizado automaticamente com tabela `aparelhos` (estoque real do PhoneCenter: modelo, GB, cor, bateria %, preço) |
| **Oportunidades & Pipeline** | ✅ Nativo | `pipeline_items` vinculados à conversa + produto + valor estimado |
| **Propostas (Orçamento PDF)** | 🚀 Construir | Gerador de proposta PhoneCenter (aparelho novo + aparelho usado na troca + parcelas com taxas da maquininha + link/PDF enviável no WhatsApp) |
| **Relatório de Vendas** | 🚀 Construir | Cruzamento CRM (oportunidades ganhas) × PhoneCenter ERP (`vendas` confirmadas) com funil completo |
| **Ranking de Vendas** | 🚀 Construir | Leaderboard em tempo real por vendedor (vendas R$, qtd aparelhos, conversão %, ticket médio) |
| **Minha Evolução** | 🚀 Construir | Painel individual do vendedor (meta mensal, progresso diário, comissão estimada, comparativo) |
| **Leads de Anúncio (Meta Ads CTWA)** | 🚀 Construir | Captura automática de `referral` (Campanha/Conjunto/Anúncio) via Evolution API / Meta Cloud API + dashboard de CPL e ROAS real |

---

## 5. Seção FERRAMENTAS (Print 5 + Print 2)

| Módulo | Status | Detalhamento |
| :--- | :---: | :--- |
| **Tags (Etiquetas)** | ✅ Nativo | `labels_controller.rb` com cores e aplicação em massa/automática |
| **Automações** | ✅ Nativo | `automation_rules_controller.rb` + `macros_controller.rb` + `scheduled_actions` |
| **Respostas Rápidas** | ✅ Nativo | `canned_responses_controller.rb` com atalho `/` + mídia (fotos/áudios/PDFs) |
| **Conexões — WhatsApp QR Code** | ✅ Nativo | `evolution` / `evolution_go` (conectado direto à nossa Evolution API!) |
| **Conexões — WhatsApp API Oficial** | ✅ Nativo | `whatsapp` (Meta Cloud API oficial) |
| **Conexões — Instagram Direct** | ✅ Nativo | `instagram` (+ moderação de comentários) |
| **Conexões — Facebook / Webchat / E-mail** | ✅ Nativo | Extras que já vêm prontos no EvoCRM (além do Mercado Phone!) |
| **Gerenciar Atendimentos (Print 2)** | 🚀 Construir | Painel de utilitários operacionais no modal de Conexões:<br>• **Migrar Tickets para Outra Conexão** (essencial contra banimento de chip)<br>• **Fechar Tickets de Conexões Removidas**<br>• **Fechar Todos os Tickets / Encerrar com Filtros**<br>• **Reiniciar Conexões** (chama `/instance/restart` na Evolution API) |
| **Equipe** | ✅ Nativo | `agents_controller.rb` + RBAC customizável (`roles`) |
| **Setores de Atendimentos** | ✅ Nativo | `teams_controller.rb` + `inbox_members` |
| **Chat Interno** | 🚀 Construir | Canal de mensagens diretas entre membros da equipe (além das notas privadas na conversa que já são nativas) |
| **Assistente de IA** | ✅ Nativo + 🚀 | EvoCRM já traz `evo-ai-core` + `evo-ai-processor` + `evo-bot-runtime` + MCP! Vamos turbinar com **Tools PhoneCenter** (consulta estoque real, simula troca/parcela, agenda visita) |

---

## 6. Seção CAMPANHAS (Print 5)

| Módulo | Status | Detalhamento |
| :--- | :---: | :--- |
| **Campanhas** | ✅ Nativo | `Campaigns` (disparos ativos / templates Meta / WhatsApp) |
| **Criar Listas (Segmentação)** | 🔧 Adaptar | Listas dinâmicas por tags, etapa do funil, clientes sem compra há X dias, garantia vencendo |
| **Configurar Campanhas (Anti-Ban)** | 🔧 Adaptar | Intervalo aleatório entre disparos, limite diário por chip, janela de horário e rotação de conexão |

---

## 7. Seção SISTEMA & INTEGRAÇÕES (Prints 1 & 3)

| Módulo | Status | Detalhamento |
| :--- | :---: | :--- |
| **Avaliações (CSAT)** | ✅ Nativo | `csat_survey_responses_controller.rb` (nota pós-atendimento no WhatsApp) |
| **Registros (Auditoria)** | 🔧 Adaptar | Logs de ações de usuários, webhooks e eventos operacionais |
| **Financeiro** | 🚀 Construir | Área de assinatura/plano da loja integrada ao módulo de planos do PhoneCenter ERP |
| **Configurações** | ✅ Nativo | `Settings` + `Admin/Settings` |
| **Link na Bio** | 🔧 Adaptar | `chat_pages_controller.rb` + página pública `crm.phonecenter.tech/bio/<loja>` com vitrine do estoque + links de setores |
| **Integrações (Print 1)** | ✅ Nativo + 🚀 | Omnichannel, **Google Calendar**, Google Sheets, Gmail, Webhooks/n8n, MCP Servers, **PhoneCenter ERP**, Meta CAPI, Pix/Asaas (ver `docs/crm/INTEGRATIONS.md`) |

---

## 8. Diferenciais PhoneCenterCRM (O que o Mercado Phone NÃO tem)
1. **IA Vendedora com Estoque Vivo via MCP:** O cliente pergunta *"Tem iPhone 15 Pro Max 256GB Titânio Natural e quanto fica em 12x?"* e a IA consulta o Supabase da loja em tempo real e responde com preço, bateria e fotos reais!
2. **Card Lateral ERP dentro do Chat (Dashboard App):** Calculadora de Upgrade/Troca + Taxas da Maquininha + Emissão de Notinha sem sair da conversa do WhatsApp!
3. **Zero cobrança por usuário ou por atendente:** Base open-source Apache 2.0 100% sob controle da PhoneCenter.
