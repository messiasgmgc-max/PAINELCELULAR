'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface CompradorFrequente {
  id: string;
  nome: string;
  tipo: 'lojista' | 'cliente';
  telefone?: string;
  total_compras: number;
  ultimo_compra: string;
  loja_id?: string;
}

export function useCompradores(lojaId: string | null) {
  const [compradores, setCompradores] = useState<CompradorFrequente[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCompradores = useCallback(async (tipo?: 'lojista' | 'cliente') => {
    if (!lojaId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('compradores_frequentes')
        .select('*')
        .or(`loja_id.eq.${lojaId},loja_id.is.null`)
        .order('total_compras', { ascending: false })
        .limit(100);

      if (tipo) {
        query = query.eq('tipo', tipo);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Erro ao buscar compradores frequentes:', error);
        // Fallback: tabela pode não existir ainda
        setCompradores([]);
        return;
      }
      setCompradores(data || []);
    } catch (err) {
      console.warn('compradores_frequentes não disponível:', err);
      setCompradores([]);
    } finally {
      setLoading(false);
    }
  }, [lojaId]);

  const buscarCompradores = useCallback(async (termo: string, tipo?: 'lojista' | 'cliente'): Promise<CompradorFrequente[]> => {
    if (!lojaId || !termo || termo.trim().length < 1) return compradores;

    try {
      let query = supabase
        .from('compradores_frequentes')
        .select('*')
        .or(`loja_id.eq.${lojaId},loja_id.is.null`)
        .ilike('nome', `%${termo.trim()}%`)
        .order('total_compras', { ascending: false })
        .limit(15);

      if (tipo) {
        query = query.eq('tipo', tipo);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Erro busca compradores:', error);
        // Fallback: filtrar localmente
        return compradores.filter(c =>
          c.nome.toLowerCase().includes(termo.toLowerCase())
        );
      }
      return data || [];
    } catch {
      return compradores.filter(c =>
        c.nome.toLowerCase().includes(termo.toLowerCase())
      );
    }
  }, [lojaId, compradores]);

  const upsertComprador = useCallback(async (
    nome: string,
    tipo: 'lojista' | 'cliente',
    telefone?: string
  ): Promise<void> => {
    if (!lojaId || !nome || nome.trim().length < 2) return;

    const nomeLimpo = nome.trim();

    try {
      // Tenta encontrar existente (case-insensitive)
      const { data: existente } = await supabase
        .from('compradores_frequentes')
        .select('id, total_compras')
        .eq('loja_id', lojaId)
        .ilike('nome', nomeLimpo)
        .maybeSingle();

      if (existente) {
        // Atualiza contagem e data
        await supabase
          .from('compradores_frequentes')
          .update({
            total_compras: (existente.total_compras || 0) + 1,
            ultimo_compra: new Date().toISOString(),
            ...(telefone ? { telefone } : {}),
          })
          .eq('id', existente.id);
      } else {
        // Insere novo
        await supabase
          .from('compradores_frequentes')
          .insert([{
            nome: nomeLimpo,
            tipo,
            telefone: telefone || null,
            total_compras: 1,
            ultimo_compra: new Date().toISOString(),
            loja_id: lojaId,
          }]);
      }

      // Também mantém o localStorage como fallback
      try {
        const key = 'painel_celular_compradores_recentes';
        const salvas = JSON.parse(localStorage.getItem(key) || '[]');
        const atualizados = [nomeLimpo, ...salvas.filter((c: string) => c.toLowerCase() !== nomeLimpo.toLowerCase())].slice(0, 15);
        localStorage.setItem(key, JSON.stringify(atualizados));
      } catch {}

    } catch (err) {
      console.warn('Erro ao upsert comprador:', err);
      // Fallback localStorage
      try {
        const key = 'painel_celular_compradores_recentes';
        const salvas = JSON.parse(localStorage.getItem(key) || '[]');
        const atualizados = [nomeLimpo, ...salvas.filter((c: string) => c.toLowerCase() !== nomeLimpo.toLowerCase())].slice(0, 15);
        localStorage.setItem(key, JSON.stringify(atualizados));
      } catch {}
    }
  }, [lojaId]);

  useEffect(() => {
    if (lojaId) {
      fetchCompradores();
    }
  }, [lojaId, fetchCompradores]);

  return {
    compradores,
    loading,
    fetchCompradores,
    buscarCompradores,
    upsertComprador,
  };
}
