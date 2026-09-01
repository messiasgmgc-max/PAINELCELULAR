'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Edit2, 
  DollarSign, 
  Calendar, 
  User, 
  CreditCard, 
  CheckCircle2, 
  TrendingUp, 
  AlertCircle,
  Package,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn, getAparelhoCodigo } from '@/lib/utils';

export interface VendaEditavelData {
  id?: string;
  vendaId?: string;
  aparelhoId?: string;
  data: string;
  comprador: string;
  modelo?: string;
  marca?: string;
  capacidade?: string;
  cor?: string;
  imei?: string;
  codigo?: string;
  valorVenda: number;
  custo: number;
  metodoPgto?: string;
  tipoVenda?: string;
  observacoes?: string;
  raw?: any;
}

interface EditarVendaRegistroModalProps {
  isOpen: boolean;
  onClose: () => void;
  venda: VendaEditavelData | null;
  lojaId: string | null;
  onSuccess: () => Promise<void>;
}

const FORMAS_PAGAMENTO = [
  { id: 'pix', label: 'PIX' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao_credito', label: 'Cartão de Crédito' },
  { id: 'cartao_debito', label: 'Cartão de Débito' },
  { id: 'fiado', label: 'A Prazo / Fiado' },
  { id: 'boleto', label: 'Boleto' },
];

export function EditarVendaRegistroModal({
  isOpen,
  onClose,
  venda,
  lojaId,
  onSuccess,
}: EditarVendaRegistroModalProps) {
  const [comprador, setComprador] = useState('');
  const [valorVenda, setValorVenda] = useState('');
  const [custo, setCusto] = useState('');
  const [dataVenda, setDataVenda] = useState('');
  const [metodoPgto, setMetodoPgto] = useState('pix');
  const [tipoVenda, setTipoVenda] = useState('Atacado');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Preenche dados ao abrir
  useEffect(() => {
    if (isOpen && venda) {
      setComprador(venda.comprador || '');
      setValorVenda(venda.valorVenda ? String(venda.valorVenda) : '0');
      setCusto(venda.custo ? String(venda.custo) : '0');
      
      const d = venda.data ? new Date(venda.data) : new Date();
      setDataVenda(!isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
      
      setMetodoPgto(venda.metodoPgto || 'pix');
      setTipoVenda(venda.tipoVenda || (venda.modelo ? 'Atacado' : 'Varejo'));
      setObservacoes(venda.observacoes || '');
    }
  }, [isOpen, venda]);

  const valorVendaNum = parseFloat(valorVenda.replace(/[^\d,.]/g, '').replace(',', '.')) || 0;
  const custoNum = parseFloat(custo.replace(/[^\d,.]/g, '').replace(',', '.')) || 0;
  const lucroNum = valorVendaNum - custoNum;
  const margemPercent = custoNum > 0 ? ((lucroNum / custoNum) * 100).toFixed(1) : '100';

  if (!isOpen || !venda) return null;

  const handleSalvarAlteracoes = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    const toastId = toast.loading('Salvando alterações do registro...');

    try {
      const compradorFinal = comprador.trim() || 'Comprador / Lojista';
      const dataIso = new Date(dataVenda + 'T12:00:00').toISOString();

      // 1. Se tem aparelhoId vinculado, atualiza o aparelho na tabela 'aparelhos'
      if (venda.aparelhoId) {
        const obsBaixa = [
          `BAIXA_ESTOQUE:${dataIso}:Venda ${tipoVenda.toUpperCase()} para ${compradorFinal} por R$ ${valorVendaNum.toFixed(2)} | Custo: R$ ${custoNum.toFixed(2)} | Lucro: R$ ${lucroNum.toFixed(2)} | Pgto: ${metodoPgto}`,
          observacoes ? `Obs: ${observacoes.trim()}` : '',
          venda.codigo ? `ID: ${venda.codigo}` : '',
          venda.imei ? `IMEI: ${venda.imei}` : ''
        ].filter(Boolean).join(' | ');

        const { error: errAparelho } = await supabase
          .from('aparelhos')
          .update({
            custo: custoNum,
            cliente: compradorFinal,
            observacoes: obsBaixa,
          })
          .eq('id', venda.aparelhoId);

        if (errAparelho) console.error('Erro ao atualizar aparelho:', errAparelho);
      }

      // 2. Se tem vendaId ou id correspondente na tabela 'vendas', atualiza a venda
      const idParaVenda = venda.vendaId || (venda.id && !venda.id.startsWith('venda_') ? venda.id : null);
      
      if (idParaVenda) {
        const payloadVendaUpdate: any = {
          clienteNome: compradorFinal,
          valor: valorVendaNum,
          custo: custoNum,
          lucro: lucroNum,
          percentualLucro: parseFloat(margemPercent) || 0,
          dataPagamento: dataIso,
          metodo: metodoPgto,
          tipoEntrega: tipoVenda,
          descricao: `Venda ${tipoVenda.toUpperCase()} - ${venda.modelo || ''} para ${compradorFinal}`,
        };

        const { error: errVenda } = await supabase
          .from('vendas')
          .update(payloadVendaUpdate)
          .eq('id', idParaVenda);

        if (errVenda) console.error('Erro ao atualizar registro de venda:', errVenda);
      } else if (venda.aparelhoId) {
        // Tenta encontrar a venda vinculada por aparelhoId no json de itens
        const { data: vendasExistentes } = await supabase
          .from('vendas')
          .select('id, itens')
          .limit(200);

        if (vendasExistentes) {
          const vendaEncontrada = vendasExistentes.find(v => 
            v.itens && Array.isArray(v.itens) && v.itens.some((it: any) => it.aparelhoId === venda.aparelhoId)
          );

          if (vendaEncontrada) {
            await supabase
              .from('vendas')
              .update({
                clienteNome: compradorFinal,
                valor: valorVendaNum,
                custo: custoNum,
                lucro: lucroNum,
                percentualLucro: parseFloat(margemPercent) || 0,
                dataPagamento: dataIso,
                metodo: metodoPgto,
              })
              .eq('id', vendaEncontrada.id);
          }
        }
      }

      toast.success('✅ Registro de venda e custos atualizados com sucesso!', { id: toastId });
      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao editar registro:', err);
      toast.error(`Erro ao salvar: ${err.message || 'Falha no banco'}`, { id: toastId });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-white my-auto shrink-0 relative">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Editar Registro de Venda & Custos</h3>
              <p className="text-xs text-slate-400">
                Ajuste datas, insira custos retroativos ou altere valores e comprador
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* RESUMO DO ITEM / APARELHO */}
        {venda.modelo && (
          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white">
                {venda.marca || ''} {venda.modelo}
                {venda.capacidade && <span className="text-xs text-slate-400 font-normal"> ({venda.capacidade})</span>}
                {venda.cor && <span className="text-xs text-slate-400 font-normal"> · {venda.cor}</span>}
              </span>
              <Badge variant="outline" className="text-[10px] bg-slate-900 border-slate-700 text-slate-300">
                ID: {venda.codigo || venda.imei || '-'}
              </Badge>
            </div>
          </div>
        )}

        <form onSubmit={handleSalvarAlteracoes} className="space-y-3.5 pt-1">
          
          {/* COMPRADOR / LOJISTA */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-400" />
              Comprador / Lojista / Cliente *
            </label>
            <input
              type="text"
              placeholder="Ex: Junior, Tech Imports..."
              value={comprador}
              onChange={(e) => setComprador(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold placeholder:text-slate-500 focus:border-amber-500 outline-none"
              required
            />
          </div>

          {/* VALOR DA VENDA E CUSTO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Valor da Venda (R$) *
              </label>
              <input
                type="text"
                placeholder="0,00"
                value={valorVenda}
                onChange={(e) => setValorVenda(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:border-emerald-500 outline-none"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                Custo do Produto (R$) *
              </label>
              <input
                type="text"
                placeholder="0,00"
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:border-amber-500 outline-none"
                required
              />
            </div>
          </div>

          {/* RECÁLCULO DO LUCRO EM TEMPO REAL */}
          <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <TrendingUp className={cn("w-4 h-4", lucroNum >= 0 ? "text-emerald-400" : "text-rose-400")} />
              <span className="text-slate-400 font-semibold">Lucro Recalculado:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("font-mono font-bold text-sm", lucroNum >= 0 ? "text-emerald-400" : "text-rose-400")}>
                R$ {lucroNum.toFixed(2).replace('.', ',')}
              </span>
              <Badge className={cn("text-[10px]", lucroNum >= 0 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border-rose-500/30")}>
                {margemPercent}% margem
              </Badge>
            </div>
          </div>

          {/* DATA DA VENDA E FORMA DE PAGAMENTO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                Data da Venda
              </label>
              <input
                type="date"
                value={dataVenda}
                onChange={(e) => setDataVenda(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-purple-400" />
                Pagamento
              </label>
              <select
                value={metodoPgto}
                onChange={(e) => setMetodoPgto(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 cursor-pointer"
              >
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* OBSERVAÇÕES */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">Observações / Notas</label>
            <input
              type="text"
              placeholder="Ex: Custo registrado posteriormente, garantia..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-amber-500"
            />
          </div>

          {/* BOTÕES INFERIORES */}
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
              disabled={salvando}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-2 px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Salvar Alterações
            </Button>
          </div>

        </form>

      </div>
    </div>
  );
}
