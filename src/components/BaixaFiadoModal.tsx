'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  DollarSign, 
  Calendar, 
  CreditCard, 
  CheckCircle2, 
  TrendingDown, 
  User, 
  Receipt,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AbatimentoFiado } from '@/lib/db/types';

interface BaixaFiadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  lojistaNome: string;
  saldoDevedorTotal: number;
  vendasEmAberto: any[];
  lojaId: string | null;
  onSuccess: () => Promise<void>;
}

const FORMAS_PAGAMENTO = [
  { id: 'pix', label: 'PIX' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao_credito', label: 'Cartão de Crédito' },
  { id: 'cartao_debito', label: 'Cartão de Débito' },
  { id: 'transferencia', label: 'Transferência Bancária' },
];

export function BaixaFiadoModal({
  isOpen,
  onClose,
  lojistaNome,
  saldoDevedorTotal,
  vendasEmAberto,
  lojaId,
  onSuccess,
}: BaixaFiadoModalProps) {
  const [valorAbatimento, setValorAbatimento] = useState('');
  const [metodoPgto, setMetodoPgto] = useState('pix');
  const [dataPagamento, setDataPagamento] = useState(() => new Date().toISOString().split('T')[0]);
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValorAbatimento('');
      setMetodoPgto('pix');
      setDataPagamento(new Date().toISOString().split('T')[0]);
      setObservacoes('');
    }
  }, [isOpen]);

  const valorNum = parseFloat(valorAbatimento.replace(/[^\d,.]/g, '').replace(',', '.')) || 0;
  const saldoRestante = Math.max(0, saldoDevedorTotal - valorNum);

  if (!isOpen) return null;

  const handleQuitarTudo = () => {
    setValorAbatimento(saldoDevedorTotal.toFixed(2));
  };

  const handleAbaterMetade = () => {
    setValorAbatimento((saldoDevedorTotal / 2).toFixed(2));
  };

  const handleSalvarAbatimento = async (e: React.FormEvent) => {
    e.preventDefault();

    if (valorNum <= 0) {
      toast.error('Informe um valor de pagamento válido.');
      return;
    }

    if (valorNum > saldoDevedorTotal + 0.01) {
      if (!confirm(`O valor informado (R$ ${valorNum.toFixed(2)}) é maior que o saldo devedor (R$ ${saldoDevedorTotal.toFixed(2)}). Deseja continuar?`)) {
        return;
      }
    }

    setSalvando(true);
    const toastId = toast.loading(`Registrando pagamento de R$ ${valorNum.toFixed(2)} de ${lojistaNome}...`);

    try {
      let valorRestanteParaAbater = valorNum;
      const dataIso = new Date(dataPagamento + 'T12:00:00').toISOString();

      // Ordena as vendas em aberto da mais antiga para a mais recente
      const vendasOrdenadas = [...vendasEmAberto].sort((a, b) => 
        new Date(a.dataPagamento || a.data || a.created_at).getTime() - new Date(b.dataPagamento || b.data || b.created_at).getTime()
      );

      for (const venda of vendasOrdenadas) {
        if (valorRestanteParaAbater <= 0) break;

        const totalVenda = Number(venda.valor || 0);
        const pagoAtual = Number(venda.valorPago || 0);
        const devedorVenda = Number(venda.saldoDevedor !== undefined ? venda.saldoDevedor : (totalVenda - pagoAtual));

        if (devedorVenda <= 0) continue;

        const abatimentoNestaVenda = Math.min(valorRestanteParaAbater, devedorVenda);
        const novoPago = pagoAtual + abatimentoNestaVenda;
        const novoSaldoDevedor = Math.max(0, devedorVenda - abatimentoNestaVenda);
        const novoStatus = novoSaldoDevedor <= 0.01 ? 'pago' : 'parcial';

        // Registra o log no histórico de abatimentos da venda
        const novoLog: AbatimentoFiado = {
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          data: dataIso,
          valor: abatimentoNestaVenda,
          metodo: metodoPgto,
          observacao: observacoes || `Abatimento efetuado por ${lojistaNome}`,
          registradoPor: 'Sistema',
        };

        const historicoExistente = Array.isArray(venda.historicoAbatimentos) 
          ? venda.historicoAbatimentos 
          : [];

        const { error } = await supabase
          .from('vendas')
          .update({
            valorPago: novoPago,
            saldoDevedor: novoSaldoDevedor,
            status: novoStatus,
            historicoAbatimentos: [...historicoExistente, novoLog],
          })
          .eq('id', venda.id);

        if (error) throw error;

        valorRestanteParaAbater -= abatimentoNestaVenda;
      }

      toast.success(`🎉 Pagamento de R$ ${valorNum.toFixed(2)} registrado com sucesso para ${lojistaNome}!`, { id: toastId, duration: 5000 });
      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao abater fiado:', err);
      toast.error(`Erro ao registrar pagamento: ${err.message || 'Falha no banco'}`, { id: toastId });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-white my-auto shrink-0 relative">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/30">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Receber Pagamento / Abater Fiado</h3>
              <p className="text-xs text-slate-400">
                Lojista: <strong className="text-amber-400">{lojistaNome}</strong>
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CARD DO SALDO DEVEDOR ATUAL */}
        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Dívida em Aberto:</span>
            <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 font-mono text-xs font-bold">
              {vendasEmAberto.length} pedido(s) pendente(s)
            </Badge>
          </div>

          <div className="text-2xl font-bold font-mono text-rose-400">
            R$ {saldoDevedorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>

          {/* BOTÕES DE ATALHO RÁPIDO */}
          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
            <button
              type="button"
              onClick={handleQuitarTudo}
              className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/20 transition-colors cursor-pointer"
            >
              Quitar Total (100%)
            </button>
            <button
              type="button"
              onClick={handleAbaterMetade}
              className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1 rounded-lg border border-cyan-500/20 transition-colors cursor-pointer"
            >
              Abater Metade (50%)
            </button>
          </div>
        </div>

        <form onSubmit={handleSalvarAbatimento} className="space-y-3.5 pt-1">
          
          {/* VALOR A ABATER */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              Valor Pago pelo Lojista (R$) *
            </label>
            <input
              type="text"
              placeholder="0,00"
              value={valorAbatimento}
              onChange={(e) => setValorAbatimento(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-base text-white font-mono font-bold focus:border-emerald-500 outline-none"
              required
              autoFocus
            />
          </div>

          {/* FORMA DE PAGAMENTO E DATA */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-purple-400" />
                Como Pagou?
              </label>
              <select
                value={metodoPgto}
                onChange={(e) => setMetodoPgto(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 cursor-pointer"
              >
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                Data
              </label>
              <input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* OBSERVAÇÕES */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">Observação / Comprovante</label>
            <input
              type="text"
              placeholder="Ex: Enviou comprovante no WhatsApp..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-emerald-500"
            />
          </div>

          {/* SIMULAÇÃO DE SALDO RESTANTE */}
          <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold">Saldo Restante:</span>
            <span className={cn("font-mono font-bold text-sm", saldoRestante <= 0 ? "text-emerald-400" : "text-amber-400")}>
              {saldoRestante <= 0 ? 'Dívida 100% Quitada! 🎉' : `R$ ${saldoRestante.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </span>
          </div>

          {/* BOTÕES DE AÇÃO */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              disabled={salvando || valorNum <= 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-2 px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Recebimento de R$ {valorNum.toFixed(2)}
            </Button>
          </div>

        </form>

      </div>
    </div>
  );
}
