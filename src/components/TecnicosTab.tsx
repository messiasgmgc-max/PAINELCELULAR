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
          <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-start p-2 sm:p-4 pt-3 sm:pt-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 text-white relative my-0 shrink-0">
              {/* Cabeçalho */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold border border-cyan-500/30">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-white">
                      {editingId ? 'Editar Membro da Equipe' : 'Cadastrar Membro da Equipe'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Cadastre técnicos e vendedores para vincular às Ordens de Serviço e Vendas
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
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Função / Cargo *</label>
                    <select
                      name="tipo"
                      value={formData.tipo}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none transition-all cursor-pointer"
                      required
                    >
                      <option value="tecnico">🔧 Técnico de Manutenção</option>
                      <option value="vendedor">🛒 Vendedor de Balcão</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Nome completo *</label>
                    <input
                      type="text"
                      name="nome"
                      placeholder="Nome completo do colaborador"
                      value={formData.nome}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Telefone / WhatsApp *</label>
                    <input
                      type="tel"
                      name="telefone"
                      placeholder="(11) 98765-4321 *"
                      value={formData.telefone}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Email (opcional)</label>
                    <input
                      type="email"
                      name="email"
                      placeholder="colaborador@loja.com"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">CPF (opcional)</label>
                    <input
                      type="text"
                      name="cpf"
                      placeholder="000.000.000-00"
                      value={formData.cpf}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Especialidade (opcional)</label>
                    <input
                      type="text"
                      name="especialidade"
                      placeholder="Ex: Troca de Tela, Placa, Balcão"
                      value={formData.especialidade}
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
                    {editingId ? 'Atualizar Membro' : 'Salvar Membro'}
                  </button>
                </div>
              </form>
            </div>
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