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
import { cn, getAparelhoCodigo, parseMonetaryValue, obterDataHoraVenda } from '@/lib/utils';
import { CompradorAutocomplete } from '@/components/CompradorAutocomplete';
import { useCompradores } from '@/hooks/useCompradores';

export interface VendaEditavelData {
  id?: string;
  vendaId?: string;
  aparelhoId?: string;
  data: string;
  dataVencimento?: string;
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
  const [dataVencimento, setDataVencimento] = useState('');
  const [metodoPgto, setMetodoPgto] = useState('pix');
  const [tipoVenda, setTipoVenda] = useState('Atacado');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { compradores, buscarCompradores, upsertComprador } = useCompradores(lojaId);

  // Preenche dados ao abrir
  useEffect(() => {
    if (isOpen && venda) {
      setComprador(venda.comprador || '');
      setValorVenda(venda.valorVenda ? String(venda.valorVenda) : '0');
      setCusto(venda.custo ? String(venda.custo) : '0');
      
      const d = venda.data ? new Date(venda.data) : new Date();
      setDataVenda(!isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
      
      const rawVenc = venda.dataVencimento || (venda.raw && (venda.raw.dataVencimento || venda.raw.data_vencimento));
      if (rawVenc) {
        const dV = new Date(rawVenc);
        setDataVencimento(!isNaN(dV.getTime()) ? dV.toISOString().split('T')[0] : '');
      } else {
        setDataVencimento('');
      }

      setMetodoPgto(venda.metodoPgto || 'pix');
      setTipoVenda(venda.tipoVenda || (venda.modelo ? 'Atacado' : 'Varejo'));
      setObservacoes(venda.observacoes || '');
    }
  }, [isOpen, venda]);

  const valorVendaNum = parseMonetaryValue(valorVenda);
  const custoNum = parseMonetaryValue(custo);
  const lucroNum = valorVendaNum - custoNum;
  const margemPercent = custoNum > 0 ? ((lucroNum / custoNum) * 100).toFixed(1) : '100';

  if (!isOpen || !venda) return null;

  const handleSalvarAlteracoes = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    const toastId = toast.loading('Salvando alterações do registro...');

    try {
      const compradorFinal = comprador.trim() || 'Comprador / Lojista';
      const dataIso = obterDataHoraVenda(dataVenda);

      // 1. Se tem aparelhoId vinculado, atualiza o aparelho na tabela 'aparelhos'
      if (venda.aparelhoId) {
        const { data: aparAtual } = await supabase
          .from('aparelhos')
          .select('observacoes')
          .eq('id', venda.aparelhoId)
          .maybeSingle();

        const obsBase = String(aparAtual?.observacoes || '')
          .replace(/BAIXA_ESTOQUE:[^\n|]+(?:\|\s*)?/gi, '')
          .replace(/Venda (?:ATACADO|VAREJO)[^\n|]*(?:\|\s*)?/gi, '')
          .replace(/Comprador:[^\n|]*(?:\|\s*)?/gi, '')
          .replace(/Valor:[^\n|]*(?:\|\s*)?/gi, '')
          .replace(/Custo:[^\n|]*(?:\|\s*)?/gi, '')
          .replace(/Lucro:[^\n|]*(?:\|\s*)?/gi, '')
          .replace(/Pgto:[^\n|]*(?:\|\s*)?/gi, '')
          .trim();

        const obsBaixa = [
          `BAIXA_ESTOQUE:${dataIso}:Venda ${tipoVenda.toUpperCase()} para ${compradorFinal} por R$ ${valorVendaNum.toFixed(2)} | Valor: R$ ${valorVendaNum.toFixed(2)} | Comprador: ${compradorFinal} | Custo: R$ ${custoNum.toFixed(2)} | Lucro: R$ ${lucroNum.toFixed(2)} | Pgto: ${metodoPgto}`,
          observacoes ? `Obs: ${observacoes.trim()}` : '',
          venda.codigo ? `ID: ${venda.codigo}` : '',
          venda.imei ? `IMEI: ${venda.imei}` : '',
          obsBase ? `Obs: ${obsBase}` : ''
        ].filter(Boolean).join(' | ');

        const { error: errAparelho } = await supabase
          .from('aparelhos')
          .update({
            preco: valorVendaNum,
            preco_atacado: valorVendaNum,
            custo: custoNum,
            cliente: compradorFinal,
            observacoes: obsBaixa,
          })
          .eq('id', venda.aparelhoId);

        if (errAparelho) console.error('Erro ao atualizar aparelho:', errAparelho);
      }

      // 2. Se tem vendaId ou id correspondente na tabela 'vendas', atualiza a venda
      const isValidUUID = (id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      
      // Se vendaId veio explicitamente ou se venda.id não for o aparelhoId
      let idParaVenda = isValidUUID(venda.vendaId) ? venda.vendaId : null;
      if (!idParaVenda && isValidUUID(venda.id) && venda.id !== venda.aparelhoId) {
        idParaVenda = venda.id;
      }

      const dataVencIso = dataVencimento ? new Date(dataVencimento + 'T12:00:00').toISOString() : null;

      // Se ainda não temos idParaVenda e temos aparelhoId, busca na tabela 'vendas'
      if (!idParaVenda && venda.aparelhoId) {
        const { data: vendasExistentes } = await supabase
          .from('vendas')
          .select('id, itens, valorPago, saldoDevedor, status, aparelhoId')
          .order('created_at', { ascending: false })
          .limit(500);

        const vendaEncontrada = vendasExistentes?.find((v: any) => 
          (v.itens && Array.isArray(v.itens) && v.itens.some((it: any) => it.aparelhoId === venda.aparelhoId)) ||
          (v as any).aparelhoId === venda.aparelhoId
        );

        if (vendaEncontrada && isValidUUID(vendaEncontrada.id)) {
          idParaVenda = vendaEncontrada.id;
          if (venda.valorPago === undefined) {
            venda.valorPago = vendaEncontrada.valorPago;
          }
        }
      }

      if (idParaVenda) {
        // Recalcula o saldo devedor e status para que baixas de fiado fiquem milimétricas
        const valorPagoAtual = Number(venda.valorPago || 0);
        let novoSaldoDevedor = 0;
        let novoStatus = 'pago';

        if (metodoPgto === 'fiado' || venda.metodo === 'fiado' || venda.status === 'pendente' || venda.status === 'parcial') {
          novoSaldoDevedor = Math.max(0, valorVendaNum - valorPagoAtual);
          novoStatus = novoSaldoDevedor <= 0.01 ? 'pago' : (valorPagoAtual > 0 ? 'parcial' : 'pendente');
        } else {
          novoSaldoDevedor = 0;
          novoStatus = 'pago';
        }

        const payloadVendaUpdate: any = {
          clienteNome: compradorFinal,
          valor: valorVendaNum,
          saldoDevedor: novoSaldoDevedor,
          status: novoStatus,
          custo: custoNum,
          lucro: lucroNum,
          percentualLucro: parseFloat(margemPercent) || 0,
          dataPagamento: dataIso,
          dataVencimento: dataVencIso,
          metodo: metodoPgto,
          tipoEntrega: tipoVenda,
          descricao: `Venda ${tipoVenda.toUpperCase()} - ${venda.modelo || ''} para ${compradorFinal}`,
          dados_cliente_pendente: false,
        };

        // Busca itens atuais da venda no banco se venda.itens não estiver populado
        let itensParaAtualizar = venda.itens;
        if (!itensParaAtualizar || !Array.isArray(itensParaAtualizar) || itensParaAtualizar.length === 0) {
          const { data: dbVenda } = await supabase
            .from('vendas')
            .select('itens')
            .eq('id', idParaVenda)
            .maybeSingle();
          if (dbVenda?.itens && Array.isArray(dbVenda.itens)) {
            itensParaAtualizar = dbVenda.itens;
          }
        }

        if (itensParaAtualizar && Array.isArray(itensParaAtualizar) && itensParaAtualizar.length > 0) {
          payloadVendaUpdate.itens = itensParaAtualizar.map((it: any, idx: number) => {
            if (idx === 0 || (venda.aparelhoId && it.aparelhoId === venda.aparelhoId)) {
              return {
                ...it,
                total: valorVendaNum,
                valorExibir: valorVendaNum,
                valorUnitario: valorVendaNum,
                custoUnitario: custoNum,
                lucroUnitario: lucroNum,
              };
            }
            return it;
          });
        }

        if (metodoPgto !== 'fiado') {
          payloadVendaUpdate.pagamentos = [
            {
              id: Date.now().toString(),
              metodo: metodoPgto,
              valor: valorVendaNum,
              parcelas: 1,
            }
          ];
        }

        const { error: errVenda } = await supabase
          .from('vendas')
          .update(payloadVendaUpdate)
          .eq('id', idParaVenda);

        if (errVenda) {
          console.error('Erro ao atualizar registro de venda:', errVenda);
          throw errVenda;
        }
      } else {
        // Se a venda ainda não estava na tabela 'vendas' (ex: venda antiga originada apenas em aparelhos),
        // cria o registro correspondente no banco para manter a integridade
        const valorPagoAtual = Number(venda.valorPago || 0);
        let novoSaldoDevedor = 0;
        let novoStatus = 'pago';

        if (metodoPgto === 'fiado' || venda.metodo === 'fiado' || venda.status === 'pendente' || venda.status === 'parcial') {
          novoSaldoDevedor = Math.max(0, valorVendaNum - valorPagoAtual);
          novoStatus = novoSaldoDevedor <= 0.01 ? 'pago' : (valorPagoAtual > 0 ? 'parcial' : 'pendente');
        }

        const payloadVendaInsert: any = {
          loja_id: lojaId || undefined,
          aparelhoId: venda.aparelhoId || undefined,
          clienteNome: compradorFinal,
          valor: valorVendaNum,
          valorPago: valorPagoAtual,
          saldoDevedor: novoSaldoDevedor,
          status: novoStatus,
          custo: custoNum,
          lucro: lucroNum,
          percentualLucro: parseFloat(margemPercent) || 0,
          dataPagamento: dataIso,
          dataVencimento: dataVencIso,
          metodo: metodoPgto,
          tipoEntrega: tipoVenda,
          descricao: `Venda ${tipoVenda.toUpperCase()} - ${venda.modelo || ''} para ${compradorFinal}`,
          itens: [
            {
              aparelhoId: venda.aparelhoId,
              modelo: venda.modelo || 'Aparelho',
              marca: venda.marca || 'Apple',
              imei: venda.imei || '',
              valorUnitario: valorVendaNum,
              total: valorVendaNum,
              valorExibir: valorVendaNum,
              custoUnitario: custoNum,
              lucroUnitario: lucroNum,
              tipoVenda: tipoVenda.toLowerCase(),
            }
          ]
        };

        const { error: errInsert } = await supabase
          .from('vendas')
          .insert([payloadVendaInsert]);

        if (errInsert) {
          console.error('Erro ao inserir registro de venda ao editar:', errInsert);
          throw errInsert;
        }
      }

      await upsertComprador(compradorFinal, tipoVenda.toLowerCase().includes('atacado') ? 'lojista' : 'cliente');

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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto my-auto">
        
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
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                Comprador / Lojista / Cliente *
              </label>
              <span className="text-[10px] text-cyan-400 font-medium">💡 Busca inteligente salva no banco</span>
            </div>
            <CompradorAutocomplete
              value={comprador}
              onChange={setComprador}
              compradores={compradores}
              onBuscar={(termo) => buscarCompradores(termo, tipoVenda.toLowerCase().includes('atacado') ? 'lojista' : undefined)}
              tipo={tipoVenda.toLowerCase().includes('atacado') ? 'lojista' : 'todos'}
              placeholder="Buscar ou digitar nome..."
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

          {/* DATA DE VENCIMENTO / PREVISÃO (QUANDO FOR FIADO) */}
          {metodoPgto === 'fiado' && (
            <div className="space-y-1 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-2xl">
              <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Data de Vencimento / Previsão de Pagamento
              </label>
              <input
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-slate-400">
                Se passar desta data, o sistema indicará atraso e calculará juros automaticamente no extrato.
              </p>
            </div>
          )}

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
