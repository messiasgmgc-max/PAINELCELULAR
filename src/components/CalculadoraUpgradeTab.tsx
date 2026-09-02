'use client';

import React, { useState, useMemo } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Repeat, 
  Search, 
  Smartphone, 
  DollarSign, 
  Sparkles, 
  MessageCircle, 
  ExternalLink, 
  Copy, 
  Check, 
  Plus, 
  Clock, 
  QrCode, 
  Printer, 
  Sliders, 
  Settings, 
  ArrowUpDown, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  FileText,
  User,
  ShieldCheck,
  Battery,
  Layers,
  ArrowRight,
  Filter,
  Truck,
  Camera,
  Image as ImageIcon,
  MapPin,
  Phone,
  CheckSquare,
  Trash2
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUpgrade, AvaliacaoUpgradeItem, VistoriaUpgradeItem } from '@/hooks/useUpgrade';
import { useMotoboys } from '@/hooks/useMotoboys';
import { supabase } from '@/lib/supabaseClient';
import { 
  calcularAvaliacaoUpgrade, 
  TABELA_BASE_UPGRADE_PADRAO, 
  MODELOS_UPGRADE_DISPONIVEIS, 
  REGRAS_DEDUCAO_PADRAO,
  RespostaCondicaoUpgrade
} from '@/lib/upgradeEngine';
import { toast } from 'sonner';
import { cn, sortModelosCronologico } from '@/lib/utils';

export function CalculadoraUpgradeTab() {
  const { usuario } = useAuth();
  const targetLojaId = usuario?.lojaId || (usuario as any)?.loja_id || 'loja-principal';

  const {
    avaliacoes,
    vistorias,
    tabelaPrecos,
    regrasDeducao,
    loading,
    salvarAvaliacao,
    atualizarStatusAvaliacao,
    atualizarStatusVistoria,
    salvarConfiguracoesPrecos,
    fetchAvaliacoes,
    fetchVistorias,
  } = useUpgrade(targetLojaId);

  const { motoboys, cadastrarMotoboy, excluirMotoboy } = useMotoboys(targetLojaId);

  // Sub-abas: 'leads' | 'vistorias' | 'motoboys' | 'balcao' | 'tabela' | 'divulgacao'
  const [subAba, setSubAba] = useState<'leads' | 'vistorias' | 'motoboys' | 'balcao' | 'tabela' | 'divulgacao'>('leads');

  // Filtros de Leads
  const [buscaLead, setBuscaLead] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [itemSelecionado, setItemSelecionado] = useState<AvaliacaoUpgradeItem | null>(null);
  const [modalDetalhesAberto, setModalDetalhesAberto] = useState(false);
  const [novoValorAprovado, setNovoValorAprovado] = useState<string>('');

  // Estados de Vistorias dos Motoboys
  const [buscaVistoria, setBuscaVistoria] = useState('');
  const [filtroStatusVistoria, setFiltroStatusVistoria] = useState<string>('todos');
  const [fotoModalAberta, setFotoModalAberta] = useState<{ url: string; titulo: string } | null>(null);
  const [modalMotoboysAberto, setModalMotoboysAberto] = useState(false);
  const [novoMotoboyNome, setNovoMotoboyNome] = useState('');
  const [novoMotoboyTel, setNovoMotoboyTel] = useState('');
  const [novoMotoboyVeiculo, setNovoMotoboyVeiculo] = useState('Moto');
  const [novoMotoboyPlaca, setNovoMotoboyPlaca] = useState('');

  // Estados do Simulador de Balcão
  const [modeloBalcao, setModeloBalcao] = useState<string>('iPhone 13');
  const [capacidadeBalcao, setCapacidadeBalcao] = useState<string>('128GB');
  const [condicoesBalcao, setCondicoesBalcao] = useState<RespostaCondicaoUpgrade>({
    bateriaPercentual: 86,
    estadoTela: 'original_impecavel',
    estadoCarcaca: 'impecavel',
    faceIdFunciona: true,
    camerasFuncionam: true,
    temCaixaAcessorios: true,
    conectorCarregadorOk: true,
  });
  const [clienteBalcaoNome, setClienteBalcaoNome] = useState('');
  const [clienteBalcaoTel, setClienteBalcaoTel] = useState('');
  const [clienteBalcaoInteresse, setClienteBalcaoInteresse] = useState('');

  // Estados do Editor da Tabela de Preços
  const [tabelaEditavel, setTabelaEditavel] = useState<Record<string, Record<string, number>>>(tabelaPrecos);
  const [regrasEditaveis, setRegrasEditaveis] = useState(regrasDeducao);
  const [modeloEditor, setModeloEditor] = useState<string>('iPhone 13');

  // Adicionar Novo Modelo na Tabela
  const [modalNovoModeloAberto, setModalNovoModeloAberto] = useState(false);
  const [novoModeloNome, setNovoModeloNome] = useState('');
  const [novaCapacidadeInput, setNovaCapacidadeInput] = useState('128GB');
  const [novoPrecoCapacidadeInput, setNovoPrecoCapacidadeInput] = useState<number>(2000);
  const [capacidadesNovoModelo, setCapacidadesNovoModelo] = useState<{ [cap: string]: number }>({
    '128GB': 2000,
    '256GB': 2300,
  });

  // Lista dinâmica ordenada de modelos disponíveis
  const modelosDisponiveis = useMemo(() => {
    const keys = Object.keys(tabelaEditavel);
    if (keys.length === 0) return MODELOS_UPGRADE_DISPONIVEIS;
    return keys.sort((a, b) => sortModelosCronologico(a, b, 'antigo_para_novo'));
  }, [tabelaEditavel]);

  // Sincroniza tabela editável quando as configs forem carregadas
  React.useEffect(() => {
    setTabelaEditavel(tabelaPrecos);
    setRegrasEditaveis(regrasDeducao);
  }, [tabelaPrecos, regrasDeducao]);

  const handleAdicionarNovoModelo = () => {
    if (!novoModeloNome.trim()) {
      toast.error('Informe o nome do novo modelo (ex: iPhone 17, Samsung S24, etc.).');
      return;
    }
    const nomeLimpo = novoModeloNome.trim();
    if (tabelaEditavel[nomeLimpo]) {
      toast.error('Este modelo já existe na tabela.');
      return;
    }

    const novasCapacidades = { ...capacidadesNovoModelo };
    if (Object.keys(novasCapacidades).length === 0) {
      novasCapacidades['128GB'] = 2000;
    }

    const novaTabela = {
      ...tabelaEditavel,
      [nomeLimpo]: novasCapacidades,
    };

    setTabelaEditavel(novaTabela);
    setModeloEditor(nomeLimpo);
    setModalNovoModeloAberto(false);
    setNovoModeloNome('');
    salvarConfiguracoesPrecos(novaTabela, regrasEditaveis);
    toast.success(`Modelo "${nomeLimpo}" adicionado com sucesso!`);
  };

  const handleExcluirModelo = (modeloParaExcluir: string) => {
    if (window.confirm(`Tem certeza que deseja remover o modelo "${modeloParaExcluir}" da tabela de recompra?`)) {
      const novaTabela = { ...tabelaEditavel };
      delete novaTabela[modeloParaExcluir];
      setTabelaEditavel(novaTabela);
      const restantes = Object.keys(novaTabela);
      if (restantes.length > 0) {
        setModeloEditor(restantes[0]);
      }
      salvarConfiguracoesPrecos(novaTabela, regrasEditaveis);
      toast.success(`Modelo "${modeloParaExcluir}" removido da tabela.`);
    }
  };

  const handleAdicionarCapacidadeAoModelo = (cap: string, preco: number) => {
    if (!cap.trim() || preco <= 0) {
      toast.error('Informe uma capacidade e um preço válido.');
      return;
    }
    const capLimpa = cap.trim().toUpperCase();
    const novaTabela = {
      ...tabelaEditavel,
      [modeloEditor]: {
        ...(tabelaEditavel[modeloEditor] || {}),
        [capLimpa]: preco,
      },
    };
    setTabelaEditavel(novaTabela);
    salvarConfiguracoesPrecos(novaTabela, regrasEditaveis);
    toast.success(`Capacidade ${capLimpa} adicionada ao ${modeloEditor}!`);
  };

  const handleRemoverCapacidadeDoModelo = (cap: string) => {
    const caps = { ...(tabelaEditavel[modeloEditor] || {}) };
    delete caps[cap];
    const novaTabela = {
      ...tabelaEditavel,
      [modeloEditor]: caps,
    };
    setTabelaEditavel(novaTabela);
    salvarConfiguracoesPrecos(novaTabela, regrasEditaveis);
    toast.success(`Capacidade ${cap} removida de ${modeloEditor}.`);
  };

  // Link público da loja
  const publicUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/avaliar/${targetLojaId}`;
  }, [targetLojaId]);

  // Métricas rápidas
  const metricas = useMemo(() => {
    const total = avaliacoes.length;
    const pendentes = avaliacoes.filter((a) => a.status === 'pendente').length;
    const convertidas = avaliacoes.filter((a) => a.status === 'convertido_venda').length;
    const volumeTotalAvaliado = avaliacoes.reduce((acc, a) => acc + (a.valor_avaliado || 0), 0);
    return { total, pendentes, convertidas, volumeTotalAvaliado };
  }, [avaliacoes]);

  // Leads filtrados
  const leadsFiltrados = useMemo(() => {
    return avaliacoes.filter((item) => {
      const matchStatus = filtroStatus === 'todos' || item.status === filtroStatus;
      const termo = buscaLead.toLowerCase().trim();
      const matchBusca =
        !termo ||
        item.cliente_nome.toLowerCase().includes(termo) ||
        (item.cliente_telefone || '').includes(termo) ||
        (item.protocolo || '').toLowerCase().includes(termo) ||
        item.modelo.toLowerCase().includes(termo);
      return matchStatus && matchBusca;
    });
  }, [avaliacoes, filtroStatus, buscaLead]);

  // Cálculo da simulação de balcão
  const resultadoBalcao = useMemo(() => {
    return calcularAvaliacaoUpgrade(
      modeloBalcao,
      capacidadeBalcao,
      condicoesBalcao,
      tabelaPrecos,
      regrasDeducao
    );
  }, [modeloBalcao, capacidadeBalcao, condicoesBalcao, tabelaPrecos, regrasDeducao]);

  // Copiar link público
  const handleCopiarLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success('Link da calculadora pública copiado!');
  };

  // Salvar Simulação de Balcão
  const handleSalvarBalcao = async () => {
    if (!clienteBalcaoNome.trim()) {
      toast.error('Informe ao menos o nome do cliente para registrar a avaliação.');
      return;
    }

    const { protocolo } = await salvarAvaliacao({
      cliente_nome: clienteBalcaoNome,
      cliente_telefone: clienteBalcaoTel,
      modelo: modeloBalcao,
      capacidade: capacidadeBalcao,
      condicoes: condicoesBalcao,
      resultado: resultadoBalcao,
      origem: 'balcao_loja',
      aparelho_interesse: clienteBalcaoInteresse,
    });

    toast.success(`Avaliação registrada com sucesso! Protocolo ${protocolo}`);
    setClienteBalcaoNome('');
    setClienteBalcaoTel('');
    setClienteBalcaoInteresse('');
    setSubAba('leads');
  };

  // Salvar Edição da Tabela de Preços
  const handleSalvarTabela = async () => {
    await salvarConfiguracoesPrecos(tabelaEditavel, regrasEditaveis);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      
      {/* CABEÇALHO DO PAINEL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-3xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-slate-950 font-black shadow-lg shadow-cyan-950/40">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                Calculadora de Aparelhos & Upgrade
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] uppercase font-black">
                  Trade-In Oficial
                </Badge>
              </h2>
              <p className="text-xs text-slate-400">
                Avalie o valor de compra de aparelhos usados, receba leads do site e converta em vendas no PDV.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={handleCopiarLink}
            variant="outline"
            className="border-slate-700 bg-slate-800 text-slate-200 hover:text-white rounded-2xl text-xs font-bold gap-1.5 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-cyan-400" /> Copiar Link Público
          </Button>

          <Button
            size="sm"
            onClick={() => window.open(publicUrl, '_blank')}
            className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-black rounded-2xl text-xs gap-1.5 shadow-lg shadow-cyan-950/40 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir Calculadora ➔
          </Button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlassCard className="p-4 bg-slate-900/80 border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total de Avaliações</span>
            <Smartphone className="w-4 h-4 text-cyan-400" />
          </div>
          <span className="text-2xl font-black text-white">{metricas.total}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Simulações de clientes & loja</span>
        </GlassCard>

        <GlassCard className="p-4 bg-slate-900/80 border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Leads Pendentes</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-2xl font-black text-amber-400">{metricas.pendentes}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Aguardando contato da loja</span>
        </GlassCard>

        <GlassCard className="p-4 bg-slate-900/80 border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Convertidos em Venda</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-2xl font-black text-emerald-400">{metricas.convertidas}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Aparelhos usados na troca</span>
        </GlassCard>

        <GlassCard className="p-4 bg-slate-900/80 border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Volume de Recompra</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-2xl font-black text-white">
            R$ {metricas.volumeTotalAvaliado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">Valor acumulado avaliado</span>
        </GlassCard>
      </div>

      {/* NAVEGAÇÃO DE SUB-ABAS */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl w-fit flex-wrap">
        {[
          { id: 'leads', label: `Propostas Recebidas (${metricas.pendentes})`, icon: <MessageCircle className="w-4 h-4" /> },
          { id: 'vistorias', label: `Coletas Realizadas (${vistorias.length})`, icon: <Truck className="w-4 h-4" /> },
          { id: 'motoboys', label: `🛵 Cadastrar Motoboys (${motoboys.length})`, icon: <User className="w-4 h-4" /> },
          { id: 'balcao', label: 'Simulador de Balcão', icon: <Smartphone className="w-4 h-4" /> },
          { id: 'tabela', label: 'Tabela de Preços & Regras', icon: <Sliders className="w-4 h-4" /> },
          { id: 'divulgacao', label: 'Link Público & QR Code', icon: <QrCode className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubAba(tab.id as any)}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer",
              subAba === tab.id
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── CONTEÚDO DA SUB-ABA 1: PROPOSTAS / LEADS ── */}
      {subAba === 'leads' && (
        <div className="space-y-4">
          
          {/* Barra de Filtros */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar cliente, telefone, modelo ou protocolo..."
                value={buscaLead}
                onChange={(e) => setBuscaLead(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none"
              />
            </div>

            {/* Filtro por Status */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'todos', label: 'Todas' },
                { id: 'pendente', label: 'Pendentes' },
                { id: 'em_negociacao', label: 'Em Negociação' },
                { id: 'aprovado', label: 'Aprovados' },
                { id: 'convertido_venda', label: 'Convertidos em Venda' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setFiltroStatus(st.id)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer",
                    filtroStatus === st.id
                      ? "bg-cyan-500 text-slate-950"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  )}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* LISTAGEM DE LEADS */}
          {leadsFiltrados.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/40 border border-slate-800/80 rounded-3xl space-y-2">
              <Smartphone className="w-8 h-8 text-slate-600 mx-auto" />
              <h4 className="text-sm font-bold text-slate-400">Nenhuma avaliação encontrada</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Divulgue o link da sua calculadora pública no WhatsApp ou Instagram para receber propostas de upgrade de clientes.
              </p>
              <Button
                size="sm"
                onClick={handleCopiarLink}
                className="mt-3 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold rounded-xl text-xs"
              >
                Copiar Link da Calculadora
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {leadsFiltrados.map((item) => {
                const telFormatado = (item.cliente_telefone || '').replace(/\D/g, '');
                const msgWhatsapp = `Olá ${item.cliente_nome}! 👋\n\nRecebemos sua avaliação para o *${item.modelo} ${item.capacidade}* no valor de *R$ ${(item.valor_avaliado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}* (Protocolo: ${item.protocolo || '#UPG'}).\n\nPodemos fechar a troca hoje mesmo! Quando você pode vir na loja?`;
                const urlWhatsapp = `https://wa.me/55${telFormatado}?text=${encodeURIComponent(msgWhatsapp)}`;

                return (
                  <div
                    key={item.id}
                    className="p-4 bg-slate-900 border border-slate-800 rounded-3xl space-y-3 flex flex-col justify-between hover:border-slate-700 transition-all shadow-md"
                  >
                    <div>
                      {/* Topo do Card */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold uppercase",
                            item.status === 'pendente' ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                            item.status === 'em_negociacao' ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                            item.status === 'aprovado' ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" :
                            item.status === 'convertido_venda' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                            "bg-red-500/10 text-red-400 border-red-500/30"
                          )}
                        >
                          {item.status.replace('_', ' ')}
                        </Badge>
                        <span className="font-mono text-[11px] text-cyan-400 font-bold">{item.protocolo || '#UPG'}</span>
                      </div>

                      {/* Informações do Cliente & Aparelho */}
                      <div className="pt-2 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-extrabold text-sm text-white">{item.cliente_nome}</span>
                        </div>
                        <p className="text-xs font-bold text-cyan-300">
                          {item.modelo} {item.capacidade}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>🔋 {item.bateria_saude || 85}%</span>
                          <span>•</span>
                          <span>{item.detalhes_condicao?.estadoTela === 'original_impecavel' ? 'Tela OK' : 'Tela Avariada'}</span>
                          {item.cliente_cidade && (
                            <>
                              <span>•</span>
                              <span>📍 {item.cliente_cidade}</span>
                            </>
                          )}
                        </div>

                        {item.aparelho_interesse && (
                          <div className="mt-2 p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px]">
                            <span className="text-slate-400 block">Interesse na troca por:</span>
                            <span className="font-bold text-emerald-400">{item.aparelho_interesse}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Valor e Ações */}
                    <div className="pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] text-slate-400">Valor Avaliado:</span>
                        <span className="text-lg font-black text-emerald-400">
                          R$ {(item.valor_aprovado || item.valor_avaliado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {telFormatado ? (
                          <a
                            href={urlWhatsapp}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-500 text-center py-2">Sem Telefone</span>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setItemSelecionado(item);
                            setNovoValorAprovado(String(item.valor_aprovado || item.valor_avaliado || ''));
                            setModalDetalhesAberto(true);
                          }}
                          className="border-slate-700 bg-slate-800 text-slate-200 hover:text-white rounded-xl text-xs font-bold"
                        >
                          Detalhes / Editar
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CONTEÚDO DA SUB-ABA: CADASTRO E GESTÃO DE MOTOBOYS ── */}
      {subAba === 'motoboys' && (
        <div className="space-y-6">
          {/* Banner de Instrução e Link de Acesso do Motoboy */}
          <GlassCard className="p-6 bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-950 border-cyan-500/30 rounded-3xl space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-black uppercase text-cyan-400 tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4" /> Equipe de Coletas em Campo
                </span>
                <h3 className="text-xl font-black text-white">Cadastre os Motoboys da Sua Loja</h3>
                <p className="text-xs text-slate-400 max-w-xl">
                  Ao cadastrar os motoboys aqui, o nome deles aparece automaticamente com <strong>botões de 1 toque no App do Motoboy</strong> para eles realizarem vistorias de aparelhos com 4 fotos e assinatura na rua sem precisar escrever!
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}/coleta/${targetLojaId}`;
                    navigator.clipboard.writeText(url);
                    toast.success('Link de Coleta copiado para o WhatsApp dos motoboys!');
                  }}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-xs gap-1.5 cursor-pointer shadow-lg shadow-cyan-950/40"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar Link para Motoboys
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    window.open(`${window.location.origin}/coleta/${targetLojaId}`, '_blank');
                  }}
                  className="border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400" /> Abrir no Celular
                </Button>
              </div>
            </div>

            {/* Caixa com o link visível */}
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 truncate text-cyan-300 font-mono">
                <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="truncate">{typeof window !== 'undefined' ? `${window.location.origin}/coleta/${targetLojaId}` : ''}</span>
              </div>
              <span className="text-[11px] text-slate-500 shrink-0 hidden sm:inline">Envie este link no grupo de entregas</span>
            </div>
          </GlassCard>

          {/* Formulário de Cadastro do Motoboy */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" /> Adicionar Novo Motoboy à Equipe
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Nome do Motoboy *</label>
                <input
                  type="text"
                  placeholder="Ex: Carlos Silva"
                  value={novoMotoboyNome}
                  onChange={(e) => setNovoMotoboyNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">WhatsApp / Celular</label>
                <input
                  type="text"
                  placeholder="Ex: 31999999999"
                  value={novoMotoboyTel}
                  onChange={(e) => setNovoMotoboyTel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Veículo / Modelo</label>
                <input
                  type="text"
                  placeholder="Ex: Honda CG 160 Fan"
                  value={novoMotoboyVeiculo}
                  onChange={(e) => setNovoMotoboyVeiculo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Placa (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: ABC-1234"
                  value={novoMotoboyPlaca}
                  onChange={(e) => setNovoMotoboyPlaca(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white outline-none uppercase"
                />
              </div>

              <div className="flex items-end">
                <Button
                  onClick={async () => {
                    if (!novoMotoboyNome.trim()) {
                      toast.error('Informe o nome do motoboy.');
                      return;
                    }
                    const ok = await cadastrarMotoboy({
                      nome: novoMotoboyNome,
                      telefone: novoMotoboyTel,
                      veiculo: novoMotoboyVeiculo,
                      placa: novoMotoboyPlaca,
                    });
                    if (ok) {
                      setNovoMotoboyNome('');
                      setNovoMotoboyTel('');
                      setNovoMotoboyPlaca('');
                      toast.success('Motoboy cadastrado com sucesso!');
                    }
                  }}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl h-9 cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" /> Cadastrar Motoboy
                </Button>
              </div>
            </div>
          </div>

          {/* Cards dos Motoboys Ativos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Motoboys Cadastrados ({motoboys.length})
              </h4>
              <span className="text-[11px] text-slate-500">Aparecem imediatamente para seleção no app mobile</span>
            </div>

            {motoboys.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-2">
                <Truck className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-bold text-slate-300">Nenhum motoboy cadastrado ainda</p>
                <p className="text-xs text-slate-500">Utilize o formulário acima para cadastrar seu primeiro entregador.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {motoboys.map((m) => {
                  const coletasDoMotoboy = vistorias.filter((v) => v.motoboy_id === m.id || v.motoboy_nome === m.nome).length;
                  return (
                    <div
                      key={m.id}
                      className="p-5 bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-3xl space-y-4 transition-all shadow-md group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-lg shadow-sm">
                            🛵
                          </div>
                          <div>
                            <h5 className="text-sm font-extrabold text-white group-hover:text-cyan-300 transition-colors">
                              {m.nome}
                            </h5>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {m.veiculo || 'Moto'} {m.placa ? `• ${m.placa}` : ''}
                            </span>
                          </div>
                        </div>

                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] font-black uppercase">
                          Ativo
                        </Badge>
                      </div>

                      <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl flex items-center justify-between text-xs">
                        <span className="text-slate-400">Coletas Registradas:</span>
                        <span className="font-extrabold text-cyan-400">{coletasDoMotoboy} vistoria{coletasDoMotoboy !== 1 ? 's' : ''}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1 gap-2">
                        {m.telefone ? (
                          <a
                            href={`https://wa.me/55${m.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${m.nome}! Segue o link de coleta de celulares da loja: ${window.location.origin}/coleta/${targetLojaId}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 py-1.5 px-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-[11px] font-bold rounded-xl text-center flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Phone className="w-3.5 h-3.5" /> Chamar WhatsApp
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-600">Sem telefone cadastrado</span>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Tem certeza que deseja remover o motoboy ${m.nome}?`)) {
                              excluirMotoboy(m.id);
                            }
                          }}
                          className="border-red-900/40 text-red-400 hover:bg-red-900/30 text-[11px] font-bold rounded-xl h-8 px-3 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remover
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONTEÚDO DA SUB-ABA 2: SIMULADOR DE BALCÃO ── */}
      {subAba === 'balcao' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Coluna 1 e 2: Formulário de Simulação */}
          <div className="lg:col-span-2 space-y-5 bg-slate-900 border border-slate-800 p-5 rounded-3xl">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-cyan-400" /> Simular Aparelho de Entrada do Cliente
              </h3>
              <p className="text-xs text-slate-400">
                Preencha as características do aparelho trazido pelo cliente no balcão para obter o valor de compra recomendado.
              </p>
            </div>

            {/* Modelo e Capacidade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Modelo do Aparelho</label>
                <select
                  value={modeloBalcao}
                  onChange={(e) => setModeloBalcao(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                >
                  {modelosDisponiveis.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Capacidade</label>
                <select
                  value={capacidadeBalcao}
                  onChange={(e) => setCapacidadeBalcao(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                >
                  {['64GB', '128GB', '256GB', '512GB', '1TB'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Checklist de Condição */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-white block uppercase tracking-wider">Estado Físico & Diagnóstico</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Saúde Bateria: {condicoesBalcao.bateriaPercentual}%</label>
                  <input
                    type="range"
                    min="65"
                    max="100"
                    value={condicoesBalcao.bateriaPercentual}
                    onChange={(e) => setCondicoesBalcao({ ...condicoesBalcao, bateriaPercentual: parseInt(e.target.value) })}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Estado da Tela</label>
                  <select
                    value={condicoesBalcao.estadoTela}
                    onChange={(e) => setCondicoesBalcao({ ...condicoesBalcao, estadoTela: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="original_impecavel">Original e Sem Riscos (100%)</option>
                    <option value="riscos_leves">Riscos Superficiais (-6%)</option>
                    <option value="trocada_compativel">Tela Trocada Não Original (-R$ 220)</option>
                    <option value="trincada_quebrada">Trincada / Display Avariado (-R$ 450)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Estado da Carcaça</label>
                  <select
                    value={condicoesBalcao.estadoCarcaca}
                    onChange={(e) => setCondicoesBalcao({ ...condicoesBalcao, estadoCarcaca: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="impecavel">Impecável / Sem Marcas (100%)</option>
                    <option value="marcas_leves">Marcas Leves de Uso (-4%)</option>
                    <option value="amassados_arranhaos">Amassados / Lascas (-10%)</option>
                    <option value="trincada_quebrada">Vidro Traseiro Quebrado (-R$ 250)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end space-y-2">
                  <label className="flex items-center justify-between text-xs text-slate-300">
                    <span>Face ID funciona?</span>
                    <input
                      type="checkbox"
                      checked={condicoesBalcao.faceIdFunciona}
                      onChange={(e) => setCondicoesBalcao({ ...condicoesBalcao, faceIdFunciona: e.target.checked })}
                      className="w-4 h-4 accent-emerald-500"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-slate-300">
                    <span>Câmeras 100%?</span>
                    <input
                      type="checkbox"
                      checked={condicoesBalcao.camerasFuncionam}
                      onChange={(e) => setCondicoesBalcao({ ...condicoesBalcao, camerasFuncionam: e.target.checked })}
                      className="w-4 h-4 accent-emerald-500"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Dados do Cliente (Opcional) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Nome do Cliente</label>
                <input
                  type="text"
                  placeholder="Ex: Carlos Oliveira"
                  value={clienteBalcaoNome}
                  onChange={(e) => setClienteBalcaoNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">WhatsApp</label>
                <input
                  type="text"
                  placeholder="(31) 9..."
                  value={clienteBalcaoTel}
                  onChange={(e) => setClienteBalcaoTel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Quer levar na troca?</label>
                <input
                  type="text"
                  placeholder="Ex: iPhone 15 Pro"
                  value={clienteBalcaoInteresse}
                  onChange={(e) => setClienteBalcaoInteresse(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Coluna 3: Card de Cotação Recomendada */}
          <div className="space-y-4">
            <div className="p-6 bg-gradient-to-b from-slate-900 to-slate-950 border border-cyan-500/40 rounded-3xl space-y-4 shadow-xl">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block">Cotação Recomendada</span>
              
              <div>
                <h4 className="text-sm font-bold text-white">{modeloBalcao} {capacidadeBalcao}</h4>
                <div className="text-3xl font-black text-emerald-400 mt-1">
                  R$ {resultadoBalcao.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] text-slate-400">Valor máximo sugerido para compra</span>
              </div>

              <div className="space-y-1.5 pt-3 border-t border-slate-800 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Valor Base Teto:</span>
                  <span>R$ {resultadoBalcao.valorBase}</span>
                </div>
                <div className="flex justify-between text-amber-400 font-bold">
                  <span>Deduções Avarias:</span>
                  <span>- R$ {resultadoBalcao.totalDeducoes}</span>
                </div>
                <div className="flex justify-between text-cyan-400 font-bold pt-1 border-t border-slate-800">
                  <span>Revenda Estimada:</span>
                  <span>R$ {resultadoBalcao.valorRevendaEstimado}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Margem Bruta Loja:</span>
                  <span>+ R$ {resultadoBalcao.lucroEstimadoLoja}</span>
                </div>
              </div>

              <div className="pt-3 space-y-2">
                <Button
                  onClick={handleSalvarBalcao}
                  className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-black rounded-xl text-xs py-3 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Salvar Avaliação no Sistema
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    const texto = `Avaliação Balcão: ${modeloBalcao} ${capacidadeBalcao} - R$ ${resultadoBalcao.valorFinal}`;
                    navigator.clipboard.writeText(texto);
                    toast.success('Resumo copiado para área de transferência!');
                  }}
                  className="w-full border-slate-800 text-slate-300 hover:text-white rounded-xl text-xs"
                >
                  Copiar Resumo da Avaliação
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTEÚDO DA SUB-ABA 3: TABELA DE PREÇOS & REGRAS ── */}
      {subAba === 'tabela' && (
        <div className="space-y-5 bg-slate-900 border border-slate-800 p-5 rounded-3xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" /> Tabela de Preços Base de Recompra
              </h3>
              <p className="text-xs text-slate-400">
                Ajuste os valores máximos que sua loja paga em cada modelo quando o aparelho está em excelente estado.
              </p>
            </div>

            <Button
              onClick={handleSalvarTabela}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs gap-1.5 shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <Check className="w-4 h-4" /> Salvar Alterações
            </Button>
          </div>

          {/* Selecionar Modelo para Editar Preços */}
          <div className="space-y-4">
            {/* Header da lista de modelos com botão de Adicionar */}
            <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-cyan-400" /> Modelos Cadastrados na Tabela ({modelosDisponiveis.length}):
              </span>
              <Button
                size="sm"
                onClick={() => {
                  setCapacidadesNovoModelo({ '128GB': 2000, '256GB': 2300 });
                  setNovoModeloNome('');
                  setModalNovoModeloAberto(true);
                }}
                className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black rounded-xl text-xs gap-1.5 h-8 px-3 cursor-pointer shadow-md"
              >
                <Plus className="w-3.5 h-3.5" /> + Adicionar Novo Modelo
              </Button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {modelosDisponiveis.map((m) => (
                <button
                  key={m}
                  onClick={() => setModeloEditor(m)}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0",
                    modeloEditor === m
                      ? "bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-950/40"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Inputs de Capacidade do Modelo Selecionado */}
            <div className="p-5 bg-slate-950 border border-slate-800 rounded-3xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                <div>
                  <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                    Preços de Compra para: <span className="text-cyan-400">{modeloEditor}</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">Valores máximos pagos na recompra por capacidade</p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExcluirModelo(modeloEditor)}
                  className="border-red-900/60 bg-red-950/20 text-red-400 hover:bg-red-900/50 hover:text-white text-xs h-8 rounded-xl gap-1 cursor-pointer w-fit"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir {modeloEditor} da Tabela
                </Button>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(tabelaEditavel[modeloEditor] || TABELA_BASE_UPGRADE_PADRAO[modeloEditor] || {}).map(([cap, valor]) => (
                  <div key={cap} className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-1.5 relative group">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-cyan-400">{cap}</label>
                      <button
                        type="button"
                        onClick={() => handleRemoverCapacidadeDoModelo(cap)}
                        className="text-slate-500 hover:text-red-400 text-xs p-0.5 rounded cursor-pointer"
                        title="Remover capacidade"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold">R$</span>
                      <input
                        type="number"
                        value={valor}
                        onChange={(e) => {
                          const novoValor = parseInt(e.target.value) || 0;
                          setTabelaEditavel((prev) => ({
                            ...prev,
                            [modeloEditor]: {
                              ...(prev[modeloEditor] || {}),
                              [cap]: novoValor,
                            },
                          }));
                        }}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-emerald-400 font-extrabold outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Adicionar nova capacidade ao modelo atual */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2 flex-wrap text-xs">
                <span className="text-slate-400 font-bold">+ Adicionar capacidade para {modeloEditor}:</span>
                <select
                  value={novaCapacidadeInput}
                  onChange={(e) => setNovaCapacidadeInput(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-bold outline-none"
                >
                  {['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold">R$</span>
                  <input
                    type="number"
                    placeholder="Valor..."
                    value={novoPrecoCapacidadeInput}
                    onChange={(e) => setNovoPrecoCapacidadeInput(parseInt(e.target.value) || 0)}
                    className="w-28 bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-2 py-1.5 text-emerald-400 font-bold outline-none"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAdicionarCapacidadeAoModelo(novaCapacidadeInput, novoPrecoCapacidadeInput)}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs h-8 px-3 rounded-xl cursor-pointer"
                >
                  Adicionar Capacidade
                </Button>
              </div>
            </div>

            {/* Editor de Regras de Dedução */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <span className="text-xs font-extrabold text-white block uppercase tracking-wider">Regras de Dedução Padrão (Avarias)</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Dedução Bateria &lt; 80% (R$)</label>
                  <input
                    type="number"
                    value={regrasEditaveis.bateriaGastaValor}
                    onChange={(e) => setRegrasEditaveis({ ...regrasEditaveis, bateriaGastaValor: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Dedução Tela Trocada (R$)</label>
                  <input
                    type="number"
                    value={regrasEditaveis.telaTrocadaCompativelValor}
                    onChange={(e) => setRegrasEditaveis({ ...regrasEditaveis, telaTrocadaCompativelValor: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Dedução Tela Trincada (R$)</label>
                  <input
                    type="number"
                    value={regrasEditaveis.telaTrincadaQuebradaValor}
                    onChange={(e) => setRegrasEditaveis({ ...regrasEditaveis, telaTrincadaQuebradaValor: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTEÚDO DA SUB-ABA 4: LINK PÚBLICO & DIVULGAÇÃO ── */}
      {subAba === 'divulgacao' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          
          {/* Card de Link */}
          <div className="space-y-4">
            <div className="p-2.5 w-fit rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <QrCode className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-white">Link Público da sua Loja</h3>
              <p className="text-xs text-slate-400 mt-1">
                Envie esse link para clientes no WhatsApp ou coloque na biografia do seu Instagram para que as pessoas avaliem os celulares de forma autônoma.
              </p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-cyan-400 truncate select-all">{publicUrl}</span>
              <Button
                size="sm"
                onClick={handleCopiarLink}
                className="bg-cyan-500 text-slate-950 font-black rounded-xl text-xs gap-1 cursor-pointer shrink-0"
              >
                <Copy className="w-3.5 h-3.5" /> Copiar
              </Button>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => window.open(publicUrl, '_blank')}
                className="border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold gap-1.5"
              >
                <ExternalLink className="w-4 h-4 text-cyan-400" /> Testar no Navegador
              </Button>
            </div>
          </div>

          {/* Dicas de Aumento de Vendas */}
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Como atrair mais clientes com o Upgrade
            </span>

            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">1.</span>
                <span>Coloque o link na <strong>Bio do Instagram</strong> com a chamada: <em>"Descubra quanto vale o seu iPhone usado na troca"</em>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">2.</span>
                <span>Divulgue nos <strong>Stories</strong> periodicamente fazendo enquetes sobre troca de aparelhos.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">3.</span>
                <span>Quando o cliente enviar a proposta, responda imediatamente via WhatsApp com os modelos disponíveis em estoque para ele subir de geração!</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ── CONTEÚDO DA SUB-ABA: VISTORIAS DOS MOTOBOYS ── */}
      {subAba === 'vistorias' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Header da Sub-Aba com Link e Ações */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-3xl border border-slate-800">
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-cyan-400" />
                Laudos & Vistorias Realizadas pelos Motoboys
              </h3>
              <p className="text-xs text-slate-400">
                Acompanhe o estado de entrada com 4 fotos, checklist e assinatura do cliente em tempo real.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const url = `${window.location.origin}/coleta/${targetLojaId}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Link de Coleta do Motoboy copiado!');
                }}
                className="bg-slate-950 border-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-cyan-400" /> Copiar Link do Motoboy
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`${window.location.origin}/coleta/${targetLojaId}`, '_blank')}
                className="bg-slate-950 border-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-cyan-400" /> Testar App Motoboy
              </Button>

              <Button
                size="sm"
                onClick={() => setModalMotoboysAberto(true)}
                className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-black rounded-xl text-xs gap-1.5 cursor-pointer shadow-md"
              >
                <User className="w-3.5 h-3.5" /> Equipe de Motoboys ({motoboys.length})
              </Button>
            </div>
          </div>

          {/* Barra de Filtros de Vistorias */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por cliente, motoboy, modelo, IMEI ou protocolo..."
                value={buscaVistoria}
                onChange={(e) => setBuscaVistoria(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'todos', label: 'Todas' },
                { id: 'coletado', label: 'Coletado' },
                { id: 'em_transito', label: 'Em Trânsito' },
                { id: 'entregue_loja', label: 'Entregue na Loja' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFiltroStatusVistoria(f.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                    filtroStatusVistoria === f.id
                      ? "bg-cyan-500 text-slate-950 font-black"
                      : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800/80"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Vistorias */}
          {vistorias.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/40 border border-slate-800/60 rounded-3xl space-y-3">
              <Truck className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">Nenhuma vistoria de coleta registrada ainda</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Envie o link <strong>/coleta/{targetLojaId}</strong> para seus motoboys. Quando eles coletarem aparelhos na rua, o laudo com 4 fotos e assinatura aparecerá aqui em tempo real!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {vistorias
                .filter((v) => {
                  const matchBusca =
                    !buscaVistoria ||
                    v.cliente_nome?.toLowerCase().includes(buscaVistoria.toLowerCase()) ||
                    v.motoboy_nome?.toLowerCase().includes(buscaVistoria.toLowerCase()) ||
                    v.modelo?.toLowerCase().includes(buscaVistoria.toLowerCase()) ||
                    v.protocolo?.toLowerCase().includes(buscaVistoria.toLowerCase()) ||
                    v.imei?.toLowerCase().includes(buscaVistoria.toLowerCase());
                  const matchStatus = filtroStatusVistoria === 'todos' || v.status_coleta === filtroStatusVistoria;
                  return matchBusca && matchStatus;
                })
                .map((vistoria) => (
                  <GlassCard key={vistoria.id} className="p-5 bg-slate-900/80 border-slate-800 rounded-3xl space-y-4">
                    {/* Topo do Card */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-1 rounded-xl">
                          {vistoria.protocolo || '#COLETA'}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                          <User className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Motoboy: <strong>{vistoria.motoboy_nome}</strong></span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {new Date(vistoria.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge
                          className={cn(
                            "text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg border",
                            vistoria.status_coleta === 'entregue_loja'
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                              : vistoria.status_coleta === 'em_transito'
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                              : "bg-blue-500/20 text-blue-400 border-blue-500/40"
                          )}
                        >
                          {vistoria.status_coleta === 'entregue_loja'
                            ? '✅ Entregue na Loja'
                            : vistoria.status_coleta === 'em_transito'
                            ? '🛵 Em Trânsito'
                            : '📦 Coletado'}
                        </Badge>
                      </div>
                    </div>

                    {/* Dados Detalhados */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      {/* Cliente e Endereço */}
                      <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 space-y-1.5">
                        <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          Cliente & Local
                        </span>
                        <p className="font-black text-white text-sm">{vistoria.cliente_nome}</p>
                        {vistoria.cliente_telefone && (
                          <p className="text-slate-400 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-cyan-400" /> {vistoria.cliente_telefone}
                          </p>
                        )}
                        {vistoria.endereco_coleta && (
                          <p className="text-slate-400 flex items-start gap-1">
                            <MapPin className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
                            <span>{vistoria.endereco_coleta}</span>
                          </p>
                        )}
                      </div>

                      {/* Aparelho & Vistoria Técnica */}
                      <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 space-y-1.5">
                        <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          Aparelho & Checklist
                        </span>
                        <p className="font-extrabold text-white text-sm">
                          {vistoria.modelo} {vistoria.capacidade} ({vistoria.cor || 'Padrão'})
                        </p>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className="text-emerald-400 font-bold">🔋 {vistoria.bateria_saude || 85}%</span>
                          {vistoria.imei && <span className="font-mono text-cyan-300">IMEI: {vistoria.imei}</span>}
                        </div>
                        <div className="text-slate-400 text-[11px] space-y-0.5 pt-1">
                          <p>• Tela: <strong className="text-slate-200">{vistoria.detalhes_checklist?.tela || 'Original'}</strong></p>
                          <p>• Carcaça: <strong className="text-slate-200">{vistoria.detalhes_checklist?.carcaca || 'Normal'}</strong></p>
                          <p>• iCloud: <strong className="text-emerald-400">✅ Desconectado</strong></p>
                        </div>
                      </div>

                      {/* Valores & Observações */}
                      <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 flex flex-col justify-between space-y-2">
                        <div>
                          <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                            Valores Acordados
                          </span>
                          <div className="mt-1">
                            <span className="text-xs text-slate-400">Valor Acordado:</span>
                            <p className="text-2xl font-black text-emerald-400 font-mono">
                              R$ {(vistoria.valor_acordado || vistoria.valor_avaliado || 0).toFixed(2)}
                            </p>
                          </div>
                        </div>

                        {vistoria.observacoes_motoboy && (
                          <div className="text-[11px] text-slate-400 bg-slate-900 p-2 rounded-xl border border-slate-800">
                            <strong>Obs Motoboy:</strong> {vistoria.observacoes_motoboy}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* FOTOS DA VISTORIA & ASSINATURA */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
                      {/* 4 Fotos */}
                      <div className="md:col-span-4 space-y-1.5">
                        <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-cyan-400" /> Fotos Reais da Vistoria ({vistoria.fotos?.length || 0})
                        </span>

                        {vistoria.fotos && vistoria.fotos.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {vistoria.fotos.map((foto, idx) => {
                              const titulos = ['Frente (Tela)', 'Traseira', 'Laterais/Aro', 'Ajustes/IMEI'];
                              const titulo = titulos[idx] || `Foto ${idx + 1}`;
                              return (
                                <div
                                  key={idx}
                                  onClick={() => setFotoModalAberta({ url: foto, titulo })}
                                  className="relative group aspect-[4/3] rounded-xl overflow-hidden border border-slate-800 hover:border-cyan-500 cursor-pointer transition-all shadow-md"
                                >
                                  <img src={foto} alt={titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                  <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 px-2 py-1 text-[10px] font-bold text-cyan-300 truncate text-center">
                                    {titulo}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
                            Nenhuma foto anexada
                          </div>
                        )}
                      </div>

                      {/* Assinatura do Cliente */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          Assinatura Cliente
                        </span>
                        {vistoria.assinatura_cliente ? (
                          <div className="aspect-[4/3] bg-slate-950 rounded-xl border border-slate-800 p-2 flex items-center justify-center">
                            <img src={vistoria.assinatura_cliente} alt="Assinatura" className="max-h-full max-w-full object-contain filter invert" />
                          </div>
                        ) : (
                          <div className="aspect-[4/3] rounded-xl border border-dashed border-slate-800 flex items-center justify-center text-[10px] text-slate-600">
                            Sem assinatura
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ações do Card */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 flex-wrap">
                      {vistoria.status_coleta !== 'entregue_loja' && (
                        <Button
                          size="sm"
                          onClick={() => atualizarStatusVistoria(vistoria.id, 'entregue_loja')}
                          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl h-8 gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar Entrega na Loja
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            // Cadastra no estoque geral (aparelhos)
                            await supabase.from('aparelhos').insert([{
                              modelo: vistoria.modelo,
                              capacidade: vistoria.capacidade,
                              cor: vistoria.cor || 'Preto',
                              imei: vistoria.imei || null,
                              bateria: vistoria.bateria_saude || 85,
                              condicao: 'seminovo',
                              custo: vistoria.valor_acordado || vistoria.valor_avaliado,
                              preco: Math.round((vistoria.valor_acordado || vistoria.valor_avaliado) * 1.30),
                              precoAtacado: Math.round((vistoria.valor_acordado || vistoria.valor_avaliado) * 1.15),
                              status: 'disponivel',
                              ativo: true,
                              loja_id: targetLojaId,
                              observacoes: `Coleta ${vistoria.protocolo} por ${vistoria.motoboy_nome}`
                            }]);
                            toast.success(`Aparelho ${vistoria.modelo} cadastrado no Estoque Geral com sucesso!`);
                          } catch (err: any) {
                            toast.error('Erro ao adicionar ao estoque: ' + err.message);
                          }
                        }}
                        className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs font-bold rounded-xl h-8 gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Dar Entrada no Estoque
                      </Button>
                    </div>
                  </GlassCard>
                ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL DE DETALHES E EDIÇÃO DO STATUS DA AVALIAÇÃO */}
      {modalDetalhesAberto && itemSelecionado && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] text-cyan-400 font-mono font-bold">{itemSelecionado.protocolo}</span>
                <h3 className="text-base font-black text-white">{itemSelecionado.cliente_nome}</h3>
              </div>
              <button
                onClick={() => setModalDetalhesAberto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Aparelho Avaliado:</span>
                <span className="font-bold text-white">{itemSelecionado.modelo} {itemSelecionado.capacidade}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Saúde Bateria:</span>
                <span className="font-bold text-emerald-400">{itemSelecionado.bateria_saude || 85}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Estado da Tela:</span>
                <span className="font-bold text-slate-200">{itemSelecionado.detalhes_condicao?.estadoTela || 'Não detalhado'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Interesse em:</span>
                <span className="font-bold text-cyan-400">{itemSelecionado.aparelho_interesse || 'Qualquer'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Telefone / WhatsApp:</span>
                <span className="font-bold text-white">{itemSelecionado.cliente_telefone || 'Não informado'}</span>
              </div>
            </div>

            {/* Ajuste do Valor Aprovado pela Loja */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-bold text-slate-300 block">Valor Final Aprovado pela Loja (R$)</label>
              <input
                type="number"
                value={novoValorAprovado}
                onChange={(e) => setNovoValorAprovado(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-sm text-emerald-400 font-extrabold outline-none"
              />
            </div>

            {/* Ações de Status */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-slate-400 block">Alterar Status da Negociação:</span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    atualizarStatusAvaliacao(itemSelecionado.id, 'em_negociacao', parseFloat(novoValorAprovado));
                    setModalDetalhesAberto(false);
                  }}
                  className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs font-bold"
                >
                  Em Negociação
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    atualizarStatusAvaliacao(itemSelecionado.id, 'aprovado', parseFloat(novoValorAprovado));
                    setModalDetalhesAberto(false);
                  }}
                  className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs font-bold"
                >
                  Aprovar Oferta
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    atualizarStatusAvaliacao(itemSelecionado.id, 'convertido_venda', parseFloat(novoValorAprovado));
                    setModalDetalhesAberto(false);
                  }}
                  className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs font-bold"
                >
                  Convertido em Venda
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    atualizarStatusAvaliacao(itemSelecionado.id, 'recusado', parseFloat(novoValorAprovado));
                    setModalDetalhesAberto(false);
                  }}
                  className="bg-red-500/10 text-red-400 border-red-500/30 text-xs font-bold"
                >
                  Recusar / Descartar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE FOTO DA VISTORIA EM TELA CHEIA */}
      {fotoModalAberta && (
        <div 
          onClick={() => setFotoModalAberta(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
        >
          <div className="max-w-2xl w-full space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-white">
              <span className="text-sm font-extrabold flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" /> {fotoModalAberta.titulo}
              </span>
              <button
                onClick={() => setFotoModalAberta(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center max-h-[80vh]">
              <img src={fotoModalAberta.url} alt={fotoModalAberta.titulo} className="w-full h-auto max-h-[80vh] object-contain" />
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO E GESTÃO DE MOTOBOYS */}
      {modalMotoboysAberto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Equipe de Motoboys / Entregadores</h3>
                  <p className="text-xs text-slate-400">Cadastre os motoboys que realizam coletas externas de aparelhos</p>
                </div>
              </div>
              <button
                onClick={() => setModalMotoboysAberto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Formulário de Novo Motoboy */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80 space-y-2.5">
              <span className="text-xs font-extrabold text-slate-300 block">Novo Motoboy</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Nome do Motoboy..."
                  value={novoMotoboyNome}
                  onChange={(e) => setNovoMotoboyNome(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
                <input
                  type="text"
                  placeholder="WhatsApp..."
                  value={novoMotoboyTel}
                  onChange={(e) => setNovoMotoboyTel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Veículo (ex: Honda CG 160)..."
                  value={novoMotoboyVeiculo}
                  onChange={(e) => setNovoMotoboyVeiculo(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
                <input
                  type="text"
                  placeholder="Placa (opcional)..."
                  value={novoMotoboyPlaca}
                  onChange={(e) => setNovoMotoboyPlaca(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none uppercase"
                />
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  if (!novoMotoboyNome.trim()) {
                    toast.error('Informe o nome do motoboy.');
                    return;
                  }
                  const ok = await cadastrarMotoboy({
                    nome: novoMotoboyNome,
                    telefone: novoMotoboyTel,
                    veiculo: novoMotoboyVeiculo,
                    placa: novoMotoboyPlaca,
                  });
                  if (ok) {
                    setNovoMotoboyNome('');
                    setNovoMotoboyTel('');
                    setNovoMotoboyPlaca('');
                  }
                }}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs h-8.5 rounded-xl cursor-pointer"
              >
                + Adicionar à Equipe
              </Button>
            </div>

            {/* Lista dos Cadastrados */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              <span className="text-xs font-bold text-slate-400 block">Motoboys Ativos ({motoboys.length}):</span>
              {motoboys.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">Nenhum motoboy cadastrado ainda.</p>
              ) : (
                motoboys.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-xs font-bold text-white">{m.nome}</p>
                      <p className="text-[11px] text-slate-400">
                        {m.veiculo || 'Moto'} {m.placa ? `• Placa: ${m.placa}` : ''} {m.telefone ? `• Tel: ${m.telefone}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => excluirMotoboy(m.id)}
                      className="text-red-400 hover:text-red-300 p-1.5 rounded-lg text-xs cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ADICIONAR NOVO MODELO NA TABELA DE UPGRADE */}
      {modalNovoModeloAberto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Cadastrar Novo Modelo</h3>
                  <p className="text-xs text-slate-400">Adicione novos aparelhos na tabela de recompra</p>
                </div>
              </div>
              <button
                onClick={() => setModalNovoModeloAberto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">Nome do Modelo *</label>
                <input
                  type="text"
                  placeholder="Ex: iPhone 17, Samsung S24 Ultra, Xiaomi 14..."
                  value={novoModeloNome}
                  onChange={(e) => setNovoModeloNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold outline-none"
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-slate-300 block">
                  Capacidades & Preços de Compra (R$):
                </label>
                <p className="text-[11px] text-slate-400">
                  Defina os valores que sua loja paga para as capacidades deste aparelho:
                </p>

                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {['64GB', '128GB', '256GB', '512GB', '1TB'].map((cap) => {
                    const ativo = cap in capacidadesNovoModelo;
                    const preco = capacidadesNovoModelo[cap] || 0;
                    return (
                      <div
                        key={cap}
                        className={cn(
                          "p-2.5 rounded-xl border transition-all space-y-1",
                          ativo ? "bg-slate-950 border-cyan-500/50" : "bg-slate-950/40 border-slate-800 opacity-60"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-black text-white flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ativo}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCapacidadesNovoModelo((prev) => ({ ...prev, [cap]: 2000 }));
                                } else {
                                  const novo = { ...capacidadesNovoModelo };
                                  delete novo[cap];
                                  setCapacidadesNovoModelo(novo);
                                }
                              }}
                              className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                            />
                            {cap}
                          </label>
                        </div>
                        {ativo && (
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-bold">R$</span>
                            <input
                              type="number"
                              value={preco}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setCapacidadesNovoModelo((prev) => ({ ...prev, [cap]: val }));
                              }}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-6 pr-2 py-1 text-xs text-emerald-400 font-bold outline-none"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setModalNovoModeloAberto(false)}
                className="flex-1 border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAdicionarNovoModelo}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-black rounded-xl text-xs cursor-pointer shadow-md"
              >
                Salvar Modelo
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
