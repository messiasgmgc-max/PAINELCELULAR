# OAUTH-SETUP.md — Guia Exato de Credenciais (Coolify, Meta, Google, Pix & Multi-Loja)

## 1. Variáveis de Ambiente no Coolify (`PAINELCELULAR` / `app.phonecenter.tech`)

No painel do Coolify → Projeto do `PAINELCELULAR` → **Environment Variables**:

### Obrigatória (ativa Ponte CRM, Dashboard App `/crm-sidebar` e MCP IA)
| Variável | Exemplo / Onde pegar |
| :--- | :--- |
| `CRM_BRIDGE_SECRET` | Gere uma chave forte (ex: 32+ caracteres). Use a **mesma** no `?token=` do Dashboard App e no header `X-PhoneCenter-CRM-Key` do MCP. |

### Opcionais (desbloqueiam recursos extras na hora)
| Variável | Para que serve |
| :--- | :--- |
| `CRM_EVO_ACCESS_TOKEN` | Token gerado em `https://crm.phonecenter.tech/settings/access-tokens` — libera **Migrar Tickets** e **Encerrar Tickets em Massa** na aba Ops. |
| `CRM_EVO_API_URL` | `https://api-crm.phonecenter.tech` *(já é o padrão)* |
| `CRM_PIX_KEY` | Chave Pix da loja (CNPJ, e-mail, telefone ou aleatória) — gera **Pix Copia e Cola EMV BACEN** instantâneo na aba **Pix** sem precisar de conta gateway! |
| `CRM_PIX_CITY` | Cidade da loja (ex: `BELO HORIZONTE`) |
| `MERCADOPAGO_ACCESS_TOKEN` | *(Opcional)* Gera Pix dinâmico com baixa automática via webhook `/api/crm-bridge/webhooks/pagamento?token=...` |
| `ASAAS_API_KEY` + `ASAAS_DEFAULT_CUSTOMER_ID` | *(Opcional)* Alternativa Asaas para Pix dinâmico com baixa automática |
| `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN` | *(Opcional)* Envia evento `Purchase` server-side para otimizar campanhas Meta Ads (ROAS real) |
| `COOLIFY_API_URL` + `COOLIFY_API_TOKEN` | *(Fase 6 Multi-Loja)* Provisionamento de novas instâncias `<slug>.crm.phonecenter.tech` |

---

## 2. URLs Exatas de Callback & Webhook no PhoneCenterCRM (`api-crm.phonecenter.tech`)

Use estas URLs exatas ao criar seus Apps no **Meta for Developers** e **Google Cloud Console** (e preencha os IDs/Secrets em `https://crm.phonecenter.tech` → **Admin → Configurações**):

| Integração | URL de Callback / Webhook Oficial |
| :--- | :--- |
| **WhatsApp API Oficial (Meta Cloud)** | Webhook: `https://api-crm.phonecenter.tech/api/v1/webhooks/whatsapp` |
| **Instagram Direct + Comentários** | Webhook: `https://api-crm.phonecenter.tech/api/v1/webhooks/instagram`<br>OAuth Redirect: `https://crm.phonecenter.tech/instagram/callback` |
| **Facebook Messenger + Feed** | Webhook: `https://api-crm.phonecenter.tech/api/v1/webhooks/facebook/feed` |
| **Google Calendar OAuth** | Redirect URI: `https://crm.phonecenter.tech/google-calendar/callback` |
| **Google Sheets / Gmail OAuth** | Redirect URI: `https://crm.phonecenter.tech/google/callback` |
| **WhatsApp Evolution API (QR Code)** | **JÁ CONFIGURADO AUTOMATICAMENTE** (`http://evolution_api:8080`, `hasEvolutionConfig: true`) |

---

## 3. Escala Multi-Loja SaaS (`infra/crm/docker-compose.tenant.yml`)

Para cada nova loja pagante do ecossistema PhoneCenter:
1. Chame `POST https://app.phonecenter.tech/api/crm-bridge/multi-loja/provisionar` com `{ lojaId, nomeLoja }` (header `X-PhoneCenter-CRM-Key`).
2. Crie os 2 registros DNS Tipo A (ou 1 wildcard `*.crm.phonecenter.tech → 13.140.36.50` — que libera infinitas lojas sem mexer no DNS nunca mais!).
3. Suba o template [infra/crm/docker-compose.tenant.yml](../../infra/crm/docker-compose.tenant.yml) no Coolify informando `TENANT_SLUG`.
4. Cadastre no tenant o Dashboard App apontando para:
   `https://app.phonecenter.tech/crm-sidebar?loja_id=<UUID_DA_LOJA>&token=<CRM_BRIDGE_SECRET>`
