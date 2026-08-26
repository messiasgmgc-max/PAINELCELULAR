'use client';

import { useState, useEffect } from 'react';
import { useAgendamentos } from '@/hooks/useAgendamentos';
import { useClientes } from '@/hooks/useClientes';
import { useTecnicos } from '@/hooks/useTecnicos';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/GlassCard';
import { ModalPortal } from '@/components/ModalPortal';
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
    <div className="panel-shell space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="w-full sm:flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, telefone ou aparelho..."
            className="input-glass pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="scroll-row w-full pb-1">
          <Button onClick={() => { setShowForm(!showForm); setEditingId(null); }} className="shrink-0 whitespace-nowrap">
            <Plus className="w-4 h-4 mr-2" />
            Novo Agendamento
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
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-white">
                      {editingId ? 'Editar Agendamento' : 'Cadastrar Novo Agendamento'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Agende a vinda de um cliente para atendimento ou serviço técnico
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => { setShowForm(false); setEditingId(null); }} 
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Cliente *</label>
                    <select
                      name="clienteId"
                      value={formData.clienteId}
                      onChange={(e) => handleClienteChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none transition-all cursor-pointer"
                      required
                    >
                      <option value="">Selecionar cliente cadastrado</option>
                      {clientes.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Data e Hora *</label>
                    <input
                      type="datetime-local"
                      name="data"
                      value={formData.data}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Telefone do Cliente</label>
                    <input
                      type="tel"
                      name="telefone"
                      value={formData.telefone}
                      readOnly
                      placeholder="Autopreenchido ao selecionar cliente"
                      className="w-full bg-slate-950/60 border border-slate-850 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-400 font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Técnico Responsável</label>
                    <select
                      name="tecnicoId"
                      value={formData.tecnicoId}
                      onChange={(e) => handleTecnicoChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="">Selecionar técnico (opcional)</option>
                      {tecnicos.map(t => (
                        <option key={t.id} value={t.id}>{t.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Aparelho do Cliente</label>
                  <input
                    type="text"
                    name="aparelhoDescricao"
                    placeholder="Ex: iPhone 13 Pro Max - Grafite"
                    value={formData.aparelhoDescricao}
                    onChange={handleInputChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Descrição do Serviço *</label>
                  <textarea
                    name="descricao"
                    placeholder="Descreva o problema ou serviço agendado..."
                    value={formData.descricao}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Status do Agendamento</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="agendado">📅 Agendado</option>
                      <option value="confirmado">✅ Confirmado</option>
                      <option value="concluido">🎉 Concluído</option>
                      <option value="cancelado">❌ Cancelado</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Observações (opcional)</label>
                    <input
                      type="text"
                      name="observacoes"
                      placeholder="Anotações internas..."
                      value={formData.observacoes}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setEditingId(null); }}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs sm:text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl text-xs sm:text-sm px-6 py-2.5 shadow-lg shadow-cyan-950/40 flex items-center gap-2 transition-all"
                  >
                    {editingId ? 'Atualizar Agendamento' : 'Salvar Agendamento'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
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
