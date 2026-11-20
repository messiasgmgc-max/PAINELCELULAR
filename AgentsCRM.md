# AgentsCRM.md — Manual Operacional dos Agentes (PhoneCenterCRM)

> **Projeto:** PhoneCenterCRM (`crm.phonecenter.tech`)
> **Base Open-Source:** Evo CRM Community (`evolution-foundation/evo-crm-community`, Apache 2.0, tag `v1.0.0-rc2`)
> **Referência Funcional:** CRM Mercado Phone (prints mapeados em `docs/crm/FEATURES-GAP.md`)
> **Identidade Visual:** PhoneCenter (`PAINELCELULAR` — Dark Slate/Navy + Azul Elétrico `#0066FF`)

---

## 1. Protocolo Anti-Desperdício de Tokens (LEIA PRIMEIRO)

Para evitar queimar contexto/tokens relendo todo o projeto a cada sessão, siga estritamente esta ordem:

1. **Início de Sessão (Obrigatório — custo mínimo):**
   - Execute `git pull` (regra global do `AGENTS.md`).
   - Leia **apenas**:
     1. `TODOCRM.md` (topo: seção **"Onde Paramos"** + fase ativa)
     2. `docs/crm/STATE.md` (estado atual da VPS, serviços e bloqueios)
2. **Leitura Sob Demanda (Progressive Disclosure):**
   - Abra **somente** o arquivo em `docs/crm/` correspondente à tarefa atual (ver Índice na Seção 3).
   - **NÃO** leia todos os docs nem faça buscas amplas no repositório se o arquivo de estado já traz o caminho exato.
3. **Fim de Sessão (Obrigatório):**
   - Atualize checkboxes e **"Onde Paramos"** em `TODOCRM.md`.
   - Registre alterações de infra/código e próxima ação em `docs/crm/STATE.md` (mantendo o arquivo enxuto, máx. ~100 linhas).
   - Faça `git commit` descritivo e `git push` (regra do `AGENTS.md`).

---

## 2. Regras Inegociáveis de Segurança da VPS & Repositório

1. **NUNCA quebre a VPS (`13.140.36.50`, SSH porta `2222`):**
   - A VPS roda serviços em produção (**Coolify**, **Traefik**, **Evolution API**, etc.).
   - Antes de subir qualquer container, **SEMPRE** audite `free -h`, `df -h`, `docker ps`, `docker network ls` e portas em uso.
   - **NUNCA** pare, recrie ou modifique containers existentes (Coolify, Traefik, Evolution API, bancos existentes) sem autorização explícita e backup prévio.
   - Use **imagens pré-compiladas** (`evoapicloud/*:1.0.0-rc2`) na VPS; **NUNCA** rode `docker compose build` de Ruby/Go/Python/Vite diretamente na VPS de produção se houver risco de OOM/CPU 100%.
   - Aplique **limites de memória (`mem_limit`)** e escolha o perfil adequado (**Core Lite** vs **Full com EvoFlow/ClickHouse**) conforme a RAM livre real da VPS (ver `docs/crm/VPS-DEPLOY.md`).
2. **NUNCA commite segredos no Git:**
   - Senhas SSH, senhas de banco, `SECRET_KEY_BASE`, `JWT_SECRET_KEY`, `ENCRYPTION_KEY`, tokens da Evolution API e chaves de OAuth ficam **exclusivamente** no `.env` da VPS / Coolify (nunca em `.md`, `.yml` versionado ou código).
3. **Licença Apache 2.0 (EvoCRM Community):**
   - Ao criar fork white-label do frontend/serviços, manter `LICENSE` e `NOTICE` originais no repositório conforme exige a Apache 2.0.

---

## 3. Índice de Documentação Modular (`docs/crm/`)

| Arquivo | Quando ler | Conteúdo resumido |
| :--- | :--- | :--- |
| [TODOCRM.md](TODOCRM.md) | **Sempre no início** | Checklist mestre (Fases 0–6) e ponto exato onde paramos |
| [docs/crm/STATE.md](docs/crm/STATE.md) | **Sempre no início** | Estado vivo da VPS, containers, domínios, bloqueios e log de sessões |
| [docs/crm/ARCHITECTURE.md](docs/crm/ARCHITECTURE.md) | Decisões de arquitetura / rede / multi-loja | Stack EvoCRM, perfis de RAM, Traefik/Coolify, Ponte ERP |
| [docs/crm/VPS-DEPLOY.md](docs/crm/VPS-DEPLOY.md) | Deploy, Docker, Coolify, Traefik, DNS | Runbook seguro passo a passo, variáveis, healthchecks e rollback |
| [docs/crm/FEATURES-GAP.md](docs/crm/FEATURES-GAP.md) | Implementação de features / paridade | Matriz Mercado Phone CRM vs EvoCRM nativo vs Extensões PhoneCenter |
| [docs/crm/BRANDING.md](docs/crm/BRANDING.md) | Customização visual / White-label | Paleta PhoneCenter, logos, tela de login, sidebar PT-BR |
| [docs/crm/INTEGRATIONS.md](docs/crm/INTEGRATIONS.md) | Integrações ERP, IA, Meta, Google, Pix | Specs de Evolution API, Supabase ERP Bridge, MCP IA, CTWA, Calendar |
| [docs/crm/OAUTH-SETUP.md](docs/crm/OAUTH-SETUP.md) | Configurar Coolify, Meta, Google, Pix e Multi-Loja | Passo a passo exato de envs no Coolify, Callback URLs oficiais e template multi-loja |

---

## 4. Decisões Arquiteturais Fixas

- **Nome oficial do produto:** `PhoneCenterCRM`
- **Domínio principal (Frontend):** `https://crm.phonecenter.tech` (DNS já aponta para `13.140.36.50`)
- **Domínio de API/Gateway:** `https://api-crm.phonecenter.tech` (ou roteamento por path no gateway — definir após auditoria do Traefik na VPS)
- **Estratégia de Entrega em Camadas:**
  1. **Camada 1 (Base imediata):** Subir EvoCRM Community via Docker/Coolify conectado à Evolution API existente.
  2. **Camada 2 (White-label):** Fork de `evo-ai-frontend-community` com identidade visual PhoneCenter, tela de login com status inicial (`Online/Ausente/Offline`) e sidebar PT-BR espelhando a ergonomia do Mercado Phone.
  3. **Camada 3 (Extensões PhoneCenter — o que o EvoCRM não oferece):**
     - **PhoneCenter CRM Bridge** (rotas seguras em `PAINELCELULAR` ou microserviço dedicado) integrando Supabase (`clientes`, `aparelhos`, `vendas`, `lojas`, `taxas`) ao CRM.
     - **Dashboard App Embutido** na barra lateral do atendimento (consulta estoque em tempo real, calculadora de troca/upgrade, simulador de maquininha, gerador de proposta PDF, emissão de notinha).
     - **MCP Server / Custom AI Tools** conectando os agentes de IA do EvoCRM ao estoque e preços reais da loja.
     - **Módulos complementares:** Ranking de Vendas & Minha Evolução, Atribuição de Leads de Anúncio (Meta CTWA + ROAS), Rodízio avançado por status/horário, Gestão de Tickets/Conexões (migrar tickets entre chips), Chat Interno, Link na Bio com vitrine dinâmica.

---

## 5. Checklist Rápido Antes de Executar Qualquer Comando na VPS

- [ ] Comando é read-only ou foi validado contra impacto nos serviços existentes?
- [ ] RAM livre + Swap suportam o container novo com margem mínima de 25%?
- [ ] Portas publicadas não conflitam com portas já em uso (`ss -tulpn`)?
- [ ] Container está na rede Docker correta do proxy Traefik/Coolify?
- [ ] Secrets foram gerados com `openssl rand` e não estão expostos em logs/git?
