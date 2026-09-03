'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { 
  TABELA_BASE_UPGRADE_PADRAO, 
  REGRAS_DEDUCAO_PADRAO, 
  gerarProtocoloUpgrade, 
  ResultadoAvaliacaoUpgrade, 
  RespostaCondicaoUpgrade 
} from '@/lib/upgradeEngine';

export interface AvaliacaoUpgradeItem {
  id: string;
  loja_id?: string | null;
  protocolo?: string;
  cliente_nome: string;
  cliente_telefone?: string;
  cliente_email?: string;
  cliente_cidade?: string;
  modelo: string;
  capacidade: string;
  cor?: string;
  bateria_saude?: number;
  condicao_geral?: string;
  detalhes_condicao?: RespostaCondicaoUpgrade;
  valor_base: number;
  descontos_aplicados?: any[];
  valor_avaliado: number;
  valor_aprovado?: number;
  status: 'pendente' | 'em_negociacao' | 'aprovado' | 'convertido_venda' | 'recusado';
  aparelho_interesse?: string;
  venda_id?: string | null;
  origem: 'web_publico' | 'balcao_loja';
  observacoes?: string;
  created_at: string;
}

export interface VistoriaUpgradeItem {
  id: string;
  loja_id?: string | null;
  avaliacao_id?: string | null;
  protocolo?: string;
  motoboy_id?: string | null;
  motoboy_nome: string;
  cliente_nome: string;
  cliente_telefone?: string;
  endereco_coleta?: string;
  modelo: string;
  capacidade: string;
  cor?: string;
  imei?: string;
  bateria_saude?: number;
  condicao_geral?: string;
  detalhes_checklist?: any;
  valor_avaliado: number;
  valor_acordado: number;
  fotos: string[];
  observacoes_motoboy?: string;
  status_coleta: 'coletado' | 'em_transito' | 'entregue_loja' | 'cancelado';
  assinatura_cliente?: string;
  created_at: string;
}

const LOCAL_STORAGE_AVALIACOES_KEY = 'painel_avaliacoes_upgrade_cache';
const LOCAL_STORAGE_VISTORIAS_KEY = 'painel_vistorias_upgrade_cache';
const LOCAL_STORAGE_TABELA_KEY = 'painel_tabela_upgrade_custom';
const LOCAL_STORAGE_REGRAS_KEY = 'painel_regras_upgrade_custom';

export function useUpgrade(lojaId?: string | null) {
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoUpgradeItem[]>([]);
  const [vistorias, setVistorias] = useState<VistoriaUpgradeItem[]>([]);
  const [tabelaPrecos, setTabelaPrecos] = useState<Record<string, Record<string, number>>>(TABELA_BASE_UPGRADE_PADRAO);
  const [regrasDeducao, setRegrasDeducao] = useState(REGRAS_DEDUCAO_PADRAO);
  const [loading, setLoading] = useState(true);

  // 1. Carrega dados do LocalStorage imediatamente para resposta rápida
  useEffect(() => {
    try {
      const cachedAvaliacoes = localStorage.getItem(LOCAL_STORAGE_AVALIACOES_KEY);
      if (cachedAvaliacoes) {
        setAvaliacoes(JSON.parse(cachedAvaliacoes));
      }

      const cachedVistorias = localStorage.getItem(LOCAL_STORAGE_VISTORIAS_KEY);
      if (cachedVistorias) {
        setVistorias(JSON.parse(cachedVistorias));
      }

      const cachedTabela = localStorage.getItem(LOCAL_STORAGE_TABELA_KEY);
      if (cachedTabela) {
        setTabelaPrecos(JSON.parse(cachedTabela));
      }

      const cachedRegras = localStorage.getItem(LOCAL_STORAGE_REGRAS_KEY);
      if (cachedRegras) {
        setRegrasDeducao(JSON.parse(cachedRegras));
      }
    } catch (e) {}
  }, []);

  // 2. Busca avaliações do Supabase
  const fetchAvaliacoes = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('avaliacoes_upgrade')
        .select('*')
        .order('created_at', { ascending: false });

      if (lojaId) {
        query = query.or(`loja_id.eq.${lojaId},loja_id.is.null`);
      }

      const { data, error } = await query;

      if (!error && data) {
        setAvaliacoes(data as AvaliacaoUpgradeItem[]);
        try {
          localStorage.setItem(LOCAL_STORAGE_AVALIACOES_KEY, JSON.stringify(data));
        } catch (e) {}
      } else if (error) {
        // Fallback gracioso se a tabela ainda não tiver sido criada no Supabase
        console.warn('Tabela avaliacoes_upgrade ainda não criada ou inacessível:', error.message);
      }
    } catch (e) {
      console.error('Erro ao buscar avaliações de upgrade:', e);
    } finally {
      setLoading(false);
    }
  }, [lojaId]);

  // 3. Busca configurações customizadas da loja no Supabase
  const fetchConfigUpgradeLoja = useCallback(async () => {
    if (!lojaId) return;
    try {
      const { data, error } = await supabase
        .from('lojas')
        .select('tabela_upgrade, regras_upgrade')
        .eq('id', lojaId)
        .maybeSingle();

      if (!error && data) {
        if (data.tabela_upgrade && typeof data.tabela_upgrade === 'object' && Object.keys(data.tabela_upgrade).length > 0) {
          setTabelaPrecos(data.tabela_upgrade);
          try {
            localStorage.setItem(LOCAL_STORAGE_TABELA_KEY, JSON.stringify(data.tabela_upgrade));
          } catch (e) {}
        }
        if (data.regras_upgrade && typeof data.regras_upgrade === 'object' && Object.keys(data.regras_upgrade).length > 0) {
          setRegrasDeducao({ ...REGRAS_DEDUCAO_PADRAO, ...data.regras_upgrade });
        }
      }
    } catch (e) {}
  }, [lojaId]);

  useEffect(() => {
    fetchAvaliacoes();
    fetchConfigUpgradeLoja();
  }, [fetchAvaliacoes, fetchConfigUpgradeLoja]);

  // 4. Salvar / Criar Avaliação (pública ou interna)
  const salvarAvaliacao = async (dados: {
    cliente_nome: string;
    cliente_telefone?: string;
    cliente_email?: string;
    cliente_cidade?: string;
    modelo: string;
    capacidade: string;
    cor?: string;
    resultado: ResultadoAvaliacaoUpgrade;
    condicoes: RespostaCondicaoUpgrade;
    origem?: 'web_publico' | 'balcao_loja';
    aparelho_interesse?: string;
    observacoes?: string;
  }): Promise<{ id: string; protocolo: string }> => {
    const protocolo = gerarProtocoloUpgrade();
    const novaAvaliacao: any = {
      loja_id: lojaId || null,
      protocolo,
      cliente_nome: dados.cliente_nome.trim(),
      cliente_telefone: dados.cliente_telefone?.trim() || '',
      cliente_email: dados.cliente_email?.trim() || '',
      cliente_cidade: dados.cliente_cidade?.trim() || '',
      modelo: dados.modelo,
      capacidade: dados.capacidade,
      cor: dados.cor || '',
      bateria_saude: dados.condicoes.bateriaPercentual || 85,
      condicao_geral: dados.condicoes.estadoTela === 'original_impecavel' && dados.condicoes.estadoCarcaca === 'impecavel' ? 'Excelente' : 'Bom',
      detalhes_condicao: dados.condicoes,
      valor_base: dados.resultado.valorBase,
      descontos_aplicados: dados.resultado.deducoes,
      valor_avaliado: dados.resultado.valorFinal,
      valor_aprovado: dados.resultado.valorFinal,
      status: 'pendente',
      aparelho_interesse: dados.aparelho_interesse || '',
      origem: dados.origem || 'web_publico',
      observacoes: dados.observacoes || '',
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('avaliacoes_upgrade')
        .insert([novaAvaliacao])
        .select()
        .single();

      if (error) {
        console.warn('Erro ao salvar no banco, gravando no armazenamento local:', error.message);
        // Salva no estado e local storage
        const itemLocal: AvaliacaoUpgradeItem = {
          ...novaAvaliacao,
          id: `local_${Date.now()}`,
        };
        setAvaliacoes((prev) => [itemLocal, ...prev]);
        try {
          localStorage.setItem(LOCAL_STORAGE_AVALIACOES_KEY, JSON.stringify([itemLocal, ...avaliacoes]));
        } catch (e) {}
        return { id: itemLocal.id, protocolo };
      }

      const itemSalvo = data as AvaliacaoUpgradeItem;
      setAvaliacoes((prev) => [itemSalvo, ...prev]);
      return { id: itemSalvo.id, protocolo };
    } catch (err: any) {
      console.error('Falha geral ao salvar avaliação:', err);
      const itemLocal: AvaliacaoUpgradeItem = {
        ...novaAvaliacao,
        id: `local_${Date.now()}`,
      };
      setAvaliacoes((prev) => [itemLocal, ...prev]);
      return { id: itemLocal.id, protocolo };
    }
  };

  // 5. Atualizar Status ou Valor Aprovado
  const atualizarStatusAvaliacao = async (
    id: string, 
    status: AvaliacaoUpgradeItem['status'], 
    valorAprovado?: number,
    observacoes?: string
  ) => {
    try {
      const payload: any = { status };
      if (valorAprovado !== undefined) payload.valor_aprovado = valorAprovado;
      if (observacoes !== undefined) payload.observacoes = observacoes;

      const { error } = await supabase
        .from('avaliacoes_upgrade')
        .update(payload)
        .eq('id', id);

      if (error) throw error;

      setAvaliacoes((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...payload } : item))
      );
      toast.success(`Status da avaliação atualizado para ${status}!`);
    } catch (e: any) {
      console.error('Erro ao atualizar status da avaliação:', e);
      // Atualiza localmente
      setAvaliacoes((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status, ...(valorAprovado !== undefined ? { valor_aprovado: valorAprovado } : {}) } : item))
      );
      toast.success(`Atualizado localmente com sucesso!`);
    }
  };

  // 6. Salvar Tabela de Preços e Deduções Customizadas
  const salvarConfiguracoesPrecos = async (
    novaTabela: Record<string, Record<string, number>>,
    novasRegras: typeof REGRAS_DEDUCAO_PADRAO
  ) => {
    setTabelaPrecos(novaTabela);
    setRegrasDeducao(novasRegras);

    try {
      localStorage.setItem(LOCAL_STORAGE_TABELA_KEY, JSON.stringify(novaTabela));
      localStorage.setItem(LOCAL_STORAGE_REGRAS_KEY, JSON.stringify(novasRegras));

      if (lojaId) {
        await supabase
          .from('lojas')
          .update({
            tabela_upgrade: novaTabela,
            regras_upgrade: novasRegras,
          })
          .eq('id', lojaId);
      }
      toast.success('Tabela de preços salva com sucesso!');
      return true;
    } catch (e) {
      console.error('Erro ao persistir configurações de upgrade:', e);
      toast.success('Salvo nas configurações locais!');
      return false;
    }
  };

  const restaurarTabelaPadrao = async () => {
    await salvarConfiguracoesPrecos(TABELA_BASE_UPGRADE_PADRAO, REGRAS_DEDUCAO_PADRAO);
    toast.success('Tabela restaurada para o padrão oficial!');
  };

  // 7. Buscar Vistorias do Supabase
  const fetchVistorias = useCallback(async () => {
    try {
      let query = supabase
        .from('vistorias_upgrade')
        .select('*')
        .order('created_at', { ascending: false });

      if (lojaId) {
        query = query.or(`loja_id.eq.${lojaId},loja_id.is.null`);
      }

      const { data, error } = await query;
      if (!error && data) {
        setVistorias(data as VistoriaUpgradeItem[]);
        try {
          localStorage.setItem(LOCAL_STORAGE_VISTORIAS_KEY, JSON.stringify(data));
        } catch (e) {}
      } else if (error) {
        console.warn('Tabela vistorias_upgrade ainda não disponível no Supabase:', error.message);
      }
    } catch (e) {
      console.error('Erro ao buscar vistorias de upgrade:', e);
    }
  }, [lojaId]);

  useEffect(() => {
    fetchVistorias();
  }, [fetchVistorias]);

  // 8. Salvar Vistoria de Coleta (Feita pelo Motoboy)
  const salvarVistoria = async (dados: Omit<VistoriaUpgradeItem, 'id' | 'created_at'>): Promise<{ id: string; protocolo?: string }> => {
    const protocolo = dados.protocolo || gerarProtocoloUpgrade();
    const payload = {
      ...dados,
      protocolo,
      loja_id: lojaId || null,
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('vistorias_upgrade')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      const itemSalvo = data as VistoriaUpgradeItem;
      setVistorias((prev) => [itemSalvo, ...prev]);

      // Se estiver vinculada a uma avaliação_upgrade, atualiza o status dela
      if (dados.avaliacao_id) {
        await supabase
          .from('avaliacoes_upgrade')
          .update({ status: 'em_negociacao' })
          .eq('id', dados.avaliacao_id);
      }

      return { id: itemSalvo.id, protocolo };
    } catch (e: any) {
      console.warn('Salvando vistoria localmente:', e.message);
      const itemLocal: VistoriaUpgradeItem = {
        ...payload,
        id: `local_vistoria_${Date.now()}`,
      };
      setVistorias((prev) => [itemLocal, ...prev]);
      try {
        localStorage.setItem(LOCAL_STORAGE_VISTORIAS_KEY, JSON.stringify([itemLocal, ...vistorias]));
      } catch (err) {}
      return { id: itemLocal.id, protocolo };
    }
  };

  // 9. Atualizar Status da Vistoria (ex: entregue na loja)
  const atualizarStatusVistoria = async (id: string, status: VistoriaUpgradeItem['status_coleta']) => {
    try {
      await supabase.from('vistorias_upgrade').update({ status_coleta: status }).eq('id', id);
    } catch (e) {}

    setVistorias((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status_coleta: status } : item))
    );
    toast.success(`Status da coleta atualizado para ${status === 'entregue_loja' ? 'Entregue na Loja' : status}!`);
  };

  return {
    avaliacoes,
    vistorias,
    tabelaPrecos,
    regrasDeducao,
    loading,
    fetchAvaliacoes,
    fetchVistorias,
    salvarAvaliacao,
    salvarVistoria,
    atualizarStatusVistoria,
    atualizarStatusAvaliacao,
    salvarConfiguracoesPrecos,
    restaurarTabelaPadrao,
  };
}
