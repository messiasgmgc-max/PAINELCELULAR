'use client';

import { useState, useEffect } from 'react';
import { useTecnicos } from '@/hooks/useTecnicos';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/GlassCard';
import { ModalPortal } from '@/components/ModalPortal';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Download, Edit2, Search, AlertCircle, Trash2, Phone, Mail, UserCheck } from 'lucide-react';
import { Tecnico } from '@/lib/db/types';

import { toast } from 'sonner';

export function TecnicosTab() {
  const { tecnicos, loading, error, fetchTecnicos, criarTecnico, atualizarTecnico, deletarTecnico } = useTecnicos();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'tecnico' | 'vendedor'>('tecnico'); // Aba técnico por padrão
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    cpf: '',
    especialidade: '',
    tipo: 'tecnico' as 'tecnico' | 'vendedor'
  });

  useEffect(() => {
    fetchTecnicos();
  }, []);

  const tecnicosFiltrados = tecnicos.filter(t => {
    const matchTipo = filtroTipo === 'todos' || (t as any).tipo === filtroTipo;
    const termo = searchTerm.trim().toLowerCase();
    const matchBusca = !termo ||
      t.nome.toLowerCase().includes(termo) ||
      t.email?.toLowerCase().includes(termo) ||
      t.telefone.includes(termo) ||
      t.especialidade?.toLowerCase().includes(termo);

    return matchTipo && matchBusca;
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEdit = (tecnico: Tecnico & { tipo?: string }) => {
    setFormData({
      nome: tecnico.nome,
      email: tecnico.email || '',
      telefone: tecnico.telefone,
      cpf: tecnico.cpf || '',
      especialidade: tecnico.especialidade || '',
      tipo: (tecnico.tipo as 'tecnico' | 'vendedor') || 'tecnico'
    });
    setEditingId(tecnico.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome || !formData.telefone) {
      toast.error('Nome e telefone são obrigatórios');
      return;
    }

    try {
      const dados = {
        nome: formData.nome,
        email: formData.email || undefined,
        telefone: formData.telefone,
        cpf: formData.cpf || undefined,
        especialidade: formData.especialidade || undefined,
        tipo: formData.tipo
      };

      if (editingId) {
        await atualizarTecnico(editingId, dados);
        toast.success('Membro da equipe atualizado com sucesso!');
      } else {
        await criarTecnico(dados);
        toast.success('Novo membro cadastrado com sucesso!');
      }

      setFormData({
        nome: '',
        email: '',
        telefone: '',
        cpf: '',
        especialidade: '',
        tipo: 'tecnico'
      });
      setEditingId(null);
      setShowForm(false);
      await fetchTecnicos();
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      toast.error(`Erro ao salvar membro: ${err.message || 'Falha no banco de dados'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja deletar este registro?')) {
      try {
        await deletarTecnico(id);
        toast.success('Membro removido da equipe!');
        await fetchTecnicos();
      } catch (err: any) {
        console.error('Erro ao deletar:', err);
        toast.error(`Erro ao deletar: ${err.message || 'Falha no processamento'}`);
      }
    }
  };

  const handleExportCSV = () => {
    const headers = ['Nome', 'Tipo', 'Email', 'Telefone', 'CPF', 'Especialidade', 'Data Cadastro'];
    const data = tecnicosFiltrados.map(t => [
      t.nome,
      (t as any).tipo || 'tecnico',
      t.email || '',
      t.telefone,
      t.cpf || '',
      t.especialidade || '',
      new Date(t.dataCadastro).toLocaleDateString('pt-BR')
    ]);

    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `equipe_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
    link.click();
  };

  return (
    <div className="panel-shell space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Botões de Filtro por Aba */}
      <div className="flex gap-2 border-b border-white/10 pb-3">
        <Button
          variant={filtroTipo === 'tecnico' ? 'default' : 'outline'}
          onClick={() => setFiltroTipo('tecnico')}
          className="rounded-xl"
        >
          Técnicos
        </Button>
        <Button
          variant={filtroTipo === 'vendedor' ? 'default' : 'outline'}
          onClick={() => setFiltroTipo('vendedor')}
          className="rounded-xl"
        >
          Vendedores
        </Button>
        <Button
          variant={filtroTipo === 'todos' ? 'default' : 'outline'}
          onClick={() => setFiltroTipo('todos')}
          className="rounded-xl"
        >
          Todos
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="w-full sm:flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, email, telefone ou especialidade..."
            className="input-glass pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="scroll-row w-full pb-1">
          <Button onClick={handleExportCSV} variant="outline" className="shrink-0 whitespace-nowrap">
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
          <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ nome: '', email: '', telefone: '', cpf: '', especialidade: '', tipo: filtroTipo === 'vendedor' ? 'vendedor' : 'tecnico' }); }} className="shrink-0 whitespace-nowrap bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Novo Membro
          </Button>
        </div>
      </div>

      {/* Formulário Modal */}
      {showForm && (
        <ModalPortal>
          <div className="modal-overlay modal-overlay-fit">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-lg w-full my-4">
              <div className="modal-header">
                <h3 className="modal-title">
                  {editingId ? 'Editar Membro da Equipe' : 'Novo Membro da Equipe'}
                </h3>
                <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); setEditingId(null); }}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="modal-body-scroll">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Função / Cargo *</label>
                      <select
                        name="tipo"
                        value={formData.tipo}
                        onChange={handleInputChange}
                        className="input-glass"
                        required
                      >
                        <option value="tecnico">Técnico</option>
                        <option value="vendedor">Vendedor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Nome *</label>
                      <input
                        type="text"
                        name="nome"
                        placeholder="Nome completo"
                        value={formData.nome}
                        onChange={handleInputChange}
                        className="input-glass"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Telefone *</label>
                      <input
                        type="tel"
                        name="telefone"
                        placeholder="(11) 98765-4321"
                        value={formData.telefone}
                        onChange={handleInputChange}
                        className="input-glass"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Email</label>
                      <input
                        type="email"
                        name="email"
                        placeholder="email@example.com"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="input-glass"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">CPF</label>
                      <input
                        type="text"
                        name="cpf"
                        placeholder="123.456.789-00"
                        value={formData.cpf}
                        onChange={handleInputChange}
                        className="input-glass"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2">Especialidade (opcional)</label>
                      <input
                        type="text"
                        name="especialidade"
                        placeholder="Ex: Tela, Bateria, Placa, Vendas Balcão"
                        value={formData.especialidade}
                        onChange={handleInputChange}
                        className="input-glass"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-4 border-t border-white/10">
                    <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700 font-bold px-6">
                      {editingId ? 'Atualizar Membro' : 'Salvar Membro'}
                    </Button>
                  </div>
                </form>
              </div>
            </GlassCard>
          </div>
        </ModalPortal>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {tecnicosFiltrados.map((tecnico: any) => (
          <GlassCard key={tecnico.id} className="p-4 hover:shadow-lg transition-shadow group rounded-2xl">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400">{tecnico.nome}</h3>
                  <Badge variant={tecnico.tipo === 'vendedor' ? 'default' : 'secondary'} className={tecnico.tipo === 'vendedor' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}>
                    {tecnico.tipo === 'vendedor' ? 'Vendedor' : 'Técnico'}
                  </Badge>
                  {tecnico.email ? (
                    tecnico.status_conta === 'ativo' ? (
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                        ✓ Login Ativo
                      </Badge>
                    ) : (
                      <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-[10px]" title="Pode criar senha via Primeiro Acesso no Login">
                        🔑 Acesso Liberado (Primeiro Acesso)
                      </Badge>
                    )
                  ) : null}
                  {tecnico.especialidade && (
                    <Badge variant="outline" className="text-xs">
                      {tecnico.especialidade}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1 text-sm text-gray-600">
                  {tecnico.telefone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      {tecnico.telefone}
                    </div>
                  )}
                  {tecnico.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      {tecnico.email}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="outline" onClick={() => handleEdit(tecnico)}>
                  <Edit2 className="w-4 h-4" /> Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDelete(tecnico.id)} className="text-red-600 hover:text-red-700">
                  <Trash2 className="w-4 h-4" /> Deletar
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {tecnicosFiltrados.length === 0 && !showForm && (
        <GlassCard className="p-8 text-center text-gray-500 rounded-3xl">
          <p>Nenhum registro encontrado para esta categoria.</p>
        </GlassCard>
      )}
    </div>
  );
}