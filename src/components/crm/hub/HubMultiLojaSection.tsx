'use client';

import { useCallback, useEffect, useState } from 'react';
import { Server, Plus, Copy, Check, Globe } from 'lucide-react';

interface Props {
  buildHeaders: () => Promise<Record<string, string>>;
}

export function MultiLojaSection({ buildHeaders }: Props) {
  const [tenants, setTenants] = useState<Array<Record<string, unknown>>>([]);
  const [lojas, setLojas] = useState<Array<{ id: string; nome: string }>>([]);
  const [lojaIdSel, setLojaIdSel] = useState('');
  const [modo, setModo] = useState<'compartilhado' | 'isolado'>('compartilhado');
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/multi-loja/provisionar', {
      headers: h,
      credentials: 'include',
    });
    const d = await res.json();
    if (res.ok && d.ok) {
      setTenants(d.tenants || []);
      if (Array.isArray(d.lojas)) {
        setLojas(d.lojas);
        if (!lojaIdSel && d.lojas[0]?.id) setLojaIdSel(d.lojas[0].id);
      }
      setErro(null);
    } else if (res.status === 403) {
      setErro('Área exclusiva do Super Admin da plataforma PhoneCenter.');
    }
  }, [buildHeaders, lojaIdSel]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const provisionar = async () => {
    const loja = lojas.find((l) => l.id === lojaIdSel);
    if (!loja) return;
    setErro(null);
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/multi-loja/provisionar', {
      method: 'POST',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({ lojaId: loja.id, nomeLoja: loja.nome, modo }),
    });
    const d = await res.json();
    if (res.ok && d.ok) {
      setResultado(d);
      carregar();
    } else {
      setErro(d.error || 'Erro ao provisionar tenant.');
    }
  };

  if (erro) {
    return (
      <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs">
        {erro}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-3">
        <div className="font-bold text-white text-sm flex items-center gap-2">
          <Server className="w-4 h-4 text-[#007BFF]" />
          Provisionar Loja no PhoneCenterCRM SaaS
        </div>
        <p className="text-xs text-slate-400">
          <strong>Compartilhado (Recomendado p/ R$ 299):</strong> 0 MB RAM extra, token isolado + Team
          dedicado na mesma stack. <strong>Isolado (Enterprise):</strong> stack Docker exclusiva
          via Coolify API.
        </p>

        <div className="grid sm:grid-cols-3 gap-2 text-xs">
          <select
            value={lojaIdSel}
            onChange={(e) => setLojaIdSel(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-white"
          >
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome} ({l.id.slice(0, 8)})
              </option>
            ))}
          </select>
          <select
            value={modo}
            onChange={(e) => setModo(e.target.value as 'compartilhado' | 'isolado')}
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-white"
          >
            <option value="compartilhado">Compartilhado (Escalável 50+ lojas)</option>
            <option value="isolado">Isolado (Container Docker Dedicado)</option>
          </select>
          <button
            onClick={provisionar}
            className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] font-semibold text-white flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Provisionar Agora
          </button>
        </div>

        {resultado && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs space-y-1.5">
            <div className="font-bold text-emerald-200">
              Tenant provisionado ({String(resultado.modo)})!
            </div>
            <div className="font-mono text-[11px] text-slate-200 break-all">
              Sidebar URL: {String(resultado.sidebarUrl || '')}
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(String(resultado.sidebarUrl || ''));
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1800);
              }}
              className="px-2.5 py-1 rounded bg-white/10 text-white inline-flex items-center gap-1 text-[11px]"
            >
              {copiado ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copiar Sidebar URL
            </button>
          </div>
        )}
      </div>

      <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-2">
        <div className="font-bold text-white text-xs">Lojas Provisionadas ({tenants.length})</div>
        {tenants.map((t) => (
          <div
            key={String(t.id)}
            className="p-3 rounded-xl bg-[#090d16] border border-white/5 flex flex-wrap justify-between items-center gap-2 text-xs"
          >
            <div>
              <strong className="text-white flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#007BFF]" />
                {String(t.frontend_domain)}
              </strong>
              <div className="text-[11px] text-slate-400">
                Slug: {String(t.slug)} • Modo: {String(t.modo || 'compartilhado')}
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-[#0066FF]/20 text-blue-300 text-[10px] font-bold uppercase">
              {String(t.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
