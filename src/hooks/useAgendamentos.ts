import { useState, useCallback, useEffect } from 'react';
import { Agendamento } from '@/lib/db/types';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './useAuth';

export function useAgendamentos() {
  const { usuario } = useAuth();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgendamentos = useCallback(async () => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('agendamentos').select('*');

      if (usuario?.lojaId) {
        query = query.eq('loja_id', usuario.lojaId);
      }

      const { data, error } = await query.order('data', { ascending: true });

      if (error) throw error;
      setAgendamentos((data || []).filter(a => a.ativo !== false));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const buscarAgendamentos = useCallback(async (termo: string) => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('agendamentos').select('*');

      if (usuario?.lojaId) {
        query = query.eq('loja_id', usuario.lojaId);
      }

      const { data, error } = await query.ilike('clienteNome', `%${termo}%`);

      if (error) throw error;
      setAgendamentos((data || []).filter(a => a.ativo !== false));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const criarAgendamento = useCallback(async (dados: Omit<Agendamento, 'id' | 'dataCadastro' | 'ativo'>) => {
    try {
      const payload = {
        ...dados,
        ...(usuario?.lojaId ? { loja_id: usuario.lojaId } : {})
      };

      const { data, error } = await supabase
        .from('agendamentos')
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      setAgendamentos(prev => [...prev, data]);
      return data;
    } catch (err) {
      throw err;
    }
  }, [usuario?.lojaId]);

  const atualizarAgendamento = useCallback(async (id: string, dados: Partial<Omit<Agendamento, 'id' | 'dataCadastro'>>) => {
    if (!usuario?.lojaId) throw new Error('Loja não autenticada');
    try {
      const { data, error } = await supabase
        .from('agendamentos')
        .update(dados)
        .eq('id', id)
        .eq('loja_id', usuario.lojaId)
        .select()
        .single();
      if (error) throw error;
      setAgendamentos(prev => prev.map(a => a.id === id ? data : a));
      return data;
    } catch (err) {
      throw err;
    }
  }, [usuario?.lojaId]);

  const deletarAgendamento = useCallback(async (id: string) => {
    if (!usuario?.lojaId) throw new Error('Loja não autenticada');
    try {
      const { error } = await supabase
        .from('agendamentos')
        .delete()
        .eq('id', id)
        .eq('loja_id', usuario.lojaId);
      if (error) throw error;
      setAgendamentos(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      throw err;
    }
  }, [usuario?.lojaId]);

  useEffect(() => {
    fetchAgendamentos();
  }, [fetchAgendamentos]);

  return {
    agendamentos,
    loading,
    error,
    fetchAgendamentos,
    buscarAgendamentos,
    criarAgendamento,
    atualizarAgendamento,
    deletarAgendamento
  };
}
