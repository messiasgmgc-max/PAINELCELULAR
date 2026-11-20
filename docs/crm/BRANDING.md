# BRANDING.md — Identidade Visual & White-Label (PhoneCenterCRM)

## 1. Tokens Visuais Oficiais (Extraídos de `src/app/global.css`)

| Token | Valor | Uso no PhoneCenterCRM |
| :--- | :--- | :--- |
| **Brand Primary Blue** | `#0066FF` / `#007BFF` | Botões primários, itens ativos na sidebar, badges principais, foco de inputs |
| **Brand Deep Blue** | `#0044CC` / `#1e3a8a` | Gradiente da marca, hover primário, painel esquerdo do Login |
| **Dark Base (Mesh 1)** | `#090d16` | Fundo da sidebar e tema dark principal |
| **Dark Surface (Mesh 2)** | `#0f172a` | Cards dark, barra superior dark, modais dark |
| **Dark Elevated (Mesh 3)** | `#111827` | Inputs dark, painéis secundários |
| **Indigo Accent (Mesh 4)** | `#1e1b4b` | Gradiente sutil de profundidade (estilo PhoneCenter) |
| **Glass Surface** | `rgba(15, 23, 42, 0.70)` | Painéis translúcidos com `backdrop-filter: blur(12px)` |
| **Glass Border** | `rgba(255, 255, 255, 0.10)` | Bordas sutis no dark mode |
| **Light Workspace BG** | `#F8FAFC` / `#FFFFFF` | Área de leitura de chat no modo claro (alta legibilidade para atendentes o dia todo) |
| **Success / Online** | `#10B981` | Status `Online`, WhatsApp conectado, venda ganha |
| **Warning / Ausente** | `#F59E0B` | Status `Ausente`, banner de notificação, SLA atenção |
| **Danger / SLA Crítico** | `#EF4444` | Conexão desconectada, SLA estourado (`7d`, `8d`), ações destrutivas |

> **Regra de UX:** Suportar **Dark Mode PhoneCenter** (padrão da marca) **E** alternância rápida para **Light Workspace com Sidebar Navy Escura (`#090d16`)** — exatamente como o contraste confortável visto nas prints do Mercado Phone!

---

## 2. Assets Oficiais da Marca (Já presentes no Repo)

- **Logo Completa (Ícone PC + "Phone Center"):** `public/logocnome.png`
- **Ícone Monograma PC (Swoosh Azul):** `public/logosnome.png`
- **Favicons & PWA Icons:** `public/favicon.ico`, `public/favicon-32x32.png`, `public/icon-192.png`, `public/icon-512.png`
- **Naming Oficial:**
  - Título da aba (`<title>`): `PhoneCenterCRM — Central de Atendimento & Vendas`
  - Cabeçalho/Sidebar: `[Ícone PC] PhoneCenterCRM`
  - Rodapé do Login: `Copyright © 2026 — crm.phonecenter.tech · Ecossistema PhoneCenter`

---

## 3. Especificação da Tela de Login (Inspirada no Print 7)

Layout **Split-Screen 50/50** (mobile empilhado):
- **Lado Esquerdo (Gradiente PhoneCenter `#090d16` → `#0f172a` → `#0044CC`):**
  - Topo: Logo `PhoneCenterCRM` (`logosnome.png` + tipografia branca/azul)
  - Headline: **"Todos os seus canais e seu estoque em uma só tela."**
  - Ilustração central animada: Smartphone estilizado com órbita conectando **WhatsApp**, **Instagram**, **Assistente IA** e **PhoneCenter ERP**, com badge flutuante *"Nova mensagem — Cliente iPhone 16 Pro"*.
  - Pills inferiores (glassmorphism): `WhatsApp & Instagram` · `IA com Estoque Vivo` · `Equipe por Setores` · `Integrado ao PhoneCenter`
- **Lado Direito (Card limpo):**
  - Título: **"Entre no PhoneCenterCRM"**
  - Subtítulo: *"Use seu e-mail e senha de acesso da sua loja."*
  - Campos: `E-mail`, `Senha` (com toggle olho), **`Entrar como`** (`🟢 Online` / `🟡 Ausente` / `⚫ Offline` + legenda *"Ausente e Offline não recebem atendimentos do rodízio."*)
  - Botão primário pill azul `#0066FF`: **"Entrar"**
  - Links: `Esqueceu a senha?` · `Termos de Uso` · `Política de Privacidade`

---

## 4. Estrutura da Sidebar (PT-BR — Paridade Total com Prints 3–6)

1. **Busca rápida no menu** (`Ctrl+K` / `Buscar no menu...`)
2. **PRINCIPAL:** Dashboard · Atendimentos · Filtros de atendimentos · Rodízios · Contatos · Agenda & Tarefas · CRM Academy
3. **KANBAN:** Kanban · Kanban Grupos · Kanban Visão Geral · Kanban Setores
4. **CRM:** Cadastros do CRM · Produtos (Estoque) · Oportunidades · Pipeline · Propostas · Relatório de Vendas · Ranking de Vendas · Minha Evolução · Leads de Anúncio
5. **FERRAMENTAS:** Tags · Automações · Respostas Rápidas · Conexões *(com badge vermelho se alguma desconectada!)* · Equipe · Setores de Atendimentos · Chat Interno · Assistente de IA
6. **CAMPANHAS:** Campanhas · Criar Listas · Configurar Campanhas
7. **SISTEMA:** Avaliações · Registros · Financeiro · Configurações · Link na Bio

---

## 5. Conformidade Open-Source (Apache 2.0)

- Ao forkar `evolution-foundation/evo-ai-frontend-community`:
  - **Manter** os arquivos `LICENSE` e `NOTICE` originais intactos no repositório.
  - **Substituir** todas as strings/logos voltadas ao usuário final (`Evo AI`, `EvoCRM`, `evolutionfoundation`) por `PhoneCenterCRM` sem violar marcas registradas de terceiros (`TRADEMARKS.md`).
  - **Build seguro:** Compilar a imagem Docker do frontend via **GitHub Actions → GHCR** (`ghcr.io/messiasgmgc-max/phonecenter-crm-frontend:latest`) para evitar consumo de RAM/CPU de `vite build` dentro da VPS de produção.
