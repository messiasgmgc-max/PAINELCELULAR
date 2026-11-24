(function () {
  'use strict';

  const BRAND_NAME = 'PhoneCenterCRM';
  const ERP_URL = 'https://app.phonecenter.tech';
  const HUB_URL = ERP_URL + '/crm-hub';
  const BIO_URL = ERP_URL + '/bio';
  const API_BASE = 'https://api-crm.phonecenter.tech';
  const STATUS_KEY = 'pc_crm_login_status';
  const STATUS_PENDING_KEY = 'pc_crm_login_status_pending';
  const THEME_KEY = 'pc_crm_workspace_theme';
  const DOCK_COLLAPSED_KEY = 'pc_crm_dock_collapsed';
  const RATES_KEY = 'pc_crm_installment_rates_v1';
  const STORE_CFG_KEY = 'pc_crm_store_cfg_v1';

  const DEFAULT_RATES = {
    debito: 1.99,
    1: 3.15,
    2: 4.99,
    3: 5.99,
    4: 6.99,
    5: 7.99,
    6: 8.99,
    7: 9.99,
    8: 10.99,
    9: 11.99,
    10: 12.99,
    11: 13.99,
    12: 14.99,
    15: 17.99,
    18: 20.99,
  };

  function showToast(msg) {
    const old = document.querySelector('.pc-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'pc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  function formatBRL(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function loadRates() {
    try {
      const raw = window.localStorage.getItem(RATES_KEY);
      if (!raw) return Object.assign({}, DEFAULT_RATES);
      return Object.assign({}, DEFAULT_RATES, JSON.parse(raw));
    } catch {
      return Object.assign({}, DEFAULT_RATES);
    }
  }

  function saveRates(rates) {
    try {
      window.localStorage.setItem(RATES_KEY, JSON.stringify(rates));
    } catch {
      // ignora
    }
  }

  function loadStoreCfg() {
    try {
      const raw = window.localStorage.getItem(STORE_CFG_KEY);
      if (!raw) return { lojaId: '', token: '', lojas: [] };
      const parsed = JSON.parse(raw);
      return {
        lojaId: parsed.lojaId || '',
        token: parsed.token || '',
        lojas: Array.isArray(parsed.lojas) ? parsed.lojas : [],
      };
    } catch {
      return { lojaId: '', token: '', lojas: [] };
    }
  }

  function saveStoreCfg(cfg) {
    try {
      window.localStorage.setItem(STORE_CFG_KEY, JSON.stringify(cfg));
    } catch {
      // ignora
    }
  }

  function insertTextIntoChat(text) {
    const editable =
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('.ProseMirror[contenteditable="true"]') ||
      document.querySelector('textarea[placeholder*="mensagem" i], textarea[placeholder*="message" i], textarea');

    if (editable) {
      editable.focus();
      if (editable.tagName === 'TEXTAREA' || editable.tagName === 'INPUT') {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(editable, text);
        } else {
          editable.value = text;
        }
        editable.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.execCommand('insertText', false, text);
        editable.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const ov = document.getElementById('pc-suite-overlay');
      if (ov) ov.classList.remove('open');
      showToast('Texto inserido na caixa de mensagem!');
      return true;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    showToast('Copiado! Abra uma conversa e pressione Ctrl+V.');
    return false;
  }

  const SUITE_ITEMS = [
    { sec: 'PRINCIPAL', title: 'Central CRM Suite', desc: 'Visão geral e KPIs reais', url: HUB_URL + '?tab=visao-geral' },
    { sec: 'AUTOMAÇÃO IA', title: 'Pós-Venda Turbo IA', desc: 'D+7 Google, Upgrade D+90/180/300', url: HUB_URL + '?tab=pos-venda' },
    { sec: 'ATENDIMENTO', title: 'Rodízio Inteligente', desc: 'Setores, horário e limite', url: HUB_URL + '?tab=rodizio' },
    { sec: 'TELEFONIA', title: 'CRM Phone (VoIP)', desc: 'Discador e popup Cliente 360º', url: HUB_URL + '?tab=telefonia' },
    { sec: 'CAMPANHAS', title: 'Campanhas Anti-Ban', desc: 'Segmentos ERP + delay seguro', url: HUB_URL + '?tab=campanhas' },
    { sec: 'KANBAN', title: 'Kanban Grupos WhatsApp', desc: 'Fornecedores & Atacado VIP', url: HUB_URL + '?tab=kanban-grupos' },
    { sec: 'CRM & METAS', title: 'Ranking & Minha Evolução', desc: 'Metas, ticket médio e comissão', url: HUB_URL + '?tab=metas' },
    { sec: 'TREINAMENTO', title: 'CRM Academy', desc: 'Playbooks e scripts de iPhone', url: HUB_URL + '?tab=academy' },
    { sec: 'SISTEMA', title: 'Configurações & Tokens', desc: 'Instância, Pix, Meta CAPI, SLA', url: ERP_URL + '/crm-config' },
    { sec: 'SISTEMA', title: 'PhoneCenter ERP', desc: 'Estoque, PDV, OS e Garantias', url: ERP_URL },
    { sec: 'VITRINE', title: 'Link na Bio Dinâmico', desc: 'Catálogo ao vivo da loja', url: BIO_URL },
  ];

  function enforceTitle() {
    if (!document.title || /evo\s*(crm|ai)/i.test(document.title)) {
      document.title = BRAND_NAME + ' — Central de Atendimento & Vendas';
    }
  }

  function applySavedWorkspaceTheme() {
    const saved = window.localStorage.getItem(THEME_KEY) || 'dark';
    if (saved === 'light-navy') {
      document.documentElement.classList.add('pc-light-workspace');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.remove('pc-light-workspace');
    }
  }

  function replaceBrandAssets(root) {
    const imgs = (root || document).querySelectorAll('img');
    imgs.forEach((img) => {
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';
      if (
        src.includes('logo.svg') ||
        src.includes('hover-evolution') ||
        /evo\s*(crm|ai|foundation)/i.test(alt)
      ) {
        if (img.dataset.pcBranded) return;
        img.dataset.pcBranded = '1';
        img.setAttribute('src', '/phonecenter-logo.png');
        img.setAttribute('alt', BRAND_NAME);
        img.style.objectFit = 'contain';
        img.style.borderRadius = '8px';
      }
    });

    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement) return NodeFilter.FILTER_REJECT;
        const tag = node.parentElement.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT') {
          return NodeFilter.FILTER_REJECT;
        }
        return /evo\s*(crm|ai)/i.test(node.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
    const toUpdate = [];
    let current;
    while ((current = walker.nextNode())) toUpdate.push(current);
    toUpdate.forEach((node) => {
      node.nodeValue = (node.nodeValue || '')
        .replace(/Evo\s*CRM\s*Community/gi, BRAND_NAME)
        .replace(/Evo\s*CRM/gi, BRAND_NAME)
        .replace(/Evo\s*AI/gi, BRAND_NAME);
    });
  }

  // Descobre Bearer token da sessão do EvoCRM no localStorage/cookies para aplicar status real
  function extractCrmAuthToken() {
    const directKeys = ['token', 'access_token', 'auth_token', 'jwt', 'cw_auth_token', 'evo_token'];
    for (let i = 0; i < directKeys.length; i++) {
      const v = window.localStorage.getItem(directKeys[i]);
      if (v && v.length > 16) return v.replace(/^"|"$/g, '');
    }
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k || k.startsWith('pc_')) continue;
        const raw = window.localStorage.getItem(k) || '';
        if (raw.startsWith('{')) {
          const obj = JSON.parse(raw);
          const candidate = obj?.access_token || obj?.token || obj?.jwt || obj?.accessToken;
          if (typeof candidate === 'string' && candidate.length > 16) return candidate;
        }
      }
    } catch {
      // ignora
    }
    return '';
  }

  let applyingStatus = false;
  async function syncAvailabilityAfterLogin() {
    const isLogin = /\/(login|auth|sign[-_]?in)/i.test(window.location.pathname);
    if (isLogin) return;
    if (window.localStorage.getItem(STATUS_PENDING_KEY) !== '1') return;
    if (applyingStatus) return;

    const status = window.localStorage.getItem(STATUS_KEY) || 'online';
    applyingStatus = true;

    const headers = { 'Content-Type': 'application/json' };
    const authToken = extractCrmAuthToken();
    if (authToken) headers.Authorization = 'Bearer ' + authToken;

    try {
      let ok = false;
      const res1 = await fetch(API_BASE + '/api/v1/profile/availability', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ availability: status }),
      }).catch(() => null);
      if (res1 && res1.ok) ok = true;

      if (!ok) {
        const res2 = await fetch(API_BASE + '/api/v1/profile', {
          method: 'PATCH',
          headers,
          credentials: 'include',
          body: JSON.stringify({ availability: status, availability_status: status }),
        }).catch(() => null);
        if (res2 && res2.ok) ok = true;
      }

      if (ok) {
        window.localStorage.removeItem(STATUS_PENDING_KEY);
      }
    } finally {
      applyingStatus = false;
    }
  }

  // Seletor "Entrar como: Online / Ausente / Offline" na tela de Login
  function enhanceLoginScreen() {
    const isLogin = /\/(login|auth|sign[-_]?in)/i.test(window.location.pathname);
    if (!isLogin) return;
    if (document.getElementById('pc-login-status-box')) return;

    const form = document.querySelector('form');
    const submitBtn = form && form.querySelector('button[type="submit"]');
    if (!form || !submitBtn) return;

    const saved = window.localStorage.getItem(STATUS_KEY) || 'online';
    const box = document.createElement('div');
    box.id = 'pc-login-status-box';
    box.innerHTML =
      '<label for="pc-login-status-select">Entrar como</label>' +
      '<select id="pc-login-status-select">' +
      '<option value="online">🟢 Online (recebe atendimentos do rodízio)</option>' +
      '<option value="busy">🟡 Ausente / Ocupado</option>' +
      '<option value="offline">⚫ Offline</option>' +
      '</select>' +
      '<div class="pc-hint">Ausente e Offline não recebem novos atendimentos automáticos do rodízio.</div>';

    const select = box.querySelector('#pc-login-status-select');
    if (select) {
      select.value = saved;
      select.addEventListener('change', (e) => {
        window.localStorage.setItem(STATUS_KEY, e.target.value);
        window.localStorage.setItem(STATUS_PENDING_KEY, '1');
      });
    }

    form.addEventListener('submit', () => {
      window.localStorage.setItem(STATUS_PENDING_KEY, '1');
    });

    submitBtn.parentElement.insertBefore(box, submitBtn);
  }

  // Converte tempos relativos em badges visuais de SLA (amarelo >= 15m, vermelho >= 2h / 1d+)
  function parseRelativeMinutes(txt) {
    const s = (txt || '').trim().toLowerCase();
    let m = s.match(/^(?:há\s*)?(\d+)\s*(?:d|dia|dias)$/i);
    if (m) return Number(m[1]) * 1440;
    m = s.match(/^(?:há\s*)?(\d+)\s*(?:h|hr|hora|horas)$/i);
    if (m) return Number(m[1]) * 60;
    m = s.match(/^(?:há\s*)?(\d+)\s*(?:m|min|minuto|minutos)$/i);
    if (m) return Number(m[1]);
    return null;
  }

  function applySlaVisualBadges() {
    if (/\/(login|auth|widget)/i.test(window.location.pathname)) return;
    const candidates = document.querySelectorAll('time, span, small');
    for (let i = 0; i < candidates.length && i < 600; i++) {
      const el = candidates[i];
      if (el.dataset.pcSla || el.children.length > 0) continue;
      const txt = (el.textContent || '').trim();
      if (!txt || txt.length > 16) continue;
      const mins = parseRelativeMinutes(txt);
      if (mins == null) continue;
      el.dataset.pcSla = '1';
      if (mins >= 120) {
        el.classList.add('pc-sla-crit');
        el.title = 'SLA Crítico: conversa aguardando há ' + txt;
      } else if (mins >= 15) {
        el.classList.add('pc-sla-warn');
        el.title = 'SLA Atenção: conversa aguardando há ' + txt;
      }
    }
  }

  function openSuiteTab(tabName) {
    const ov = document.getElementById('pc-suite-overlay');
    if (!ov) return;
    ov.classList.add('open');
    ov.querySelectorAll('.pc-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    ov.querySelectorAll('.pc-suite-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.pane === tabName);
    });
    if (tabName === 'atalhos') {
      const inp = ov.querySelector('#pc-suite-search');
      if (inp) setTimeout(() => inp.focus(), 40);
    } else if (tabName === 'taxas') {
      const val = ov.querySelector('#pc-calc-valor');
      if (val) setTimeout(() => val.focus(), 40);
    } else if (tabName === 'lojas') {
      const q = ov.querySelector('#pc-store-search');
      if (q) setTimeout(() => q.focus(), 40);
    }
  }

  // Modal Launcher PT-BR (Ctrl+K) com Abas: Atalhos, Taxas de Parcelamento e Lojas PhoneCenter
  function ensureSuiteModal() {
    if (document.getElementById('pc-suite-overlay')) return;
    if (!document.body) return;

    const overlay = document.createElement('div');
    overlay.id = 'pc-suite-overlay';
    overlay.innerHTML =
      '<div id="pc-suite-modal">' +
      '<div class="pc-suite-head">' +
      '<img src="/phonecenter-logo.png" alt="" style="width:24px;height:24px;border-radius:6px" />' +
      '<input id="pc-suite-search" placeholder="Buscar função do PhoneCenterCRM (Pós-Venda, Rodízio, Telefonia, Campanhas...)" />' +
      '<button id="pc-suite-theme-btn" type="button" title="Alternar Tema Dark / Light Navy" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#cbd5e1;border-radius:8px;padding:4px 9px;font-size:11px;cursor:pointer">Tema</button>' +
      '<button id="pc-suite-close" type="button" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#cbd5e1;border-radius:8px;padding:4px 9px;font-size:11px;cursor:pointer">ESC</button>' +
      '</div>' +
      '<div class="pc-suite-tabs">' +
      '<button type="button" class="pc-tab-btn active" data-tab="atalhos">⚡ Atalhos Suite</button>' +
      '<button type="button" class="pc-tab-btn" data-tab="taxas">💳 Taxas & Parcelamento</button>' +
      '<button type="button" class="pc-tab-btn" data-tab="lojas">🏪 Lojas & Estoque</button>' +
      '</div>' +
      '<div class="pc-suite-pane active" data-pane="atalhos">' +
      '<div class="pc-suite-grid" id="pc-suite-grid"></div>' +
      '</div>' +
      '<div class="pc-suite-pane" data-pane="taxas">' +
      '<div class="pc-form-row">' +
      '<div class="pc-field"><label>Aparelho / Produto (opcional)</label><input id="pc-calc-produto" placeholder="Ex: iPhone 15 Pro 256GB" /></div>' +
      '<div class="pc-field"><label>Valor à Vista (R$)</label><input id="pc-calc-valor" type="number" step="0.01" min="0" value="3500" /></div>' +
      '<div class="pc-field"><label>Entrada / Troca (R$)</label><input id="pc-calc-entrada" type="number" step="0.01" min="0" value="0" /></div>' +
      '<div class="pc-field"><label>Modo da Taxa</label><select id="pc-calc-modo"><option value="repassar">Repassar ao cliente (loja recebe 100%)</option><option value="absorver">Absorver taxa (desconta do lojista)</option></select></div>' +
      '</div>' +
      '<div class="pc-actions-row">' +
      '<button type="button" class="pc-btn pc-btn-primary" id="pc-calc-insert">💬 Colar Simulação no Chat</button>' +
      '<button type="button" class="pc-btn" id="pc-calc-copy">📋 Copiar Texto</button>' +
      '<button type="button" class="pc-btn" id="pc-calc-reset">↺ Restaurar Taxas Padrão</button>' +
      '</div>' +
      '<table class="pc-calc-table"><thead><tr><th>Forma</th><th>Taxa (%)</th><th>Parcela</th><th>Total Cliente</th><th>Líquido Loja</th></tr></thead><tbody id="pc-calc-tbody"></tbody></table>' +
      '</div>' +
      '<div class="pc-suite-pane" data-pane="lojas">' +
      '<div class="pc-form-row">' +
      '<div class="pc-field"><label>Loja / ID (opcional — vazio usa padrão)</label><input id="pc-store-id" placeholder="ID ou slug da loja no PhoneCenter" /></div>' +
      '<div class="pc-field"><label>Token Bridge (opcional para estoque privado)</label><input id="pc-store-token" type="password" placeholder="x-crm-bridge-token" /></div>' +
      '</div>' +
      '<div class="pc-actions-row">' +
      '<input id="pc-store-search" placeholder="Buscar aparelho no estoque (ex: iPhone 14, 128GB, Pro Max)..." style="flex:1;min-width:180px;padding:7px 10px;border-radius:9px;border:1px solid rgba(255,255,255,0.14);background:#090d16;color:#fff;font-size:12px" />' +
      '<button type="button" class="pc-btn pc-btn-primary" id="pc-store-load">🔄 Buscar Estoque</button>' +
      '<button type="button" class="pc-btn pc-btn-green" id="pc-store-send-bio">🔗 Colar Vitrine no Chat</button>' +
      '</div>' +
      '<div id="pc-store-status" style="font-size:11px;color:#94a3b8;margin-bottom:8px">Clique em "Buscar Estoque" para carregar aparelhos ao vivo do PhoneCenter ERP.</div>' +
      '<div class="pc-stock-list" id="pc-stock-list"></div>' +
      '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    const grid = overlay.querySelector('#pc-suite-grid');
    const search = overlay.querySelector('#pc-suite-search');
    const renderList = (filtro) => {
      const q = (filtro || '').trim().toLowerCase();
      const itens = SUITE_ITEMS.filter(
        (it) =>
          !q ||
          it.title.toLowerCase().includes(q) ||
          it.sec.toLowerCase().includes(q) ||
          it.desc.toLowerCase().includes(q)
      );
      grid.innerHTML = itens
        .map(
          (it) =>
            '<a class="pc-suite-item" href="' +
            it.url +
            '" target="_blank" rel="noopener noreferrer">' +
            '<span class="pc-suite-sec">' +
            it.sec +
            '</span>' +
            '<span class="pc-suite-title">' +
            it.title +
            '</span>' +
            '<span class="pc-suite-desc">' +
            it.desc +
            '</span></a>'
        )
        .join('');
    };

    renderList('');
    search.addEventListener('input', (e) => {
      openSuiteTab('atalhos');
      renderList(e.target.value);
    });

    overlay.querySelectorAll('.pc-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => openSuiteTab(btn.dataset.tab));
    });

    // --- Calculadora de Taxas & Parcelamento ---
    const calcProduto = overlay.querySelector('#pc-calc-produto');
    const calcValor = overlay.querySelector('#pc-calc-valor');
    const calcEntrada = overlay.querySelector('#pc-calc-entrada');
    const calcModo = overlay.querySelector('#pc-calc-modo');
    const calcTbody = overlay.querySelector('#pc-calc-tbody');
    let rates = loadRates();

    function computeRow(base, ratePct, parcelas, modo) {
      const taxa = Math.max(0, Number(ratePct) || 0) / 100;
      let totalCliente = base;
      let liquido = base;
      if (modo === 'repassar') {
        totalCliente = taxa < 0.99 ? base / (1 - taxa) : base;
        liquido = base;
      } else {
        totalCliente = base;
        liquido = base * (1 - taxa);
      }
      return {
        parcela: totalCliente / parcelas,
        totalCliente,
        liquido,
      };
    }

    function renderCalc() {
      const valor = Math.max(0, Number(calcValor.value) || 0);
      const entrada = Math.max(0, Math.min(valor, Number(calcEntrada.value) || 0));
      const financiar = Math.max(0, valor - entrada);
      const modo = calcModo.value;
      const rows = [
        { key: 'pix', label: 'Pix / Dinheiro', parcelas: 1, editable: false, rate: 0 },
        { key: 'debito', label: 'Débito', parcelas: 1, editable: true, rate: rates.debito },
      ];
      [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18].forEach((n) => {
        rows.push({ key: String(n), label: n + 'x Crédito', parcelas: n, editable: true, rate: rates[n] });
      });

      calcTbody.innerHTML = rows
        .map((r) => {
          const res = computeRow(financiar, r.rate, r.parcelas, modo);
          const rateCell = r.editable
            ? '<input class="pc-rate-inp" data-rate-key="' + r.key + '" type="number" step="0.01" min="0" max="60" value="' + Number(r.rate || 0).toFixed(2) + '" />'
            : '0.00%';
          return (
            '<tr>' +
            '<td><strong>' + r.label + '</strong></td>' +
            '<td>' + rateCell + '</td>' +
            '<td>' + (r.parcelas > 1 ? r.parcelas + 'x de ' + formatBRL(res.parcela) : formatBRL(res.totalCliente)) + '</td>' +
            '<td>' + formatBRL(res.totalCliente) + '</td>' +
            '<td style="color:#34d399">' + formatBRL(res.liquido) + '</td>' +
            '</tr>'
          );
        })
        .join('');

      calcTbody.querySelectorAll('input.pc-rate-inp').forEach((inp) => {
        inp.addEventListener('change', (e) => {
          const k = e.target.dataset.rateKey;
          rates[k] = Math.max(0, Number(e.target.value) || 0);
          saveRates(rates);
          renderCalc();
        });
      });
    }

    function buildCalcMessage() {
      const prod = (calcProduto.value || '').trim();
      const valor = Math.max(0, Number(calcValor.value) || 0);
      const entrada = Math.max(0, Math.min(valor, Number(calcEntrada.value) || 0));
      const financiar = Math.max(0, valor - entrada);
      const modo = calcModo.value;
      const lines = [];
      lines.push(prod ? '📱 *' + prod + '*' : '💳 *Simulação de Pagamento — PhoneCenter*');
      if (entrada > 0) {
        lines.push('💰 Valor total: ' + formatBRL(valor));
        lines.push('🔄 Entrada / Troca: ' + formatBRL(entrada));
        lines.push('📌 Restante a pagar: *' + formatBRL(financiar) + '*');
      } else {
        lines.push('⚡ *No Pix / À vista:* ' + formatBRL(financiar));
      }
      lines.push('');
      lines.push('💳 *Opções no Cartão:*');
      [1, 3, 6, 10, 12, 18].forEach((n) => {
        const res = computeRow(financiar, rates[n], n, modo);
        lines.push('• ' + n + 'x de ' + formatBRL(res.parcela) + ' (total ' + formatBRL(res.totalCliente) + ')');
      });
      lines.push('');
      lines.push('Qual opção fica melhor para você? 🚀');
      return lines.join('\n');
    }

    [calcValor, calcEntrada, calcModo].forEach((el) => el.addEventListener('input', renderCalc));
    overlay.querySelector('#pc-calc-insert').addEventListener('click', () => {
      insertTextIntoChat(buildCalcMessage());
    });
    overlay.querySelector('#pc-calc-copy').addEventListener('click', () => {
      const txt = buildCalcMessage();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => showToast('Simulação copiada!'));
      }
    });
    overlay.querySelector('#pc-calc-reset').addEventListener('click', () => {
      rates = Object.assign({}, DEFAULT_RATES);
      saveRates(rates);
      renderCalc();
      showToast('Taxas padrão restauradas!');
    });
    renderCalc();

    // --- Integração Direta com Lojas & Estoque PhoneCenter ---
    const storeIdInp = overlay.querySelector('#pc-store-id');
    const storeTokenInp = overlay.querySelector('#pc-store-token');
    const storeSearchInp = overlay.querySelector('#pc-store-search');
    const storeStatus = overlay.querySelector('#pc-store-status');
    const stockList = overlay.querySelector('#pc-stock-list');

    const savedStore = loadStoreCfg();
    storeIdInp.value = savedStore.lojaId;
    storeTokenInp.value = savedStore.token;

    function persistStoreInputs() {
      const cfg = loadStoreCfg();
      cfg.lojaId = storeIdInp.value.trim();
      cfg.token = storeTokenInp.value.trim();
      saveStoreCfg(cfg);
    }

    storeIdInp.addEventListener('change', persistStoreInputs);
    storeTokenInp.addEventListener('change', persistStoreInputs);

    async function fetchStoreStock() {
      persistStoreInputs();
      const lojaId = storeIdInp.value.trim();
      const token = storeTokenInp.value.trim();
      const q = storeSearchInp.value.trim();
      storeStatus.textContent = 'Buscando estoque ao vivo no PhoneCenter ERP...';
      stockList.innerHTML = '';

      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (lojaId) params.set('loja_id', lojaId);
        const url = token
          ? ERP_URL + '/api/crm-bridge/estoque?' + params.toString()
          : ERP_URL + '/api/publico/vitrine?' + params.toString();
        const headers = { Accept: 'application/json' };
        if (token) headers['x-crm-bridge-token'] = token;

        const resp = await fetch(url, { headers });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          storeStatus.textContent = 'Erro ao consultar loja: ' + (data.error || resp.status);
          return;
        }

        const lojaNome = (data.loja && data.loja.nome) || 'PhoneCenter';
        const itens = Array.isArray(data.itens) ? data.itens : [];
        storeStatus.textContent = '🏪 ' + lojaNome + ' — ' + itens.length + ' aparelho(s) disponível(is)';

        if (!itens.length) {
          stockList.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:10px">Nenhum aparelho encontrado para essa busca.</div>';
          return;
        }

        stockList.innerHTML = itens
          .slice(0, 25)
          .map((item, idx) => {
            const titulo = [item.marca, item.modelo, item.capacidade, item.cor].filter(Boolean).join(' ');
            const detalhes = [
              item.condicao,
              item.saudeBateria ? 'Bateria ' + item.saudeBateria + '%' : '',
            ]
              .filter(Boolean)
              .join(' • ');
            return (
              '<div class="pc-stock-card">' +
              '<div class="pc-stock-meta">' +
              '<strong style="font-size:13px;color:#fff">' + titulo + '</strong>' +
              '<span style="font-size:11px;color:#94a3b8">' + (detalhes || 'Pronta entrega') + '</span>' +
              '<span class="pc-stock-price">' + formatBRL(item.preco) + '</span>' +
              '</div>' +
              '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
              '<button type="button" class="pc-btn" data-sim-idx="' + idx + '">💳 Simular</button>' +
              '<button type="button" class="pc-btn pc-btn-primary" data-send-idx="' + idx + '">💬 Enviar no Chat</button>' +
              '</div></div>'
            );
          })
          .join('');

        stockList.querySelectorAll('[data-sim-idx]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const item = itens[Number(btn.dataset.simIdx)];
            if (!item) return;
            calcProduto.value = [item.marca, item.modelo, item.capacidade, item.cor].filter(Boolean).join(' ');
            calcValor.value = Number(item.preco || 0);
            calcEntrada.value = 0;
            renderCalc();
            openSuiteTab('taxas');
          });
        });

        stockList.querySelectorAll('[data-send-idx]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const item = itens[Number(btn.dataset.sendIdx)];
            if (!item) return;
            const titulo = [item.marca, item.modelo, item.capacidade, item.cor].filter(Boolean).join(' ');
            const msg =
              item.textoWhatsapp ||
              '📱 *' +
                titulo +
                '*\n' +
                (item.condicao ? '✨ Condição: ' + item.condicao + '\n' : '') +
                (item.saudeBateria ? '🔋 Saúde da bateria: ' + item.saudeBateria + '%\n' : '') +
                '⚡ *Valor no Pix:* ' +
                formatBRL(item.preco) +
                '\n🏪 Loja: ' +
                lojaNome +
                '\n\nQuer que eu faça a simulação parcelada no cartão?';
            insertTextIntoChat(msg);
          });
        });
      } catch (err) {
        storeStatus.textContent = 'Não foi possível conectar ao ERP (' + (err && err.message ? err.message : 'rede') + ').';
      }
    }

    overlay.querySelector('#pc-store-load').addEventListener('click', fetchStoreStock);
    storeSearchInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        fetchStoreStock();
      }
    });
    overlay.querySelector('#pc-store-send-bio').addEventListener('click', () => {
      const lojaId = storeIdInp.value.trim();
      const link = lojaId ? BIO_URL + '?loja_id=' + encodeURIComponent(lojaId) : BIO_URL;
      insertTextIntoChat('Confira nosso catálogo atualizado em tempo real aqui: ' + link);
    });

    const themeBtn = overlay.querySelector('#pc-suite-theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const atual = window.localStorage.getItem(THEME_KEY) || 'dark';
        const proximo = atual === 'dark' ? 'light-navy' : 'dark';
        window.localStorage.setItem(THEME_KEY, proximo);
        applySavedWorkspaceTheme();
      });
    }

    overlay.querySelector('#pc-suite-close').addEventListener('click', () => {
      overlay.classList.remove('open');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlay.classList.contains('open')) {
          overlay.classList.remove('open');
        } else {
          openSuiteTab('atalhos');
        }
      } else if (e.key === 'Escape') {
        overlay.classList.remove('open');
      }
    });
  }

  // Integração nativa no Header e na Sidebar do CRM (sem dock flutuante sobre o chat)
  function ensureNativeSuiteEntry() {
    const oldDock = document.getElementById('pc-quick-dock');
    if (oldDock) oldDock.remove();
    if (window.location.pathname.startsWith('/widget')) return;
    if (/\/(login|auth|sign[-_]?in)/i.test(window.location.pathname)) return;
    if (!document.body) return;

    // 1. Botão compacto nativo no cabeçalho superior (ao lado de notificações/perfil)
    if (!document.getElementById('pc-header-suite-btn')) {
      const header = document.querySelector('header');
      if (header) {
        const rightGroup =
          header.querySelector('div:last-child') || header;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'pc-header-suite-btn';
        btn.title = 'PhoneCenter Suite: Taxas, Estoque e Atalhos (Ctrl+K)';
        btn.innerHTML =
          '<img src="/phonecenter-logo.png" alt="" style="width:15px;height:15px;border-radius:3px" />' +
          '<span class="pc-hdr-label">Suite</span>';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openSuiteTab('atalhos');
        });
        if (rightGroup.firstChild) {
          rightGroup.insertBefore(btn, rightGroup.firstChild);
        } else {
          rightGroup.appendChild(btn);
        }
      }
    }

    // 2. Seção nativa dentro da Sidebar (desktop e menu lateral mobile)
    const sidebar =
      document.querySelector('[data-sidebar="content"]') ||
      document.querySelector('aside nav') ||
      document.querySelector('aside');
    if (sidebar && !sidebar.querySelector('#pc-sidebar-section')) {
      const sec = document.createElement('div');
      sec.id = 'pc-sidebar-section';
      sec.innerHTML =
        '<div class="pc-sb-title">PhoneCenter</div>' +
        '<button type="button" data-pc-sb-tab="taxas"><span>💳</span><span>Taxas & Parcelamento</span></button>' +
        '<button type="button" data-pc-sb-tab="lojas"><span>🏪</span><span>Lojas & Estoque</span></button>' +
        '<button type="button" data-pc-sb-tab="atalhos"><span>⚡</span><span>Suite CRM</span></button>' +
        '<a href="' + ERP_URL + '" target="_blank" rel="noopener noreferrer"><span>🌐</span><span>PhoneCenter ERP</span></a>';

      sec.querySelectorAll('[data-pc-sb-tab]').forEach((b) => {
        b.addEventListener('click', () => openSuiteTab(b.dataset.pcSbTab));
      });
      sidebar.appendChild(sec);
    }
  }

  let lastHeavyScan = 0;
  function applyAll(forceHeavy) {
    enforceTitle();
    if (!document.body) return;
    ensureSuiteModal();
    ensureNativeSuiteEntry();
    enhanceLoginScreen();
    syncAvailabilityAfterLogin();

    const now = Date.now();
    if (forceHeavy || now - lastHeavyScan >= 1200) {
      lastHeavyScan = now;
      replaceBrandAssets(document.body);
      applySlaVisualBadges();
    }
  }

  function initBrand() {
    applySavedWorkspaceTheme();
    applyAll(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrand);
  } else {
    initBrand();
  }

  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) return;
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      applyAll(false);
    }, 400);
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
