# OAUTH-SETUP.md — Guia Exato de Credenciais (Coolify, Tokens por Loja, Telefonia, Pós-Venda & VPS)

## 1. Variáveis de Ambiente no Coolify (`PAINELCELULAR` / `app.phonecenter.tech`)

No painel do Coolify → Projeto do `PAINELCELULAR` → **Environment Variables**:

### Obrigatória (Chave Master da Plataforma / Crons)
| Variável | Exemplo / Onde pegar |
| :--- | :--- |
| `CRM_BRIDGE_SECRET` | Chave forte master (ex: 32+ caracteres). Usada para administração multi-loja e crons globais (`todasLojas: true`). |

> **Tokens Isolados por Loja (Recomendado):** Após autenticar no ERP, cada loja gera e rotaciona automaticamente seu próprio `bridge_token` e `webhook_token` isolados em **`https://app.phonecenter.tech/crm-config`** — evitando compartilhar a chave master entre diferentes clientes SaaS!

### Opcionais (desbloqueiam recursos extras na hora)
| Variável | Para que serve |
| :--- | :--- |
| `CRM_EVO_ACCESS_TOKEN` | Token gerado em `https://crm.phonecenter.tech/settings/access-tokens` — libera **Migrar Tickets** e **Encerrar Tickets em Massa** na aba Ops (também configurável por loja em `/crm-config`). |
| `CRM_EVO_API_URL` | `https://api-crm.phonecenter.tech` *(já é o padrão)* |
| `CRM_PIX_KEY` / `CRM_PIX_CITY` | Chave Pix e cidade padrão para gerar **Pix Copia e Cola EMV BACEN** instantâneo na aba **Pix**. |
| `MERCADOPAGO_ACCESS_TOKEN` | *(Opcional)* Pix dinâmico validado em tempo real na API `GET /v1/payments/{id}` antes de reservar o IMEI no estoque. |
| `ASAAS_API_KEY` + `ASAAS_DEFAULT_CUSTOMER_ID` | *(Opcional)* Alternativa Asaas para Pix dinâmico com baixa automática. |
| `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN` | *(Opcional)* Dispara evento `Purchase` server-side para otimizar campanhas Meta Ads (ROAS real). |
| `COOLIFY_API_URL` + `COOLIFY_API_TOKEN` | *(Fase 6 Multi-Loja Enterprise)* Provisionamento de stacks dedicadas `isolado` (`<slug>.crm.phonecenter.tech`) enviando `docker-compose.tenant.yml` em Base64 (`docker_compose_raw`). |

---

## 2. Webhooks Isolados & Automação Diária (Bridge + Telefonia + Pós-Venda)

1. **Dashboard App Lateral (no EvoCRM da Loja):**
   `https://app.phonecenter.tech/crm-sidebar?loja_id=<UUID_DA_LOJA>&token=<BRIDGE_TOKEN_DA_LOJA>`
2. **MCP Server IA (8 Tools no EvoCRM):**
   URL: `https://app.phonecenter.tech/api/crm-bridge/mcp` · Header: `X-PhoneCenter-CRM-Key: <BRIDGE_TOKEN_DA_LOJA>`
3. **Webhook de Eventos EvoCRM:**
   `https://app.phonecenter.tech/api/crm-bridge/webhooks/evo?token=<WEBHOOK_TOKEN_DA_LOJA>`
4. **Webhook Pagamentos (Mercado Pago / Asaas):**
   `https://app.phonecenter.tech/api/crm-bridge/webhooks/pagamento?token=<WEBHOOK_TOKEN_DA_LOJA>`
5. **Webhook de Telefonia PABX/VoIP (Asterisk, 3CX, Zenvia, Twilio ou JSON genérico):**
   `POST https://app.phonecenter.tech/api/crm-bridge/webhooks/telefonia?token=<WEBHOOK_TOKEN_DA_LOJA>`
   Campos aceitos no JSON: `{ direction, from, to, call_id, status, duration, recording_url, ramal, agente }` → identifica o cliente no ERP instantaneamente para popup no `/crm-sidebar` e `/crm-hub`.
6. **Cron Diário do Motor de Pós-Venda Automático ("PhoneCenter Turbo"):**
   Agende 1x por dia (ex: `09:30` BRT via Coolify Scheduled Task / cron na VPS):
   ```bash
   curl -sS -X POST https://app.phonecenter.tech/api/crm-bridge/pos-venda \
     -H "Content-Type: application/json" \
     -H "X-PhoneCenter-CRM-Key: <CRM_BRIDGE_SECRET>" \
     -d '{ "todasLojas": true }'
   ```

---

## 3. URLs Exatas de Callback & Webhook no PhoneCenterCRM (`api-crm.phonecenter.tech`)

Use estas URLs ao criar seus Apps no **Meta for Developers** e **Google Cloud Console** (e preencha IDs/Secrets em `https://crm.phonecenter.tech` → **Admin → Configurações**):

| Integração | URL de Callback / Webhook Oficial |
| :--- | :--- |
| **WhatsApp API Oficial (Meta Cloud)** | Webhook: `https://api-crm.phonecenter.tech/api/v1/webhooks/whatsapp`<br>Verify Token: `phonecenter_meta_verify_2026` |
| **Instagram Direct + Comentários** | Webhook: `https://api-crm.phonecenter.tech/api/v1/webhooks/instagram`<br>Verify Token: `phonecenter_meta_verify_2026`<br>OAuth Redirect: `https://crm.phonecenter.tech/instagram/callback` |
| **Facebook Messenger + Feed** | Webhook: `https://api-crm.phonecenter.tech/api/v1/webhooks/facebook/feed`<br>Verify Token: `phonecenter_meta_verify_2026` |
| **Google Calendar OAuth** | Redirect URI: `https://crm.phonecenter.tech/google-calendar/callback` |
| **Google Sheets / Gmail OAuth** | Redirect URI: `https://crm.phonecenter.tech/google/callback` |
| **WhatsApp Evolution API (QR Code)** | **JÁ CONFIGURADO AUTOMATICAMENTE** (`http://evolution_api:8080`, `hasEvolutionConfig: true`) |

---

## 4. Sincronização do White-Label atualizado na VPS (Comando Único)

Após dar `git pull` em um clone atualizado ou a partir da sua máquina local com acesso SSH em `root@13.140.36.50:2222`, copie os arquivos de [infra/crm/branding/](../../infra/crm/branding/) para `/opt/phonecenter-crm/branding/` e recarregue o Nginx sem downtime:

```bash
scp -P 2222 infra/crm/branding/* root@13.140.36.50:/opt/phonecenter-crm/branding/ && \
ssh -p 2222 root@13.140.36.50 "docker exec evocrm_frontend nginx -s reload"
```

---

## 5. Escala Multi-Loja SaaS (`compartilhado` vs `isolado`)

- **Padrão `compartilhado` (Plano Avançado R\$ 299/mês):** Chame `POST https://app.phonecenter.tech/api/crm-bridge/multi-loja/provisionar` com `{ lojaId, nomeLoja, modo: "compartilhado" }` — gera `bridge_token`/`webhook_token` isolados, cria Time no EvoCRM compartilhado (`crm.phonecenter.tech`) e ativa a loja imediatamente.
- **Enterprise `isolado`:** Passe `modo: "isolado"` (com DNS wildcard `*.crm.phonecenter.tech → 13.140.36.50`). Quando `COOLIFY_API_URL` + `COOLIFY_API_TOKEN` estiverem configurados, o provisionador envia [infra/crm/docker-compose.tenant.yml](../../infra/crm/docker-compose.tenant.yml) codificado em Base64 (`docker_compose_raw`) para subir a stack isolada completa com IA dedicada.
