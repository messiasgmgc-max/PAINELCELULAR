'use client';

import { useEffect, useMemo, useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Save, 
  Percent, 
  Calculator, 
  Search, 
  TrendingUp, 
  CreditCard, 
  ArrowRightLeft, 
  Edit, 
  X,
  BadgeCheck,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';

interface LinhaTaxa {
  parcelas: number; // 0 = Débito, 1..24 = Crédito 1x..24x
  label: string;
  taxaBaseMaster: string;
  taxaBaseElo: string;
  taxaClienteMaster: string;
  taxaClienteElo: string;
}

const criarLinhasPadrao = (maxParcelas: number = 24): LinhaTaxa[] => [
  { parcelas: 0, label: 'Débito', taxaBaseMaster: '', taxaBaseElo: '', taxaClienteMaster: '', taxaClienteElo: '' },
  ...Array.from({ length: Math.max(12, maxParcelas) }, (_, index) => ({
    parcelas: index + 1,
    label: `${index + 1}x`,
    taxaBaseMaster: '',
    taxaBaseElo: '',
    taxaClienteMaster: '',
    taxaClienteElo: '',
  })),
];

export function TaxasMaquininhaTab() {
  const { usuario } = useAuth();
  const [perfis, setPerfis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [perfilNome, setPerfilNome] = useState('');
  const [editingGrupoNome, setEditingGrupoNome] = useState<string | null>(null);
  
  const [usarTaxasAumentadas, setUsarTaxasAumentadas] = useState(false);

  const [linhas, setLinhas] = useState<LinhaTaxa[]>(criarLinhasPadrao(24));

  // Estados da Calculadora
  const [calcPerfil, setCalcPerfil] = useState('');
  const [calcBandeira, setCalcBandeira] = useState<'master' | 'elo'>('master');
  const [calcValorBase, setCalcValorBase] = useState('');
  
  // Modos de cálculo: 'parcelas' (fixo) ou 'alvo' (busca inteligente)
  const [tipoBusca, setTipoBusca] = useState<'parcelas' | 'alvo'>('parcelas');
  
  const [calcParcelaSelecionada, setCalcParcelaSelecionada] = useState('Debito'); // Ex: 'Debito', '1', '2', ..., '24'
  const [calcValorAlvo, setCalcValorAlvo] = useState('');
  const [calcModoAlvo, setCalcModoAlvo] = useState<'parcela' | 'total'>('parcela');
  
  const [calcResultado, setCalcResultado] = useState<any>(null);

  const lojaIdAtual = usuario?.lojaId || usuario?.loja_id || usuario?.id;

  const carregarPerfis = async () => {
    if (!lojaIdAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('taxas_maquininha')
      .select('*')
      .eq('loja_id', lojaIdAtual)
      .eq('ativo', true)
      .order('created_at', { ascending: false });

    if (!error) setPerfis(data || []);
    setLoading(false);
  };

  useEffect(() => { carregarPerfis(); }, [lojaIdAtual]);

  const perfisAgrupados = useMemo(() => {
    const agrupados = new Map<string, any[]>();
    perfis.forEach((perfil) => {
      const nomeBase = perfil.nome?.split(' | ')[0] || 'Sem nome';
      const lista = agrupados.get(nomeBase) ?? [];
      lista.push(perfil);
      agrupados.set(nomeBase, lista);
    });

    const resultado = Array.from(agrupados.entries()).map(([nome, itens]) => ({
      nome,
      itens: itens.sort((a, b) => {
        const strA = (a.nome?.split(' | ')[1] || '').toLowerCase();
        const strB = (b.nome?.split(' | ')[1] || '').toLowerCase();
        if (strA.includes('débito') || strA.includes('debito')) return -1;
        if (strB.includes('débito') || strB.includes('debito')) return 1;
        const numA = parseInt(strA.replace('x', '') || '0');
        const numB = parseInt(strB.replace('x', '') || '0');
        return numA - numB;
      }),
    }));

    if (resultado.length > 0 && !calcPerfil) setCalcPerfil(resultado[0].nome);
    return resultado;
  }, [perfis, calcPerfil]);

  const podeAdicionar = useMemo(() => perfisAgrupados.length < 3, [perfisAgrupados.length]);

  const atualizarLinha = (index: number, campo: keyof LinhaTaxa, valor: string) => {
    setLinhas((prev) => prev.map((linha, i) => i === index ? { ...linha, [campo]: valor } : linha));
  };

  const adicionarLinha = () => {
    setLinhas((prev) => [
      ...prev, 
      { 
        parcelas: prev.length, 
        label: `${prev.length}x`, 
        taxaBaseMaster: '', 
        taxaBaseElo: '', 
        taxaClienteMaster: '', 
        taxaClienteElo: '' 
      }
    ]);
  };

  const resetarFormulario = () => {
    setPerfilNome('');
    setEditingGrupoNome(null);
    setUsarTaxasAumentadas(false);
    setLinhas(criarLinhasPadrao(24));
    setMostrarFormulario(false);
  };

  const editarPerfil = (grupoNome: string) => {
    const grupo = perfisAgrupados.find(g => g.nome === grupoNome);
    if (!grupo) return;

    setEditingGrupoNome(grupoNome);
    setPerfilNome(grupoNome);

    // Descobre qual a maior parcela salva neste perfil (ex: 21, 24)
    let maiorParcela = 24;
    grupo.itens.forEach((item: any) => {
      const parte = (item.nome?.split(' | ')[1] || '').toLowerCase();
      if (!parte.includes('débito') && !parte.includes('debito')) {
        const num = parseInt(parte.replace('x', '') || '0');
        if (num > maiorParcela) maiorParcela = num;
      }
    });

    const novasLinhas = criarLinhasPadrao(maiorParcela).map((linhaPadrao) => {
      const itemEncontrado = grupo.itens.find((item: any) => {
        const parte = (item.nome?.split(' | ')[1] || '').toLowerCase();
        if (linhaPadrao.parcelas === 0) {
          return parte.includes('débito') || parte.includes('debito') || parte === '0x';
        }
        return parte === `${linhaPadrao.parcelas}x` || parte === `${linhaPadrao.parcelas}`;
      });

      if (itemEncontrado) {
        return {
          ...linhaPadrao,
          taxaBaseMaster: itemEncontrado.taxa_base_master !== null && itemEncontrado.taxa_base_master !== undefined ? String(itemEncontrado.taxa_base_master) : '',
          taxaBaseElo: itemEncontrado.taxa_base_elo !== null && itemEncontrado.taxa_base_elo !== undefined ? String(itemEncontrado.taxa_base_elo) : '',
          taxaClienteMaster: itemEncontrado.taxa_cliente_master !== null && itemEncontrado.taxa_cliente_master !== undefined ? String(itemEncontrado.taxa_cliente_master) : '',
          taxaClienteElo: itemEncontrado.taxa_cliente_elo !== null && itemEncontrado.taxa_cliente_elo !== undefined ? String(itemEncontrado.taxa_cliente_elo) : '',
        };
      }
      return linhaPadrao;
    });

    setLinhas(novasLinhas);

    const temAumentada = grupo.itens.some(
      (i: any) => Number(i.taxa_cliente_master) !== Number(i.taxa_base_master) || Number(i.taxa_cliente_elo) !== Number(i.taxa_base_elo)
    );
    setUsarTaxasAumentadas(temAumentada);
    setMostrarFormulario(true);
  };

  const salvarPerfil = async () => {
    if (!lojaIdAtual) return alert('Erro: Loja não identificada.');
    if (!perfilNome.trim()) return alert('Dê um nome para o perfil.');
    if (!editingGrupoNome && !podeAdicionar) return alert('Máximo de 3 perfis por loja.');

    const preenchidas = linhas.filter((linha) => linha.taxaBaseMaster.trim() !== '');
    if (preenchidas.length === 0) return alert('Preencha pelo menos a taxa Base Master (Débito ou parcelas).');

    // Se estiver editando, desativa o grupo antigo primeiro
    if (editingGrupoNome) {
      const idsAntigos = perfisAgrupados.find(g => g.nome === editingGrupoNome)?.itens.map((i: any) => i.id);
      if (idsAntigos && idsAntigos.length > 0) {
        await supabase.from('taxas_maquininha').update({ ativo: false }).in('id', idsAntigos);
      }
    }

    const inserts = preenchidas.map((linha) => {
      const tBaseMaster = Number(linha.taxaBaseMaster || 0);
      const tBaseElo = linha.taxaBaseElo ? Number(linha.taxaBaseElo) : tBaseMaster;
      const tCliMaster = usarTaxasAumentadas && linha.taxaClienteMaster ? Number(linha.taxaClienteMaster) : tBaseMaster;
      const tCliElo = usarTaxasAumentadas && linha.taxaClienteElo ? Number(linha.taxaClienteElo) : tBaseElo;

      const rotulo = linha.parcelas === 0 ? 'Débito' : `${linha.parcelas}x`;

      return {
        loja_id: lojaIdAtual,
        nome: `${perfilNome.trim()} | ${rotulo}`,
        taxa_base_master: tBaseMaster,
        taxa_base_elo: tBaseElo,
        taxa_cliente_master: tCliMaster,
        taxa_cliente_elo: tCliElo,
        ativo: true,
      };
    });

    const { error } = await supabase.from('taxas_maquininha').insert(inserts);

    if (!error) {
      resetarFormulario();
      await carregarPerfis();
      alert(editingGrupoNome ? 'Perfil de taxas atualizado com sucesso!' : 'Perfil de taxas salvo com sucesso!');
    } else {
      alert(`Erro ao salvar perfil: ${error.message}`);
    }
  };

  const removerPerfil = async (grupoNome: string) => {
    if (!confirm(`Tem certeza que deseja excluir o perfil "${grupoNome}"?`)) return;
    const idsParaRemover = perfisAgrupados.find(g => g.nome === grupoNome)?.itens.map(i => i.id);
    if (!idsParaRemover || idsParaRemover.length === 0) return;
    await supabase.from('taxas_maquininha').update({ ativo: false }).in('id', idsParaRemover);
    await carregarPerfis();
    if (calcPerfil === grupoNome) setCalcPerfil(''); 
    if (editingGrupoNome === grupoNome) resetarFormulario();
  };

  const calcularMelhorOpcao = () => {
    const grupo = perfisAgrupados.find(g => g.nome === calcPerfil);
    if (!grupo || !calcValorBase) return;

    const base = parseFloat(calcValorBase);

    // FUNÇÃO AUXILIAR PARA FAZER A MATEMÁTICA
    const processarItem = (perfil: any) => {
      const parte = (perfil.nome?.split(' | ')[1] || '1x').toLowerCase();
      const isDebito = parte.includes('débito') || parte.includes('debito') || parte === '0x';
      const numParcelas = isDebito ? 1 : (parseInt(parte.replace('x', '')) || 1);
      const labelExibicao = isDebito ? 'Débito À Vista' : `${numParcelas}x`;

      const taxaBase = calcBandeira === 'master' ? Number(perfil.taxa_base_master) : Number(perfil.taxa_base_elo);
      const taxaCliente = calcBandeira === 'master' ? Number(perfil.taxa_cliente_master) : Number(perfil.taxa_cliente_elo);

      const valorTotalCobrado = base / (1 - (taxaCliente / 100)); 
      const valorDaParcela = valorTotalCobrado / numParcelas;
      const custoMaquininha = valorTotalCobrado * (taxaBase / 100);
      const valorLiquidoRecebido = valorTotalCobrado - custoMaquininha;
      const lucroTaxa = valorLiquidoRecebido - base;

      return { numParcelas, labelExibicao, isDebito, taxaCliente, taxaBase, valorTotalCobrado, valorDaParcela, lucroTaxa };
    };

    if (tipoBusca === 'parcelas') {
      // MODO: BUSCAR PARCELA/MODALIDADE ESPECÍFICA
      const isBuscandoDebito = calcParcelaSelecionada.toLowerCase().includes('debito') || calcParcelaSelecionada === '0';
      
      const perfilExato = grupo.itens.find(p => {
        const parte = (p.nome?.split(' | ')[1] || '').toLowerCase();
        if (isBuscandoDebito) {
          return parte.includes('débito') || parte.includes('debito') || parte === '0x';
        }
        return parte === `${calcParcelaSelecionada}x` || parte === calcParcelaSelecionada;
      });

      if (!perfilExato) {
        alert(isBuscandoDebito ? 'A modalidade Débito não está cadastrada neste perfil de taxa.' : 'Esta quantidade de parcelas não está cadastrada neste perfil de taxa.');
        return;
      }
      setCalcResultado(processarItem(perfilExato));

    } else {
      // MODO: BUSCAR POR ALVO (INTELIGENTE)
      if (!calcValorAlvo) return;
      const alvo = parseFloat(calcValorAlvo);
      let melhorOpcao = null;
      let menorDiferenca = Infinity;

      grupo.itens.forEach(perfil => {
        const resultadoItem = processarItem(perfil);
        const valorComparacao = calcModoAlvo === 'parcela' ? resultadoItem.valorDaParcela : resultadoItem.valorTotalCobrado;
        const diferenca = Math.abs(valorComparacao - alvo);

        if (diferenca < menorDiferenca) {
          menorDiferenca = diferenca;
          melhorOpcao = resultadoItem;
        }
      });
      setCalcResultado(melhorOpcao);
    }
  };

  const tabelaTodasParcelas = useMemo(() => {
    const grupo = perfisAgrupados.find((g) => g.nome === calcPerfil);
    if (!grupo || !calcValorBase || isNaN(parseFloat(calcValorBase))) return [];

    const base = parseFloat(calcValorBase);

    return grupo.itens.map((perfil: any) => {
      const parte = (perfil.nome?.split(' | ')[1] || '1x').toLowerCase();
      const isDebito = parte.includes('débito') || parte.includes('debito') || parte === '0x';
      const numParcelas = isDebito ? 1 : parseInt(parte.replace('x', '')) || 1;
      const labelExibicao = isDebito ? 'Débito (À Vista)' : `${numParcelas}x`;

      const taxaBase = calcBandeira === 'master' ? Number(perfil.taxa_base_master) : Number(perfil.taxa_base_elo);
      const taxaCliente = calcBandeira === 'master' ? Number(perfil.taxa_cliente_master) : Number(perfil.taxa_cliente_elo);

      const valorTotalCobrado = base / (1 - taxaCliente / 100);
      const valorDaParcela = valorTotalCobrado / numParcelas;
      const custoMaquininha = valorTotalCobrado * (taxaBase / 100);
      const valorLiquidoRecebido = valorTotalCobrado - custoMaquininha;
      const lucroTaxa = valorLiquidoRecebido - base;

      return {
        id: perfil.id,
        numParcelas,
        labelExibicao,
        isDebito,
        taxaCliente,
        taxaBase,
        valorTotalCobrado,
        valorDaParcela,
        lucroTaxa,
        valorLiquidoRecebido,
      };
    });
  }, [perfisAgrupados, calcPerfil, calcValorBase, calcBandeira]);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 px-2 pb-16 font-sans">
      
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Taxas de Maquininha</h1>
        <p className="text-sm md:text-base font-medium text-slate-600 dark:text-slate-400">Calcule as parcelas no Débito ou Crédito (até 24x) pro cliente e veja seu lucro real.</p>
      </div>

      {/* BLOCO DA CALCULADORA */}
      {perfisAgrupados.length > 0 && (
        <div className="rounded-[2rem] border border-cyan-500/30 bg-slate-950 p-5 md:p-6 text-white shadow-xl shadow-cyan-900/20">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-cyan-400">
              <Calculator className="w-4 h-4" /> Simulador de Taxas
            </div>
            {/* BOTÃO PARA ALTERNAR O MODO DE BUSCA */}
            <button 
              onClick={() => {
                setTipoBusca(prev => prev === 'parcelas' ? 'alvo' : 'parcelas');
                setCalcResultado(null);
              }}
              className="flex items-center gap-2 text-[11px] font-bold bg-cyan-950/40 text-cyan-300 px-3 py-1.5 rounded-full border border-cyan-500/20 hover:bg-cyan-900/40 transition-colors uppercase tracking-wider"
            >
              <ArrowRightLeft className="w-3 h-3" />
              {tipoBusca === 'parcelas' ? 'Mudar para Busca por Alvo' : 'Mudar para Seleção Direta'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-5 items-end">
            <div className="w-full">
              <label className="mb-2 block text-[13px] font-semibold text-slate-300">Maquininha</label>
              <select 
                className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-medium text-white outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all cursor-pointer" 
                value={calcPerfil} 
                onChange={(e) => { setCalcPerfil(e.target.value); setCalcResultado(null); }}
              >
                {perfisAgrupados.map(g => <option key={g.nome} value={g.nome}>{g.nome}</option>)}
              </select>
            </div>
            
            <div className="w-full">
              <label className="mb-2 block text-[13px] font-semibold text-slate-300">Bandeira</label>
              <select className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-medium text-white outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all cursor-pointer" value={calcBandeira} onChange={(e) => setCalcBandeira(e.target.value as 'master'|'elo')}>
                <option value="master">Master / Visa</option>
                <option value="elo">Elo / Hiper / Outras</option>
              </select>
            </div>
            
            <div className="w-full">
              <label className="mb-2 block text-[13px] font-semibold text-slate-300">Valor Produto (R$)</label>
              <input type="number" className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all" placeholder="Ex: 3500" value={calcValorBase} onChange={(e) => setCalcValorBase(e.target.value)} />
            </div>
            
            <div className="w-full">
              <label className="mb-2 block text-[13px] font-semibold text-cyan-300">
                {tipoBusca === 'parcelas' ? 'Modalidade / Parcelas' : 'Alvo do Cliente'}
              </label>
              
              {tipoBusca === 'parcelas' ? (
                <select 
                  className="w-full rounded-xl border border-cyan-500/30 bg-slate-900/80 px-3.5 py-2.5 text-sm font-medium text-white outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all cursor-pointer" 
                  value={calcParcelaSelecionada} 
                  onChange={(e) => setCalcParcelaSelecionada(e.target.value)}
                >
                  {perfisAgrupados.find(g => g.nome === calcPerfil)?.itens.map(p => {
                    const parte = p.nome?.split(' | ')[1] || '1x';
                    const isDebito = parte.toLowerCase().includes('débito') || parte.toLowerCase().includes('debito') || parte === '0x';
                    const val = isDebito ? 'Debito' : parte.replace('x', '');
                    const labelStr = isDebito ? '💵 DÉBITO (À Vista)' : `💳 ${parte}`;
                    return <option key={p.id} value={val}>{labelStr}</option>;
                  })}
                </select>
              ) : (
                <div className="flex rounded-xl border border-cyan-500/30 bg-slate-900/80 overflow-hidden focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500 transition-all">
                  <input type="number" className="w-full bg-transparent px-3.5 py-2.5 text-sm font-medium text-white outline-none placeholder:text-slate-500" placeholder="Ex: 350" value={calcValorAlvo} onChange={(e) => setCalcValorAlvo(e.target.value)} />
                  <select className="bg-slate-800/80 px-2 py-2.5 text-xs font-semibold text-slate-300 outline-none border-l border-white/10 cursor-pointer" value={calcModoAlvo} onChange={(e) => setCalcModoAlvo(e.target.value as 'parcela'|'total')}>
                    <option value="parcela">/mês</option>
                    <option value="total">Total</option>
                  </select>
                </div>
              )}
            </div>
            
            <div className="w-full sm:col-span-2 lg:col-span-1">
              <Button onClick={calcularMelhorOpcao} className="w-full gap-2 bg-cyan-600 font-semibold text-white hover:bg-cyan-500 rounded-xl h-[42px] shadow-lg shadow-cyan-900/20">
                <Search className="w-4 h-4" /> Calcular
              </Button>
            </div>
          </div>

          {calcResultado && (
            <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 animate-in fade-in slide-in-from-top-2">
              <div className="flex-1">
                <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest mb-1">
                  {tipoBusca === 'parcelas' ? 'Resultado do Cálculo' : 'A melhor opção pro cliente é'}
                </p>
                <p className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  {calcResultado.isDebito ? (
                    <>💳 <span className="text-purple-300">DÉBITO</span>: <span className="text-emerald-400">R$ {calcResultado.valorTotalCobrado.toFixed(2)}</span></>
                  ) : (
                    <>{calcResultado.numParcelas}x de <span className="text-emerald-400">R$ {calcResultado.valorDaParcela.toFixed(2)}</span></>
                  )}
                </p>
                <p className="text-[13px] font-medium text-slate-300 mt-2">
                  Total passado na máquina: <strong className="text-white">R$ {calcResultado.valorTotalCobrado.toFixed(2)}</strong>
                </p>
              </div>
              <div className="flex-1 text-left md:text-right border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6">
                <p className="text-[11px] font-bold text-slate-400 flex items-center md:justify-end gap-1.5 uppercase tracking-widest">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400"/> Lucro líquido na taxa
                </p>
                <p className={`text-xl md:text-2xl font-extrabold tracking-tight mt-1 ${calcResultado.lucroTaxa > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                  + R$ {calcResultado.lucroTaxa.toFixed(2)}
                </p>
                <p className="text-[12px] font-medium text-slate-400 mt-2 bg-black/20 inline-block px-2.5 py-1 rounded-md">
                  Taxa Cliente: <span className="text-white">{calcResultado.taxaCliente}%</span> • Custo Máq: <span className="text-white">{calcResultado.taxaBase}%</span>
                </p>
              </div>
            </div>
          )}

          {/* TABELA COMPARATIVA DE TODAS AS PARCELAS */}
          {tabelaTodasParcelas.length > 0 && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/90 p-4 md:p-5 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-white/10 gap-2">
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-widest flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-400" /> Tabela Completa de Parcelamento ({calcPerfil} - {calcBandeira === 'master' ? 'Master / Visa' : 'Elo / Hiper'})
                </h3>
                <span className="text-xs font-semibold text-slate-400">
                  Valor Produto: <strong className="text-white">R$ {parseFloat(calcValorBase || '0').toFixed(2).replace('.', ',')}</strong>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-medium border-collapse min-w-[620px]">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">Modalidade</th>
                      <th className="py-2.5 px-3">Taxa Cliente</th>
                      <th className="py-2.5 px-3">Valor da Parcela</th>
                      <th className="py-2.5 px-3">Total na Maquininha</th>
                      <th className="py-2.5 px-3">Custo Máquina</th>
                      <th className="py-2.5 px-3 text-right">Lucro na Taxa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {tabelaTodasParcelas.map((row) => {
                      const isSelected = calcResultado && (
                        (row.isDebito && calcResultado.isDebito) ||
                        (!row.isDebito && !calcResultado.isDebito && row.numParcelas === calcResultado.numParcelas)
                      );

                      return (
                        <tr 
                          key={row.id}
                          className={`transition-colors ${
                            isSelected 
                              ? 'bg-cyan-500/25 font-bold border-l-4 border-cyan-400' 
                              : row.isDebito 
                                ? 'bg-purple-950/20 hover:bg-purple-950/40' 
                                : 'hover:bg-white/5'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            {row.isDebito ? (
                              <span className="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                                💵 DÉBITO
                              </span>
                            ) : (
                              <span className="text-white font-extrabold text-xs">{row.labelExibicao}</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-cyan-300 font-semibold">
                            {row.taxaCliente.toFixed(2)}%
                          </td>

                          <td className="py-2.5 px-3 text-white font-black text-xs sm:text-sm">
                            R$ {row.valorDaParcela.toFixed(2).replace('.', ',')}
                            {!row.isDebito && <span className="text-[10px] text-slate-400 font-normal"> /mês</span>}
                          </td>

                          <td className="py-2.5 px-3 text-slate-200">
                            R$ {row.valorTotalCobrado.toFixed(2).replace('.', ',')}
                          </td>

                          <td className="py-2.5 px-3 text-slate-400">
                            {row.taxaBase.toFixed(2)}%
                          </td>

                          <td className="py-2.5 px-3 text-right font-bold">
                            <span className={row.lucroTaxa > 0 ? 'text-emerald-400' : 'text-slate-400'}>
                              {row.lucroTaxa > 0 ? `+ R$ ${row.lucroTaxa.toFixed(2).replace('.', ',')}` : `R$ ${row.lucroTaxa.toFixed(2).replace('.', ',')}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BLOCO DE CADASTRO E EDIÇÃO DE PERFIL */}
      <div className="rounded-[2rem] border border-white/10 bg-slate-950 p-5 md:p-6 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-300">
            <CreditCard className="w-4 h-4 text-cyan-400" /> 
            {editingGrupoNome ? (
              <span className="text-cyan-300">Editando Perfil: {editingGrupoNome}</span>
            ) : (
              <span>Cadastrar Novo Perfil de Taxas (Até 24x)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editingGrupoNome && (
              <Button 
                variant="outline" 
                onClick={resetarFormulario} 
                className="gap-1.5 border-white/15 bg-white/10 text-xs font-semibold text-slate-300 hover:bg-white/20 h-[42px] rounded-xl"
              >
                <X className="w-4 h-4" /> Cancelar Edição
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={() => {
                if (mostrarFormulario && editingGrupoNome) {
                  resetarFormulario();
                } else {
                  setMostrarFormulario((v) => !v);
                }
              }} 
              className="gap-2 border-white/15 bg-white/10 text-sm font-semibold text-white hover:bg-white/20 h-[42px] rounded-xl w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" /> {mostrarFormulario ? 'Fechar Formulário' : 'Adicionar Perfil'}
            </Button>
          </div>
        </div>

        {mostrarFormulario && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6 backdrop-blur-xl animate-in fade-in zoom-in-95">
            
            <div className="flex flex-col lg:flex-row lg:items-end gap-5 mb-6 pb-6 border-b border-white/10">
              <div className="flex-1">
                <label className="mb-2 block text-[13px] font-semibold text-slate-200">Nome da Maquininha / Perfil</label>
                <input 
                  className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all" 
                  placeholder="Ex: InfinitePay, Ton, Stone, Mercado Pago..." 
                  value={perfilNome} 
                  onChange={(e) => setPerfilNome(e.target.value)} 
                />
              </div>
              
              <div className="flex items-center gap-3 bg-cyan-950/30 p-3 rounded-xl border border-cyan-500/30 w-full lg:w-auto">
                <input type="checkbox" id="taxas-aumentadas" className="w-5 h-5 accent-cyan-500 rounded cursor-pointer" checked={usarTaxasAumentadas} onChange={(e) => setUsarTaxasAumentadas(e.target.checked)} />
                <label htmlFor="taxas-aumentadas" className="text-[13px] font-bold text-cyan-200 cursor-pointer select-none">
                  Ativar Taxas Aumentadas (Lucro)
                </label>
              </div>
            </div>

            <div className="grid gap-3 xl:max-h-[480px] overflow-y-auto pr-1">
              {linhas.map((linha, index) => {
                const isDebito = linha.parcelas === 0;
                return (
                  <div 
                    key={index} 
                    className={`rounded-xl border p-3.5 flex flex-col md:flex-row md:items-center gap-4 transition-colors ${
                      isDebito 
                        ? 'border-purple-500/30 bg-purple-950/20 hover:border-purple-500/50' 
                        : 'border-white/5 bg-slate-900/60 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 shrink-0 min-w-[90px]">
                      {isDebito ? (
                        <span className="text-xs font-black bg-purple-600 text-white px-2.5 py-1 rounded-lg uppercase tracking-wider">
                          DÉBITO
                        </span>
                      ) : (
                        <span className="text-base font-extrabold text-white">{linha.label}</span>
                      )}
                    </div>
                    
                    {/* TAXAS BASE */}
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1.5 block">
                          Master/Visa ({isDebito ? 'Débito' : 'Base'})
                        </label>
                        <input 
                          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-medium text-white outline-none focus:border-cyan-500 transition-colors" 
                          type="number" 
                          step="0.01" 
                          placeholder={isDebito ? "Ex: 1.2" : "Ex: 3.5"} 
                          value={linha.taxaBaseMaster} 
                          onChange={(e) => atualizarLinha(index, 'taxaBaseMaster', e.target.value)} 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1.5 block">
                          Elo ({isDebito ? 'Débito' : 'Base'})
                        </label>
                        <input 
                          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-medium text-white outline-none focus:border-cyan-500 transition-colors" 
                          type="number" 
                          step="0.01" 
                          placeholder={isDebito ? "Ex: 1.99" : "Ex: 4.2"} 
                          value={linha.taxaBaseElo} 
                          onChange={(e) => atualizarLinha(index, 'taxaBaseElo', e.target.value)} 
                        />
                      </div>
                    </div>

                    {/* TAXAS CLIENTE */}
                    {usarTaxasAumentadas && (
                      <div className="flex-1 grid grid-cols-2 gap-3 border-t md:border-t-0 md:border-l border-white/10 pt-3 md:pt-0 md:pl-5">
                        <div>
                          <label className="text-[10px] text-cyan-400 uppercase font-bold tracking-wider mb-1.5 block">
                            Master/Visa (Cliente)
                          </label>
                          <input 
                            className="w-full rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-2 text-sm font-medium text-cyan-100 outline-none focus:border-cyan-400 transition-colors placeholder:text-cyan-800" 
                            type="number" 
                            step="0.01" 
                            placeholder="Ex: 5.0" 
                            value={linha.taxaClienteMaster} 
                            onChange={(e) => atualizarLinha(index, 'taxaClienteMaster', e.target.value)} 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-cyan-400 uppercase font-bold tracking-wider mb-1.5 block">
                            Elo (Cliente)
                          </label>
                          <input 
                            className="w-full rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-2 text-sm font-medium text-cyan-100 outline-none focus:border-cyan-400 transition-colors placeholder:text-cyan-800" 
                            type="number" 
                            step="0.01" 
                            placeholder="Ex: 6.0" 
                            value={linha.taxaClienteElo} 
                            onChange={(e) => atualizarLinha(index, 'taxaClienteElo', e.target.value)} 
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/10">
              <Button type="button" onClick={adicionarLinha} variant="secondary" className="gap-2 bg-white/10 font-semibold text-white hover:bg-white/20 w-full sm:w-auto h-[42px] rounded-xl">
                <Plus className="w-4 h-4" /> Adicionar Parcela Extra (+1x)
              </Button>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {editingGrupoNome && (
                  <Button type="button" onClick={resetarFormulario} variant="ghost" className="text-slate-400 hover:text-white w-full sm:w-auto">
                    Cancelar
                  </Button>
                )}
                <Button type="button" onClick={salvarPerfil} className="gap-2 bg-cyan-600 font-semibold text-white hover:bg-cyan-500 w-full sm:w-auto h-[42px] rounded-xl shadow-lg shadow-cyan-900/20">
                  <Save className="w-4 h-4" /> {editingGrupoNome ? 'Salvar Alterações' : 'Salvar Perfil'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {!editingGrupoNome && !podeAdicionar && (
          <p className="mt-5 text-[13px] font-medium text-amber-400 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
            Você já atingiu o limite de 3 perfis de taxas para esta loja. Use o botão <b>Editar</b> para alterar um perfil existente.
          </p>
        )}
      </div>

      {/* BLOCO DA LISTA DE CADASTRADOS */}
      <div className="rounded-[2rem] border border-slate-200/50 bg-white/80 p-5 md:p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Perfis Cadastrados</h2>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2.5 py-1 rounded-md">{perfisAgrupados.length}/3</span>
        </div>

        {loading ? (
          <p className="pt-6 text-sm font-medium text-slate-600 dark:text-slate-400 text-center">Carregando as taxas...</p>
        ) : perfisAgrupados.length === 0 ? (
          <p className="pt-6 text-sm font-medium text-slate-600 dark:text-slate-400 text-center">Nenhum perfil cadastrado. Adicione um perfil acima para simular vendas.</p>
        ) : (
          <div className="space-y-4 pt-5">
            {perfisAgrupados.map((grupo) => (
              <div key={grupo.nome} className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/50 hover:border-cyan-500/30 transition-colors">
                
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{grupo.nome}</p>
                    {editingGrupoNome === grupo.nome && (
                      <span className="text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                        Em edição
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => editarPerfil(grupo.nome)} 
                      className="shrink-0 border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/20 rounded-lg font-semibold flex-1 md:flex-none"
                    >
                      <Edit className="w-3.5 h-3.5 mr-1.5" /> Editar Perfil
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => removerPerfil(grupo.nome)} 
                      className="shrink-0 bg-red-500/15 text-red-600 hover:bg-red-500/30 hover:text-red-500 dark:text-red-400 rounded-lg font-semibold flex-1 md:flex-none"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Excluir
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
                  {grupo.itens.map((perfil) => {
                    const parte = perfil.nome?.split(' | ')[1] || '1x';
                    const isDebito = parte.toLowerCase().includes('débito') || parte.toLowerCase().includes('debito') || parte === '0x';
                    return (
                      <div 
                        key={perfil.id} 
                        className={`rounded-xl p-2.5 flex flex-col gap-1.5 ${
                          isDebito 
                            ? 'border border-purple-500/40 bg-purple-500/10 dark:bg-purple-950/30' 
                            : 'border border-cyan-500/20 bg-cyan-500/5 dark:bg-cyan-950/20'
                        }`}
                      >
                        <strong className={`text-[12px] font-extrabold pb-1 border-b ${isDebito ? 'text-purple-400 border-purple-500/20' : 'text-cyan-700 dark:text-cyan-400 border-cyan-500/10'}`}>
                          {isDebito ? '💵 DÉBITO' : parte}
                        </strong>
                        
                        <div className="flex justify-between items-center text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          <span>M/V:</span>
                          <span className="font-bold text-slate-900 dark:text-white">{perfil.taxa_cliente_master}%</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          <span>Elo:</span>
                          <span className="font-bold text-slate-900 dark:text-white">{perfil.taxa_cliente_elo}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
