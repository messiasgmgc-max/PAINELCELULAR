'use client';

import { useState, useEffect } from 'react';
import { useTecnicos } from '@/hooks/useTecnicos';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Download, Edit2, Search, AlertCircle, Trash2, Phone, Mail } from 'lucide-react';
import { Tecnico } from '@/lib/db/types';

export function TecnicosTab() {
  const { tecnicos, loading, error, fetchTecnicos, criarTecnico, atualizarTecnico, deletarTecnico } = useTecnicos();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    cpf: '',
    especialidade: ''
  });

  useEffect(() => {
    fetchTecnicos();
  }, []);

  const tecnicosFiltrados = searchTerm.trim()
    ? tecnicos.filter(t =>
        t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.telefone.includes(searchTerm) ||
        t.especialidade?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : tecnicos;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEdit = (tecnico: Tecnico) => {
    setFormData({
      nome: tecnico.nome,
      email: tecnico.email || '',
      telefone: tecnico.telefone,
      cpf: tecnico.cpf || '',
      especialidade: tecnico.especialidade || ''
    });
    setEditingId(tecnico.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome || !formData.telefone) {
      alert('Nome e telefone são obrigatórios');
      return;
    }

    try {
      const dados = {
        nome: formData.nome,
        email: formData.email || undefined,
        telefone: formData.telefone,
        cpf: formData.cpf || undefined,
        especialidade: formData.especialidade || undefined
      };

      if (editingId) {
        await atualizarTecnico(editingId, dados);
      } else {
        await criarTecnico(dados);
      }

      setFormData({
        nome: '',
        email: '',
        telefone: '',
        cpf: '',
        especialidade: ''
      });
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      console.error('Erro ao salvar técnico:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja deletar esse técnico?')) {
      try {
        await deletarTecnico(id);
      } catch (err) {
        console.error('Erro ao deletar:', err);
      }
    }
  };

  const handleExportCSV = () => {
    const headers = ['Nome', 'Email', 'Telefone', 'CPF', 'Especialidade', 'Data Cadastro'];
    const data = tecnicosFiltrados.map(t => [
      t.nome,
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
    link.setAttribute('download', `tecnicos_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
    link.click();
  };

  return (
    <div className="space-y-4">
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
            placeholder="Buscar por nome, email, telefone ou especialidade..."
            className="input-glass pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <Button onClick={handleExportCSV} variant="outline" className="shrink-0 whitespace-nowrap">
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
          <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ nome: '', email: '', telefone: '', cpf: '', especialidade: '' }); }} className="shrink-0 whitespace-nowrap">
            <Plus className="w-4 h-4 mr-2" />
            Novo Técnico
          </Button>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <GlassCard className="bg-white/40 dark:bg-white/5 rounded-[2rem] border-white/10 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {editingId ? 'Editar Técnico' : 'Novo Técnico'}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); setFormData({ nome: '', email: '', telefone: '', cpf: '', especialidade: '' }); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <label className="block text-sm font-medium mb-2">Especialidade</label>
                <input
                  type="text"
                  name="especialidade"
                  placeholder="Ex: Tela, Bateria, Placa, Reparo Geral"
                  value={formData.especialidade}
                  onChange={handleInputChange}
                  className="input-glass"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">{editingId ? 'Atualizar' : 'Criar'} Técnico</Button>
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setFormData({ nome: '', email: '', telefone: '', cpf: '', especialidade: '' }); }}>
                Cancelar
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Lista de Técnicos */}
      <div className="space-y-3">
        {tecnicosFiltrados.map((tecnico) => (
          <GlassCard key={tecnico.id} className="p-4 hover:shadow-lg transition-shadow group rounded-2xl">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-blue-600">{tecnico.nome}</h3>
                  {tecnico.especialidade && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
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
                  {tecnico.cpf && (
                    <div className="text-xs text-gray-500">
                      CPF: {tecnico.cpf}
                    </div>
                  )}
                </div>

                <div className="mt-2 text-xs text-gray-400">
                  Cadastrado em {new Date(tecnico.dataCadastro).toLocaleDateString('pt-BR')}
                </div>
              </div>

              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEdit(tecnico)}
                  className="flex items-center gap-1"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(tecnico.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                  Deletar
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {tecnicosFiltrados.length === 0 && !showForm && (
        <GlassCard className="p-8 text-center text-gray-500 rounded-3xl">
          <p>{searchTerm ? 'Nenhum técnico encontrado' : 'Nenhum técnico cadastrado'}</p>
        </GlassCard>
      )}

      {loading && (
        <GlassCard className="p-8 text-center text-gray-500 rounded-3xl">
          <p>Carregando técnicos...</p>
        </GlassCard>
      )}
    </div>
  );
}
