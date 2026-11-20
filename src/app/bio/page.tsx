'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Search, Smartphone, ShieldCheck, Sparkles } from 'lucide-react';

interface VitrineItem {
  id: string;
  marca: string;
  modelo: string;
  capacidade: string;
  cor: string;
  condicao: string;
  saudeBateria: string;
  preco: number;
}

const formatBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function LinkNaBioVitrinePage() {
  const [lojaNome, setLojaNome] = useState('PhoneCenter');
  const [whatsappNum, setWhatsappNum] = useState('');
  const [busca, setBusca] = useState('');
  const [condicao, setCondicao] = useState('');
  const [itens, setItens] = useState<VitrineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const lojaId = sp.get('loja_id') || '';
    const wa = (sp.get('wa') || '').replace(/\D/g, '');
    setWhatsappNum(wa);

    const qs = new URLSearchParams();
    if (lojaId) qs.set('loja_id', lojaId);
    if (busca.trim()) qs.set('q', busca.trim());
    if (condicao) qs.set('condicao', condicao);

    setLoading(true);
    fetch(`/api/publico/vitrine?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          if (d.loja?.nome) setLojaNome(d.loja.nome);
          setItens(d.itens || []);
        }
      })
      .finally(() => setLoading(false));
  }, [busca, condicao]);

  const abrirWhatsApp = (msg: string) => {
    const base = whatsappNum ? `https://wa.me/${whatsappNum}` : 'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-white px-4 py-6">
      <div className="max-w-xl mx-auto space-y-5">
        {/* Cabeçalho da Loja */}
        <div className="text-center space-y-2">
          <img
            src="/logosnome.png"
            alt={lojaNome}
            className="w-16 h-16 mx-auto rounded-2xl bg-[#0f172a] p-2 border border-[#0066FF]/50 shadow-lg shadow-[#0066FF]/20"
          />
          <h1 className="text-xl font-bold tracking-tight">{lojaNome}</h1>
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#007BFF]" />
            Estoque atualizado em tempo real • Garantia &amp; Procedência
          </p>
        </div>

        {/* Botões rápidos de setor */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() =>
              abrirWhatsApp(`Olá ${lojaNome}! Vim pelo Link na Bio e quero ver os aparelhos disponíveis.`)
            }
            className="py-3 px-4 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#0066FF]/25"
          >
            <MessageCircle className="w-4 h-4" /> Falar com Vendas
          </button>
          <button
            onClick={() =>
              abrirWhatsApp(`Olá ${lojaNome}! Quero simular a troca/upgrade do meu aparelho.`)
            }
            className="py-3 px-4 rounded-xl bg-[#0f172a] hover:bg-slate-800 border border-white/15 font-semibold text-sm flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-[#007BFF]" /> Simular Troca
          </button>
        </div>

        {/* Busca e filtros */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar modelo (ex: iPhone 15 Pro, 256GB...)"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0f172a] border border-white/10 text-sm text-white placeholder:text-slate-500 outline-none focus:border-[#0066FF]"
            />
          </div>
          <div className="flex gap-2">
            {[
              { val: '', label: 'Todos' },
              { val: 'novo', label: 'Lacrados' },
              { val: 'seminovo', label: 'Seminovos' },
            ].map((f) => (
              <button
                key={f.val}
                onClick={() => setCondicao(f.val)}
                className={`px-3 py-1 rounded-full text-xs border ${
                  condicao === f.val
                    ? 'bg-[#0066FF]/20 border-[#0066FF] text-blue-300'
                    : 'bg-[#0f172a] border-white/10 text-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Vitrine */}
        <div className="space-y-2.5">
          {loading ? (
            <div className="text-center py-10 text-slate-400 text-sm">Carregando estoque...</div>
          ) : itens.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              Nenhum aparelho encontrado com esse filtro.
            </div>
          ) : (
            itens.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-[#0f172a] border border-white/10 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="font-semibold text-sm text-white flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-[#007BFF] shrink-0" />
                    <span className="truncate">
                      {item.modelo} {item.capacidade}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex flex-wrap gap-2">
                    {item.cor && <span>{item.cor}</span>}
                    <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-white/5">
                      {item.condicao === 'novo' ? 'Lacrado' : 'Seminovo'}
                    </span>
                    {item.saudeBateria && (
                      <span className="text-emerald-400">🔋 {item.saudeBateria}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <div className="font-bold text-emerald-400 text-sm">{formatBRL(item.preco)}</div>
                  <button
                    onClick={() =>
                      abrirWhatsApp(
                        `Olá ${lojaNome}! Tenho interesse no *${item.modelo} ${item.capacidade} ${item.cor}* (${formatBRL(item.preco)}). Ainda está disponível?`
                      )
                    }
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                  >
                    Quero este
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="text-center text-[11px] text-slate-500 pt-4">
          Powered by <span className="text-[#007BFF] font-semibold">PhoneCenterCRM</span>
        </footer>
      </div>
    </div>
  );
}
