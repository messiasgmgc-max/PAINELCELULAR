# INTEGRATIONS.md — Catálogo Completo de Integrações do PhoneCenterCRM

> Objetivo: Entregar o ecossistema de integrações **mais completo do mercado de lojas de celulares**, combinando as integrações nativas do EvoCRM Community com a ponte direta para o PhoneCenter ERP (`PAINELCELULAR`).

---

## 1. Integração Nativa PhoneCenter ERP (`PAINELCELULAR` ↔ `PhoneCenterCRM`) — PRIORIDADE MÁXIMA

### A. PhoneCenter CRM Bridge (`/api/crm-bridge/*` no Next.js)
Endpoints server-side (usando `supabaseAdmin`, protegidos por `X-PhoneCenter-CRM-Key` + `loja_id`):
- `GET /api/crm-bridge/estoque` — Busca aparelhos disponíveis (`modelo`, `armazenamento`, `cor`, `saude_bateria`, `condicao`, `preco_venda`, `foto`, `imei_final`).
- `GET /api/crm-bridge/clientes/lookup?phone=...&cpf=...` — Retorna perfil do cliente no ERP + histórico de compras + aparelhos em garantia + OS abertas.
- `POST /api/crm-bridge/simular-troca` — Reutiliza lógica da Calculadora de Upgrade + Taxas da Maquininha para gerar opções de entrada + parcelamento em 1x–18x.
- `POST /api/crm-bridge/propostas` — Gera orçamento/proposta oficial em PDF com logo da loja e retorna URL + base64 para envio imediato no WhatsApp.
- `POST /api/crm-bridge/pre-venda` — Envia dados do cliente + aparelho + aparelho na troca direto para a tela de Vendas/Notinha do PhoneCenter ERP.
- `GET /api/crm-bridge/ranking` — Retorna dados reais de vendas fechadas no ERP por vendedor (alimenta **Relatório de Vendas**, **Ranking de Vendas** e **Minha Evolução**).
- `POST /api/crm-bridge/webhooks/evo` — Recebe webhooks do CRM (oportunidade ganha, novo contato, lead de anúncio) para registrar no Supabase.

### B. Dashboard App Embutido no Chat (`/crm-sidebar`)
- Configurado nativamente em `Admin/Configurações > Dashboard Apps` no EvoCRM.
- Abre ao lado direito da conversa do cliente recebendo `window.addEventListener('message', ...)` com telefone/nome do contato atual.
- Permite ao vendedor em **1 tela**:
  1. Ver histórico de compras e garantia do cliente.
  2. Pesquisar estoque em tempo real e copiar/enviar descrição + foto para o chat.
  3. Simular **Troca/Upgrade + Parcelamento Maquininha** e enviar orçamento pronto.
  4. Criar **Proposta PDF** ou disparar **Pré-venda / Notinha** no PhoneCenter.

### C. MCP Server PhoneCenter para Agentes de IA (`/api/crm-bridge/mcp`)
- Cadastrado nativamente em `Admin > McpServers` do EvoCRM (`evo-ai-processor` + `evo-ai-core`).
- Tools expostas à IA de atendimento:
  - `consultar_estoque(query, condicao, max_preco)`
  - `simular_parcelas(valor, valor_troca)`
  - `buscar_cliente_garantia(telefone_ou_cpf)`
  - `agendar_atendimento_loja(nome, telefone, data_hora, interesse)`
  - `transferir_para_vendedor(setor, resumo_atendimento)`

---

## 2. Canais Omnichannel (Comunicação)

| Canal | Engine | O que faz | Prioridade |
| :--- | :--- | :--- | :---: |
| **WhatsApp (QR Code)** | Evolution API (já na VPS) / Evolution Go | Múltiplos chips por loja, áudio, mídia, grupos, reações, status | **P0 (Fase 2)** |
| **WhatsApp API Oficial** | Meta Cloud API (nativo EvoCRM) | Templates aprovados, botões interativos, alta escala sem banimento, selo verde | **P0 (Fase 2)** |
| **Instagram Direct + Comentários** | Meta Graph API (nativo EvoCRM) | DMs, respostas a Stories, comentários em posts/Reels → abre ticket + automação | **P0 (Fase 2)** |
| **Facebook Messenger + Comentários** | Meta Graph API (nativo EvoCRM) | Mensagens da página + moderação de comentários | **P1 (Fase 2)** |
| **Webchat Widget** | Widget nativo EvoCRM | Bolha de chat embutível na vitrine/site/Link na Bio da loja | **P1 (Fase 2)** |
| **E-mail Omnichannel** | SMTP/IMAP + Gmail OAuth (nativo) | Centralizar e-mails de suporte/garantia/fornecedores como tickets | **P2** |
| **NotificaMe / Z-API** | Conectores nativos EvoCRM | Alternativa plug-and-play para canais extras (Mercado Livre / Telegram via NotificaMe) | **P2** |

---

## 3. Marketing, Tráfego Pago & Atribuição (Superando o Mercado Phone)

- **Meta Ads — Click-to-WhatsApp (CTWA) Attribution:**
  - Captura automática do objeto `referral` (source_id, headline, body, source_url, ctwa_clid) quando o lead chega de um anúncio do Instagram/Facebook.
  - Grava automaticamente nos atributos do contato e no card do Pipeline → alimenta a tela **Leads de Anúncio**.
- **Meta Conversions API (CAPI):**
  - Quando uma oportunidade é marcada como **Ganha** no CRM (ou venda confirmada no ERP), dispara evento `Purchase` server-side para a Meta com `ctwa_clid` + valor da venda → otimiza o algoritmo do Meta Ads para trazer compradores reais!
- **UTM & Link na Bio Tracker:**
  - Rastreamento de origem (`bio`, `instagram_story`, `indicacao`, `google`, `loja_fisica`).

---

## 4. Produtividade, Agenda & Automação Externa

| Integração | Tipo | Caso de Uso PhoneCenter |
| :--- | :--- | :--- |
| **Google Calendar** | Nativo EvoCRM (OAuth) | Agendar visitas à loja, retirada de aparelho, avaliação presencial de troca (sincronizado com Agenda & Tarefas) |
| **Google Sheets** | Nativo EvoCRM (OAuth) | Exportar leads/campanhas ou importar listas de disparos |
| **Webhooks Outbound & Inbound** | Nativo EvoCRM | Integração ilimitada com **n8n**, **Make**, **Typebot**, **Zapier** |
| **Cloud Storage (Cloudflare R2 / S3 / MinIO)** | Nativo EvoCRM (`ACTIVE_STORAGE_SERVICE=s3_compatible`) | Armazenar áudios, vídeos e fotos de aparelhos fora do disco da VPS |
| **SMTP / Resend** | Nativo EvoCRM | E-mails de convite de equipe, reset de senha e resumos diários |

---

## 5. Pagamentos, Cobrança & Pós-Venda Automatizado

- **Pix / Links de Pagamento (Asaas / Mercado Pago / Stripe):**
  - Gerar cobrança de **sinal de reserva** de aparelho direto dentro do chat; ao pagar (webhook), move automaticamente o card no Kanban para *"Sinal Pago / Reservado"* e reserva o IMEI no PhoneCenter ERP!
- **Automação de Pós-Venda PhoneCenter (Gatilho ERP → CRM):**
  - **Dia 0 (Venda fechada):** Envia recibo/notinha PDF + link de garantia + pesquisa CSAT.
  - **Dia 7:** Mensagem automática perguntando se está tudo certo com o aparelho + pedido de avaliação no Google Meu Negócio.
  - **Dia 90 / 330:** Campanha automática de **Upgrade / Troca** oferecendo avaliação do aparelho comprado na loja!
  - **Aniversário do cliente:** Cupom/mensagem automática para película/acessório.

---

## 6. Provedores de IA Suportados (BYOK / Multi-Modelo)

O `evo-ai-processor` permite configurar credenciais por agente:
- **OpenAI** (GPT-4o / GPT-4o-mini + Whisper transcrição de áudio)
- **Google Gemini** (Gemini 2.5 Flash / Pro — já usado no `PAINELCELULAR`!)
- **Groq** (Llama / Whisper ultra-rápido — já usado no `PAINELCELULAR`!)
- **Anthropic Claude** (opcional)
- **Transcrição automática de áudios recebidos no WhatsApp** (fundamental para vendas de celulares no Brasil!).
