# STATE.md — Estado Vivo do PhoneCenterCRM

> **Regra:** Mantenha este arquivo curto (máx. ~100 linhas). Atualize no fim de toda sessão.

## 1. Infraestrutura & Acessos (Sem Segredos)
- **VPS IP:** `13.140.36.50`
- **SSH Porta:** `2222`
- **SSH Usuário:** `PENDENTE` *(testados `root`, `ubuntu`, `messias` → falharam; pausado para evitar fail2ban)*
- **Orquestrador na VPS:** Coolify + Traefik *(confirmado indiretamente via resposta 503 em HTTPS)*
- **Evolution API existente:** Referenciada no `.env` como `http://13.140.36.50:8080` *(porta 8080 recusou conexão externa direta — provavelmente atrás do Traefik/domínio próprio ou firewall UFW, confirmar via SSH)*
- **Hardware VPS (CPU / RAM / Swap / Disco):** `PENDENTE DE AUDITORIA SSH`

## 2. Domínios & DNS
- `phonecenter.tech` → `13.140.36.50` ✅
- `crm.phonecenter.tech` → `13.140.36.50` ✅ *(já propagado; HTTPS responde 503 aguardando backend no Traefik)*
- `api-crm.phonecenter.tech` → `NÃO VERIFICADO` *(decidir entre subdomínio separado ou gateway único em `crm.phonecenter.tech`)*

## 3. Serviços EvoCRM Deployados
- Nenhum container EvoCRM subido ainda (aguardando SSH + auditoria de RAM/Coolify).

## 4. Bloqueios & Decisões Abertas
1. **[BLOQUEIO IMEDIATO]** Confirmar usuário SSH correto (e senha/chave) da VPS `13.140.36.50:2222`.
2. **[DECISÃO APÓS AUDITORIA]** Escolher perfil **Core Lite** (~2.5–3.5 GB RAM, sem ClickHouse/RabbitMQ/EvoFlow) ou **Full** (8+ GB RAM) conforme memória real da VPS.
3. **[DECISÃO PRODUTO]** Fase 1 começa operando para a loja principal (single-tenant EvoCRM) e na Fase 6 escalamos para multi-loja SaaS (instâncias por loja via Coolify API ou multi-tenant). Confirmar com o usuário.

## 5. Log Compacto de Sessões
- **2026-11-20 (Sessão 1):**
  - Sincronizado repo (`git pull` fast-forward para `0f21dc21`).
  - Mapeadas as 7 prints do CRM Mercado Phone e identidade visual do PhoneCenter (`global.css`, `logocnome.png`, `logosnome.png`).
  - Auditado repositório oficial `evolution-foundation/evo-crm-community` (`v1.0.0-rc2`): confirmada arquitetura de 6 serviços + gateway + licença Apache 2.0 + módulos nativos.
  - Verificado DNS `crm.phonecenter.tech` → `13.140.36.50`.
  - Tentativa de SSH em `13.140.36.50:2222` bloqueada por usuário desconhecido (`root`/`ubuntu`/`messias` recusados).
  - Criada base completa de instruções: `AgentsCRM.md`, `TODOCRM.md`, `docs/crm/{STATE,ARCHITECTURE,VPS-DEPLOY,FEATURES-GAP,BRANDING,INTEGRATIONS}.md`.
