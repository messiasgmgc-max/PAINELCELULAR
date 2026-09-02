'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

export interface Motoboy {
  id: string;
  loja_id?: string | null;
  nome: string;
  telefone?: string;
  veiculo?: string;
  placa?: string;
  chave_pix?: string;
  ativo: boolean;
  created_at?: string;
}

const LOCAL_STORAGE_MOTOBOYS_KEY = 'painel_motoboys_cache';

export function useMotoboys(lojaId?: string | null) {
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Carrega do LocalStorage primeiro para resposta instantânea
  useEffect(() => {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_MOTOBOYS_KEY);
      if (cached) {
        setMotoboys(JSON.parse(cached));
      }
    } catch (e) {}
  }, []);

  // 2. Busca do Supabase
  const fetchMotoboys = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase.from('motoboys').select('*').order('nome');

      if (lojaId) {
        query = query.or(`loja_id.eq.${lojaId},loja_id.is.null`);
      }

      const { data, error } = await query;
      if (!error && data) {
        setMotoboys(data as Motoboy[]);
        try {
          localStorage.setItem(LOCAL_STORAGE_MOTOBOYS_KEY, JSON.stringify(data));
        } catch (e) {}
      } else if (error) {
        console.warn('Tabela motoboys ainda não disponível no Supabase:', error.message);
      }
    } catch (e) {
      console.error('Erro ao buscar motoboys:', e);
    } finally {
      setLoading(false);
    }
  }, [lojaId]);

  useEffect(() => {
    fetchMotoboys();
  }, [fetchMotoboys]);

  // 3. Cadastrar Motoboy
  const cadastrarMotoboy = async (dados: {
    nome: string;
    telefone?: string;
    veiculo?: string;
    placa?: string;
    chave_pix?: string;
  }): Promise<boolean> => {
    if (!dados.nome.trim()) {
      toast.error('Informe o nome do motoboy.');
      return false;
    }

    const novoMotoboy: any = {
      loja_id: lojaId || null,
      nome: dados.nome.trim(),
      telefone: dados.telefone?.trim() || '',
      veiculo: dados.veiculo?.trim() || 'Moto',
      placa: dados.placa?.trim() || '',
      chave_pix: dados.chave_pix?.trim() || '',
      ativo: true,
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('motoboys')
        .insert([novoMotoboy])
        .select()
        .single();

      if (error) {
        console.warn('Salvando motoboy localmente:', error.message);
        const itemLocal: Motoboy = {
          ...novoMotoboy,
          id: `local_moto_${Date.now()}`,
        };
        const updated = [...motoboys, itemLocal];
        setMotoboys(updated);
        try {
          localStorage.setItem(LOCAL_STORAGE_MOTOBOYS_KEY, JSON.stringify(updated));
        } catch (e) {}
        toast.success('Motoboy salvo com sucesso!');
        return true;
      }

      const salvo = data as Motoboy;
      const updated = [...motoboys, salvo];
      setMotoboys(updated);
      try {
        localStorage.setItem(LOCAL_STORAGE_MOTOBOYS_KEY, JSON.stringify(updated));
      } catch (e) {}
      toast.success('Motoboy cadastrado com sucesso!');
      return true;
    } catch (e: any) {
      console.error('Erro geral ao cadastrar motoboy:', e);
      const itemLocal: Motoboy = {
        ...novoMotoboy,
        id: `local_moto_${Date.now()}`,
      };
      const updated = [...motoboys, itemLocal];
      setMotoboys(updated);
      toast.success('Salvo localmente!');
      return true;
    }
  };

  // 4. Excluir Motoboy
  const excluirMotoboy = async (id: string): Promise<boolean> => {
    try {
      await supabase.from('motoboys').delete().eq('id', id);
    } catch (e) {}

    const updated = motoboys.filter((m) => m.id !== id);
    setMotoboys(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_MOTOBOYS_KEY, JSON.stringify(updated));
    } catch (e) {}
    toast.success('Motoboy removido!');
    return true;
  };

  return {
    motoboys,
    loading,
    fetchMotoboys,
    cadastrarMotoboy,
    excluirMotoboy,
  };
}
