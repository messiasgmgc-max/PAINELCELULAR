'use client';

import React, { useState } from 'react';
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
  Sparkles
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

  if (!isOpen) return null;

  // Cálculos consolidados do lojista
  const totalGeral = vendasLojista.reduce((acc, v) => acc + Number(v.valor || 0), 0);
  const totalPago = vendasLojista.reduce((acc, v) => acc + Number(v.valorPago || 0), 0);
  const saldoDevedor = Math.max(0, totalGeral - totalPago);

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
      msg += `\n`;
    });

    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💵 *Total Geral:* R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    msg += `✅ *Total Já Pago:* R$ ${totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    msg += `⚠️ *SALDO DEVEDOR ATUAL: R$ ${saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (chavePix) {
      msg += `🔑 *Chave PIX para pagamento:*\n${chavePix}\n\n`;
    }

    msg += `Qualquer dúvida estamos à disposição! 🤝`;

    navigator.clipboard.writeText(msg)
      .then(() => toast.success('Extrato copiado para o WhatsApp! 📲'))
      .catch(() => toast.error('Erro ao copiar extrato.'));
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-white my-auto shrink-0 relative max-h-[90vh] flex flex-col">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                Extrato do Lojista: <span className="text-amber-400">{lojistaNome}</span>
              </h3>
              <p className="text-xs text-slate-400">
                Detalhamento completo de compras a prazo, itens pegos e histórico de pagamentos
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CARDS DE RESUMO FINANCEIRO DO LOJISTA */}
        <div className="grid grid-cols-3 gap-3">
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

          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Saldo Devedor</span>
            <span className={cn("text-base sm:text-lg font-bold font-mono", saldoDevedor > 0 ? "text-rose-400" : "text-emerald-400")}>
              R$ {saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
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
              <MessageCircle className="w-3.5 h-3.5" /> Extrato WhatsApp
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
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
          
          {abaAtiva === 'itens' ? (
            vendasLojista.length === 0 ? (
              <p className="p-8 text-center text-slate-500 text-xs">Nenhum pedido registrado para este lojista.</p>
            ) : (
              vendasLojista.map((v) => {
                const total = Number(v.valor || 0);
                const pago = Number(v.valorPago || 0);
                const pendente = Math.max(0, total - pago);

                return (
                  <div key={v.id} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{v.descricao || 'Pedido'}</span>
                        <Badge variant="outline" className={cn("text-[10px]", pendente <= 0.01 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border-amber-500/30")}>
                          {pendente <= 0.01 ? 'Quitado' : pago > 0 ? 'Parcial' : 'Em Aberto'}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Data: {new Date(v.dataPagamento || v.data || v.created_at).toLocaleDateString('pt-BR')} · Método: {v.metodo || 'fiado'}
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
