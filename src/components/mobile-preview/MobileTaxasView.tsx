'use client';

import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  Percent,
  TrendingUp,
  MessageCircle,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  RotateCcw,
  DollarSign,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TaxasPerfilMock {
  nome: string;
  taxasMaster: number[]; // 1x a 18x
  taxasElo: number[];
  taxasBaseMaster: number[];
}

const PERFIS_MAQUINA: TaxasPerfilMock[] = [
  {
    nome: 'InfinitePay Smart',
    taxasMaster: [
      3.15, 4.85, 5.75, 6.65, 7.55, 8.45, 9.55, 10.45, 11.35, 12.25, 13.15, 14.05, 15.2, 16.1, 17.0, 17.9, 18.8, 19.9,
    ],
    taxasElo: [
      4.15, 5.85, 6.75, 7.65, 8.55, 9.45, 10.55, 11.45, 12.35, 13.25, 14.15, 15.05, 16.2, 17.1, 18.0, 18.9, 19.8, 20.9,
    ],
    taxasBaseMaster: [
      2.5, 3.9, 4.7, 5.5, 6.3, 7.1, 8.0, 8.8, 9.6, 10.4, 11.2, 12.0, 13.0, 13.8, 14.6, 15.4, 16.2, 17.0,
    ],
  },
  {
    nome: 'Ton Black (Mega)',
    taxasMaster: [
      3.49, 5.19, 6.09, 6.99, 7.89, 8.79, 9.89, 10.79, 11.69, 12.59, 13.49, 14.39, 15.5, 16.4, 17.3, 18.2, 19.1, 20.2,
    ],
    taxasElo: [
      4.49, 6.19, 7.09, 7.99, 8.89, 9.79, 10.89, 11.79, 12.69, 13.59, 14.49, 15.39, 16.5, 17.4, 18.3, 19.2, 20.1, 21.2,
    ],
    taxasBaseMaster: [
      2.8, 4.2, 5.0, 5.8, 6.6, 7.4, 8.3, 9.1, 9.9, 10.7, 11.5, 12.3, 13.3, 14.1, 14.9, 15.7, 16.5, 17.3,
    ],
  },
  {
    nome: 'Mercado Pago Pro',
    taxasMaster: [
      3.99, 5.99, 6.99, 7.99, 8.99, 9.99, 11.1, 12.1, 13.1, 14.1, 15.1, 16.1, 17.3, 18.3, 19.3, 20.3, 21.3, 22.5,
    ],
    taxasElo: [
      4.99, 6.99, 7.99, 8.99, 9.99, 10.99, 12.1, 13.1, 14.1, 15.1, 16.1, 17.1, 18.3, 19.3, 20.3, 21.3, 22.3, 23.5,
    ],
    taxasBaseMaster: [
      3.2, 4.8, 5.7, 6.5, 7.4, 8.2, 9.2, 10.1, 11.0, 11.9, 12.8, 13.7, 14.8, 15.7, 16.6, 17.5, 18.4, 19.4,
    ],
  },
];

interface MobileTaxasViewProps {
  density: 'compact' | 'detailed';
  onToast: (msg: string) => void;
}

export function MobileTaxasView({ density, onToast }: MobileTaxasViewProps) {
  const [valorBase, setValorBase] = useState('3000');
  const [perfilSelecionado, setPerfilSelecionado] = useState(PERFIS_MAQUINA[0].nome);
  const [bandeira, setBandeira] = useState<'master' | 'elo'>('master');
  const [modoCliente, setModoCliente] = useState(false); // true = oculta margens e lucros da loja
  const [copied, setCopied] = useState(false);

  const perfilAtual = PERFIS_MAQUINA.find((p) => p.nome === perfilSelecionado) || PERFIS_MAQUINA[0];

  const valorNumerico = parseFloat(valorBase.replace(/\D/g, '')) || 0;

  // Cálculo das parcelas
  const simulacoes = useMemo(() => {
    if (valorNumerico <= 0) return [];

    const taxasCli = bandeira === 'master' ? perfilAtual.taxasMaster : perfilAtual.taxasElo;
    const taxasBase = perfilAtual.taxasBaseMaster;

    return taxasCli.map((taxaCliente, index) => {
      const numParcelas = index + 1;
      const taxaBase = taxasBase[index] || taxaCliente * 0.8;

      // Fórmula matemática padrão de repasse da taxa
      const valorTotal = valorNumerico / (1 - taxaCliente / 100);
      const valorParcela = valorTotal / numParcelas;
      const custoMaquininha = valorTotal * (taxaBase / 100);
      const liquidoLoja = valorTotal - custoMaquininha;
      const lucroLoja = liquidoLoja - valorNumerico;

      return {
        numParcelas,
        label: `${numParcelas}x`,
        taxaCliente,
        taxaBase,
        valorTotal,
        valorParcela,
        lucroLoja,
      };
    });
  }, [valorNumerico, perfilAtual, bandeira]);

  const handleCopiarWhatsApp = () => {
    if (simulacoes.length === 0) return;

    let texto = `📱 *SIMULAÇÃO DE PAGAMENTO NO CARTÃO*\n`;
    texto += `*Valor à Vista:* R$ ${valorNumerico.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n`;
    texto += `💳 *Opções de Parcelamento:*\n`;

    // Inclui as principais opções (1x, 3x, 6x, 10x, 12x, 18x)
    simulacoes.forEach((s) => {
      if ([1, 2, 3, 4, 6, 10, 12, 18].includes(s.numParcelas)) {
        texto += `• *${s.label}:* ${s.numParcelas}x de R$ ${s.valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Total: R$ ${s.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n`;
      }
    });

    texto += `\n_Simulação gerada por Phone Center._`;

    navigator.clipboard.writeText(texto);
    setCopied(true);
    onToast('Simulação copiada! Pronta para colar no WhatsApp!');
    setTimeout(() => setCopied(false), 2500);
  };

  // Ouvinte para ações disparadas pela BottomBar no Mobile
  React.useEffect(() => {
    const handleAction = (e: any) => {
      const act = e.detail?.action;
      if (act === 'copy-whatsapp') {
        handleCopiarWhatsApp();
      } else if (act === 'toggle-modo') {
        setModoCliente((prev) => {
          const next = !prev;
          onToast(next ? 'Modo Cliente ativado (oculta lucros)' : 'Modo Lojista ativado (mostra lucros)');
          return next;
        });
      } else if (act === 'zerar') {
        setValorBase('');
        onToast('Valor zerado.');
      } else if (act === 'trocar-maquina') {
        setPerfilSelecionado((prev) => {
          const currentIndex = PERFIS_MAQUINA.findIndex((p) => p.nome === prev);
          const nextIndex = (currentIndex + 1) % PERFIS_MAQUINA.length;
          const nextName = PERFIS_MAQUINA[nextIndex].nome;
          onToast(`Máquina alterada: ${nextName}`);
          return nextName;
        });
      }
    };

    window.addEventListener('phonecenter:taxas-action' as any, handleAction);
    return () => window.removeEventListener('phonecenter:taxas-action' as any, handleAction);
  }, [simulacoes, valorNumerico, onToast]);

  return (
    <div className="space-y-3.5">
      {/* 1. Card de Entrada de Valor com visual Fintech */}
      <div className="p-3.5 bg-gradient-to-br from-slate-900 to-slate-950 border border-blue-500/20 rounded-3xl shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-cyan-400" />
            Valor a Cobrar / Receber
          </span>

          {/* Alternador Modo Cliente vs Lojista */}
          <button
            onClick={() => {
              setModoCliente(!modoCliente);
              onToast(modoCliente ? 'Modo Lojista ativado (mostra lucros)' : 'Modo Cliente ativado (oculta lucros)');
            }}
            className={`text-[10.5px] px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
              modoCliente
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : 'bg-blue-950/40 text-blue-300 border-blue-500/30'
            }`}
          >
            {modoCliente ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-cyan-400" />}
            {modoCliente ? 'Modo Cliente (Oculto)' : 'Modo Lojista (Margens)'}
          </button>
        </div>

        {/* Input Gigante e Confortável para Digitação no Celular */}
        <div className="relative">
          <span className="absolute left-3.5 top-3 text-cyan-400 font-bold text-lg">R$</span>
          <Input
            value={valorBase}
            onChange={(e) => setValorBase(e.target.value)}
            placeholder="0,00"
            className="h-13 pl-11 pr-4 bg-slate-950/80 border-slate-700/80 rounded-2xl text-2xl font-black text-cyan-300 tracking-tight focus:border-cyan-400"
          />
        </div>

        {/* Atalhos Rápidos de Incremento */}
        <div className="grid grid-cols-4 gap-1.5">
          {[100, 500, 1000].map((inc) => (
            <button
              key={inc}
              onClick={() => setValorBase(String(valorNumerico + inc))}
              className="py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer active:scale-95"
            >
              +{inc}
            </button>
          ))}
          <button
            onClick={() => setValorBase('')}
            className="py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-rose-300 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer active:scale-95"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* 2. Seletores de Máquina e Bandeira */}
      <div className="space-y-2">
        {/* Carrossel de Perfis de Máquina */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {PERFIS_MAQUINA.map((p) => {
            const active = p.nome === perfilSelecionado;
            return (
              <button
                key={p.nome}
                onClick={() => setPerfilSelecionado(p.nome)}
                className={`text-xs px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap border transition-all cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {p.nome}
              </button>
            );
          })}
        </div>

        {/* Bandeira (Master/Visa vs Elo/Hiper) */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setBandeira('master')}
            className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
              bandeira === 'master'
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-blue-400" />
            Master / Visa
          </button>

          <button
            onClick={() => setBandeira('elo')}
            className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
              bandeira === 'elo'
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
            Elo / Hipercard
          </button>
        </div>
      </div>

      {/* 3. Ação Rápida de Compartilhar WhatsApp */}
      <Button
        onClick={handleCopiarWhatsApp}
        className="w-full h-11 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
      >
        {copied ? <Check className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
        {copied ? 'Copiado para o WhatsApp!' : 'Copiar Simulação p/ WhatsApp'}
      </Button>

      {/* 4. Lista de Parcelas Ultra Compacta (52px por linha) */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs px-1 text-slate-400">
          <span>Opções de 1x a 18x</span>
          <span className="text-[11px] text-cyan-400 font-medium">
            {modoCliente ? 'Visão do Cliente' : 'Visão com Margens'}
          </span>
        </div>

        {simulacoes.map((item) => (
          <div
            key={item.numParcelas}
            onClick={() => {
              const txt = `${item.numParcelas}x de R$ ${item.valorParcela.toFixed(2).replace('.', ',')} (Total: R$ ${item.valorTotal.toFixed(2).replace('.', ',')})`;
              navigator.clipboard.writeText(txt);
              onToast(`Copiado: ${txt}`);
            }}
            className="w-full h-[52px] px-3 py-1.5 bg-slate-900/60 hover:bg-slate-800/80 active:bg-blue-950/40 border border-slate-800/80 hover:border-cyan-500/30 rounded-xl flex items-center justify-between gap-2.5 transition-all cursor-pointer select-none group"
          >
            {/* Parcela (1x, 2x... 18x) */}
            <div className="w-9 h-9 rounded-lg bg-blue-950/50 border border-blue-500/30 flex items-center justify-center shrink-0 text-cyan-300 font-extrabold text-xs group-hover:scale-105 transition-transform">
              {item.label}
            </div>

            {/* Valor da Parcela + Total */}
            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm text-white">
                  {item.numParcelas}x R$ {item.valorParcela.toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="text-[10.5px] text-slate-400 truncate flex items-center gap-1.5">
                <span>Total: R$ {item.valorTotal.toFixed(2).replace('.', ',')}</span>
                <span className="text-slate-600">•</span>
                <span className="text-cyan-400 font-semibold">{item.taxaCliente}%</span>
              </div>
            </div>

            {/* Lucro Loja (Se Modo Lojista ativado) ou Ícone Copiar */}
            <div className="shrink-0 text-right">
              {!modoCliente && item.lucroLoja > 0 ? (
                <div className="flex flex-col items-end">
                  <span className="text-[9.5px] text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold">
                    +R$ {item.lucroLoja.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-[9px] text-slate-500 mt-0.5">lucro</span>
                </div>
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
