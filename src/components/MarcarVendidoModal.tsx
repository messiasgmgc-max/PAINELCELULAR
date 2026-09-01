'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ShoppingBag, 
  Package, 
  User, 
  DollarSign, 
  Calendar, 
  CreditCard, 
  CheckCircle2, 
  FileText, 
  Sparkles,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn, getAparelhoCodigo, parseMonetaryValue } from '@/lib/utils';
import { Aparelho } from '@/lib/db/types';

interface MarcarVendidoModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelho: Aparelho | null;
  lojaId: string | null;
  tipoInicial?: 'atacado' | 'varejo';
  onSuccess: () => Promise<void>;
}

const FORMAS_PAGAMENTO = [
  { id: 'pix', label: 'PIX' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao_credito', label: 'Cartão de Crédito' },
  { id: 'cartao_debito', label: 'Cartão de Débito' },
  { id: 'fiado', label: 'A Prazo / Fiado' },
  { id: 'troca', label: 'Troca / Base de Troca' },
];

export function MarcarVendidoModal({
  isOpen,
  onClose,
  aparelho,
  lojaId,
  tipoInicial = 'atacado',
  onSuccess,
}: MarcarVendidoModalProps) {
  const [tipoVenda, setTipoVenda] = useState<'atacado' | 'varejo' | 'manutencao' | 'perda'>('atacado');
  const [comprador, setComprador] = useState('');
  const [valorVenda, setValorVenda] = useState<string>('');
  const [metodoPgto, setMetodoPgto] = useState<string>('pix');
  const [dataVenda, setDataVenda] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [dataVencimento, setDataVencimento] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [compradoresRecentes, setCompradoresRecentes] = useState<string[]>([]);

  // Carrega compradores recentes do localStorage
  useEffect(() => {
    try {
      const salvas = localStorage.getItem('painel_celular_compradores_recentes');
      if (salvas) {
        setCompradoresRecentes(JSON.parse(salvas));
      }
    } catch (e) {}
  }, []);

  // Preenche dados padrão ao abrir para um aparelho
  useEffect(() => {
    if (isOpen && aparelho) {
      const tipo = tipoInicial || ((aparelho as any).precoAtacado ? 'atacado' : 'varejo');
      setTipoVenda(tipo);
      
      const precoPadrao = tipo === 'atacado' 
        ? ((aparelho as any).precoAtacado || aparelho.preco || 0)
        : (aparelho.preco || 0);

      setValorVenda(precoPadrao > 0 ? String(precoPadrao) : '');
      setComprador(aparelho.cliente || '');
      setObservacoes('');
      setDataVenda(new Date().toISOString().split('T')[0]);
      setMetodoPgto('pix');
    }
  }, [isOpen, aparelho, tipoInicial]);

  // Atualiza preço sugerido ao mudar tipo de venda
  const handleTipoVendaChange = (novoTipo: 'atacado' | 'varejo' | 'manutencao' | 'perda') => {
    setTipoVenda(novoTipo);
    if (!aparelho) return;

    if (novoTipo === 'atacado') {
      const precoAtac = (aparelho as any).precoAtacado || aparelho.preco || 0;
      setValorVenda(precoAtac > 0 ? String(precoAtac) : '');
    } else if (novoTipo === 'varejo') {
      setValorVenda(aparelho.preco > 0 ? String(aparelho.preco) : '');
    } else if (novoTipo === 'manutencao' || novoTipo === 'perda') {
      setValorVenda('0');
    }
  };

  const custoNum = aparelho?.custo || 0;
  const valorVendaNum = parseMonetaryValue(valorVenda);
  const lucroNum = valorVendaNum - custoNum;
  const margemPercent = custoNum > 0 ? ((lucroNum / custoNum) * 100).toFixed(1) : '100';

  if (!isOpen || !aparelho) return null;

  const salvarCompradorRecente = (nome: string) => {
    if (!nome || nome.trim().length < 2) return;
    const limpo = nome.trim();
    try {
      const atualizados = [limpo, ...compradoresRecentes.filter(c => c.toLowerCase() !== limpo.toLowerCase())].slice(0, 8);
      setCompradoresRecentes(atualizados);
      localStorage.setItem('painel_celular_compradores_recentes', JSON.stringify(atualizados));
    } catch (e) {}
  };

  const handleConfirmarVenda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aparelho) return;

    if (!comprador.trim() && (tipoVenda === 'atacado' || tipoVenda === 'varejo')) {
      toast.error('Informe o nome do comprador/lojista (ex: "Junior" ou "Cliente Final").');
      return;
    }

    setSalvando(true);
    const toastId = toast.loading('Registrando saída/venda do aparelho...');

    try {
      const compradorFinal = comprador.trim() || (tipoVenda === 'atacado' ? 'Lojista / Revenda' : 'Venda Varejo');
      const dataIso = new Date(dataVenda + 'T12:00:00').toISOString();
      const isFiado = metodoPgto === 'fiado';
      const dataVencIso = (isFiado && dataVencimento) ? new Date(dataVencimento + 'T12:00:00').toISOString() : undefined;

      // Monta tag estruturada de baixa no estoque
      const obsBaixa = [
        `BAIXA_ESTOQUE:${dataIso}:Venda ${tipoVenda.toUpperCase()} para ${compradorFinal} por R$ ${valorVendaNum.toFixed(2)} | Custo: R$ ${custoNum.toFixed(2)} | Lucro: R$ ${lucroNum.toFixed(2)} | Pgto: ${metodoPgto}`,
        observacoes ? `Obs: ${observacoes.trim()}` : '',
        `ID: ${getAparelhoCodigo(aparelho)}`,
        aparelho.imei ? `IMEI: ${aparelho.imei}` : ''
      ].filter(Boolean).join(' | ');

      // 1. Atualiza aparelho no Supabase
      const { error: errAparelho } = await supabase
        .from('aparelhos')
        .update({
          ativo: false,
          condicao: 'vendido',
          status: 'vendido',
          cliente: compradorFinal,
          observacoes: obsBaixa,
        })
        .eq('id', aparelho.id);

      if (errAparelho) throw errAparelho;

      // 2. Insere registro na tabela 'vendas' para alimentar relatórios e gráficos
      const payloadVenda: any = {
        clienteNome: compradorFinal,
        vendedor: 'Sistema',
        tipoEntrega: tipoVenda === 'atacado' ? 'Atacado / Lojista' : 'Varejo',
        valor: valorVendaNum,
        custo: custoNum,
        lucro: lucroNum,
        percentualLucro: parseFloat(margemPercent) || 0,
        dataPagamento: dataIso,
        dataVencimento: dataVencIso,
        status: isFiado ? 'pendente' : 'pago',
        metodo: metodoPgto,
        saldoDevedor: isFiado ? valorVendaNum : 0,
        valorPago: isFiado ? 0 : valorVendaNum,
        historicoAbatimentos: [],
        descricao: `Venda ${tipoVenda.toUpperCase()} - ${aparelho.marca} ${aparelho.modelo} (${aparelho.capacidade || ''} ${aparelho.cor || ''})`,
        garantia: tipoVenda === 'atacado' ? 'Garantia de Atacado (Teste)' : '90 dias',
        descontoTotal: 0,
        itens: [
          {
            id: Date.now().toString(),
            aparelhoId: aparelho.id,
            descricao: `${aparelho.marca} ${aparelho.modelo} - ${aparelho.capacidade || ''} ${aparelho.cor || ''} (IMEI/ID: ${aparelho.imei || getAparelhoCodigo(aparelho)})`,
            quantidade: 1,
            valorInterno: custoNum,
            valorExibir: valorVendaNum,
            desconto: 0,
            tipoDesconto: 'R$',
            total: valorVendaNum,
            observacao: observacoes || `Vendido em ${tipoVenda}`,
          },
        ],
        pagamentos: [
          {
            id: Date.now().toString(),
            metodo: metodoPgto,
            valor: isFiado ? 0 : valorVendaNum,
            parcelas: 1,
          },
        ],
        loja_id: lojaId || null,
        lojaId: lojaId || null,
      };

      await supabase.from('vendas').insert([payloadVenda]);

      salvarCompradorRecente(compradorFinal);

      toast.success(`🎉 Venda de ${aparelho.modelo} registrada com sucesso para ${compradorFinal}!`, { id: toastId, duration: 5000 });
      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao registrar venda:', err);
      toast.error(`Erro ao registrar venda: ${err.message || 'Falha no banco de dados'}`, { id: toastId });
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
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/30">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Marcar como Vendido / Baixa</h3>
              <p className="text-xs text-slate-400">
                Registre o comprador e os detalhes financeiros da saída
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* RESUMO DO APARELHO */}
        <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-white flex items-center gap-2">
              <span>{aparelho.marca} {aparelho.modelo}</span>
              {aparelho.capacidade && <span className="text-xs text-slate-400 font-normal">({aparelho.capacidade})</span>}
            </span>
            <Badge variant="outline" className="text-[10px] bg-slate-900 border-slate-700 text-slate-300">
              ID: {getAparelhoCodigo(aparelho)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            {aparelho.cor && <span>Cor: <strong className="text-slate-200">{aparelho.cor}</strong></span>}
            {aparelho.imei && <span>· IMEI: <strong className="text-slate-200">{aparelho.imei}</strong></span>}
            <span>· Custo: <strong className="text-slate-200">R$ {custoNum.toFixed(2).replace('.', ',')}</strong></span>
          </div>
        </div>

        <form onSubmit={handleConfirmarVenda} className="space-y-4 pt-1">
          
          {/* SELETOR DO TIPO DE SAÍDA */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Tipo de Saída / Venda *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTipoVendaChange('atacado')}
                className={cn(
                  "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer",
                  tipoVenda === 'atacado'
                    ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-950/30"
                    : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                )}
              >
                <Package className="w-4 h-4" /> Venda Atacado (Lojista)
              </button>

              <button
                type="button"
                onClick={() => handleTipoVendaChange('varejo')}
                className={cn(
                  "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer",
                  tipoVenda === 'varejo'
                    ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-950/30"
                    : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                )}
              >
                <User className="w-4 h-4" /> Venda Varejo (Cliente)
              </button>
            </div>
          </div>

          {/* COMPRADOR / DESTINATÁRIO */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">
                {tipoVenda === 'atacado' ? 'Nome do Lojista / Comprador *' : 'Nome do Cliente / Comprador *'}
              </label>
              <span className="text-[10px] text-slate-400">Ex: "Junior", "Tech Cell"</span>
            </div>

            <input
              type="text"
              placeholder={tipoVenda === 'atacado' ? 'Digite o nome do lojista (ex: Junior)' : 'Digite o nome do cliente'}
              value={comprador}
              onChange={(e) => setComprador(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 outline-none"
              required
            />

            {/* CHIPS DE COMPRADORES RECENTES */}
            {compradoresRecentes.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] text-slate-500">Recentes:</span>
                {compradoresRecentes.map((rec) => (
                  <button
                    key={rec}
                    type="button"
                    onClick={() => setComprador(rec)}
                    className="text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 px-2 py-0.5 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                  >
                    {rec}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* VALOR DA VENDA E FORMA DE PAGAMENTO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Valor Negociado (R$) *</label>
              <input
                type="text"
                placeholder="0,00"
                value={valorVenda}
                onChange={(e) => setValorVenda(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-bold font-mono placeholder:text-slate-500 focus:border-emerald-500 outline-none"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Forma de Pagamento</label>
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
          </div>

          {/* PREVISÃO DE PAGAMENTO / VENCIMENTO SE FOR FIADO */}
          {metodoPgto === 'fiado' && (
            <div className="space-y-1 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-2xl">
              <label className="text-xs font-bold text-amber-400">
                📅 Data Prevista de Pagamento / Vencimento
              </label>
              <input
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-slate-400">
                Utilizada para sinalizar fiados em atraso e calcular juros no extrato de cobrança.
              </p>
            </div>
          )}

          {/* CARD DE LUCRO EM TEMPO REAL */}
          <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <TrendingUp className={cn("w-4 h-4", lucroNum >= 0 ? "text-emerald-400" : "text-rose-400")} />
              <span className="text-slate-400 font-semibold">Lucro Estimado:</span>
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

          {/* DATA E OBSERVAÇÕES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Data da Venda</label>
              <input
                type="date"
                value={dataVenda}
                onChange={(e) => setDataVenda(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Observação / Garantia</label>
              <input
                type="text"
                placeholder="Ex: Garantia 30 dias, motoboy..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-emerald-500"
              />
            </div>
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
              disabled={salvando}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-2 px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" /> Confirmar Venda ({tipoVenda === 'atacado' ? 'Atacado' : 'Varejo'})
            </Button>
          </div>

        </form>

      </div>
    </div>
  );
}
