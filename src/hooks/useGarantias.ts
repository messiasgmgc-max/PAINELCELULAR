import { useState, useCallback, useEffect } from 'react';
import { Garantia } from '@/lib/db/types';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './useAuth';

export function useGarantias() {
  const { usuario } = useAuth();
  const [garantias, setGarantias] = useState<Garantia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGarantias = useCallback(async () => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('garantias')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .order('dataInicio', { ascending: false });
      if (error) throw error;
      setGarantias(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const buscarGarantias = useCallback(async (termo: string) => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('garantias')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .ilike('clienteNome', `%${termo}%`);
      if (error) throw error;
      setGarantias(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const criarGarantia = useCallback(async (dados: Omit<Garantia, 'id' | 'dataCadastro'>) => {
    if (!usuario?.lojaId) throw new Error("Loja não identificada");
    try {
      const { data, error } = await supabase
        .from('garantias')
        .insert([{ ...dados, loja_id: usuario.lojaId }])
        .select()
        .single();
      if (error) throw error;
      setGarantias(prev => [...prev, data]);
      return data;
    } catch (err) {
      throw err;
    }
  }, [usuario?.lojaId]);

  const atualizarGarantia = useCallback(async (id: string, dados: Partial<Omit<Garantia, 'id' | 'dataCadastro'>>) => {
    try {
      const { data, error } = await supabase
        .from('garantias')
        .update(dados)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      setGarantias(prev => prev.map(g => g.id === id ? data : g));
      return data;
    } catch (err) {
      throw err;
    }
  }, []);

  const deletarGarantia = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('garantias')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setGarantias(prev => prev.filter(g => g.id !== id));
    } catch (err) {
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchGarantias();
  }, [fetchGarantias]);

  return {
    garantias,
    loading,
    error,
    fetchGarantias,
    buscarGarantias,
    criarGarantia,
    atualizarGarantia,
    deletarGarantia
  };
}
