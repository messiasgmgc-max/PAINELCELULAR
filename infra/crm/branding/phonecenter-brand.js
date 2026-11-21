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

  // Modal Launcher PT-BR (Ctrl+K) dentro do crm.phonecenter.tech
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
      '<button id="pc-suite-close" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#cbd5e1;border-radius:8px;padding:4px 9px;font-size:11px;cursor:pointer">ESC</button>' +
      '</div>' +
      '<div class="pc-suite-body" id="pc-suite-grid"></div>' +
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
    search.addEventListener('input', (e) => renderList(e.target.value));
    overlay.querySelector('#pc-suite-close').addEventListener('click', () => {
      overlay.classList.remove('open');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        overlay.classList.toggle('open');
        if (overlay.classList.contains('open')) {
          setTimeout(() => search.focus(), 40);
        }
      } else if (e.key === 'Escape') {
        overlay.classList.remove('open');
      }
    });
  }

  // Dock rápido PhoneCenter Suite + Toggle Tema + ERP + Bio
  function ensureQuickDock() {
    if (window.location.pathname.startsWith('/widget')) return;
    if (document.getElementById('pc-quick-dock')) return;
    if (!document.body) return;

    const status = window.localStorage.getItem(STATUS_KEY) || 'online';
    const dot = status === 'online' ? '🟢' : status === 'busy' ? '🟡' : '⚫';

    const dock = document.createElement('div');
    dock.id = 'pc-quick-dock';
    dock.innerHTML =
      '<button type="button" id="pc-open-suite-btn" title="Abrir Menu PhoneCenter Suite (Ctrl+K)">' +
      '<img src="/phonecenter-logo.png" alt="" style="width:14px;height:14px;border-radius:3px" />' +
      '<span>Suite CRM (Ctrl+K)</span></button>' +
      '<button type="button" id="pc-toggle-theme-btn" class="pc-dock-secondary" title="Alternar Tema Dark / Light Navy">' +
      '<span>Tema</span></button>' +
      '<a href="' +
      ERP_URL +
      '" target="_blank" rel="noopener noreferrer" class="pc-dock-secondary" title="Abrir PhoneCenter ERP">' +
      '<span>' +
      dot +
      ' ERP</span></a>' +
      '<a href="' +
      BIO_URL +
      '" target="_blank" rel="noopener noreferrer" class="pc-dock-secondary" title="Link na Bio / Vitrine">' +
      '<span>Vitrine Bio</span></a>';

    document.body.appendChild(dock);

    dock.querySelector('#pc-open-suite-btn').addEventListener('click', () => {
      const ov = document.getElementById('pc-suite-overlay');
      if (ov) {
        ov.classList.add('open');
        const inp = document.getElementById('pc-suite-search');
        if (inp) setTimeout(() => inp.focus(), 40);
      }
    });

    dock.querySelector('#pc-toggle-theme-btn').addEventListener('click', () => {
      const atual = window.localStorage.getItem(THEME_KEY) || 'dark';
      const proximo = atual === 'dark' ? 'light-navy' : 'dark';
      window.localStorage.setItem(THEME_KEY, proximo);
      applySavedWorkspaceTheme();
    });
  }

  function applyAll() {
    enforceTitle();
    applySavedWorkspaceTheme();
    if (document.body) {
      replaceBrandAssets(document.body);
      enhanceLoginScreen();
      syncAvailabilityAfterLogin();
      applySlaVisualBadges();
      ensureSuiteModal();
      ensureQuickDock();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll);
  } else {
    applyAll();
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      applyAll();
    });
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
