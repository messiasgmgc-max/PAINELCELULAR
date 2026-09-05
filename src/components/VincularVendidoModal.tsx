'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, 
  Link2, 
  Smartphone, 
  User, 
  DollarSign, 
  CheckCircle2, 
  Search, 
  Calendar,
  CreditCard,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn, getAparelhoCodigo, obterDataHoraVenda } from '@/lib/utils';
import { Aparelho, Cliente } from '@/lib/db/types';
import { CompradorAutocomplete } from '@/components/CompradorAutocomplete';
import { useCompradores } from '@/hooks/useCompradores';

interface VincularVendidoModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelhos: Aparelho[];
  clientes: Cliente[];
  lojaId: string | null;
  onSuccess: () => Promise<void>;
  onEmitirNotinha?: (venda: any) => void;
}

export function VincularVendidoModal({
  isOpen,
  onClose,
  aparelhos,
  clientes,
  lojaId,
  onSuccess,
  onEmitirNotinha,
}: VincularVendidoModalProps) {
  const [buscaAparelho, setBuscaAparelho] = useState('');
  const [aparelhoSelecionadoId, setAparelhoSelecionadoId] = useState<string>('');
  const [clienteId, setClienteId] = useState<string>('');
  const [clienteNome, setClienteNome] = useState<string>('');
  const [valorVenda, setValorVenda] = useState<string>('');
  const [metodoPgto, setMetodoPgto] = useState<string>('pix');
  const [dataVenda, setDataVenda] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { compradores, buscarCompradores, upsertComprador } = useCompradores(lojaId);

  // Lista de aparelhos com status vendido ou inativo (que foram dados baixa)
  const aparelhosVendidos = useMemo(() => {
    return aparelhos.filter(a => a.ativo === false || a.condicao === 'vendido' || (a as any).status === 'vendido');
  }, [aparelhos]);

  const filtrados = useMemo(() => {
    if (!buscaAparelho.trim()) return aparelhosVendidos.slice(0, 30);
    const termo = buscaAparelho.toLowerCase();
    return aparelhosVendidos.filter(a => {
      const id = getAparelhoCodigo(a).toLowerCase();
      const imei = (a.imei || a.numeroSerie || '').toLowerCase();
      const mod = `${a.marca} ${a.modelo}`.toLowerCase();
      const cli = (a.cliente || '').toLowerCase();
      return id.includes(termo) || imei.includes(termo) || mod.includes(termo) || cli.includes(termo);
    }).slice(0, 30);
  }, [aparelhosVendidos, buscaAparelho]);

  const aparelhoSelecionado = useMemo(() => {
    return aparelhos.find(a => a.id === aparelhoSelecionadoId) || null;
  }, [aparelhos, aparelhoSelecionadoId]);

  // Ao selecionar aparelho, preenche preço sugerido
  const handleSelecionarAparelho = (ap: Aparelho) => {
    setAparelhoSelecionadoId(ap.id);
    setValorVenda(String(ap.preco || 0));
    if (ap.cliente && !ap.cliente.toLowerCase().includes('cliente final') && !ap.cliente.toLowerCase().includes('lojista')) {
      setClienteNome(ap.cliente);
      const cExist = clientes.find(c => c.nome.toLowerCase() === ap.cliente!.toLowerCase());
      if (cExist) setClienteId(cExist.id);
    }
  };

  const handleClienteChange = (nome: string) => {
    setClienteNome(nome);
    const match = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase());
    if (match) {
      setClienteId(match.id);
    } else {
      setClienteId('');
    }
  };

  const handleConfirmarVinculo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aparelhoSelecionado) {
      toast.error('Selecione um aparelho vendido na lista.');
      return;
    }
    if (!clienteNome.trim()) {
      toast.error('Informe o nome do cliente para a notinha.');
      return;
    }

    setSalvando(true);
    const toastId = toast.loading('Vinculando aparelho ao cliente e gerando venda...');

    try {
      const valorNum = parseFloat(valorVenda.replace(/[^\d,.]/g, '').replace(',', '.')) || 0;
      const custoNum = aparelhoSelecionado.custo || 0;
      const lucroNum = valorNum - custoNum;
      const dataIso = obterDataHoraVenda(dataVenda);

      // 1. Atualiza cliente na tabela de aparelhos
      await supabase
        .from('aparelhos')
        .update({
          cliente: clienteNome.trim(),
          clienteId: clienteId || null,
        })
        .eq('id', aparelhoSelecionado.id);

      // 2. Cria ou atualiza venda vinculada
      const novaVenda: any = {
        clienteId: clienteId || null,
        clienteNome: clienteNome.trim(),
        vendedor: 'Sistema',
        tipoEntrega: 'Varejo',
        valor: valorNum,
        custo: custoNum,
        lucro: lucroNum,
        percentualLucro: valorNum > 0 ? (lucroNum / valorNum) * 100 : 0,
        dataPagamento: dataIso,
        status: 'pago',
        metodo: metodoPgto,
        saldoDevedor: 0,
        valorPago: valorNum,
        descricao: `Venda VAREJO - ${aparelhoSelecionado.marca} ${aparelhoSelecionado.modelo} para ${clienteNome.trim()}`,
        garantia: '90 dias',
        descontoTotal: 0,
        dados_cliente_pendente: false,
        itens: [
          {
            id: Date.now().toString(),
            aparelhoId: aparelhoSelecionado.id,
            descricao: `${aparelhoSelecionado.marca} ${aparelhoSelecionado.modelo} - ${aparelhoSelecionado.capacidade || ''} ${aparelhoSelecionado.cor || ''} (ID: ${getAparelhoCodigo(aparelhoSelecionado)})`,
            quantidade: 1,
            valorInterno: custoNum,
            valorExibir: valorNum,
            desconto: 0,
            tipoDesconto: 'R$',
            total: valorNum,
            observacao: observacoes || 'Venda vinculada retroativamente',
          }
        ],
        pagamentos: [
          {
            id: Date.now().toString(),
            metodo: metodoPgto,
            valor: valorNum,
            parcelas: 1,
          }
        ],
        loja_id: lojaId || null,
        lojaId: lojaId || null,
      };

      const { data: vendaInserida, error: errVenda } = await supabase
        .from('vendas')
        .insert([novaVenda])
        .select()
        .single();

      if (errVenda) {
        console.warn('Fallback inserção:', errVenda);
        const { lojaId: _l, ...comp } = novaVenda;
        await supabase.from('vendas').insert([comp]);
      }

      await upsertComprador(clienteNome.trim(), 'cliente');

      toast.success(`🎉 ${aparelhoSelecionado.modelo} vinculado a ${clienteNome.trim()} com sucesso!`, { id: toastId });
      await onSuccess();

      if (onEmitirNotinha && vendaInserida) {
        onEmitirNotinha(vendaInserida);
      }

      onClose();
    } catch (err: any) {
      console.error('Erro ao vincular venda:', err);
      toast.error(`Erro ao vincular: ${err.message || 'Falha no banco'}`, { id: toastId });
    } finally {
      setSalvando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto my-auto">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Vincular Aparelho Já Vendido</h3>
              <p className="text-xs text-slate-400">
                Selecione um aparelho já baixado do estoque para vincular ao cliente e emitir a notinha
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleConfirmarVinculo} className="space-y-4">
          
          {/* PASSO 1: ESCOLHER O APARELHO VENDIDO */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              1. Selecione o aparelho vendido sem cliente ({aparelhosVendidos.length} disponíveis):
            </label>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar por modelo, IMEI ou ID (ex: 15, 8665041)..."
                value={buscaAparelho}
                onChange={(e) => setBuscaAparelho(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500"
              />
            </div>

            <div className="max-h-44 overflow-y-auto space-y-1 p-1 bg-slate-950 rounded-xl border border-slate-800 scrollbar-thin">
              {filtrados.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  Nenhum aparelho vendido encontrado.
                </div>
              ) : (
                filtrados.map((ap) => {
                  const isSel = ap.id === aparelhoSelecionadoId;
                  return (
                    <div
                      key={ap.id}
                      onClick={() => handleSelecionarAparelho(ap)}
                      className={cn(
                        "p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors",
                        isSel 
                          ? "bg-cyan-500/20 border-cyan-500/50 text-white font-bold"
                          : "bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-white">{ap.marca} {ap.modelo}</span>
                          {ap.capacidade && <span className="text-slate-400 text-[11px]">({ap.capacidade})</span>}
                          {ap.cor && <span className="text-slate-400 text-[11px]">· {ap.cor}</span>}
                          <Badge variant="outline" className="text-[10px] py-0 bg-slate-950 border-slate-700 text-slate-400">
                            ID: {getAparelhoCodigo(ap)}
                          </Badge>
                          {ap.imei && (
                            <span className="text-[10px] font-mono text-emerald-400">IMEI: {ap.imei}</span>
                          )}
                        </div>
                        {ap.cliente && (
                          <span className="text-[10px] text-amber-400/80 block mt-0.5">
                            Status anterior: {ap.cliente}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-emerald-400 shrink-0 font-mono">
                        R$ {(ap.preco || 0).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* PASSO 2: DADOS DO CLIENTE E NOTINHA */}
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              2. Dados do Cliente para a Notinha
            </span>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-400">Nome do Cliente *</label>
                <span className="text-[10px] text-cyan-400">💡 Busca inteligente no banco</span>
              </div>
              <CompradorAutocomplete
                value={clienteNome}
                onChange={handleClienteChange}
                compradores={compradores}
                onBuscar={(t) => buscarCompradores(t, 'cliente')}
                tipo="cliente"
                placeholder="Digite o nome do cliente (ex: João Silva)..."
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Valor da Venda (R$) *</label>
                <input
                  type="text"
                  value={valorVenda}
                  onChange={(e) => setValorVenda(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Forma de Pagamento</label>
                <select
                  value={metodoPgto}
                  onChange={(e) => setMetodoPgto(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                >
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="troca">Troca</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Data da Venda</label>
                <input
                  type="date"
                  value={dataVenda}
                  onChange={(e) => setDataVenda(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* BOTÕES */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
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
              disabled={salvando || !aparelhoSelecionadoId}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs gap-1.5 h-9 px-4 rounded-xl cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              <CheckCircle2 className="w-4 h-4" /> Vincular & Liberar Notinha
            </Button>
          </div>

        </form>

      </div>
    </div>
  );
}
