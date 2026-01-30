// src/components/SuperAdminTab.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Painel Super Admin</h2>
          <p className="text-muted-foreground">Gerenciamento de Lojas e Acessos</p>
        </div>
        <Button onClick={() => setShowNovaLoja(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Loja
        </Button>
      </div>

      {/* Modal Nova Loja */}
      {showNovaLoja && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Criar Nova Loja</CardTitle>
              <CardDescription>Defina os dados da nova unidade</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCriarLoja} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Nome da Loja</label>
                  <input 
                    className="w-full border rounded p-2 bg-background"
                    value={novaLojaData.nome}
                    onChange={e => setNovaLojaData({...novaLojaData, nome: e.target.value})}
                    placeholder="Ex: Phone Center Centro"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Telefone</label>
                  <input 
                    className="w-full border rounded p-2 bg-background"
                    value={novaLojaData.telefone}
                    onChange={e => setNovaLojaData({...novaLojaData, telefone: e.target.value})}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowNovaLoja(false)}>Cancelar</Button>
                  <Button type="submit">Criar Loja</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal Novo Acesso */}
      {showNovoAcesso && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Novo Acesso</CardTitle>
              <CardDescription>Adicionar usuário para a loja</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCriarAcesso} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Email de Login</label>
                  <input 
                    type="email"
                    className="w-full border rounded p-2 bg-background"
                    value={novoAcessoData.email}
                    onChange={e => setNovoAcessoData({...novoAcessoData, email: e.target.value})}
                    placeholder="usuario@loja.com"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Senha Inicial</label>
                  <input 
                    type="text"
                    className="w-full border rounded p-2 bg-background"
                    value={novoAcessoData.password}
                    onChange={e => setNovoAcessoData({...novoAcessoData, password: e.target.value})}
                    placeholder="Senha provisória"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    * A senha deve ser configurada no provedor de Auth.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Função (Role)</label>
                  <select 
                    className="w-full border rounded p-2 bg-background"
                    value={novoAcessoData.role}
                    onChange={e => setNovoAcessoData({...novoAcessoData, role: e.target.value})}
                  >
                    <option value="admin">Admin da Loja</option>
                    <option value="operador">Operador</option>
                    <option value="tecnico">Técnico</option>
                    <option value="vendedor">Vendedor</option>
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowNovoAcesso(null)}>Cancelar</Button>
                  <Button type="submit">Adicionar Acesso</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal Editar Acesso */}
      {editingAcesso && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Editar Acesso</CardTitle>
              <CardDescription>Alterar permissões do usuário</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateAcesso} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Email de Login</label>
                  <input 
                    type="email"
                    className="w-full border rounded p-2 bg-background"
                    value={editingAcesso.email}
                    onChange={e => setEditingAcesso({...editingAcesso, email: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Função (Role)</label>
                  <select 
                    className="w-full border rounded p-2 bg-background"
                    value={editingAcesso.role}
                    onChange={e => setEditingAcesso({...editingAcesso, role: e.target.value})}
                  >
                    <option value="admin">Admin da Loja</option>
                    <option value="operador">Operador</option>
                    <option value="tecnico">Técnico</option>
                    <option value="vendedor">Vendedor</option>
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setEditingAcesso(null)}>Cancelar</Button>
                  <Button type="submit">Salvar Alterações</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lista de Lojas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lojas.map(loja => {
          const lojaAcessos = acessos.filter(a => a.loja_id === loja.id);
          return (
            <Card key={loja.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <CardTitle className="text-lg">{loja.nome}</CardTitle>
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDeletarLoja(loja.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <CardDescription>{loja.telefone || 'Sem telefone'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium flex items-center gap-1">
                        <Users className="w-4 h-4" /> Acessos ({lojaAcessos.length}/5)
                      </span>
                      {lojaAcessos.length < 5 && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowNovoAcesso(loja.id)}>
                          <Plus className="w-3 h-3 mr-1" /> Adicionar
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1 bg-muted/50 p-2 rounded-md min-h-[50px]">
                      {lojaAcessos.length > 0 ? (
                        lojaAcessos.map(acesso => (
                          <div key={acesso.id} className="text-xs flex items-center gap-2 p-1 bg-background rounded border">
                            <Key className="w-3 h-3 text-gray-400" />
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">{acesso.email}</div>
                              <div className="text-[10px] text-muted-foreground">{acesso.role}</div>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingAcesso(acesso)}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => handleDeleteAcesso(acesso.id)}>
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
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    ID: {loja.id}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {lojas.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Store className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>Nenhuma loja cadastrada.</p>
        </div>
      )}
    </div>
  );
}
