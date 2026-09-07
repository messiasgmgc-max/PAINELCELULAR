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
      const mapa = new Map<string, CompradorFrequente>();

      // 1. Busca da tabela compradores_frequentes
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
        if (!error && data) {
          data.forEach(c => {
            if (c.nome?.trim()) {
              mapa.set(c.nome.trim().toLowerCase(), c);
            }
          });
        }
      } catch (e) {
        console.warn('compradores_frequentes não disponível:', e);
      }

      // 2. Busca da tabela lojistas_devedores (Clientes Atacado)
      try {
        const { data: lojistas, error: errLojistas } = await supabase
          .from('lojistas_devedores')
          .select('id, nome, whatsapp, telefone, created_at')
          .eq('loja_id', lojaId)
          .eq('ativo', true);

        if (!errLojistas && lojistas) {
          lojistas.forEach(l => {
            const chave = (l.nome || '').trim().toLowerCase();
            if (chave && !mapa.has(chave)) {
              mapa.set(chave, {
                id: l.id,
                nome: l.nome.trim(),
                tipo: 'lojista',
                telefone: l.whatsapp || l.telefone || '',
                total_compras: 1,
                ultimo_compra: l.created_at || new Date().toISOString(),
                loja_id: lojaId,
              });
            }
          });
        }
      } catch (e) {
        console.warn('lojistas_devedores não disponível:', e);
      }

      // 3. Fallback localStorage
      try {
        const key = 'painel_celular_compradores_recentes';
        const salvas: string[] = JSON.parse(localStorage.getItem(key) || '[]');
        salvas.forEach(nomeRecente => {
          const chave = (nomeRecente || '').trim().toLowerCase();
          if (chave && !mapa.has(chave)) {
            mapa.set(chave, {
              id: `local-${chave}`,
              nome: nomeRecente.trim(),
              tipo: 'lojista',
              total_compras: 1,
              ultimo_compra: new Date().toISOString(),
              loja_id: lojaId,
            });
          }
        });
      } catch {}

      const lista = Array.from(mapa.values()).sort((a, b) => (b.total_compras || 0) - (a.total_compras || 0));
      setCompradores(lista);
    } finally {
      setLoading(false);
    }
  }, [lojaId]);

  const buscarCompradores = useCallback(async (termo: string, tipo?: 'lojista' | 'cliente'): Promise<CompradorFrequente[]> => {
    if (!termo || termo.trim().length < 1) return compradores;
    const t = termo.trim().toLowerCase();
    return compradores.filter(c =>
      c.nome.toLowerCase().includes(t) || (c.telefone && c.telefone.includes(t))
    );
  }, [compradores]);

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
