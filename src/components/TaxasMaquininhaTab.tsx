'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, Percent, Calculator, Search, TrendingUp, CreditCard, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';

interface LinhaTaxa {
  parcelas: number;
  taxaBaseMaster: string;
  taxaBaseElo: string;
  taxaClienteMaster: string;
  taxaClienteElo: string;
}

export function TaxasMaquininhaTab() {
  const { usuario } = useAuth();
  const [perfis, setPerfis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [perfilNome, setPerfilNome] = useState('');
  
  const [usarTaxasAumentadas, setUsarTaxasAumentadas] = useState(false);

  const [linhas, setLinhas] = useState<LinhaTaxa[]>(
    Array.from({ length: 12 }, (_, index) => ({ 
      parcelas: index + 1, 
      taxaBaseMaster: '', taxaBaseElo: '', 
      taxaClienteMaster: '', taxaClienteElo: '' 
    }))
  );

  // Estados da Calculadora
  const [calcPerfil, setCalcPerfil] = useState('');
  const [calcBandeira, setCalcBandeira] = useState<'master' | 'elo'>('master');
  const [calcValorBase, setCalcValorBase] = useState('');
  
  // Modos de cálculo: 'parcelas' (fixo) ou 'alvo' (busca inteligente)
  const [tipoBusca, setTipoBusca] = useState<'parcelas' | 'alvo'>('parcelas');
  
  const [calcParcelaSelecionada, setCalcParcelaSelecionada] = useState('1'); // Ex: '1', '2'
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
        const numA = parseInt(a.nome?.split(' | ')[1] || '0');
        const numB = parseInt(b.nome?.split(' | ')[1] || '0');
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
    setLinhas((prev) => [...prev, { parcelas: prev.length + 1, taxaBaseMaster: '', taxaBaseElo: '', taxaClienteMaster: '', taxaClienteElo: '' }]);
  };

  const salvarPerfil = async () => {
    if (!lojaIdAtual) return alert('Erro: Loja não identificada.');
    if (!perfilNome.trim()) return alert('Dê um nome para o perfil.');
    if (!podeAdicionar) return alert('Máximo de 3 perfis por loja.');

    const preenchidas = linhas.filter((linha) => linha.taxaBaseMaster.trim() !== '');
    if (preenchidas.length === 0) return alert('Preencha pelo menos a taxa Base Master em alguma parcela.');

    const inserts = preenchidas.map((linha) => {
      const tBaseMaster = Number(linha.taxaBaseMaster || 0);
      const tBaseElo = linha.taxaBaseElo ? Number(linha.taxaBaseElo) : tBaseMaster;
      const tCliMaster = usarTaxasAumentadas && linha.taxaClienteMaster ? Number(linha.taxaClienteMaster) : tBaseMaster;
      const tCliElo = usarTaxasAumentadas && linha.taxaClienteElo ? Number(linha.taxaClienteElo) : tBaseElo;

      return {
        loja_id: lojaIdAtual,
        nome: `${perfilNome.trim()} | ${linha.parcelas}x`,
        taxa_base_master: tBaseMaster,
        taxa_base_elo: tBaseElo,
        taxa_cliente_master: tCliMaster,
        taxa_cliente_elo: tCliElo,
        ativo: true,
      };
    });

    const { error } = await supabase.from('taxas_maquininha').insert(inserts);

    if (!error) {
      setPerfilNome('');
      setUsarTaxasAumentadas(false);
      setLinhas(Array.from({ length: 12 }, (_, index) => ({ parcelas: index + 1, taxaBaseMaster: '', taxaBaseElo: '', taxaClienteMaster: '', taxaClienteElo: '' })));
      setMostrarFormulario(false);
      await carregarPerfis();
    } else {
      alert(`Deu bosta ao salvar: ${error.message}`);
    }
  };

  const removerPerfil = async (grupoNome: string) => {
    const idsParaRemover = perfisAgrupados.find(g => g.nome === grupoNome)?.itens.map(i => i.id);
    if (!idsParaRemover || idsParaRemover.length === 0) return;
    await supabase.from('taxas_maquininha').update({ ativo: false }).in('id', idsParaRemover);
    await carregarPerfis();
    if (calcPerfil === grupoNome) setCalcPerfil(''); 
  };

  const calcularMelhorOpcao = () => {
    const grupo = perfisAgrupados.find(g => g.nome === calcPerfil);
    if (!grupo || !calcValorBase) return;

    const base = parseFloat(calcValorBase);

    // FUNÇÃO AUXILIAR PARA FAZER A MATEMÁTICA
    const processarItem = (perfil: any) => {
      const numParcelas = parseInt(perfil.nome?.split(' | ')[1] || '1');
      const taxaBase = calcBandeira === 'master' ? Number(perfil.taxa_base_master) : Number(perfil.taxa_base_elo);
      const taxaCliente = calcBandeira === 'master' ? Number(perfil.taxa_cliente_master) : Number(perfil.taxa_cliente_elo);

      const valorTotalCobrado = base / (1 - (taxaCliente / 100)); 
      const valorDaParcela = valorTotalCobrado / numParcelas;
      const custoMaquininha = valorTotalCobrado * (taxaBase / 100);
      const valorLiquidoRecebido = valorTotalCobrado - custoMaquininha;
      const lucroTaxa = valorLiquidoRecebido - base;

      return { numParcelas, taxaCliente, taxaBase, valorTotalCobrado, valorDaParcela, lucroTaxa };
    };

    if (tipoBusca === 'parcelas') {
      // MODO: BUSCAR PARCELA ESPECÍFICA
      const perfilExato = grupo.itens.find(p => p.nome?.endsWith(` | ${calcParcelaSelecionada}x`));
      if (!perfilExato) {
        alert('Ô sô, essa quantidade de parcelas não tá cadastrada nesse perfil não!');
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

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 px-2 pb-16 font-sans">
      
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Taxas de Maquininha</h1>
        <p className="text-sm md:text-base font-medium text-slate-600 dark:text-slate-400">Calcule as parcelas pro cliente e veja seu lucro com taxas ajustadas.</p>
      </div>

      {/* BLOCO DA CALCULADORA */}
      {perfisAgrupados.length > 0 && (
        <div className="rounded-[2rem] border border-cyan-500/30 bg-slate-950 p-5 md:p-6 text-white shadow-xl shadow-cyan-900/20">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-cyan-400">
              <Calculator className="w-4 h-4" /> Simulador
            </div>
            {/* BOTÃO PARA ALTERNAR O MODO DE BUSCA */}
            <button 
              onClick={() => {
                setTipoBusca(prev => prev === 'parcelas' ? 'alvo' : 'parcelas');
                setCalcResultado(null); // Limpa o resultado ao trocar de modo
              }}
              className="flex items-center gap-2 text-[11px] font-bold bg-cyan-950/40 text-cyan-300 px-3 py-1.5 rounded-full border border-cyan-500/20 hover:bg-cyan-900/40 transition-colors uppercase tracking-wider"
            >
              <ArrowRightLeft className="w-3 h-3" />
              {tipoBusca === 'parcelas' ? 'Mudar para Alvo' : 'Mudar para Parcelas'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-5 items-end">
            <div className="w-full">
              <label className="mb-2 block text-[13px] font-semibold text-slate-300">Maquininha</label>
              <select className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-medium text-white outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all cursor-pointer" value={calcPerfil} onChange={(e) => { setCalcPerfil(e.target.value); setCalcResultado(null); }}>
                {perfisAgrupados.map(g => <option key={g.nome} value={g.nome}>{g.nome}</option>)}
              </select>
            </div>
            
            <div className="w-full">
              <label className="mb-2 block text-[13px] font-semibold text-slate-300">Bandeira</label>
              <select className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-medium text-white outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all cursor-pointer" value={calcBandeira} onChange={(e) => setCalcBandeira(e.target.value as 'master'|'elo')}>
                <option value="master">Master/Visa</option>
                <option value="elo">Elo/Outras</option>
              </select>
            </div>
            
            <div className="w-full">
              <label className="mb-2 block text-[13px] font-semibold text-slate-300">Valor Produto (R$)</label>
              <input type="number" className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all" placeholder="Ex: 3500" value={calcValorBase} onChange={(e) => setCalcValorBase(e.target.value)} />
            </div>
            
            <div className="w-full">
              <label className="mb-2 block text-[13px] font-semibold text-cyan-300">
                {tipoBusca === 'parcelas' ? 'Qtd. de Parcelas' : 'Alvo do Cliente'}
              </label>
              
              {tipoBusca === 'parcelas' ? (
                <select 
                  className="w-full rounded-xl border border-cyan-500/30 bg-slate-900/80 px-3.5 py-2.5 text-sm font-medium text-white outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all cursor-pointer" 
                  value={calcParcelaSelecionada} 
                  onChange={(e) => setCalcParcelaSelecionada(e.target.value)}
                >
                  {perfisAgrupados.find(g => g.nome === calcPerfil)?.itens.map(p => {
                    const num = p.nome?.split(' | ')[1]?.replace('x', '') || '1';
                    return <option key={p.id} value={num}>{num}x</option>
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
                  {tipoBusca === 'parcelas' ? 'Resultado do Cálculo' : 'A melhor parcela pro cliente é'}
                </p>
                <p className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  {calcResultado.numParcelas}x de <span className="text-emerald-400">R$ {calcResultado.valorDaParcela.toFixed(2)}</span>
                </p>
                <p className="text-[13px] font-medium text-slate-300 mt-2">
                  Total passado na máquina: <strong className="text-white">R$ {calcResultado.valorTotalCobrado.toFixed(2)}</strong>
                </p>
              </div>
              <div className="flex-1 text-left md:text-right border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6">
                <p className="text-[11px] font-bold text-slate-400 flex items-center md:justify-end gap-1.5 uppercase tracking-widest">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400"/> Lucro limpo na taxa
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
        </div>
      )}

      {/* BLOCO DE CADASTRO */}
      <div className="rounded-[2rem] border border-white/10 bg-slate-950 p-5 md:p-6 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-300">
            <CreditCard className="w-4 h-4" /> Cadastrar Taxas
          </div>
          <Button variant="outline" onClick={() => setMostrarFormulario((v) => !v)} className="gap-2 border-white/15 bg-white/10 text-sm font-semibold text-white hover:bg-white/20 h-[42px] rounded-xl w-full sm:w-auto">
            <Plus className="w-4 h-4" /> Adicionar Perfil
          </Button>
        </div>

        {mostrarFormulario && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6 backdrop-blur-xl animate-in fade-in zoom-in-95">
            
            <div className="flex flex-col lg:flex-row lg:items-end gap-5 mb-6 pb-6 border-b border-white/10">
              <div className="flex-1">
                <label className="mb-2 block text-[13px] font-semibold text-slate-200">Nome da Maquininha</label>
                <input className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all" placeholder="Ex: InfinitePay, Stone..." value={perfilNome} onChange={(e) => setPerfilNome(e.target.value)} />
              </div>
              
              <div className="flex items-center gap-3 bg-cyan-950/30 p-3 rounded-xl border border-cyan-500/30 w-full lg:w-auto">
                <input type="checkbox" id="taxas-aumentadas" className="w-5 h-5 accent-cyan-500 rounded cursor-pointer" checked={usarTaxasAumentadas} onChange={(e) => setUsarTaxasAumentadas(e.target.checked)} />
                <label htmlFor="taxas-aumentadas" className="text-[13px] font-bold text-cyan-200 cursor-pointer select-none">
                  Ativar Taxas Aumentadas (Lucro)
                </label>
              </div>
            </div>

            <div className="grid gap-3 xl:max-h-96 overflow-y-auto pr-1">
              {linhas.map((linha, index) => (
                <div key={index} className="rounded-xl border border-white/5 bg-slate-900/60 p-3.5 flex flex-col md:flex-row md:items-center gap-4 hover:border-white/10 transition-colors">
                  <span className="text-base font-extrabold text-white w-10 shrink-0">{linha.parcelas}x</span>
                  
                  {/* TAXAS BASE */}
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1.5 block">Master/Visa (Base)</label>
                      <input className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-medium text-white outline-none focus:border-cyan-500 transition-colors" type="number" step="0.01" placeholder="Ex: 3.5" value={linha.taxaBaseMaster} onChange={(e) => atualizarLinha(index, 'taxaBaseMaster', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1.5 block">Elo (Base)</label>
                      <input className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-medium text-white outline-none focus:border-cyan-500 transition-colors" type="number" step="0.01" placeholder="Ex: 4.2" value={linha.taxaBaseElo} onChange={(e) => atualizarLinha(index, 'taxaBaseElo', e.target.value)} />
                    </div>
                  </div>

                  {/* TAXAS CLIENTE */}
                  {usarTaxasAumentadas && (
                    <div className="flex-1 grid grid-cols-2 gap-3 border-t md:border-t-0 md:border-l border-white/10 pt-3 md:pt-0 md:pl-5">
                      <div>
                        <label className="text-[10px] text-cyan-400 uppercase font-bold tracking-wider mb-1.5 block">Master/Visa (Cliente)</label>
                        <input className="w-full rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-2 text-sm font-medium text-cyan-100 outline-none focus:border-cyan-400 transition-colors placeholder:text-cyan-800" type="number" step="0.01" placeholder="Ex: 5.0" value={linha.taxaClienteMaster} onChange={(e) => atualizarLinha(index, 'taxaClienteMaster', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] text-cyan-400 uppercase font-bold tracking-wider mb-1.5 block">Elo (Cliente)</label>
                        <input className="w-full rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-2 text-sm font-medium text-cyan-100 outline-none focus:border-cyan-400 transition-colors placeholder:text-cyan-800" type="number" step="0.01" placeholder="Ex: 6.0" value={linha.taxaClienteElo} onChange={(e) => atualizarLinha(index, 'taxaClienteElo', e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-white/10">
              <Button type="button" onClick={adicionarLinha} variant="secondary" className="gap-2 bg-white/10 font-semibold text-white hover:bg-white/20 w-full sm:w-auto h-[42px] rounded-xl">
                <Plus className="w-4 h-4" /> Adicionar Mês
              </Button>
              <Button type="button" onClick={salvarPerfil} className="gap-2 bg-cyan-600 font-semibold text-white hover:bg-cyan-500 w-full sm:w-auto h-[42px] rounded-xl shadow-lg shadow-cyan-900/20">
                <Save className="w-4 h-4" /> Salvar Perfil
              </Button>
            </div>
          </div>
        )}

        {!podeAdicionar && <p className="mt-5 text-[13px] font-medium text-amber-400 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">Você já atingiu o limite de 3 perfis para esta loja.</p>}
      </div>

      {/* BLOCO DA LISTA DE CADASTRADOS */}
      <div className="rounded-[2rem] border border-slate-200/50 bg-white/80 p-5 md:p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Perfis Cadastrados</h2>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2.5 py-1 rounded-md">{perfisAgrupados.length}/3</span>
        </div>

        {loading ? (
          <p className="pt-6 text-sm font-medium text-slate-600 dark:text-slate-400 text-center">Carregando as taxas, guenta aí...</p>
        ) : perfisAgrupados.length === 0 ? (
          <p className="pt-6 text-sm font-medium text-slate-600 dark:text-slate-400 text-center">Nenhum perfil cadastrado. A maquininha vai chorar de fome.</p>
        ) : (
          <div className="space-y-4 pt-5">
            {perfisAgrupados.map((grupo) => (
              <div key={grupo.nome} className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/50 hover:border-cyan-500/30 transition-colors">
                
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{grupo.nome}</p>
                  <Button variant="destructive" size="sm" onClick={() => removerPerfil(grupo.nome)} className="shrink-0 bg-red-500/15 text-red-600 hover:bg-red-500/30 hover:text-red-500 dark:text-red-400 rounded-lg font-semibold w-full md:w-auto">
                    <Trash2 className="w-4 h-4 mr-2" /> Excluir Perfil
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                  {grupo.itens.map((perfil) => {
                    const parte = perfil.nome?.split(' | ')[1] || '1x';
                    return (
                      <div key={perfil.id} className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 dark:bg-cyan-950/20 p-2.5 flex flex-col gap-1.5">
                        <strong className="text-[13px] font-extrabold text-cyan-700 dark:text-cyan-400 border-b border-cyan-500/10 pb-1">{parte}</strong>
                        
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
