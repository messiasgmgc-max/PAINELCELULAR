'use client';

import { useState, useEffect } from 'react';
import { useAgendamentos } from '@/hooks/useAgendamentos';
import { useClientes } from '@/hooks/useClientes';
import { useTecnicos } from '@/hooks/useTecnicos';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Trash2, Edit2, Plus, Search, X, Calendar, Clock, Phone, User } from 'lucide-react';
import { Agendamento } from '@/lib/db/types';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  agendado: { label: 'Agendado', color: 'bg-blue-100 text-blue-800' },
  confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-800' },
  concluido: { label: 'Concluído', color: 'bg-purple-100 text-purple-800' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-800' }
};

export function AgendamentosTab() {
  const { agendamentos, loading, error, fetchAgendamentos, criarAgendamento, atualizarAgendamento, deletarAgendamento } = useAgendamentos();
  const { clientes, fetchClientes } = useClientes();
  const { tecnicos, fetchTecnicos } = useTecnicos();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    clienteId: '',
    clienteNome: '',
    telefone: '',
    data: '',
    descricao: '',
    tecnicoId: '',
    tecnicoNome: '',
    aparelhoDescricao: '',
    status: 'agendado' as const,
    observacoes: ''
  });

  useEffect(() => {
    fetchClientes();
    fetchTecnicos();
    fetchAgendamentos();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleClienteChange = (clienteId: string) => {
    const cliente = clientes.find(c => c.id === clienteId);
    setFormData(prev => ({
      ...prev,
      clienteId,
      clienteNome: cliente?.nome || '',
      telefone: cliente?.telefone || ''
    }));
  };

  const handleTecnicoChange = (tecnicoId: string) => {
    const tecnico = tecnicos.find(t => t.id === tecnicoId);
    setFormData(prev => ({
      ...prev,
      tecnicoId,
      tecnicoNome: tecnico?.nome || ''
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await atualizarAgendamento(editingId, formData);
      } else {
        await criarAgendamento(formData);
      }
      setFormData({
        clienteId: '',
        clienteNome: '',
        telefone: '',
        data: '',
        descricao: '',
        tecnicoId: '',
        tecnicoNome: '',
        aparelhoDescricao: '',
        status: 'agendado',
        observacoes: ''
      });
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      console.error('Erro ao salvar agendamento:', err);
    }
  };

  const handleEdit = (agendamento: Agendamento) => {
    setFormData({
      clienteId: agendamento.clienteId,
      clienteNome: agendamento.clienteNome,
      telefone: agendamento.telefone,
      data: agendamento.data,
      descricao: agendamento.descricao,
      tecnicoId: agendamento.tecnicoId || '',
      tecnicoNome: agendamento.tecnicoNome || '',
      aparelhoDescricao: agendamento.aparelhoDescricao || '',
      status: (agendamento.status === 'concluido' || agendamento.status === 'cancelado' || agendamento.status === 'confirmado') ? 'agendado' : agendamento.status,
      observacoes: agendamento.observacoes || ''
    });
    setEditingId(agendamento.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja deletar este agendamento?')) {
      try {
        await deletarAgendamento(id);
      } catch (err) {
        console.error('Erro ao deletar:', err);
      }
    }
  };

  const agendamentosFiltrados = searchTerm.trim()
    ? agendamentos.filter(a =>
        a.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.telefone.includes(searchTerm) ||
        a.aparelhoDescricao?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : agendamentos;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, telefone ou aparelho..."
            className="input-glass pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditingId(null); }}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Agendamento
        </Button>
      </div>

      {/* Formulário */}
      {showForm && (
        <GlassCard className="bg-white/40 dark:bg-white/5 rounded-[2rem] border-white/10 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {editingId ? 'Editar Agendamento' : 'Novo Agendamento'}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Cliente *</label>
                <select
                  name="clienteId"
                  value={formData.clienteId}
                  onChange={(e) => handleClienteChange(e.target.value)}
                  className="input-glass"
                  required
                >
                  <option value="">Selecionar cliente</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Data e Hora *</label>
                <input
                  type="datetime-local"
                  name="data"
                  value={formData.data}
                  onChange={handleInputChange}
                  className="input-glass"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Telefone</label>
                <input
                  type="tel"
                  name="telefone"
                  value={formData.telefone}
                  readOnly
                  className="input-glass bg-white/10"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Técnico</label>
                <select
                  name="tecnicoId"
                  value={formData.tecnicoId}
                  onChange={(e) => handleTecnicoChange(e.target.value)}
                  className="input-glass"
                >
                  <option value="">Selecionar técnico</option>
                  {tecnicos.map(t => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Aparelho</label>
              <input
                type="text"
                name="aparelhoDescricao"
                placeholder="Ex: iPhone 13 Pro Preto"
                value={formData.aparelhoDescricao}
                onChange={handleInputChange}
                className="input-glass"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Descrição do Serviço *</label>
              <textarea
                name="descricao"
                placeholder="Descreva o serviço a ser realizado..."
                value={formData.descricao}
                onChange={handleInputChange}
                rows={3}
                className="input-glass"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="input-glass"
                >
                  <option value="agendado">Agendado</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Observações</label>
                <input
                  type="text"
                  name="observacoes"
                  placeholder="Observações adicionais"
                  value={formData.observacoes}
                  onChange={handleInputChange}
                  className="input-glass"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {editingId ? 'Atualizar' : 'Criar'} Agendamento
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Listagem */}
      <div className="grid grid-cols-1 gap-3">
        {agendamentosFiltrados.length > 0 ? (
          agendamentosFiltrados.map(agendamento => (
            <GlassCard key={agendamento.id} className="p-4 border-l-4 border-l-blue-500 hover:shadow-md transition-shadow group rounded-2xl">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-bold text-lg text-blue-600">{agendamento.clienteNome}</p>
                      <div className="flex gap-2 items-center text-sm text-gray-600">
                        <Calendar className="w-4 h-4" />
                        {new Date(agendamento.data).toLocaleDateString('pt-BR', {
                          weekday: 'short',
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })}
                        <Clock className="w-4 h-4 ml-2" />
                        {new Date(agendamento.data).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <Badge className={STATUS_MAP[agendamento.status].color}>
                      {STATUS_MAP[agendamento.status].label}
                    </Badge>
                  </div>

                  <p className="text-sm text-gray-700 mb-2">{agendamento.descricao}</p>

                  <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {agendamento.telefone}
                    </div>
                    {agendamento.tecnicoNome && (
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {agendamento.tecnicoNome}
                      </div>
                    )}
                    {agendamento.aparelhoDescricao && (
                      <div className="text-blue-600 font-medium">
                        {agendamento.aparelhoDescricao}
                      </div>
                    )}
                  </div>

                  {agendamento.observacoes && (
                    <p className="text-xs text-gray-500 italic mt-2">Obs: {agendamento.observacoes}</p>
                  )}
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-col">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(agendamento)}>
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDelete(agendamento.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))
        ) : (
          <GlassCard className="p-8 text-center text-gray-500 rounded-3xl">
            <p>Nenhum agendamento encontrado</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
