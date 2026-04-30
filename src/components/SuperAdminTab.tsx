// src/components/SuperAdminTab.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { Plus, Store, Users, Trash2, Key, Save, X, Building2, Edit2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface Loja {
  id: string;
  nome: string;
  telefone: string;
  ativo: boolean;
  created_at: string;
}

interface Acesso {
  id: string;
  email: string;
  loja_id: string;
  role: string;
}

export default function SuperAdminTab() {
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showNovaLoja, setShowNovaLoja] = useState(false);
  const [showNovoAcesso, setShowNovoAcesso] = useState<string | null>(null); // ID da loja
  
  const [novaLojaData, setNovaLojaData] = useState({ nome: '', telefone: '' });
  const [novoAcessoData, setNovoAcessoData] = useState({ email: '', password: '', role: 'admin' });
  const [editingAcesso, setEditingAcesso] = useState<Acesso | null>(null);

  useEffect(() => {
    fetchDados();
  }, []);

  const fetchDados = async () => {
    setLoading(true);
    try {
      const { data: lojasData, error: lojasError } = await supabase
        .from('lojas')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (lojasError) throw lojasError;
      setLojas(lojasData || []);

      const { data: acessosData, error: acessosError } = await supabase
        .from('perfis')
        .select('*');
        
      if (acessosError) {
        console.warn("Erro ao buscar perfis (tabela pode não existir ainda):", acessosError);
      } else {
        setAcessos(acessosData || []);
      }
      
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCriarLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaLojaData.nome) return alert("Nome da loja é obrigatório");

    try {
      const { data, error } = await supabase
        .from('lojas')
        .insert([{ 
          nome: novaLojaData.nome, 
          telefone: novaLojaData.telefone,
          ativo: true 
        }])
        .select()
        .single();

      if (error) throw error;

      setLojas([data, ...lojas]);
      setShowNovaLoja(false);
      setNovaLojaData({ nome: '', telefone: '' });
      
      if (confirm("Loja criada com sucesso! Deseja criar um acesso para ela agora?")) {
        setShowNovoAcesso(data.id);
      }
    } catch (error) {
      alert("Erro ao criar loja: " + (error as any).message);
    }
  };

  const handleCriarAcesso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showNovoAcesso || !novoAcessoData.email) return;

    const acessosDaLoja = acessos.filter(a => a.loja_id === showNovoAcesso);
    if (acessosDaLoja.length >= 5) {
      alert("Limite de 5 acessos por loja atingido!");
      return;
    }

    // Função simples para gerar UUID caso crypto.randomUUID não esteja disponível
    const generateUUID = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    };

    try {
      const { data, error } = await supabase
        .from('perfis')
        .insert([{
          id: generateUUID(), // Gera ID manualmente para evitar erro de not-null
          email: novoAcessoData.email,
          loja_id: showNovoAcesso,
          role: novoAcessoData.role
        }])
        .select()
        .single();

      if (error) throw error;

      setAcessos([...acessos, data]);
      setShowNovoAcesso(null);
      setNovoAcessoData({ email: '', password: '', role: 'admin' });
      alert("Vínculo criado! Agora crie o usuário no menu 'Authentication' do Supabase com este email.");

    } catch (error) {
      const msg = (error as any).message;
      if (msg.includes("perfis_id_fkey")) {
        alert("Erro de Banco de Dados: A tabela 'perfis' está vinculada à tabela de usuários (auth.users). Você precisa remover essa restrição (Foreign Key) no Supabase para criar pré-cadastros, ou criar o usuário no Auth primeiro.\n\nSugestão: Rode 'ALTER TABLE public.perfis DROP CONSTRAINT perfis_id_fkey;' no SQL Editor.");
      } else {
        alert("Erro ao criar acesso: " + msg);
      }
    }
  };

  const handleUpdateAcesso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAcesso) return;

    try {
      const { error } = await supabase
        .from('perfis')
        .update({ email: editingAcesso.email, role: editingAcesso.role })
        .eq('id', editingAcesso.id);

      if (error) throw error;

      setAcessos(acessos.map(a => a.id === editingAcesso.id ? editingAcesso : a));
      setEditingAcesso(null);
      alert("Acesso atualizado com sucesso!");
    } catch (error) {
      alert("Erro ao atualizar acesso: " + (error as any).message);
    }
  };

  const handleDeleteAcesso = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este acesso?")) return;
    try {
      const { error } = await supabase.from('perfis').delete().eq('id', id);
      if (error) throw error;
      setAcessos(acessos.filter(a => a.id !== id));
    } catch (error) {
      alert("Erro ao remover acesso: " + (error as any).message);
    }
  };

  const handleDeletarLoja = async (id: string) => {
    if (!confirm("Tem certeza? Isso apagará todos os dados desta loja!")) return;
    try {
      const { error } = await supabase.from('lojas').delete().eq('id', id);
      if (error) throw error;
      setLojas(lojas.filter(l => l.id !== id));
      setAcessos(acessos.filter(a => a.loja_id !== id));
    } catch (error) {
      alert("Erro ao deletar loja: " + (error as any).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white drop-shadow-sm">Painel Super Admin</h2>
          <p className="text-slate-600 dark:text-slate-300 font-medium">Gerenciamento de Lojas e Acessos</p>
        </div>
        <Button onClick={() => setShowNovaLoja(true)} className="btn-ios w-full sm:w-auto flex items-center justify-center gap-2 h-auto shrink-0 whitespace-nowrap">
          <Plus className="w-5 h-5" /> Nova Loja
        </Button>
      </div>

      {/* Modal Nova Loja */}
      {showNovaLoja && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md bg-white/90 dark:bg-black/90">
            <div className="pb-4 border-b border-white/10 mb-4">
              <h3 className="text-lg font-bold">Criar Nova Loja</h3>
              <p className="text-sm text-muted-foreground">Defina os dados da nova unidade</p>
            </div>
            <div>
              <form onSubmit={handleCriarLoja} className="space-y-4">
                <div>
                  <label className="text-sm font-medium ml-1">Nome da Loja</label>
                  <input 
                    className="input-glass"
                    value={novaLojaData.nome}
                    onChange={e => setNovaLojaData({...novaLojaData, nome: e.target.value})}
                    placeholder="Ex: Phone Center Centro"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium ml-1">Telefone</label>
                  <input 
                    className="input-glass"
                    value={novaLojaData.telefone}
                    onChange={e => setNovaLojaData({...novaLojaData, telefone: e.target.value})}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="ghost" onClick={() => setShowNovaLoja(false)} className="hover:bg-white/10">Cancelar</Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20">Criar Loja</Button>
                </div>
              </form>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Modal Novo Acesso */}
      {showNovoAcesso && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md bg-white/90 dark:bg-black/90">
            <div className="pb-4 border-b border-white/10 mb-4">
              <h3 className="text-lg font-bold">Novo Acesso</h3>
              <p className="text-sm text-muted-foreground">Adicionar usuário para a loja</p>
            </div>
            <div>
              <form onSubmit={handleCriarAcesso} className="space-y-4">
                <div>
                  <label className="text-sm font-medium ml-1">Email de Login</label>
                  <input 
                    type="email"
                    className="input-glass"
                    value={novoAcessoData.email}
                    onChange={e => setNovoAcessoData({...novoAcessoData, email: e.target.value})}
                    placeholder="usuario@loja.com"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium ml-1">Senha Inicial</label>
                  <input 
                    type="text"
                    className="input-glass"
                    value={novoAcessoData.password}
                    onChange={e => setNovoAcessoData({...novoAcessoData, password: e.target.value})}
                    placeholder="Senha provisória"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    * A senha deve ser configurada no provedor de Auth.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium ml-1">Função (Role)</label>
                  <select 
                    className="input-glass"
                    value={novoAcessoData.role}
                    onChange={e => setNovoAcessoData({...novoAcessoData, role: e.target.value})}
                  >
                    <option value="admin">Admin da Loja</option>
                    <option value="operador">Operador</option>
                    <option value="tecnico">Técnico</option>
                    <option value="vendedor">Vendedor</option>
                  </select>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="ghost" onClick={() => setShowNovoAcesso(null)} className="hover:bg-white/10">Cancelar</Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20">Adicionar Acesso</Button>
                </div>
              </form>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Modal Editar Acesso */}
      {editingAcesso && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md bg-white/90 dark:bg-black/90">
            <div className="pb-4 border-b border-white/10 mb-4">
              <h3 className="text-lg font-bold">Editar Acesso</h3>
              <p className="text-sm text-muted-foreground">Alterar permissões do usuário</p>
            </div>
            <div>
              <form onSubmit={handleUpdateAcesso} className="space-y-4">
                <div>
                  <label className="text-sm font-medium ml-1">Email de Login</label>
                  <input 
                    type="email"
                    className="input-glass"
                    value={editingAcesso.email}
                    onChange={e => setEditingAcesso({...editingAcesso, email: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium ml-1">Função (Role)</label>
                  <select 
                    className="input-glass"
                    value={editingAcesso.role}
                    onChange={e => setEditingAcesso({...editingAcesso, role: e.target.value})}
                  >
                    <option value="admin">Admin da Loja</option>
                    <option value="operador">Operador</option>
                    <option value="tecnico">Técnico</option>
                    <option value="vendedor">Vendedor</option>
                  </select>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="ghost" onClick={() => setEditingAcesso(null)} className="hover:bg-white/10">Cancelar</Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20">Salvar Alterações</Button>
                </div>
              </form>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Lista de Lojas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lojas.map(loja => {
          const lojaAcessos = acessos.filter(a => a.loja_id === loja.id);
          return (
            <GlassCard key={loja.id} className="relative group hover:bg-white/40 dark:hover:bg-black/40 transition-colors" hoverEffect={true}>
              <div className="pb-2 mb-2 border-b border-white/10">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-bold">{loja.nome}</h3>
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10" onClick={() => handleDeletarLoja(loja.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">{loja.telefone || 'Sem telefone'}</p>
              </div>
              
              <div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium flex items-center gap-1">
                        <Users className="w-4 h-4" /> Acessos ({lojaAcessos.length}/5)
                      </span>
                      {lojaAcessos.length < 5 && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs hover:bg-white/20" onClick={() => setShowNovoAcesso(loja.id)}>
                          <Plus className="w-3 h-3 mr-1" /> Adicionar
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1 bg-white/20 dark:bg-black/20 p-2 rounded-xl min-h-[50px] border border-white/5">
                      {lojaAcessos.length > 0 ? (
                        lojaAcessos.map(acesso => (
                          <div key={acesso.id} className="text-xs flex items-center gap-2 p-2 bg-white/40 dark:bg-white/5 rounded-lg border border-white/10">
                            <Key className="w-3 h-3 text-gray-400" />
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">{acesso.email}</div>
                              <div className="text-[10px] text-muted-foreground">{acesso.role}</div>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/20" onClick={() => setEditingAcesso(acesso)}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-500/10" onClick={() => handleDeleteAcesso(acesso.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">Nenhum acesso criado</p>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground pt-2 border-t border-white/10">
                    ID: {loja.id}
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
      
      {lojas.length === 0 && !loading && (
        <GlassCard className="text-center py-12 text-muted-foreground">
          <Store className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>Nenhuma loja cadastrada.</p>
        </GlassCard>
      )}
    </div>
  );
}
