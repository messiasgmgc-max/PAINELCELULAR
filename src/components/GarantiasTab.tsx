'use client';

import { useState, useEffect, useMemo } from 'react';
import { useGarantias } from '@/hooks/useGarantias';
import { useClientes } from '@/hooks/useClientes';
import { useAparelhos } from '@/hooks/useAparelhos';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/GlassCard';
import { ModalPortal } from '@/components/ModalPortal';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Trash2, Edit2, Plus, Search, X, Calendar, Shield, AlertTriangle } from 'lucide-react';
import { Garantia, Venda } from '@/lib/db/types';
import { VendaSearchCombobox, EnrichedVendaData } from '@/components/VendaSearchCombobox';

export function GarantiasTab() {
  const { usuario } = useAuth();
  const { garantias, loading, error, fetchGarantias, criarGarantia, atualizarGarantia, deletarGarantia } = useGarantias();
  const { clientes, fetchClientes } = useClientes();
  const { aparelhos, fetchAparelhos } = useAparelhos();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingVendas, setLoadingVendas] = useState(false);
  const [vendasProcessadas, setVendasProcessadas] = useState<Venda[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'todas' | 'vigentes' | 'expiradas'>('todas');
  const [formData, setFormData] = useState({
    osId: '',
    osNumero: 0,
    clienteId: '',
    clienteNome: '',
    aparelhoDescricao: '',
    dataInicio: '',
    diasGarantia: 30,
    descricao: '',
    historico: [] as Garantia['historico']
  });

  const [novoHistorico, setNovoHistorico] = useState({ acao: '', descricao: '' });

  const parseDiasGarantia = (garantiaTexto?: string) => {
    if (!garantiaTexto) return 90;
    const match = garantiaTexto.match(/(\d+)/);
    const dias = match ? parseInt(match[1], 10) : 90;
    return Number.isFinite(dias) && dias > 0 ? dias : 90;
  };

  const getVendaNumero = (venda: Venda) => {
    const digits = (venda.id || '').replace(/\D/g, '');
    const parsed = parseInt(digits.slice(-6), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
  };

  const getDescricaoVenda = (venda: Venda) => {
    if (venda.itens && venda.itens.length > 0) {
      return venda.itens.map((item) => item.descricao).join(', ');
    }
    return venda.descricao || 'Venda sem descrição';
  };

  const getDataFimVenda = (venda: Venda) => {
    const inicio = new Date(venda.dataPagamento);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + parseDiasGarantia(venda.garantia));
    return fim;
  };

  const getDiasRestantesVenda = (venda: Venda) => {
    const agora = new Date();
    agora.setHours(0, 0, 0, 0);
    const diffMs = getDataFimVenda(venda).getTime() - agora.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const carregarVendasProcessadas = async () => {
    setLoadingVendas(true);
    try {
      const targetLojaId = usuario?.lojaId || (usuario as any)?.loja_id;
      let query = supabase
        .from('vendas')
        .select('*')
        .neq('status', 'cancelado')
        .order('dataPagamento', { ascending: false });

      if (targetLojaId) {
        query = query.or(`loja_id.eq.${targetLojaId},loja_id.is.null`);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Erro com filtro loja_id em vendas:', error);
        const resFallback = await supabase
          .from('vendas')
          .select('*')
          .neq('status', 'cancelado')
          .order('dataPagamento', { ascending: false });
        setVendasProcessadas(resFallback.data || []);
      } else {
        setVendasProcessadas(data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar vendas processadas:', err);
      setVendasProcessadas([]);
    } finally {
      setLoadingVendas(false);
    }
  };

  const vendasComGarantia = useMemo(() => new Set(garantias.map((g) => g.osId)), [garantias]);

  const vendasElegiveis = useMemo(() => {
    return vendasProcessadas.filter((venda) => {
      const dentroDoPrazo = getDiasRestantesVenda(venda) >= 0;
      if (!dentroDoPrazo) return false;

      const jaTemGarantia = vendasComGarantia.has(venda.id);
      if (editingId && formData.osId === venda.id) return true;
      return !jaTemGarantia;
    });
  }, [vendasProcessadas, vendasComGarantia, editingId, formData.osId]);

  useEffect(() => {
    fetchGarantias();
    carregarVendasProcessadas();
    fetchClientes();
    fetchAparelhos();
  }, [usuario?.lojaId]);

  const garantiasVigentes = useMemo(() => {
    return garantias.filter(g => {
      const dataFim = new Date(g.dataInicio);
      dataFim.setDate(dataFim.getDate() + g.diasGarantia);
      return new Date() < dataFim;
    });
  }, [garantias]);

  const garantiasExpiradas = useMemo(() => {
    return garantias.filter(g => {
      const dataFim = new Date(g.dataInicio);
      dataFim.setDate(dataFim.getDate() + g.diasGarantia);
      return new Date() >= dataFim;
    });
  }, [garantias]);

  const getDiasRestantes = (garantia: Garantia) => {
    const dataFim = new Date(garantia.dataInicio);
    dataFim.setDate(dataFim.getDate() + garantia.diasGarantia);
    const difMs = dataFim.getTime() - new Date().getTime();
    return Math.ceil(difMs / (1000 * 60 * 60 * 24));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'osNumero' || name === 'diasGarantia' ? parseInt(value) : value
    }));
  };

  const handleSelectVenda = (venda: Venda, enriched: EnrichedVendaData) => {
    const dataInicio = venda.dataPagamento?.includes('T')
      ? venda.dataPagamento.split('T')[0]
      : (venda.dataPagamento || new Date().toISOString().split('T')[0]);

    setFormData(prev => ({
      ...prev,
      osId: venda.id,
      osNumero: getVendaNumero(venda),
      clienteId: venda.clienteId || enriched.cliente?.id || '',
      clienteNome: enriched.clienteNome,
      aparelhoDescricao: enriched.aparelhoFormatado,
      dataInicio,
      diasGarantia: enriched.diasGarantia || parseDiasGarantia(venda.garantia)
    }));
  };

  const handleClearSelection = () => {
    setFormData(prev => ({
      ...prev,
      osId: '',
      osNumero: 0,
      clienteId: '',
      clienteNome: '',
      aparelhoDescricao: '',
      dataInicio: '',
      diasGarantia: 90
    }));
  };

  const handleAddHistorico = () => {
    if (!novoHistorico.acao) return;
    
    setFormData(prev => ({
      ...prev,
      historico: [
        ...prev.historico,
        {
          data: new Date().toISOString(),
          acao: novoHistorico.acao,
          descricao: novoHistorico.descricao
        }
      ]
    }));
    setNovoHistorico({ acao: '', descricao: '' });
  };

  const handleRemoveHistorico = (index: number) => {
    setFormData(prev => ({
      ...prev,
      historico: prev.historico.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingId) {
      const venda = vendasProcessadas.find((v) => v.id === formData.osId);
      if (!venda) {
        alert('Selecione uma venda na barra de busca para emitir a garantia.');
        return;
      }

      if (getDiasRestantesVenda(venda) < 0) {
        if (!confirm('Esta venda foi realizada há mais de 90 dias. Deseja emitir o termo de garantia mesmo assim?')) {
          return;
        }
      }
    }

    try {
      if (editingId) {
        await atualizarGarantia(editingId, formData);
      } else {
        await criarGarantia({ ...formData, ativo: true });
      }
      resetForm();
    } catch (err) {
      console.error('Erro ao salvar garantia:', err);
    }
  };

  const openNewForm = () => {
    setEditingId(null);
    setFormData({
      osId: '',
      osNumero: 0,
      clienteId: '',
      clienteNome: '',
      aparelhoDescricao: '',
      dataInicio: '',
      diasGarantia: 30,
      descricao: '',
      historico: []
    });
    setNovoHistorico({ acao: '', descricao: '' });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      osId: '',
      osNumero: 0,
      clienteId: '',
      clienteNome: '',
      aparelhoDescricao: '',
      dataInicio: '',
      diasGarantia: 30,
      descricao: '',
      historico: []
    });
    setNovoHistorico({ acao: '', descricao: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (garantia: Garantia) => {
    setFormData({
      osId: garantia.osId,
      osNumero: garantia.osNumero,
      clienteId: garantia.clienteId,
      clienteNome: garantia.clienteNome,
      aparelhoDescricao: garantia.aparelhoDescricao,
      dataInicio: garantia.dataInicio,
      diasGarantia: garantia.diasGarantia,
      descricao: garantia.descricao || '',
      historico: garantia.historico
    });
    setEditingId(garantia.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja deletar esta garantia?')) {
      try {
        await deletarGarantia(id);
      } catch (err) {
        console.error('Erro ao deletar:', err);
      }
    }
  };

  const garantiasFiltradas = useMemo(() => {
    let filtered = garantias;

    if (filterStatus === 'vigentes') {
      filtered = garantiasVigentes;
    } else if (filterStatus === 'expiradas') {
      filtered = garantiasExpiradas;
    }

    if (searchTerm.trim()) {
      filtered = filtered.filter(g =>
        g.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        g.aparelhoDescricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        g.osNumero.toString().includes(searchTerm)
      );
    }

    return filtered;
  }, [garantias, filterStatus, searchTerm]);

  return (
    <div className="panel-shell space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-4 border-l-4 border-l-blue-500 rounded-2xl">
          <p className="text-sm text-gray-600">Total de Garantias</p>
          <p className="text-2xl font-bold text-blue-600">{garantias.length}</p>
        </GlassCard>
        <GlassCard className="p-4 border-l-4 border-l-green-500 rounded-2xl">
          <p className="text-sm text-gray-600">Garantias Vigentes</p>
          <p className="text-2xl font-bold text-green-600">{garantiasVigentes.length}</p>
        </GlassCard>
        <GlassCard className="p-4 border-l-4 border-l-red-500 rounded-2xl">
          <p className="text-sm text-gray-600">Garantias Expiradas</p>
          <p className="text-2xl font-bold text-red-600">{garantiasExpiradas.length}</p>
        </GlassCard>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="w-full sm:flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, aparelho ou venda..."
            className="input-glass pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="scroll-row w-full pb-1 flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="bg-slate-800/90 text-slate-200 border border-slate-700/80 rounded-xl px-3 py-2 text-xs sm:text-sm outline-none focus:border-cyan-500 cursor-pointer h-10"
          >
            <option value="todas">Todas as Garantias</option>
            <option value="vigentes">Vigentes</option>
            <option value="expiradas">Expiradas</option>
          </select>

          <Button 
            onClick={openNewForm} 
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl px-4 text-xs sm:text-sm shadow-md shadow-cyan-950/30 flex items-center gap-2 border border-cyan-400/30 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap h-10"
          >
            <Plus className="w-4 h-4" />
            Nova Garantia
          </Button>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-start p-2 sm:p-4 pt-3 sm:pt-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 text-white relative my-0 shrink-0">
              {/* Cabeçalho */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold border border-cyan-500/30">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-white">
                      {editingId ? 'Editar Termo de Garantia' : 'Emissão de Nova Garantia'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Vincule a uma venda realizada e registre a cobertura de garantia do cliente
                    </p>
                  </div>
                </div>

                <button 
                  onClick={resetForm} 
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* BARRA DE PESQUISA COMPLETA DE VENDAS (IMEI, DADOS PESSOAIS, NOME, DATA) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Venda Elegível (Buscar por IMEI, Nome, Telefone, CPF, Modelo ou Data) *
                  </label>
                  <VendaSearchCombobox
                    vendas={vendasProcessadas}
                    clientes={clientes}
                    aparelhos={aparelhos}
                    vendasComGarantia={vendasComGarantia}
                    selectedVendaId={formData.osId}
                    onSelectVenda={handleSelectVenda}
                    onClearSelection={handleClearSelection}
                    loading={loadingVendas}
                  />
                  {!loadingVendas && vendasProcessadas.length === 0 && (
                    <p className="text-[11px] text-amber-400 mt-1">
                      ⚠️ Nenhuma venda registrada encontrada no sistema.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Data de Início da Cobertura *</label>
                    <input
                      type="date"
                      name="dataInicio"
                      value={formData.dataInicio}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none transition-all"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Prazo de Cobertura (Dias) *</label>
                    <input
                      type="number"
                      name="diasGarantia"
                      value={formData.diasGarantia}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none transition-all font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Cliente Vinculado</label>
                    <input
                      type="text"
                      value={formData.clienteNome || 'Selecione uma venda na busca acima'}
                      readOnly
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-300 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Aparelho & IMEI Vinculados</label>
                    <input
                      type="text"
                      value={formData.aparelhoDescricao || 'Selecione uma venda na busca acima'}
                      readOnly
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-300 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Termos / Cobertura da Garantia</label>
                  <textarea
                    name="descricao"
                    placeholder="Especifique o que está coberto pela garantia da loja..."
                    value={formData.descricao}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                  />
                </div>

                {/* Histórico */}
                <div className="space-y-2 border-t border-slate-800 pt-3">
                  <h4 className="font-bold text-xs text-cyan-400 uppercase tracking-wider">Histórico de Chamados de Garantia</h4>
                  
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {formData.historico.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">Nenhum evento gravado no histórico.</p>
                    ) : (
                      formData.historico.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                          <div className="text-xs">
                            <p className="font-bold text-white">{item.acao}</p>
                            <p className="text-[11px] text-slate-400">{new Date(item.data).toLocaleDateString('pt-BR')} {item.descricao && `- ${item.descricao}`}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveHistorico(idx)}
                            className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2">
                    <select
                      value={novoHistorico.acao}
                      onChange={(e) => setNovoHistorico(prev => ({ ...prev, acao: e.target.value }))}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="">Ação do Chamado</option>
                      <option value="Troca">Troca de Aparelho/Peça</option>
                      <option value="Reparo">Reparo em Assistência</option>
                      <option value="Verificação">Verificação / Análise</option>
                      <option value="Substituição">Substituição Definitiva</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Descrição do atendimento"
                      value={novoHistorico.descricao}
                      onChange={(e) => setNovoHistorico(prev => ({ ...prev, descricao: e.target.value }))}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddHistorico}
                      className="bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold px-3 py-2 rounded-xl text-xs shrink-0"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs sm:text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl text-xs sm:text-sm px-6 py-2.5 shadow-lg shadow-cyan-950/40 flex items-center gap-2 transition-all"
                  >
                    {editingId ? 'Atualizar Garantia' : 'Emitir Garantia'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Listagem */}
      <div className="grid grid-cols-1 gap-3">
        {garantiasFiltradas.length > 0 ? (
          garantiasFiltradas.map(garantia => {
            const diasRestantes = getDiasRestantes(garantia);
            const isVigente = diasRestantes > 0;

            return (
              <GlassCard
                key={garantia.id}
                className={`p-4 border-l-4 hover:shadow-md transition-shadow group ${
                  isVigente ? 'border-l-green-500' : 'border-l-red-500'
                }`}
              >
                <div className="flex gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-bold text-lg">
                          Venda #{garantia.osNumero} - {garantia.clienteNome}
                        </p>
                        <p className="text-sm text-gray-600">{garantia.aparelhoDescricao}</p>
                      </div>
                      <div className="flex gap-2">
                        {isVigente ? (
                          <Badge className="bg-green-100 text-green-800">
                            <Shield className="w-3 h-3 mr-1" />
                            Vigente
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Expirada
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Início: {new Date(garantia.dataInicio).toLocaleDateString('pt-BR')}
                      </div>
                      <div>
                        Dias: {garantia.diasGarantia}
                      </div>
                      {isVigente && (
                        <div className="font-medium text-green-600">
                          {diasRestantes} dia(s) restante(s)
                        </div>
                      )}
                    </div>

                    {garantia.descricao && (
                      <p className="text-sm text-gray-700 mb-2">{garantia.descricao}</p>
                    )}

                    {garantia.historico.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-xs font-medium text-gray-600 mb-1">Histórico:</p>
                        <div className="space-y-1">
                          {garantia.historico.map((item, idx) => (
                            <p key={idx} className="text-xs text-gray-600">
                              • {item.acao} - {new Date(item.data).toLocaleDateString('pt-BR')}
                              {item.descricao && ` (${item.descricao})`}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-col">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(garantia)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDelete(garantia.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </GlassCard>
            );
          })
        ) : (
          <GlassCard className="p-8 text-center text-gray-500 rounded-3xl">
            <p>Nenhuma garantia encontrada</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
