import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Cliente } from "@/lib/db/types";

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
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClientes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('dataCadastro', { ascending: false });

      if (error) throw error;
      setClientes(data || []);
    } catch (err) {
      setError("Erro ao buscar clientes");
    } finally {
      setLoading(false);
    }
  }, []);

  const buscarClientes = useCallback(async (termo: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .ilike('nome', `%${termo}%`);

      if (error) throw error;
      setClientes(data || []);
    } catch (err) {
      setError("Erro ao buscar clientes");
    } finally {
      setLoading(false);
    }
  }, []);

  const criarCliente = useCallback(
    async (dados: Omit<Cliente, "id" | "dataCadastro">) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('clientes')
          .insert([dados])
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
    []
  );

  const atualizarCliente = useCallback(
    async (id: string, dados: Partial<Cliente>) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('clientes')
          .update(dados)
          .eq('id', id)
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
    []
  );

  const deletarCliente = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setClientes((prev) => prev.filter((c) => c.id !== id));
      return true;
    } catch (err) {
      setError("Erro ao deletar cliente");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

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
