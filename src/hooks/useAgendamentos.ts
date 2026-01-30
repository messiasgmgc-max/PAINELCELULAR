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
      const { data, error } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .order('data', { ascending: true });
      
      if (error) throw error;
      setAgendamentos(data || []);
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
      const { data, error } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .ilike('clienteNome', `%${termo}%`);
      
      if (error) throw error;
      setAgendamentos(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const criarAgendamento = useCallback(async (dados: Omit<Agendamento, 'id' | 'dataCadastro' | 'ativo'>) => {
    if (!usuario?.lojaId) throw new Error("Loja não identificada");
    try {
      const { data, error } = await supabase
        .from('agendamentos')
        .insert([{ ...dados, loja_id: usuario.lojaId }])
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
    try {
      const { data, error } = await supabase
        .from('agendamentos')
        .update(dados)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      setAgendamentos(prev => prev.map(a => a.id === id ? data : a));
      return data;
    } catch (err) {
      throw err;
    }
  }, []);

  const deletarAgendamento = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('agendamentos')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setAgendamentos(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      throw err;
    }
  }, []);

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
