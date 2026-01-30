"use client";

import { useState, useCallback, useEffect } from "react";
import { Peca } from "@/lib/db/types";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./useAuth";

export function usePecas() {
  const { usuario } = useAuth();
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar todas as peças
  const fetchPecas = useCallback(async () => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('pecas')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .order('nome');
      if (error) throw error;
      setPecas(data || []);
    } catch (err) {
      setError(`Erro ao conectar com servidor: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  // Buscar peças por termo
  const buscarPecas = useCallback(async (termo: string) => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('pecas')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .ilike('nome', `%${termo}%`);
      if (error) throw error;
      setPecas(data || []);
    } catch (err) {
      setError(`Erro ao conectar com servidor: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  // Criar nova peça
  const criarPeca = useCallback(async (dados: Omit<Peca, "id" | "dataCadastro">) => {
    if (!usuario?.lojaId) return null;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('pecas')
        .insert([{ ...dados, loja_id: usuario.lojaId }])
        .select()
        .single();
      if (error) throw error;
      setPecas((prev) => [...prev, data]);
      return data;
    } catch (err) {
      setError(`Erro ao conectar com servidor: ${err}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  // Atualizar peça
  const atualizarPeca = useCallback(
    async (id: string, dados: Partial<Omit<Peca, "id" | "dataCadastro">>) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('pecas')
          .update(dados)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        setPecas((prev) =>
          prev.map((peca) => (peca.id === id ? data : peca))
        );
        return data;
      } catch (err) {
        setError(`Erro ao conectar com servidor: ${err}`);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Deletar peça
  const deletarPeca = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('pecas')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setPecas((prev) => prev.filter((peca) => peca.id !== id));
      return true;
    } catch (err) {
      setError(`Erro ao conectar com servidor: ${err}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPecas();
  }, [fetchPecas]);

  return {
    pecas,
    loading,
    error,
    fetchPecas,
    buscarPecas,
    criarPeca,
    atualizarPeca,
    deletarPeca,
  };
}
