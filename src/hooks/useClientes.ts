import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Cliente } from "@/lib/db/types";
import { useAuth } from "./useAuth";

interface UseClientesReturn {
  clientes: Cliente[];
  loading: boolean;
  error: string | null;
  fetchClientes: () => Promise<void>;
  buscarClientes: (termo: string) => Promise<void>;
  criarCliente: (dados: Omit<Cliente, "id" | "dataCadastro">) => Promise<Cliente | null>;
  atualizarCliente: (id: string, dados: Partial<Cliente>) => Promise<Cliente | null>;
  deletarCliente: (id: string) => Promise<boolean>;
}

export function useClientes(): UseClientesReturn {
  const { usuario } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClientes = useCallback(async () => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .order('dataCadastro', { ascending: false });

      if (error) throw error;
      setClientes(data || []);
    } catch (err) {
      setError("Erro ao buscar clientes");
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const buscarClientes = useCallback(async (termo: string) => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .ilike('nome', `%${termo}%`);

      if (error) throw error;
      setClientes(data || []);
    } catch (err) {
      setError("Erro ao buscar clientes");
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const criarCliente = useCallback(
    async (dados: Omit<Cliente, "id" | "dataCadastro">) => {
      if (!usuario?.lojaId) return null;
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('clientes')
          .insert([{ ...dados, loja_id: usuario.lojaId }])
          .select()
          .single();

        if (error) throw error;
        
        setClientes((prev) => [data, ...prev]);
        return data;
      } catch (err) {
        setError("Erro ao criar cliente");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [usuario?.lojaId]
  );

  const atualizarCliente = useCallback(
    async (id: string, dados: Partial<Cliente>) => {
      if (!usuario?.lojaId) return null;
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('clientes')
          .update(dados)
          .eq('id', id)
          .eq('loja_id', usuario.lojaId)
          .select()
          .single();

        if (error) throw error;
        
        setClientes((prev) => prev.map((c) => (c.id === id ? data : c)));
        return data;
      } catch (err) {
        setError("Erro ao atualizar cliente");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [usuario?.lojaId]
  );

  const deletarCliente = useCallback(async (id: string) => {
    if (!usuario?.lojaId) return false;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', id)
        .eq('loja_id', usuario.lojaId);

      if (error) throw error;
      
      setClientes((prev) => prev.filter((c) => c.id !== id));
      return true;
    } catch (err) {
      setError("Erro ao deletar cliente");
      return false;
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  return {
    clientes,
    loading,
    error,
    fetchClientes,
    buscarClientes,
    criarCliente,
    atualizarCliente,
    deletarCliente,
  };
}
