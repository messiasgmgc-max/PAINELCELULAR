import { useState, useEffect, useCallback } from 'react';
import { Tecnico } from '@/lib/db/types';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './useAuth';

export function useTecnicos() {
  const { usuario } = useAuth();
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auxiliar para resolver o ID da loja com fallbacks seguros
  const resolveLojaId = useCallback(async (): Promise<string | null> => {
    if (usuario?.lojaId) return usuario.lojaId;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        const { data: perfil } = await supabase
          .from('perfis')
          .select('loja_id')
          .eq('email', session.user.email)
          .maybeSingle();
        if (perfil?.loja_id) return perfil.loja_id;
      }

      const { data: primeiraLoja } = await supabase
        .from('lojas')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (primeiraLoja?.id) return primeiraLoja.id;
    } catch (e) {
      console.error('Erro ao resolver loja_id:', e);
    }
    return null;
  }, [usuario?.lojaId]);

  // Buscar todos os técnicos
  const fetchTecnicos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lojaId = await resolveLojaId();
      let query = supabase.from('tecnicos').select('*');

      if (lojaId) {
        query = query.eq('loja_id', lojaId);
      }

      const { data, error } = await query.order('nome');
      if (error) throw error;
      setTecnicos(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar membros da equipe:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [resolveLojaId]);

  // Buscar técnicos por termo
  const buscarTecnicos = useCallback(async (termo: string) => {
    setLoading(true);
    setError(null);
    try {
      const lojaId = await resolveLojaId();
      let query = supabase.from('tecnicos').select('*');

      if (lojaId) {
        query = query.eq('loja_id', lojaId);
      }

      const { data, error } = await query.ilike('nome', `%${termo}%`);
      if (error) throw error;
      setTecnicos(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [resolveLojaId]);

  // Criar novo técnico / vendedor
  const criarTecnico = useCallback(async (dados: Partial<Tecnico>) => {
    setError(null);
    try {
      const lojaId = await resolveLojaId();
      const payload = {
        ...dados,
        ...(lojaId ? { loja_id: lojaId } : {})
      };

      const { data, error } = await supabase
        .from('tecnicos')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      setTecnicos(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      return data;
    } catch (err: any) {
      console.error('Erro ao criar membro da equipe:', err);
      setError(err.message);
      throw err;
    }
  }, [resolveLojaId]);

  // Atualizar técnico / vendedor
  const atualizarTecnico = useCallback(async (id: string, dados: Partial<Tecnico>) => {
    setError(null);
    try {
      const lojaId = await resolveLojaId();
      let query = supabase.from('tecnicos').update(dados).eq('id', id);
      if (lojaId) {
        query = query.eq('loja_id', lojaId);
      }

      const { data, error } = await query.select().single();
      if (error) throw error;

      setTecnicos(prev => 
        prev.map(t => t.id === id ? data : t).sort((a, b) => a.nome.localeCompare(b.nome))
      );
      return data;
    } catch (err: any) {
      console.error('Erro ao atualizar membro da equipe:', err);
      setError(err.message);
      throw err;
    }
  }, [resolveLojaId]);

  // Deletar técnico / vendedor
  const deletarTecnico = useCallback(async (id: string) => {
    setError(null);
    try {
      const lojaId = await resolveLojaId();
      let query = supabase.from('tecnicos').delete().eq('id', id);
      if (lojaId) {
        query = query.eq('loja_id', lojaId);
      }

      const { error } = await query;
      if (error) throw error;

      setTecnicos(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      console.error('Erro ao deletar membro da equipe:', err);
      setError(err.message);
      throw err;
    }
  }, [resolveLojaId]);

  useEffect(() => {
    fetchTecnicos();
  }, [fetchTecnicos]);

  return {
    tecnicos,
    loading,
    error,
    fetchTecnicos,
    buscarTecnicos,
    criarTecnico,
    atualizarTecnico,
    deletarTecnico
  };
}
