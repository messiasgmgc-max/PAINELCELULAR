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
  Filter
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUpgrade, AvaliacaoUpgradeItem } from '@/hooks/useUpgrade';
import { 
  calcularAvaliacaoUpgrade, 
  TABELA_BASE_UPGRADE_PADRAO, 
  MODELOS_UPGRADE_DISPONIVEIS, 
  REGRAS_DEDUCAO_PADRAO,
  RespostaCondicaoUpgrade
} from '@/lib/upgradeEngine';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function CalculadoraUpgradeTab() {
  const { usuario } = useAuth();
  const targetLojaId = usuario?.lojaId || (usuario as any)?.loja_id || 'loja-principal';

  const {
    avaliacoes,
    tabelaPrecos,
    regrasDeducao,
    loading,
    salvarAvaliacao,
    atualizarStatusAvaliacao,
    salvarConfiguracoesPrecos,
    fetchAvaliacoes,
  } = useUpgrade(targetLojaId);

  // Sub-abas: 'leads' | 'balcao' | 'tabela' | 'divulgacao'
  const [subAba, setSubAba] = useState<'leads' | 'balcao' | 'tabela' | 'divulgacao'>('leads');

  // Filtros de Leads
  const [buscaLead, setBuscaLead] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [itemSelecionado, setItemSelecionado] = useState<AvaliacaoUpgradeItem | null>(null);
  const [modalDetalhesAberto, setModalDetalhesAberto] = useState(false);
  const [novoValorAprovado, setNovoValorAprovado] = useState<string>('');

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

  // Sincroniza tabela editável quando as configs forem carregadas
  React.useEffect(() => {
    setTabelaEditavel(tabelaPrecos);
    setRegrasEditaveis(regrasDeducao);
  }, [tabelaPrecos, regrasDeducao]);

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
                <label className="text-xs font-bold text-slate-300 block mb-1">Modelo do iPhone</label>
                <select
                  value={modeloBalcao}
                  onChange={(e) => setModeloBalcao(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                >
                  {MODELOS_UPGRADE_DISPONIVEIS.map((m) => (
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
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {MODELOS_UPGRADE_DISPONIVEIS.map((m) => (
                <button
                  key={m}
                  onClick={() => setModeloEditor(m)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                    modeloEditor === m
                      ? "bg-cyan-500 text-slate-950 font-black"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Inputs de Capacidade do Modelo Selecionado */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <span className="text-xs font-extrabold text-white block">Preços de Compra para: {modeloEditor}</span>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(tabelaEditavel[modeloEditor] || TABELA_BASE_UPGRADE_PADRAO[modeloEditor] || {}).map(([cap, valor]) => (
                  <div key={cap} className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">{cap}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold">R$</span>
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
                        className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white font-bold outline-none"
                      />
                    </div>
                  </div>
                ))}
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

    </div>
  );
}
