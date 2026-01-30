'use client';

import { useState, useEffect, useMemo } from 'react';
import { useGarantias } from '@/hooks/useGarantias';
import { useOrdensServico } from '@/hooks/useOrdensServico';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Trash2, Edit2, Plus, Search, X, Calendar, Clock, Shield, AlertTriangle } from 'lucide-react';
import { Garantia } from '@/lib/db/types';

export function GarantiasTab() {
  const { garantias, loading, error, fetchGarantias, criarGarantia, atualizarGarantia, deletarGarantia } = useGarantias();
  const { ordensServico, fetchOrdensServico } = useOrdensServico();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  useEffect(() => {
    fetchOrdensServico();
    fetchGarantias();
  }, []);

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

  const handleOsChange = (osId: string) => {
    const os = ordensServico.find(o => o.id === osId);
    if (os) {
      setFormData(prev => ({
        ...prev,
        osId,
        osNumero: os.numeroOS,
        clienteId: os.clienteId,
        clienteNome: os.clienteNome,
        aparelhoDescricao: `${os.aparelhoMarca} ${os.aparelhoModelo}`
      }));
    }
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
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-500">
          <p className="text-sm text-gray-600">Total de Garantias</p>
          <p className="text-2xl font-bold text-blue-600">{garantias.length}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-green-500">
          <p className="text-sm text-gray-600">Garantias Vigentes</p>
          <p className="text-2xl font-bold text-green-600">{garantiasVigentes.length}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-red-500">
          <p className="text-sm text-gray-600">Garantias Expiradas</p>
          <p className="text-2xl font-bold text-red-600">{garantiasExpiradas.length}</p>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap items-center mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, aparelho ou OS..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="todas">Todas</option>
          <option value="vigentes">Vigentes</option>
          <option value="expiradas">Expiradas</option>
        </select>

        <Button onClick={() => { setShowForm(!showForm); setEditingId(null); resetForm(); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Garantia
        </Button>
      </div>

      {/* Formulário */}
      {showForm && (
        <Card className="p-6 space-y-4 border-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {editingId ? 'Editar Garantia' : 'Nova Garantia'}
            </h3>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">OS *</label>
                <select
                  name="osId"
                  value={formData.osId}
                  onChange={(e) => handleOsChange(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecionar OS</option>
                  {ordensServico.map(os => (
                    <option key={os.id} value={os.id}>
                      #{os.numeroOS} - {os.clienteNome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Data de Início *</label>
                <input
                  type="date"
                  name="dataInicio"
                  value={formData.dataInicio}
                  onChange={handleInputChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Dias de Garantia *</label>
                <input
                  type="number"
                  name="diasGarantia"
                  value={formData.diasGarantia}
                  onChange={handleInputChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Cliente</label>
                <input
                  type="text"
                  value={formData.clienteNome}
                  readOnly
                  className="w-full p-2 border border-gray-300 rounded-lg bg-gray-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Aparelho</label>
              <input
                type="text"
                value={formData.aparelhoDescricao}
                readOnly
                className="w-full p-2 border border-gray-300 rounded-lg bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Descrição</label>
              <textarea
                name="descricao"
                placeholder="Descrição da garantia..."
                value={formData.descricao}
                onChange={handleInputChange}
                rows={2}
                className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Histórico */}
            <div className="space-y-2 border-t pt-4">
              <h4 className="font-medium text-sm">Histórico</h4>
              
              <div className="space-y-2">
                {formData.historico.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                    <div className="text-sm">
                      <p className="font-medium">{item.acao}</p>
                      <p className="text-xs text-gray-600">{new Date(item.data).toLocaleDateString('pt-BR')} {item.descricao && `- ${item.descricao}`}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveHistorico(idx)}
                      className="text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <select
                  value={novoHistorico.acao}
                  onChange={(e) => setNovoHistorico(prev => ({ ...prev, acao: e.target.value }))}
                  className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Selecionar ação</option>
                  <option value="Troca">Troca</option>
                  <option value="Reparo">Reparo</option>
                  <option value="Verificação">Verificação</option>
                  <option value="Substituição">Substituição</option>
                </select>
                <input
                  type="text"
                  placeholder="Descrição (opcional)"
                  value={novoHistorico.descricao}
                  onChange={(e) => setNovoHistorico(prev => ({ ...prev, descricao: e.target.value }))}
                  className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddHistorico}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Adicionar
                </Button>
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-4">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {editingId ? 'Atualizar' : 'Criar'} Garantia
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Listagem */}
      <div className="grid grid-cols-1 gap-3">
        {garantiasFiltradas.length > 0 ? (
          garantiasFiltradas.map(garantia => {
            const diasRestantes = getDiasRestantes(garantia);
            const isVigente = diasRestantes > 0;

            return (
              <Card
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
                          #{garantia.osNumero} - {garantia.clienteNome}
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
              </Card>
            );
          })
        ) : (
          <Card className="p-8 text-center text-gray-500">
            <p>Nenhuma garantia encontrada</p>
          </Card>
        )}
      </div>
    </div>
  );
}
