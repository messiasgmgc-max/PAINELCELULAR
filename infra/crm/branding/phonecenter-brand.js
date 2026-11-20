(function () {
  'use strict';

  const BRAND_NAME = 'PhoneCenterCRM';
  const ERP_URL = 'https://app.phonecenter.tech';
  const BIO_URL = 'https://app.phonecenter.tech/bio';
  const STATUS_KEY = 'pc_crm_login_status';

  function enforceTitle() {
    if (!document.title || /evo\s*(crm|ai)/i.test(document.title)) {
      document.title = BRAND_NAME + ' — Central de Atendimento & Vendas';
    }
  }

  function replaceBrandAssets(root) {
    // 1. Substitui imagens/logos EvoCRM pela logo oficial PhoneCenter
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

    // 2. Substitui nós de texto visíveis contendo "Evo CRM" ou "Evo AI" (sem tocar em inputs/scripts)
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

  // 3. Injeta seletor "Entrar como: Online / Ausente / Offline" na tela de Login (estilo print 7)
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
      });
    }

    submitBtn.parentElement.insertBefore(box, submitBtn);
  }

  // 4. Dock rápido no rodapé direito para alternar entre CRM <-> PhoneCenter ERP / Vitrine Bio
  function ensureQuickDock() {
    if (window.location.pathname.startsWith('/widget')) return;
    if (document.getElementById('pc-quick-dock')) return;
    if (!document.body) return;

    const dock = document.createElement('div');
    dock.id = 'pc-quick-dock';
    dock.innerHTML =
      '<a href="' +
      ERP_URL +
      '" target="_blank" rel="noopener noreferrer" title="Abrir PhoneCenter ERP">' +
      '<img src="/phonecenter-logo.png" alt="" style="width:14px;height:14px;border-radius:3px" />' +
      '<span>PhoneCenter ERP</span></a>' +
      '<a href="' +
      BIO_URL +
      '" target="_blank" rel="noopener noreferrer" title="Link na Bio / Vitrine" style="background:rgba(15,23,42,0.92);border-color:rgba(255,255,255,0.16)">' +
      '<span>Link na Bio</span></a>';
    document.body.appendChild(dock);
  }

  function applyAll() {
    enforceTitle();
    if (document.body) {
      replaceBrandAssets(document.body);
      enhanceLoginScreen();
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
