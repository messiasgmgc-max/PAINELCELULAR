'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2,
  Printer,
  ShieldCheck,
  Smartphone,
  Clock,
  RefreshCw,
} from 'lucide-react';

interface Parcela {
  parcelas: number;
  taxaPercentual: number;
  totalComTaxa: number;
  valorParcela: number;
}

interface PropostaPublica {
  protocolo: string;
  cliente_nome: string;
  vendedor_nome: string;
  modelo_novo: string;
  valor_aparelho: number;
  troca_modelo: string;
  troca_capacidade: string;
  valor_troca: number;
  entrada_pix: number;
  saldo_financiar: number;
  parcelamento: Parcela[];
  status: string;
  validade_ate: string;
  aceita_em: string | null;
  created_at: string;
}

const formatBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PropostaPublicaPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || '';

  const [lojaNome, setLojaNome] = useState('PhoneCenter');
  const [proposta, setProposta] = useState<PropostaPublica | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/publico/proposta/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setErro(d.error || 'Proposta não encontrada.');
          return;
        }
        if (d.loja?.nome) setLojaNome(d.loja.nome);
        setProposta(d.proposta);
      })
      .catch(() => setErro('Erro ao carregar proposta.'))
      .finally(() => setLoading(false));
  }, [token]);

  const aceitarProposta = async () => {
    if (!token) return;
    setConfirmando(true);
    try {
      const res = await fetch(`/api/publico/proposta/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aceita' }),
      });
      const data = await res.json();
      if (res.ok && data.ok && proposta) {
        setProposta({
          ...proposta,
          status: 'aceita',
          aceita_em: data.proposta?.aceita_em || new Date().toISOString(),
        });
      }
    } finally {
      setConfirmando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-300 flex items-center justify-center text-sm">
        Carregando proposta oficial...
      </div>
    );
  }

  if (erro || !proposta) {
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-300 flex items-center justify-center p-6">
        <div className="max-w-md w-full p-6 rounded-2xl bg-[#0f172a] border border-white/10 text-center space-y-2">
          <div className="text-lg font-bold text-white">Proposta indisponível</div>
          <p className="text-sm text-slate-400">{erro || 'Link expirado ou inválido.'}</p>
        </div>
      </div>
    );
  }

  const aceita = proposta.status === 'aceita';

  return (
    <div className="min-h-screen bg-[#090d16] text-white py-8 px-4 print:bg-white print:text-black">
      <div className="max-w-2xl mx-auto rounded-3xl bg-[#0f172a] border border-white/10 overflow-hidden shadow-2xl print:shadow-none print:border-slate-300 print:bg-white">
        {/* Topo */}
        <div className="bg-gradient-to-r from-[#090d16] via-[#0f172a] to-[#0044cc] p-6 border-b border-white/10 flex items-center justify-between gap-4 print:bg-none print:border-slate-300">
          <div className="flex items-center gap-3">
            <img
              src="/logosnome.png"
              alt={lojaNome}
              className="w-12 h-12 rounded-xl bg-[#090d16] p-1 border border-[#0066FF]/50"
            />
            <div>
              <div className="text-xs uppercase tracking-wider text-blue-300 font-semibold print:text-blue-700">
                Proposta Comercial Oficial
              </div>
              <h1 className="text-xl font-bold">{lojaNome}</h1>
              <div className="text-xs text-slate-300 print:text-slate-600">
                Protocolo <strong>{proposta.protocolo}</strong> • Atendente:{' '}
                {proposta.vendedor_nome}
              </div>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
              aceita
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-[#0066FF]/20 text-blue-200 border border-[#0066FF]/40'
            }`}
          >
            {aceita ? '✓ Aceita' : proposta.status}
          </span>
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-300 print:text-slate-700">
            <div>
              Preparada para: <strong className="text-white print:text-black">{proposta.cliente_nome}</strong>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              Validade até {new Date(proposta.validade_ate).toLocaleString('pt-BR')}
            </div>
          </div>

          {/* Aparelho + Resumo */}
          <div className="rounded-2xl bg-[#090d16] border border-white/10 p-4 space-y-3 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-[#007BFF]" />
                <div>
                  <div className="text-xs text-slate-400">Aparelho Selecionado</div>
                  <div className="font-bold text-base">{proposta.modelo_novo}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">À vista / Pix</div>
                <div className="font-bold text-lg text-white print:text-black">
                  {formatBRL(proposta.valor_aparelho)}
                </div>
              </div>
            </div>

            {proposta.valor_troca > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-white/10 text-sm">
                <span className="flex items-center gap-1.5 text-amber-300 print:text-amber-700">
                  <RefreshCw className="w-4 h-4" />
                  Aparelho na troca ({proposta.troca_modelo} {proposta.troca_capacidade})
                </span>
                <strong className="text-amber-300 print:text-amber-700">
                  - {formatBRL(proposta.valor_troca)}
                </strong>
              </div>
            )}

            {proposta.entrada_pix > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-white/10 text-sm">
                <span className="text-slate-300 print:text-slate-700">Entrada em Pix / Dinheiro</span>
                <strong className="text-emerald-400 print:text-emerald-700">
                  - {formatBRL(proposta.entrada_pix)}
                </strong>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-white/15 text-base">
              <span className="font-bold">Saldo Restante</span>
              <strong className="text-2xl text-emerald-400 print:text-emerald-700">
                {formatBRL(proposta.saldo_financiar)}
              </strong>
            </div>
          </div>

          {/* Tabela de Parcelamento */}
          {proposta.parcelamento.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-white print:text-black">
                Opções de Parcelamento no Cartão
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {proposta.parcelamento.map((p) => (
                  <div
                    key={p.parcelas}
                    className="p-3 rounded-xl bg-[#090d16] border border-white/10 print:bg-white print:border-slate-300"
                  >
                    <div className="text-xs text-slate-400">{p.parcelas}x no cartão</div>
                    <div className="font-bold text-sm text-white print:text-black">
                      {formatBRL(p.valorParcela)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Total {formatBRL(p.totalComTaxa)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-400 bg-white/5 p-3 rounded-xl print:bg-slate-100">
            <ShieldCheck className="w-4 h-4 text-[#007BFF] shrink-0" />
            <span>
              Garantia oficial {lojaNome}. Em caso de troca, o valor do aparelho usado é confirmado na
              conferência presencial.
            </span>
          </div>

          {/* Ações */}
          <div className="flex flex-wrap gap-3 pt-2 print:hidden">
            {!aceita ? (
              <button
                onClick={aceitarProposta}
                disabled={confirmando}
                className="flex-1 py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25"
              >
                <CheckCircle2 className="w-5 h-5" />
                {confirmando ? 'Confirmando...' : 'Aceitar Proposta e Reservar'}
              </button>
            ) : (
              <div className="flex-1 py-3 px-5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Proposta aceita! Avise seu vendedor no WhatsApp.
              </div>
            )}
            <button
              onClick={() => window.print()}
              className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm flex items-center gap-2"
            >
              <Printer className="w-4 h-4" /> Baixar / Imprimir PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
