import { useState, useEffect, useCallback } from 'react';
import { OrdemServico } from '@/lib/db/types';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './useAuth';

export function useOrdensServico() {
  const { usuario } = useAuth();
  const [ordensServico, setOrdensServico] = useState<OrdemServico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buscar todas as OS
  const fetchOrdensServico = useCallback(async () => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('ordens_servico').select('*');

      if (usuario?.lojaId) {
        query = query.eq('loja_id', usuario.lojaId);
      }

      const { data, error } = await query.order('dataEntrada', { ascending: false });
      if (error) throw error;
      setOrdensServico((data || []).filter(o => o.ativo !== false));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  // Buscar OS por termo
  const buscarOrdensServico = useCallback(async (termo: string) => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('ordens_servico').select('*');

      if (usuario?.lojaId) {
        query = query.eq('loja_id', usuario.lojaId);
      }

      const { data, error } = await query.or(`clienteNome.ilike.%${termo}%,aparelhoModelo.ilike.%${termo}%`);
      if (error) throw error;
      setOrdensServico((data || []).filter(o => o.ativo !== false));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  // Criar nova OS
  const criarOrdemServico = useCallback(async (dados: Partial<OrdemServico>) => {
    setError(null);
    try {
      // Remover campos que não existem no banco ou que são gerados automaticamente
      // fotosEntrada e fotosSaida estão no form mas não no banco ainda
      const { lojaId, id, numeroOS, fotosEntrada, fotosSaida, ...dadosLimpos } = dados as any;

      const { data, error } = await supabase
        .from('ordens_servico')
        .insert([{ ...dadosLimpos, ...(usuario?.lojaId ? { loja_id: usuario.lojaId } : {}) }])
        .select()
        .single();
      if (error) throw error;
      setOrdensServico(prev => [data, ...prev]);
      return data;
    } catch (err: any) {
      console.error("Erro detalhado ao criar OS:", JSON.stringify(err, null, 2));
      setError(err.message);
      throw err;
    }
  }, [usuario?.lojaId]);

  // Atualizar OS
  const atualizarOrdemServico = useCallback(async (id: string, dados: Partial<OrdemServico>) => {
    if (!usuario?.lojaId) throw new Error('Loja não autenticada');
    setError(null);
    try {
      // Remover campos que não devem ser atualizados ou não existem no banco
      const { lojaId, id: _id, numeroOS, fotosEntrada, fotosSaida, ...dadosLimpos } = dados as any;

      const { data, error } = await supabase
        .from('ordens_servico')
        .update(dadosLimpos)
        .eq('id', id)
        .eq('loja_id', usuario.lojaId)
        .select()
        .single();
      if (error) throw error;
      setOrdensServico(prev => 
        prev.map(o => o.id === id ? data : o)
      );
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [usuario?.lojaId]);

  // Deletar OS
  const deletarOrdemServico = useCallback(async (id: string) => {
    if (!usuario?.lojaId) throw new Error('Loja não autenticada');
    setError(null);
    try {
      const { error } = await supabase
        .from('ordens_servico')
        .delete()
        .eq('id', id)
        .eq('loja_id', usuario.lojaId);
      if (error) throw error;
      setOrdensServico(prev => prev.filter(o => o.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [usuario?.lojaId]);

  useEffect(() => {
    fetchOrdensServico();
  }, [fetchOrdensServico]);

  return {
    ordensServico,
    loading,
    error,
    fetchOrdensServico,
    buscarOrdensServico,
    criarOrdemServico,
    atualizarOrdemServico,
    deletarOrdemServico
  };
}
