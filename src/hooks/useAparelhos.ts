import { useState, useCallback, useEffect } from "react";
import { Aparelho } from "@/lib/db/types";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./useAuth";

interface UseAparelhosReturn {
  aparelhos: Aparelho[];
  loading: boolean;
  error: string | null;
  fetchAparelhos: () => Promise<void>;
  buscarAparelhos: (termo: string) => Promise<void>;
  criarAparelho: (dados: Omit<Aparelho, "id" | "dataCadastro">) => Promise<Aparelho | null>;
  atualizarAparelho: (id: string, dados: Partial<Aparelho>) => Promise<Aparelho | null>;
  deletarAparelho: (id: string) => Promise<boolean>;
}

export function useAparelhos(): UseAparelhosReturn {
  const { usuario } = useAuth();
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAparelhos = useCallback(async () => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('aparelhos')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .order('dataCadastro', { ascending: false });
      if (error) throw error;
      setAparelhos(data || []);
    } catch (err) {
      setError("Erro ao buscar aparelhos");
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const buscarAparelhos = useCallback(async (termo: string) => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('aparelhos')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .or(`modelo.ilike.%${termo}%,marca.ilike.%${termo}%`);
      if (error) throw error;
      setAparelhos(data || []);
    } catch (err) {
      setError("Erro ao buscar aparelhos");
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const criarAparelho = useCallback(
    async (dados: Omit<Aparelho, "id" | "dataCadastro">) => {
      if (!usuario?.lojaId) return null;
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('aparelhos')
          .insert([{ ...dados, loja_id: usuario.lojaId }])
          .select()
          .single();
        if (error) throw error;
        setAparelhos((prev) => [...prev, data]);
        return data;
      } catch (err) {
        setError("Erro ao criar aparelho");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [usuario?.lojaId]
  );

  const atualizarAparelho = useCallback(
    async (id: string, dados: Partial<Aparelho>) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('aparelhos')
          .update(dados)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        setAparelhos((prev) =>
          prev.map((a) => (a.id === id ? data : a))
        );
        return data;
      } catch (err) {
        setError("Erro ao atualizar aparelho");
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deletarAparelho = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('aparelhos')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setAparelhos((prev) => prev.filter((a) => a.id !== id));
      return true;
    } catch (err) {
      setError("Erro ao deletar aparelho");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAparelhos();
  }, [fetchAparelhos]);

  return {
    aparelhos,
    loading,
    error,
    fetchAparelhos,
    buscarAparelhos,
    criarAparelho,
    atualizarAparelho,
    deletarAparelho,
  };
}
