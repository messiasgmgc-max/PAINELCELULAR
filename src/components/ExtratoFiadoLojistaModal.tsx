'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Receipt, 
  MessageCircle, 
  DollarSign, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Smartphone, 
  Package, 
  User, 
  Copy,
  History,
  TrendingDown,
  Sparkles,
  Percent,
  AlertTriangle,
  Key
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExtratoFiadoLojistaModalProps {
  isOpen: boolean;
  onClose: () => void;
  lojistaNome: string;
  vendasLojista: any[];
  chavePix?: string;
  nomeLoja?: string;
  onAbrirBaixaModal: () => void;
}

export function ExtratoFiadoLojistaModal({
  isOpen,
  onClose,
  lojistaNome,
  vendasLojista,
  chavePix = '',
  nomeLoja = 'Lucas Imports',
  onAbrirBaixaModal,
}: ExtratoFiadoLojistaModalProps) {
  const [abaAtiva, setAbaAtiva] = useState<'itens' | 'abatimentos'>('itens');
  const [chavePixInput, setChavePixInput] = useState(chavePix);
  const [taxaJurosMensal, setTaxaJurosMensal] = useState('2.0');
  const [aplicarJuros, setAplicarJuros] = useState(false);

  useEffect(() => {
    if (chavePix) {
      setChavePixInput(chavePix);
    }
  }, [chavePix]);

  if (!isOpen) return null;

  // Cálculos consolidados do lojista
  const totalGeral = vendasLojista.reduce((acc, v) => acc + Number(v.valor || 0), 0);
  const totalPago = vendasLojista.reduce((acc, v) => acc + Number(v.valorPago || 0), 0);
  const saldoDevedor = Math.max(0, totalGeral - totalPago);

  // Verificação de vencimento mais antigo e cálculo de atraso
  const agora = new Date();
  let dataVencimentoMaisAntiga: Date | null = null;
  vendasLojista.forEach((v) => {
    const dataVencStr = v.dataVencimento || (v.raw && v.raw.dataVencimento);
    if (dataVencStr) {
      const d = new Date(dataVencStr);
      if (!isNaN(d.getTime())) {
        if (!dataVencimentoMaisAntiga || d < dataVencimentoMaisAntiga) {
          dataVencimentoMaisAntiga = d;
        }
      }
    }
  });

  let diasAtraso = 0;
  let estaEmAtraso = false;
  if (dataVencimentoMaisAntiga && dataVencimentoMaisAntiga.getTime() < agora.getTime() && saldoDevedor > 0.01) {
    const diffMs = agora.getTime() - dataVencimentoMaisAntiga.getTime();
    diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    estaEmAtraso = diasAtraso > 0;
  }

  // Cálculo de juros pro rata die mensal
  const taxaJurosNum = parseFloat(taxaJurosMensal.replace(',', '.')) || 0;
  const valorJurosCalculado = estaEmAtraso && taxaJurosNum > 0
    ? Math.round((saldoDevedor * (taxaJurosNum / 100) * (diasAtraso / 30)) * 100) / 100
    : 0;

  const saldoComJuros = (aplicarJuros && estaEmAtraso) ? (saldoDevedor + valorJurosCalculado) : saldoDevedor;

  // Lista todos os abatimentos já realizados
  const todosAbatimentos: Array<{ data: string; valor: number; metodo: string; observacao?: string; vendaDesc?: string }> = [];
  vendasLojista.forEach((v) => {
    if (v.historicoAbatimentos && Array.isArray(v.historicoAbatimentos)) {
      v.historicoAbatimentos.forEach((ab: any) => {
        todosAbatimentos.push({
          ...ab,
          vendaDesc: v.descricao || 'Pedido',
        });
      });
    }
  });
  todosAbatimentos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  // Copia mensagem de extrato formatada para o WhatsApp
  const handleCopiarWhatsApp = () => {
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    
    let msg = `📋 *EXTRATO DE CONTA - ${nomeLoja.toUpperCase()}*\n`;
    msg += `👤 *Lojista / Parceiro:* ${lojistaNome}\n`;
    msg += `📅 *Data de Emissão:* ${dataHoje}\n\n`;

    msg += `📦 *ITENS E PEDIDOS:*\n`;
    vendasLojista.forEach((v) => {
      const dataVenda = new Date(v.dataPagamento || v.data || v.created_at).toLocaleDateString('pt-BR');
      const val = Number(v.valor || 0);
      const pago = Number(v.valorPago || 0);
      const pend = Math.max(0, val - pago);

      let statusEmoji = pend <= 0.01 ? '✅' : pago > 0 ? '🟡' : '⏳';
      msg += `${statusEmoji} *${v.descricao || 'Pedido'}* (${dataVenda})\n`;
      msg += `   Valor: R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      if (pago > 0 && pend > 0) {
        msg += ` | Já pago: R$ ${pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | *Resta: R$ ${pend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`;
      }
      if (v.dataVencimento) {
        msg += ` | Vencimento: ${new Date(v.dataVencimento).toLocaleDateString('pt-BR')}`;
      }
      msg += `\n`;
    });

    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💵 *Total Geral Comprado:* R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    msg += `✅ *Total Já Pago:* R$ ${totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    msg += `⚠️ *Saldo Devedor Principal:* R$ ${saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;

    if (aplicarJuros && estaEmAtraso && valorJurosCalculado > 0) {
      msg += `⏳ *Atraso:* ${diasAtraso} dias (Vencimento: ${dataVencimentoMaisAntiga?.toLocaleDateString('pt-BR')})\n`;
      msg += `📈 *Juros por Atraso (${taxaJurosNum.toFixed(1)}% a.m.):* + R$ ${valorJurosCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      msg += `🚨 *TOTAL ATUALIZADO PARA QUITAÇÃO: R$ ${saldoComJuros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    } else {
      msg += `🚨 *SALDO TOTAL PENDENTE: R$ ${saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    const pixFinal = chavePixInput.trim();
    if (pixFinal) {
      msg += `🔑 *Chave PIX para pagamento:*\n${pixFinal}\n\n`;
    }

    msg += `Qualquer dúvida estamos à disposição! 🤝`;

    navigator.clipboard.writeText(msg)
      .then(() => toast.success('Extrato copiado para o WhatsApp com PIX e cálculos! 📲'))
      .catch(() => toast.error('Erro ao copiar extrato.'));
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-white my-auto shrink-0 relative max-h-[92vh] flex flex-col">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg text-white">
                  Extrato do Lojista: <span className="text-amber-400">{lojistaNome}</span>
                </h3>
                {estaEmAtraso && (
                  <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px] animate-pulse">
                    ⚠️ {diasAtraso}d em atraso
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Detalhamento completo de fiados, juros por atraso e chave PIX para cobrança
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CARDS DE RESUMO FINANCEIRO DO LOJISTA */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Total Comprado</span>
            <span className="text-base sm:text-lg font-bold font-mono text-white">
              R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Total Já Pago</span>
            <span className="text-base sm:text-lg font-bold font-mono text-emerald-400">
              R$ {totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 relative">
            <span className="text-[11px] text-slate-400 block">Saldo Devedor {aplicarJuros && estaEmAtraso ? '(com Juros)' : ''}</span>
            <span className={cn("text-base sm:text-lg font-bold font-mono", saldoComJuros > 0 ? "text-rose-400" : "text-emerald-400")}>
              R$ {saldoComJuros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* BARRA DE CONFIGURAÇÃO DE PIX E JUROS */}
        <div className="bg-slate-950/80 border border-slate-800/80 p-3 rounded-2xl space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
            
            {/* Chave PIX */}
            <div className="sm:col-span-6 space-y-1">
              <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                <Key className="w-3 h-3 text-emerald-400" /> Chave PIX para Cobrança
              </label>
              <input
                type="text"
                value={chavePixInput}
                onChange={(e) => setChavePixInput(e.target.value)}
                placeholder="Ex: seuemail@pix.com ou 12345678900"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-emerald-300 font-mono font-bold outline-none focus:border-emerald-500"
              />
            </div>

            {/* Cálculo de Juros */}
            <div className="sm:col-span-6 flex flex-col justify-end space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <Percent className="w-3 h-3 text-amber-400" /> Juros por Atraso (% a.m.)
                </label>
                {estaEmAtraso && (
                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-amber-400 font-bold">
                    <input
                      type="checkbox"
                      checked={aplicarJuros}
                      onChange={(e) => setAplicarJuros(e.target.checked)}
                      className="rounded accent-amber-500 cursor-pointer"
                    />
                    Aplicar no Extrato
                  </label>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={taxaJurosMensal}
                  onChange={(e) => setTaxaJurosMensal(e.target.value)}
                  placeholder="2.0"
                  className="w-20 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-amber-300 font-mono font-bold outline-none focus:border-amber-500 text-center"
                />
                {estaEmAtraso ? (
                  <span className="text-[11px] text-slate-400">
                    {diasAtraso}d atraso ➔ <strong className="text-rose-400 font-mono">+ R$ {valorJurosCalculado.toFixed(2)}</strong>
                  </span>
                ) : (
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    ✓ Sem atrasos pendentes
                  </span>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ABAS: ITENS EM ABERTO vs HISTÓRICO DE ABATIMENTOS */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAbaAtiva('itens')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer",
                abaAtiva === 'itens' ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white bg-slate-950"
              )}
            >
              📦 Itens e Pedidos ({vendasLojista.length})
            </button>

            <button
              onClick={() => setAbaAtiva('abatimentos')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer",
                abaAtiva === 'abatimentos' ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white bg-slate-950"
              )}
            >
              📜 Histórico de Pagamentos ({todosAbatimentos.length})
            </button>
          </div>

          {/* BOTÕES DE AÇÃO RÁPIDA */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleCopiarWhatsApp}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-3 rounded-xl gap-1.5 shadow-md shadow-emerald-950/30 cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Copiar Extrato WhatsApp
            </Button>

            {saldoDevedor > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  onAbrirBaixaModal();
                }}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs h-8 px-3 rounded-xl gap-1.5 shadow-md shadow-amber-950/30 cursor-pointer"
              >
                <DollarSign className="w-3.5 h-3.5" /> Abater Pagamento
              </Button>
            )}
          </div>
        </div>

        {/* CONTEÚDO DA ABA SELECIONADA */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
          
          {abaAtiva === 'itens' ? (
            vendasLojista.length === 0 ? (
              <p className="p-8 text-center text-slate-500 text-xs">Nenhum pedido registrado para este lojista.</p>
            ) : (
              vendasLojista.map((v) => {
                const total = Number(v.valor || 0);
                const pago = Number(v.valorPago || 0);
                const pendente = Math.max(0, total - pago);
                const dataVencStr = v.dataVencimento || (v.raw && v.raw.dataVencimento);
                const dataVenc = dataVencStr ? new Date(dataVencStr) : null;
                const estaVencido = dataVenc && dataVenc.getTime() < agora.getTime() && pendente > 0.01;

                return (
                  <div key={v.id} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                        <span>{v.descricao || 'Pedido'}</span>
                        <Badge variant="outline" className={cn("text-[10px]", pendente <= 0.01 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border-amber-500/30")}>
                          {pendente <= 0.01 ? 'Quitado' : pago > 0 ? 'Parcial' : 'Em Aberto'}
                        </Badge>
                        {estaVencido && (
                          <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[9px]">
                            Vencido: {dataVenc?.toLocaleDateString('pt-BR')}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Data Compra: {new Date(v.dataPagamento || v.data || v.created_at).toLocaleDateString('pt-BR')} · Método: {v.metodo || 'fiado'}
                        {dataVenc && !estaVencido && ` · Vencimento: ${dataVenc.toLocaleDateString('pt-BR')}`}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-bold font-mono text-sm text-white">
                        R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                      {pendente > 0 && pago > 0 && (
                        <span className="text-[10px] text-rose-400 font-mono block">
                          Resta: R$ {pendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )
          ) : (
            todosAbatimentos.length === 0 ? (
              <p className="p-8 text-center text-slate-500 text-xs">Nenhum abatimento registrado ainda.</p>
            ) : (
              todosAbatimentos.map((ab, idx) => (
                <div key={idx} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-emerald-400 font-mono text-sm">
                      + R$ {Number(ab.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {new Date(ab.data).toLocaleDateString('pt-BR')} · Método: {ab.metodo} · {ab.observacao || ''}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-slate-900 border-slate-700 text-emerald-300">
                    Abatido
                  </Badge>
                </div>
              ))
            )
          )}

        </div>

      </div>
    </div>
  );
}
