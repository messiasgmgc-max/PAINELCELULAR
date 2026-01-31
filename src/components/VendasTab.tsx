'use client';

import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Calendar, Plus, Search, X, Printer, ShoppingCart, User, Truck, CreditCard, Trash2, Save, Ban, MessageCircle } from 'lucide-react';
import { useClientes } from '@/hooks/useClientes';
import { useAparelhos } from '@/hooks/useAparelhos';
import { useTecnicos } from '@/hooks/useTecnicos';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { Venda, VendaItem } from '@/lib/db/types';

interface VendasPorPeriodo {
  periodo: string;
  total: number;
  custo: number;
  lucro: number;
  quantidade: number;
}

export function VendasTab() {
  const { usuario } = useAuth();
  const { clientes, fetchClientes, criarCliente } = useClientes();
  const { aparelhos, fetchAparelhos, criarAparelho } = useAparelhos();
  const { tecnicos, fetchTecnicos } = useTecnicos();

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [vendasPorPeriodo, setVendasPorPeriodo] = useState<VendasPorPeriodo[]>([]);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [filtroMetodo, setFiltroMetodo] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showPOS, setShowPOS] = useState(false);
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [showNovoAparelho, setShowNovoAparelho] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Estados do PDV
  const [posDados, setPosDados] = useState({
    tipoVenda: 'Venda',
    clienteId: '',
    clienteNome: '',
    vendedor: '',
    tipoEntrega: 'Retirada',
    dataVenda: new Date().toISOString().split('T')[0],
  });

  const [posItem, setPosItem] = useState<Partial<VendaItem>>({
    quantidade: 1,
    valorInterno: 0,
    valorExibir: 0,
    desconto: 0,
    tipoDesconto: 'R$',
    observacao: ''
  });

  const [carrinho, setCart] = useState<VendaItem[]>([]);
  const [posPagamento, setPosPagamento] = useState({
    metodo: 'dinheiro' as const,
    parcelas: 1,
    detalhes: '',
    valorPago: 0,
    usarCredito: false,
    credito: 0,
    status: 'pago' as const,
    garantia: '90 dias',
    descontoGlobal: 0,
    tipoDescontoGlobal: 'R$' as 'R$' | '%'
  });

  // Estados legados para compatibilidade (se necessário) ou removidos
  /* const [formData, setFormData] = useState({
    aparelhoId: '',
    aparelhoDescricao: '',
    valor: 0,
    custo: 0,
    dataPagamento: new Date().toISOString().split('T')[0],
    status: 'pago' as const,
    metodo: 'dinheiro' as const,
    descricao: '',
    garantia: '90 dias',
  }); */

  // Estados para formulários rápidos
  const [novoClienteData, setNovoClienteData] = useState({ nome: '', email: '', telefone: '', cpf: '' });
  const [novoAparelhoData, setNovoAparelhoData] = useState({ marca: '', modelo: '', imei: '', preco: '', condicao: 'seminovo' as const });

  useEffect(() => {
    if (usuario?.lojaId) {
      carregarVendas();
    }
    fetchClientes();
    fetchAparelhos();
    fetchTecnicos();
  }, [usuario?.lojaId]);

  const carregarVendas = async () => {
    if (!usuario?.lojaId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vendas')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .order('dataPagamento', { ascending: false });
      
      if (error) throw error;
      const vendasData = data || [];
      setVendas(vendasData);
      calcularVendasPorPeriodo(vendasData);
    } catch (error) {
      console.error('Erro ao carregar vendas:', error);
    } finally {
      setLoading(false);
    }
  };

  const calcularVendasPorPeriodo = (vendas: Venda[]) => {
    const mapa: { [key: string]: VendasPorPeriodo } = {};

    vendas.forEach(venda => {
      if (venda.dataPagamento) {
        const data = new Date(venda.dataPagamento);
        const mes = data.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });

        if (!mapa[mes]) {
          mapa[mes] = {
            periodo: mes,
            total: 0,
            custo: 0,
            lucro: 0,
            quantidade: 0,
          };
        }

        mapa[mes].total += venda.valor;
        mapa[mes].custo += venda.custo;
        mapa[mes].lucro += venda.lucro;
        mapa[mes].quantidade += 1;
      }
    });

    setVendasPorPeriodo(Object.values(mapa).reverse());
  };

  const handleFinalizarVenda = async () => {
    try {
      if (carrinho.length === 0) {
        alert('Adicione pelo menos um item ao carrinho.');
        return;
      }
      if (!posDados.clienteId) {
        alert('Selecione um cliente.');
        return;
      }

      // Cálculos Finais
      const totalProdutos = carrinho.reduce((acc, item) => acc + item.total, 0);
      
      let descontoGlobalValor = 0;
      if (posPagamento.tipoDescontoGlobal === '%') {
        descontoGlobalValor = totalProdutos * (posPagamento.descontoGlobal / 100);
      } else {
        descontoGlobalValor = posPagamento.descontoGlobal;
      }

      const valorFinal = totalProdutos - descontoGlobalValor;
      const custoTotal = carrinho.reduce((acc, item) => acc + (item.valorInterno * item.quantidade), 0);
      const lucro = valorFinal - custoTotal;
      const percentualLucro = valorFinal > 0 ? (lucro / valorFinal) * 100 : 0;

      const vendaDados = {
        clienteId: posDados.clienteId,
        clienteNome: posDados.clienteNome,
        vendedor: posDados.vendedor,
        tipoEntrega: posDados.tipoEntrega,
        itens: carrinho,
        valor: valorFinal,
        custo: custoTotal,
        lucro,
        percentualLucro,
        dataPagamento: posDados.dataVenda,
        status: posPagamento.status,
        metodo: posPagamento.metodo,
        descricao: `Venda PDV - ${carrinho.length} itens`,
        garantia: posPagamento.garantia,
        descontoTotal: descontoGlobalValor,
        loja_id: usuario?.lojaId
      };

      if (editingId) {
        const { error } = await supabase
          .from('vendas')
          .update(vendaDados)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vendas').insert([vendaDados]);
        if (error) throw error;
      }

      await carregarVendas();
      
      resetPOS();
      setShowPOS(false);
    } catch (error) {
      console.error('Erro ao salvar venda:', error);
    }
  };

  const resetPOS = () => {
    setPosDados({ tipoVenda: 'Venda', clienteId: '', clienteNome: '', vendedor: '', tipoEntrega: 'Retirada', dataVenda: new Date().toISOString().split('T')[0] });
    setCart([]);
    setPosItem({ quantidade: 1, valorInterno: 0, valorExibir: 0, desconto: 0, tipoDesconto: 'R$', observacao: '' });
    setPosPagamento({ metodo: 'dinheiro', parcelas: 1, detalhes: '', valorPago: 0, usarCredito: false, credito: 0, status: 'pago', garantia: '90 dias', descontoGlobal: 0, tipoDescontoGlobal: 'R$' });
    setEditingId(null);
  };

  const handleEdit = (venda: Venda) => {
    setPosDados({
      tipoVenda: 'Venda',
      clienteId: venda.clienteId || '',
      clienteNome: venda.clienteNome,
      vendedor: venda.vendedor || '',
      tipoEntrega: venda.tipoEntrega || 'Retirada',
      dataVenda: venda.dataPagamento
    });
    
    // Se for venda antiga sem itens, cria um item fictício
    const itens = venda.itens && venda.itens.length > 0 ? venda.itens : [{
      id: 'legacy',
      aparelhoId: '',
      descricao: venda.descricao || 'Item legado',
      quantidade: 1,
      valorInterno: venda.custo,
      valorExibir: venda.valor,
      desconto: 0,
      tipoDesconto: 'R$',
      total: venda.valor,
      observacao: ''
    } as VendaItem];

    setCart(itens);
    setPosPagamento({
      ...posPagamento,
      metodo: venda.metodo,
      status: venda.status,
      garantia: venda.garantia || '90 dias',
      descontoGlobal: venda.descontoTotal || 0
    });

    setEditingId(venda.id);
    setShowPOS(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta venda?')) {
      const { error } = await supabase.from('vendas').delete().eq('id', id);
      if (error) {
        console.error('Erro ao deletar venda:', error);
      } else {
        await carregarVendas();
      }
    }
  };

  const vendasFiltradas = vendas.filter(v => {
    const matchCliente = v.clienteNome.toLowerCase().includes(filtroCliente.toLowerCase());
    const matchStatus = !filtroStatus || v.status === filtroStatus;
    const matchMetodo = !filtroMetodo || v.metodo === filtroMetodo;
    return matchCliente && matchStatus && matchMetodo;
  });

  const resumoVendas = {
    totalVendido: vendasFiltradas.reduce((sum, v) => sum + v.valor, 0),
    totalCusto: vendasFiltradas.reduce((sum, v) => sum + v.custo, 0),
    totalLucro: vendasFiltradas.reduce((sum, v) => sum + v.lucro, 0),
    quantidade: vendasFiltradas.length,
    vendPago: vendasFiltradas.filter(v => v.status === 'pago').length,
    vendPendente: vendasFiltradas.filter(v => v.status === 'pendente').length,
  };

  const metodosPagamento = ['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto'];

  const dadosPizza = metodosPagamento.map(metodo => ({
    name: metodo === 'cartao_credito' ? 'Cartão Crédito' : 
          metodo === 'cartao_debito' ? 'Cartão Débito' : 
          metodo === 'dinheiro' ? 'Dinheiro' :
          metodo === 'pix' ? 'PIX' : 'Boleto',
    value: vendasFiltradas.filter(v => v.metodo === metodo).reduce((sum, v) => sum + v.valor, 0),
  })).filter(d => d.value > 0);

  const COLORS = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'];

  const handleNovoClienteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoClienteData.nome || !novoClienteData.telefone) {
      alert('Nome e telefone são obrigatórios');
      return;
    }
    const cliente = await criarCliente({ ...novoClienteData, email: novoClienteData.email || 'sem@email.com', ativo: true });
    if (cliente) {
      setPosDados(prev => ({ ...prev, clienteId: cliente.id, clienteNome: cliente.nome }));
      setShowNovoCliente(false);
      setNovoClienteData({ nome: '', email: '', telefone: '', cpf: '' });
      await fetchClientes();
    }
  };

  const handleNovoAparelhoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoAparelhoData.marca || !novoAparelhoData.modelo) {
      alert('Marca e modelo são obrigatórios');
      return;
    }
    const precoNum = parseFloat(novoAparelhoData.preco.replace(/\D/g, '')) / 100 || 0;
    const aparelho = await criarAparelho({
      ...novoAparelhoData,
      preco: precoNum,
      ativo: true,
      capacidade: 'N/A',
      cor: 'N/A'
    });
    if (aparelho) {
      setPosItem(prev => ({
        ...prev,
        aparelhoId: aparelho.id,
        descricao: `${aparelho.marca} ${aparelho.modelo}`,
        valorExibir: aparelho.preco,
        valorInterno: 0 // Assumindo 0 pois cadastro rápido não tem custo
      }));
      setShowNovoAparelho(false);
      setNovoAparelhoData({ marca: '', modelo: '', imei: '', preco: '', condicao: 'seminovo' });
      await fetchAparelhos();
    }
  };

  const handleAddItem = () => {
    if (!posItem.aparelhoId && !posItem.descricao) {
      alert('Selecione um aparelho ou descreva o item.');
      return;
    }

    const qtd = posItem.quantidade || 1;
    const valor = posItem.valorExibir || 0;
    let desconto = 0;

    if (posItem.tipoDesconto === '%') {
      desconto = valor * ((posItem.desconto || 0) / 100);
    } else {
      desconto = posItem.desconto || 0;
    }

    const total = (valor - desconto) * qtd;

    const newItem: VendaItem = {
      id: Date.now().toString(),
      aparelhoId: posItem.aparelhoId || '',
      descricao: posItem.descricao || 'Item Avulso',
      quantidade: qtd,
      valorInterno: posItem.valorInterno || 0,
      valorExibir: valor,
      desconto: posItem.desconto || 0,
      tipoDesconto: posItem.tipoDesconto as 'R$' | '%',
      total: total,
      observacao: posItem.observacao || ''
    };

    setCart([...carrinho, newItem]);
    setPosItem({ quantidade: 1, valorInterno: 0, valorExibir: 0, desconto: 0, tipoDesconto: 'R$', observacao: '', aparelhoId: '', descricao: '' });
  };

  const handleRemoveItem = (id: string) => {
    setCart(carrinho.filter(item => item.id !== id));
  };

  // Cálculos do PDV em tempo real
  const subtotalCarrinho = carrinho.reduce((acc, item) => acc + item.total, 0);
  const descontoGlobalValor = posPagamento.tipoDescontoGlobal === '%' 
    ? subtotalCarrinho * (posPagamento.descontoGlobal / 100) 
    : posPagamento.descontoGlobal;
  const totalFinal = subtotalCarrinho - descontoGlobalValor;
  const troco = Math.max(0, posPagamento.valorPago - totalFinal);
  const saldo = Math.max(0, totalFinal - posPagamento.valorPago);

  const handleGerarNota = async (venda: Venda) => {
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      
      // Preparar linhas da tabela
      const itensHtml = venda.itens && venda.itens.length > 0 
        ? venda.itens.map(item => `
            <tr>
              <td style="padding: 5px;">${item.descricao} <span style="font-size: 10px;">(${item.quantidade}x)</span></td>
              <td style="text-align: right; padding: 5px;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}</td>
            </tr>
          `).join('')
        : `<tr>
             <td style="padding: 5px;">${venda.descricao || 'Produto Genérico'}</td>
             <td style="text-align: right; padding: 5px;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)}</td>
           </tr>`;

      const element = document.createElement("div");
      element.innerHTML = `
        <div style="font-family: 'Courier New', Courier, monospace; padding: 20px; max-width: 800px; margin: 0 auto; color: #000; background-color: #fff;">
          <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 20px;">
            <h2 style="margin: 0; font-size: 24px;">PHONE CENTER</h2>
            <p style="margin: 5px 0;">Assistência Técnica e Vendas</p>
            <p style="margin: 5px 0;">CNPJ: 00.000.000/0000-00</p>
            <p style="margin: 5px 0;">(11) 99999-9999</p>
          </div>

          <div style="margin-bottom: 20px;">
            <p><strong>COMPROVANTE DE VENDA #${venda.id.slice(-6)}</strong></p>
            <p>Data: ${new Date(venda.dataPagamento).toLocaleDateString('pt-BR')}</p>
            <p>Cliente: ${venda.clienteNome}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr style="border-bottom: 1px dashed #000;">
              <th style="text-align: left; padding: 5px;">Item</th>
              <th style="text-align: right; padding: 5px;">Valor</th>
            </tr>
            ${itensHtml}
          </table>

          <div style="text-align: right; margin-bottom: 30px; border-top: 1px dashed #000; padding-top: 10px;">
            <p style="font-size: 18px; font-weight: bold;">TOTAL: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)}</p>
            <p style="font-size: 12px;">Forma de Pagamento: ${venda.metodo.toUpperCase().replace('_', ' ')}</p>
          </div>

          <div style="border: 1px solid #000; padding: 15px; font-size: 12px; margin-bottom: 30px;">
            <p style="font-weight: bold; text-align: center; margin-top: 0;">TERMOS DE GARANTIA</p>
            <p>1. A garantia é válida por <strong>${venda.garantia || '90 dias'}</strong> a partir desta data.</p>
            <p>2. A garantia cobre defeitos de fabricação e funcionamento.</p>
            <p>3. A garantia NÃO cobre:</p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>Danos causados por líquidos ou oxidação;</li>
              <li>Quedas, trincas ou mau uso;</li>
              <li>Sinais de abertura por terceiros.</li>
            </ul>
            <p>4. Obrigatória a apresentação deste comprovante.</p>
          </div>

          <div style="margin-top: 50px; text-align: center;">
            <div style="border-top: 1px solid #000; width: 60%; margin: 0 auto 5px auto;"></div>
            <p>Assinatura do Cliente</p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; font-size: 10px;">
            <p>Obrigado pela preferência!</p>
          </div>
        </div>
      `;

      const options = {
        margin: 10,
        filename: `nota_venda_${venda.id}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, backgroundColor: "#ffffff" },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      html2pdf().set(options).from(element).save();
    } catch (err) {
      console.error("Erro ao gerar nota:", err);
      alert("Erro ao gerar nota PDF.");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Carregando vendas...</div>;
  }

  return (
    <div className="w-full flex justify-center">
      <div className="space-y-4 sm:space-y-6 pb-40 sm:pb-6 w-full max-w-6xl px-4 sm:px-0">
        {/* Header com Botão */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white drop-shadow-sm">Vendas</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Controle de vendas e faturamento</p>
          </div>
          <Button 
            onClick={() => {
              setShowPOS(true);
              if (editingId) setEditingId(null);
            }}
            className="btn-ios w-full sm:w-auto flex items-center justify-center gap-2 h-auto"
          >
            + Nova Venda
          </Button>
        </div>

        {/* Modal PDV Completo */}
        {showPOS && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <div className="glass w-full max-w-6xl h-full sm:h-auto sm:max-h-[95vh] rounded-none sm:rounded-[2.5rem] shadow-2xl flex flex-col border border-white/20 overflow-hidden">
              
              {/* Header do PDV */}
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/20 dark:bg-white/5 backdrop-blur-xl sticky top-0 z-20">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-6 h-6 text-blue-600" />
                  <h2 className="text-xl font-bold">{editingId ? 'Editar Venda' : 'Nova Venda'}</h2>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setShowPOS(false); resetPOS(); }}>
                  <X className="w-6 h-6" />
                </Button>
              </div>

              {/* Resumo Fixo (Cards) - Liquid Glass */}
              <div className="p-4 bg-white/10 dark:bg-black/20 backdrop-blur-md border-b border-white/10 z-10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <GlassCard className="!p-3 rounded-2xl bg-white/30 dark:bg-white/5 border-white/10">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">📦 Valor Produtos</p>
                    <p className="text-lg font-bold">R$ {subtotalCarrinho.toFixed(2)}</p>
                  </GlassCard>
                  <GlassCard className="!p-3 rounded-2xl bg-white/30 dark:bg-white/5 border-white/10">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">💰 Pagamentos</p>
                    <p className="text-lg font-bold">R$ {posPagamento.valorPago.toFixed(2)}</p>
                  </GlassCard>
                  <GlassCard className="!p-3 rounded-2xl bg-white/30 dark:bg-white/5 border-white/10">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">📉 Saldo</p>
                    <p className="text-lg font-bold">R$ {saldo.toFixed(2)}</p>
                  </GlassCard>
                  <GlassCard className="!p-3 rounded-2xl bg-white/30 dark:bg-white/5 border-white/10">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">💵 Troco</p>
                    <p className="text-lg font-bold">R$ {troco.toFixed(2)}</p>
                  </GlassCard>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                
                {/* Seção 1: Dados da Venda */}
                <GlassCard className="bg-white/40 dark:bg-white/5 rounded-[2rem] border-white/10">
                  <div className="pb-3 mb-3 border-b border-white/10">
                    <h3 className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                      <User className="w-4 h-4" /> Dados da Venda
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    <select 
                      className="input-glass"
                      value={posDados.tipoVenda}
                      onChange={e => setPosDados({...posDados, tipoVenda: e.target.value})}
                    >
                      <option>Venda</option>
                      <option>Orçamento</option>
                      <option>Troca</option>
                    </select>

                <div className="flex gap-2">
                  <select
                      className="input-glass flex-1"
                      value={posDados.clienteId}
                    onChange={(e) => {
                      const cliente = clientes.find(c => c.id === e.target.value);
                        setPosDados({ ...posDados, clienteId: e.target.value, clienteNome: cliente?.nome || '' });
                    }}
                  >
                    <option value="">Selecionar Cliente</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <Button type="button" size="icon" variant="outline" onClick={() => setShowNovoCliente(true)} className="h-full aspect-square bg-white/50 backdrop-blur">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                    <select 
                      className="input-glass"
                      value={posDados.vendedor}
                      onChange={e => setPosDados({...posDados, vendedor: e.target.value})}
                    >
                      <option value="">Vendedor (Opcional)</option>
                      {tecnicos.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
                    </select>

                    <select 
                      className="input-glass"
                      value={posDados.tipoEntrega}
                      onChange={e => setPosDados({...posDados, tipoEntrega: e.target.value})}
                    >
                      <option>Retirada</option>
                      <option>Entrega</option>
                      <option>Correios</option>
                    </select>

                    <input 
                      type="date" 
                      className="input-glass"
                      value={posDados.dataVenda}
                      onChange={e => setPosDados({...posDados, dataVenda: e.target.value})}
                    />
                  </div>
                </GlassCard>

                {/* Seção 2: Itens da Venda */}
                <GlassCard className="bg-white/40 dark:bg-white/5 rounded-[2rem] border-white/10">
                  <div className="pb-3 mb-3 border-b border-white/10">
                    <h3 className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4" /> Itens da Venda
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {/* Input de Item */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-white/30 dark:bg-black/30 p-3 rounded-xl border border-white/10">
                      <div className="md:col-span-4 flex gap-2">
                <div className="flex gap-2">
                  <select
                            className="input-glass flex-1"
                            value={posItem.aparelhoId}
                    onChange={(e) => {
                      const aparelho = aparelhos.find(a => a.id === e.target.value);
                              setPosItem({ 
                                ...posItem, 
                        aparelhoId: e.target.value, 
                                descricao: aparelho ? `${aparelho.marca} ${aparelho.modelo}` : '',
                                valorExibir: aparelho ? aparelho.preco : 0,
                                valorInterno: 0 // Assumindo 0 ou buscar custo se disponível
                      });
                    }}
                  >
                    <option value="">Selecionar Aparelho</option>
                    {aparelhos.map(a => (
                      <option key={a.id} value={a.id}>{a.marca} {a.modelo} - R$ {a.preco}</option>
                    ))}
                  </select>
                  <Button type="button" size="icon" variant="outline" onClick={() => setShowNovoAparelho(true)} className="h-full aspect-square bg-white/50 backdrop-blur">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="md:col-span-1">
                <label className="text-xs text-gray-500 ml-1">Qtd</label>
                <input type="number" min="1" className="input-glass" value={posItem.quantidade} onChange={e => setPosItem({...posItem, quantidade: parseInt(e.target.value)})} />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-gray-500 ml-1">Valor (R$)</label>
                <input
                  type="number"
                  className="input-glass"
                  value={posItem.valorExibir}
                  onChange={e => setPosItem({...posItem, valorExibir: parseFloat(e.target.value)})}
                />
                      </div>

                      <div className="md:col-span-2 flex gap-1">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 ml-1">Desconto</label>
                          <input type="number" className="input-glass" value={posItem.desconto} onChange={e => setPosItem({...posItem, desconto: parseFloat(e.target.value)})} />
                        </div>
                        <div className="w-16">
                          <label className="text-xs text-gray-500 ml-1">Tipo</label>
                <select
                            className="input-glass px-1"
                            value={posItem.tipoDesconto}
                            onChange={e => setPosItem({...posItem, tipoDesconto: e.target.value as any})}
                >
                            <option>R$</option>
                            <option>%</option>
                </select>
                        </div>
              </div>

                      <div className="md:col-span-2">
                        <label className="text-xs text-gray-500 ml-1">Obs</label>
                        <input type="text" className="input-glass" value={posItem.observacao} onChange={e => setPosItem({...posItem, observacao: e.target.value})} />
                      </div>

                      <div className="md:col-span-1">
                        <Button onClick={handleAddItem} className="w-full h-[46px] bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Tabela de Itens */}
                    <div className="border border-white/10 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-white/20 dark:bg-black/20 text-xs uppercase text-gray-500">
                          <tr>
                            <th className="p-3 text-left">Produto</th>
                            <th className="p-3 text-center">Qtd</th>
                            <th className="p-3 text-right">Vlr Unit.</th>
                            <th className="p-3 text-right">Desc.</th>
                            <th className="p-3 text-right">Total</th>
                            <th className="p-3 text-center">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {carrinho.map(item => (
                            <tr key={item.id} className="hover:bg-white/5">
                              <td className="p-3">{item.descricao} <span className="text-xs text-gray-400 block">{item.observacao}</span></td>
                              <td className="p-3 text-center">{item.quantidade}</td>
                              <td className="p-3 text-right">R$ {item.valorExibir.toFixed(2)}</td>
                              <td className="p-3 text-right text-red-500">
                                {item.desconto > 0 ? `-${item.tipoDesconto === 'R$' ? 'R$' : ''}${item.desconto}${item.tipoDesconto === '%' ? '%' : ''}` : '-'}
                              </td>
                              <td className="p-3 text-right font-bold">R$ {item.total.toFixed(2)}</td>
                              <td className="p-3 text-center">
                                <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                              </td>
                            </tr>
                          ))}
                          {carrinho.length === 0 && (
                            <tr><td colSpan={6} className="p-4 text-center text-gray-400">Nenhum item adicionado</td></tr>
                          )}
                        </tbody>
                        <tfoot className="bg-white/10 dark:bg-black/10 font-bold">
                          <tr>
                            <td colSpan={4} className="p-3 text-right">Subtotal:</td>
                            <td className="p-3 text-right">R$ {subtotalCarrinho.toFixed(2)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Desconto Total */}
                    <div className="flex justify-end items-center gap-2 bg-white/30 dark:bg-black/30 p-2 rounded-xl border border-white/10">
                      <span className="text-sm font-medium">Desconto Total:</span>
                      <input 
                        type="number" 
                        className="w-24 input-glass py-1 h-8 text-right" 
                        value={posPagamento.descontoGlobal} 
                        onChange={e => setPosPagamento({...posPagamento, descontoGlobal: parseFloat(e.target.value)})} 
                      />
                      <div className="flex border border-white/20 rounded-lg overflow-hidden">
                        <button 
                          className={`px-2 py-1 text-xs ${posPagamento.tipoDescontoGlobal === 'R$' ? 'bg-blue-600 text-white' : 'bg-white/50 dark:bg-black/50'}`}
                          onClick={() => setPosPagamento({...posPagamento, tipoDescontoGlobal: 'R$'})}
                        >R$</button>
                        <button 
                          className={`px-2 py-1 text-xs ${posPagamento.tipoDescontoGlobal === '%' ? 'bg-blue-600 text-white' : 'bg-white/50 dark:bg-black/50'}`}
                          onClick={() => setPosPagamento({...posPagamento, tipoDescontoGlobal: '%'})}
                        >%</button>
                      </div>
                      <button onClick={() => setPosPagamento({...posPagamento, descontoGlobal: 0})} className="text-xs text-red-500 underline ml-2">Limpar</button>
                    </div>
                  </div>
                </GlassCard>

                {/* Seção 3: Pagamento */}
                <GlassCard className="bg-white/40 dark:bg-white/5 rounded-[2rem] border-white/10">
                  <div className="pb-3 mb-3 border-b border-white/10">
                    <h3 className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Dados do Pagamento
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 ml-1">Forma Pagamento</label>
                      <select 
                        className="input-glass"
                        value={posPagamento.metodo}
                        onChange={e => setPosPagamento({...posPagamento, metodo: e.target.value as any})}
                      >
                        <option value="dinheiro">Dinheiro</option>
                        <option value="cartao_credito">Cartão Crédito</option>
                        <option value="cartao_debito">Cartão Débito</option>
                        <option value="pix">PIX</option>
                        <option value="boleto">Boleto</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 ml-1">Parcelas</label>
                      <select 
                        className="input-glass"
                        value={posPagamento.parcelas}
                        onChange={e => setPosPagamento({...posPagamento, parcelas: parseInt(e.target.value)})}
                      >
                        {[1,2,3,4,5,6,10,12].map(p => <option key={p} value={p}>{p}x</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 ml-1">Valor Pago (R$)</label>
                      <input 
                        type="number" 
                        className="input-glass font-bold text-green-600" 
                        value={posPagamento.valorPago} 
                        onChange={e => setPosPagamento({...posPagamento, valorPago: parseFloat(e.target.value)})} 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 ml-1">Garantia</label>
                      <input 
                        type="text" 
                        className="input-glass" 
                        value={posPagamento.garantia} 
                        onChange={e => setPosPagamento({...posPagamento, garantia: e.target.value})} 
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500 ml-1">Detalhes / Obs Pagamento</label>
                      <input 
                        type="text" 
                        className="input-glass" 
                        value={posPagamento.detalhes} 
                        onChange={e => setPosPagamento({...posPagamento, detalhes: e.target.value})} 
                      />
                    </div>
                    <div className="flex items-end mb-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={posPagamento.usarCredito} 
                          onChange={e => setPosPagamento({...posPagamento, usarCredito: e.target.checked})} 
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Usar Crédito Cliente
                      </label>
                    </div>
                  </div>
                </GlassCard>

              </div>

              {/* Footer Ações */}
              <div className="p-6 border-t border-white/10 bg-white/20 dark:bg-white/5 backdrop-blur-xl flex justify-end gap-3 sticky bottom-0 z-20">
                <Button variant="outline" onClick={() => { setShowPOS(false); resetPOS(); }} className="gap-2 bg-white/50 hover:bg-white/80 border-white/20">
                  <Ban className="w-4 h-4" /> Cancelar
                </Button>
                <Button onClick={handleFinalizarVenda} className="bg-green-600 hover:bg-green-700 gap-2 w-full sm:w-auto shadow-lg shadow-green-500/20">
                  <Save className="w-4 h-4" /> FINALIZAR VENDA
              </Button>
              </div>
            </div>
          </div>
        )}

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <GlassCard hoverEffect={true} className="rounded-3xl">
            <div className="flex flex-row items-center justify-between pb-2">
              <h3 className="text-xs sm:text-sm font-medium">Total Vendido</h3>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoVendas.totalVendido)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{resumoVendas.quantidade} vendas</p>
            </div>
          </GlassCard>

          <GlassCard hoverEffect={true} className="rounded-3xl">
            <div className="flex flex-row items-center justify-between pb-2">
              <h3 className="text-xs sm:text-sm font-medium">Lucro Total</h3>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-green-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoVendas.totalLucro)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {resumoVendas.totalVendido > 0 ? ((resumoVendas.totalLucro / resumoVendas.totalVendido) * 100).toFixed(1) : 0}% de margem
              </p>
            </div>
          </GlassCard>

          <GlassCard hoverEffect={true} className="rounded-3xl">
            <div className="flex flex-row items-center justify-between pb-2">
              <h3 className="text-xs sm:text-sm font-medium">Pagas</h3>
              <Badge variant="default" className="text-xs">{resumoVendas.vendPago}</Badge>
            </div>
            <div>
              <div className="text-2xl font-bold">{resumoVendas.vendPago}</div>
              <p className="text-xs text-muted-foreground mt-1">Confirmadas</p>
            </div>
          </GlassCard>

          <GlassCard hoverEffect={true} className="rounded-3xl">
            <div className="flex flex-row items-center justify-between pb-2">
              <h3 className="text-xs sm:text-sm font-medium">Pendentes</h3>
              <Badge variant="secondary" className="text-xs">{resumoVendas.vendPendente}</Badge>
            </div>
            <div>
              <div className="text-2xl font-bold">{resumoVendas.vendPendente}</div>
              <p className="text-xs text-muted-foreground mt-1">À receber</p>
            </div>
          </GlassCard>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Gráfico de Vendas por Período */}
          <GlassCard className="rounded-3xl">
            <div className="pb-4 border-b border-white/10 mb-4">
              <h3 className="text-base sm:text-lg font-bold">Vendas por Período</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Últimos 12 meses</p>
            </div>
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={vendasPorPeriodo}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 12 }} stroke="rgba(150,150,150,0.5)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="rgba(150,150,150,0.5)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((value || 0))} 
                  />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" name="Vendido" strokeWidth={3} dot={{r: 4}} />
                  <Line type="monotone" dataKey="lucro" stroke="#10b981" name="Lucro" strokeWidth={3} dot={{r: 4}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Gráfico de Métodos de Pagamento */}
          <GlassCard className="rounded-3xl">
            <div className="pb-4 border-b border-white/10 mb-4">
              <h3 className="text-base sm:text-lg font-bold">Métodos de Pagamento</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Distribuição por método</p>
            </div>
            <div>
              {dadosPizza.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={dadosPizza}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${(entry.value / resumoVendas.totalVendido * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {COLORS.map((color, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip 
                       contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                       formatter={(value: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((value || 0))} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Sem dados de pagamento
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Filtros */}
        <GlassCard className="p-4 rounded-3xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <input
              type="text"
              placeholder="Filtrar por cliente..."
              value={filtroCliente}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltroCliente(e.target.value)}
              className="input-glass h-10 sm:h-auto"
            />
            <select
              className="input-glass h-10 sm:h-auto"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select
              className="input-glass h-10 sm:h-auto"
              value={filtroMetodo}
              onChange={(e) => setFiltroMetodo(e.target.value)}
            >
              <option value="">Todos os métodos</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartao_credito">Cartão Crédito</option>
              <option value="cartao_debito">Cartão Débito</option>
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
            </select>
          </div>
        </GlassCard>

        {/* Tabela de Vendas */}
        <GlassCard className="rounded-3xl">
          <div className="pb-4 border-b border-white/10 mb-4">
            <h3 className="text-base sm:text-lg font-bold">Vendas Registradas</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">{vendasFiltradas.length} vendas</p>
          </div>
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10">
                  <tr className="text-xs sm:text-sm text-left">
                    <th className="py-3 px-2">Cliente</th>
                    <th className="text-left py-3 px-2 hidden sm:table-cell">Aparelho</th>
                    <th className="text-right py-3 px-2">Valor</th>
                    <th className="text-right py-3 px-2 hidden sm:table-cell">Lucro</th>
                    <th className="py-3 px-2 hidden sm:table-cell">Método</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="text-right py-3 px-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasFiltradas.map((venda) => (
                    <tr key={venda.id} className="border-b border-white/10 last:border-0 text-xs sm:text-sm hover:bg-white/5 transition-colors">
                      <td className="py-3 px-2 font-medium">{venda.clienteNome}</td>
                      <td className="py-3 px-2 hidden sm:table-cell text-muted-foreground">{venda.itens && venda.itens.length > 0 ? `${venda.itens.length} itens` : venda.descricao}</td>
                      <td className="py-3 px-2 text-right font-bold">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)}
                      </td>
                      <td className="py-3 px-2 text-right hidden sm:table-cell text-green-600 font-medium">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.lucro)}
                      </td>
                      <td className="py-3 px-2 hidden sm:table-cell text-xs">
                        {venda.metodo === 'cartao_credito' ? 'Cartão Crédito' :
                         venda.metodo === 'cartao_debito' ? 'Cartão Débito' :
                         venda.metodo === 'dinheiro' ? 'Dinheiro' :
                         venda.metodo === 'pix' ? 'PIX' : 'Boleto'}
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={venda.status === 'pago' ? 'default' : venda.status === 'pendente' ? 'secondary' : 'outline'} className="text-xs">
                          {venda.status === 'pago' ? 'Pago' : venda.status === 'pendente' ? 'Pendente' : 'Cancelado'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(venda)}
                            className="h-8 text-xs hover:bg-white/10"
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(venda.id)}
                            className="h-8 text-xs text-red-500 hover:bg-red-500/10"
                          >
                            Excluir
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleGerarNota(venda)}
                            className="h-8 text-xs text-blue-600 hover:bg-blue-500/10"
                          >
                            <Printer className="w-3 h-3 mr-1" /> Nota
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { const c = clientes.find(cl => cl.nome === venda.clienteNome); if(c) window.open(`https://wa.me/55${c.telefone.replace(/\D/g, '')}`, '_blank'); }}
                            className="h-8 text-xs text-green-600 hover:bg-green-500/10"
                          >
                            <MessageCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vendasFiltradas.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma venda encontrada
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Modal Novo Cliente */}
      {showNovoCliente && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border-white/20 shadow-2xl overflow-hidden !p-0">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/10">
              <h3 className="text-lg font-bold">Novo Cliente</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowNovoCliente(false)}><X className="w-4 h-4" /></Button>
            </div>
            <div className="p-6">
              <form onSubmit={handleNovoClienteSubmit} className="space-y-4">
                <input type="text" placeholder="Nome *" required className="input-glass" value={novoClienteData.nome} onChange={e => setNovoClienteData({...novoClienteData, nome: e.target.value})} />
                <input type="tel" placeholder="Telefone *" required className="input-glass" value={novoClienteData.telefone} onChange={e => setNovoClienteData({...novoClienteData, telefone: e.target.value})} />
                <input type="email" placeholder="Email" className="input-glass" value={novoClienteData.email} onChange={e => setNovoClienteData({...novoClienteData, email: e.target.value})} />
                <input type="text" placeholder="CPF" className="input-glass" value={novoClienteData.cpf} onChange={e => setNovoClienteData({...novoClienteData, cpf: e.target.value})} />
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">Cadastrar Cliente</Button>
              </form>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Modal Novo Aparelho */}
      {showNovoAparelho && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border-white/20 shadow-2xl overflow-hidden !p-0">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/10">
              <h3 className="text-lg font-bold">Novo Aparelho</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowNovoAparelho(false)}><X className="w-4 h-4" /></Button>
            </div>
            <div className="p-6">
              <form onSubmit={handleNovoAparelhoSubmit} className="space-y-4">
                <input type="text" placeholder="Marca *" required className="input-glass" value={novoAparelhoData.marca} onChange={e => setNovoAparelhoData({...novoAparelhoData, marca: e.target.value})} />
                <input type="text" placeholder="Modelo *" required className="input-glass" value={novoAparelhoData.modelo} onChange={e => setNovoAparelhoData({...novoAparelhoData, modelo: e.target.value})} />
                <input type="text" placeholder="IMEI" className="input-glass" value={novoAparelhoData.imei} onChange={e => setNovoAparelhoData({...novoAparelhoData, imei: e.target.value})} />
                <input 
                  type="text" 
                  placeholder="Preço Venda (R$)" 
                  className="input-glass" 
                  value={novoAparelhoData.preco} 
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '');
                    const formatted = (parseInt(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    setNovoAparelhoData({...novoAparelhoData, preco: v ? `R$ ${formatted}` : ''});
                  }} 
                />
                <select 
                  className="input-glass"
                  value={novoAparelhoData.condicao}
                  onChange={e => setNovoAparelhoData({...novoAparelhoData, condicao: e.target.value as any})}
                >
                  <option value="novo">Novo</option>
                  <option value="seminovo">Seminovo</option>
                  <option value="usado">Usado</option>
                </select>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">Cadastrar Aparelho</Button>
              </form>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
