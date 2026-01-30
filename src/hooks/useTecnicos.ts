import { useState, useEffect, useCallback } from 'react';
import { Tecnico } from '@/lib/db/types';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './useAuth';

export function useTecnicos() {
  const { usuario } = useAuth();
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buscar todos os técnicos
  const fetchTecnicos = useCallback(async () => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('tecnicos')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .order('nome');
      if (error) throw error;
      setTecnicos(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  // Buscar técnicos por termo
  const buscarTecnicos = useCallback(async (termo: string) => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('tecnicos')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .ilike('nome', `%${termo}%`);
      if (error) throw error;
      setTecnicos(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  // Criar novo técnico
  const criarTecnico = useCallback(async (dados: Partial<Tecnico>) => {
    if (!usuario?.lojaId) throw new Error("Loja não identificada");
    setError(null);
    try {
      const { data, error } = await supabase
        .from('tecnicos')
        .insert([{ ...dados, loja_id: usuario.lojaId }])
        .select()
        .single();
      if (error) throw error;
      setTecnicos(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [usuario?.lojaId]);

  // Atualizar técnico
  const atualizarTecnico = useCallback(async (id: string, dados: Partial<Tecnico>) => {
    setError(null);
    try {
      const { data, error } = await supabase
        .from('tecnicos')
        .update(dados)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      setTecnicos(prev => 
        prev.map(t => t.id === id ? data : t).sort((a, b) => a.nome.localeCompare(b.nome))
      );
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Deletar técnico
  const deletarTecnico = useCallback(async (id: string) => {
    setError(null);
    try {
      const { error } = await supabase
        .from('tecnicos')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setTecnicos(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

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
