'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Sparkles,
  Users,
  Megaphone,
  Layers,
  Phone,
  Trophy,
  BookOpen,
  Server,
  Search,
  ExternalLink,
  Settings2,
} from 'lucide-react';
import {
  CampanhasSection,
  PosVendaSection,
  RodizioSection,
  VisaoGeralSection,
} from '@/components/crm/hub/HubOperacaoSections';
import {
  AcademySection,
  KanbanGruposSection,
  MetasSection,
  TelefoniaSection,
} from '@/components/crm/hub/HubCanaisEquipeSections';
import { MultiLojaSection } from '@/components/crm/hub/HubMultiLojaSection';
import { supabase } from '@/lib/supabaseClient';

type HubTab =
  | 'visao-geral'
  | 'pos-venda'
  | 'rodizio'
  | 'campanhas'
  | 'kanban-grupos'
  | 'telefonia'
  | 'metas'
  | 'academy'
  | 'multi-loja';

const NAV_ITEMS: Array<{ id: HubTab; label: string; sec: string; icon: typeof LayoutDashboard }> = [
  { id: 'visao-geral', label: 'Visão Geral & Financeiro', sec: 'PRINCIPAL', icon: LayoutDashboard },
  { id: 'pos-venda', label: 'Pós-Venda Turbo IA', sec: 'AUTOMAÇÃO', icon: Sparkles },
  { id: 'rodizio', label: 'Rodízio Inteligente', sec: 'ATENDIMENTO', icon: Users },
  { id: 'campanhas', label: 'Campanhas Anti-Ban', sec: 'MARKETING', icon: Megaphone },
  { id: 'kanban-grupos', label: 'Kanban Grupos WhatsApp', sec: 'KANBAN', icon: Layers },
  { id: 'telefonia', label: 'Telefonia (CRM Phone)', sec: 'CANAIS', icon: Phone },
  { id: 'metas', label: 'Ranking & Minha Evolução', sec: 'CRM', icon: Trophy },
  { id: 'academy', label: 'CRM Academy', sec: 'TREINAMENTO', icon: BookOpen },
  { id: 'multi-loja', label: 'Multi-Loja SaaS', sec: 'ADMIN', icon: Server },
];

export default function CrmHubPage() {
  const [tab, setTab] = useState<HubTab>('visao-geral');
  const [buscaMenu, setBuscaMenu] = useState('');
  const [token, setToken] = useState('');
  const [lojaNome, setLojaNome] = useState('PhoneCenter');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get('tab') as HubTab | null;
    if (t && NAV_ITEMS.some((i) => i.id === t)) {
      setTab(t);
    }
    const tok = sp.get('token') || window.localStorage.getItem('pc_crm_bridge_token') || '';
    if (tok) setToken(tok);
  }, []);

  const buildHeaders = useCallback(async () => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-PhoneCenter-CRM-Key'] = token;
    if (!token) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
      } catch {
        // segue via cookie
      }
    }
    return h;
  }, [token]);

  useEffect(() => {
    (async () => {
      const h = await buildHeaders();
      const res = await fetch('/api/crm-bridge/minha-loja', {
        headers: h,
        credentials: 'include',
      });
      const d = await res.json().catch(() => ({}));
      if (d?.ok) {
        setIsSuperAdmin(Boolean(d.isSuperAdmin));
      }
      const hRes = await fetch('/api/crm-bridge/health', { headers: h, credentials: 'include' });
      const hData = await hRes.json().catch(() => ({}));
      if (hData?.loja?.nome) setLojaNome(hData.loja.nome);
    })();
  }, [buildHeaders]);

  const itensVisiveis = useMemo(() => {
    const q = buscaMenu.trim().toLowerCase();
    return NAV_ITEMS.filter((item) => {
      if (item.id === 'multi-loja' && !isSuperAdmin && !token) return false;
      if (!q) return true;
      return item.label.toLowerCase().includes(q) || item.sec.toLowerCase().includes(q);
    });
  }, [buscaMenu, isSuperAdmin, token]);

  const selecionarTab = (next: HubTab) => {
    setTab(next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url.toString());
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar PT-BR estilo PhoneCenterCRM */}
      <aside className="w-full md:w-64 bg-[#090d16] border-b md:border-b-0 md:border-r border-white/10 p-4 flex flex-col gap-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <img
            src="/logosnome.png"
            alt="PhoneCenterCRM"
            className="w-9 h-9 rounded-xl bg-[#0f172a] p-1 border border-[#0066FF]/50"
          />
          <div className="min-w-0">
            <div className="font-bold text-sm text-white truncate">
              PhoneCenter<span className="text-[#007BFF]">CRM</span>
            </div>
            <div className="text-[11px] text-slate-400 truncate">Suite • {lojaNome}</div>
          </div>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            ref={searchInputRef}
            value={buscaMenu}
            onChange={(e) => setBuscaMenu(e.target.value)}
            placeholder="Buscar módulo (Ctrl+K)..."
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#0f172a] border border-white/10 text-xs text-white placeholder:text-slate-500 outline-none focus:border-[#0066FF]"
          />
        </div>

        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1">
          {itensVisiveis.map((item) => {
            const Icon = item.icon;
            const ativo = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => selecionarTab(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition shrink-0 text-left ${
                  ativo
                    ? 'bg-gradient-to-r from-[#0066FF]/30 to-[#0066FF]/10 border-l-2 border-[#007BFF] text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="hidden md:flex flex-col gap-1.5 mt-auto pt-3 border-t border-white/10 text-xs">
          <a
            href="/crm-config"
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 flex items-center gap-2"
          >
            <Settings2 className="w-3.5 h-3.5 text-[#007BFF]" /> Configurações &amp; Tokens
          </a>
          <a
            href="https://crm.phonecenter.tech"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-white font-semibold flex items-center justify-between"
          >
            <span>Abrir Chat CRM</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a href="/" className="px-3 py-1.5 text-center text-slate-400 hover:text-white">
            ← Voltar ao PhoneCenter ERP
          </a>
        </div>
      </aside>

      {/* Área principal */}
      <main className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div>
              <div className="text-[11px] font-bold text-[#007BFF] uppercase tracking-wider">
                {NAV_ITEMS.find((i) => i.id === tab)?.sec}
              </div>
              <h1 className="text-xl font-bold text-white">
                {NAV_ITEMS.find((i) => i.id === tab)?.label}
              </h1>
            </div>
            <div className="flex gap-2 md:hidden">
              <a
                href="/crm-config"
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200"
              >
                Config
              </a>
              <a
                href="/"
                className="px-3 py-1.5 rounded-lg bg-[#0066FF] text-xs font-semibold text-white"
              >
                ERP
              </a>
            </div>
          </header>

          {tab === 'visao-geral' && (
            <VisaoGeralSection buildHeaders={buildHeaders} lojaNome={lojaNome} />
          )}
          {tab === 'pos-venda' && (
            <PosVendaSection buildHeaders={buildHeaders} lojaNome={lojaNome} />
          )}
          {tab === 'rodizio' && (
            <RodizioSection buildHeaders={buildHeaders} lojaNome={lojaNome} />
          )}
          {tab === 'campanhas' && (
            <CampanhasSection buildHeaders={buildHeaders} lojaNome={lojaNome} />
          )}
          {tab === 'kanban-grupos' && <KanbanGruposSection buildHeaders={buildHeaders} />}
          {tab === 'telefonia' && <TelefoniaSection buildHeaders={buildHeaders} />}
          {tab === 'metas' && <MetasSection buildHeaders={buildHeaders} />}
          {tab === 'academy' && <AcademySection buildHeaders={buildHeaders} />}
          {tab === 'multi-loja' && <MultiLojaSection buildHeaders={buildHeaders} />}
        </div>
      </main>
    </div>
  );
}
