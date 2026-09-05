'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStoreConfig } from '@/hooks/useStoreConfig';

export interface TabDefinition {
  id: string;
  label: string;
  descricao: string;
}

export const DEFAULT_TABS_ORDER: TabDefinition[] = [
  { id: 'dashboard', label: 'Dashboard', descricao: 'Visão geral, faturamento e métricas' },
  { id: 'vendas', label: 'Vendas', descricao: 'Vendas de varejo e pendências' },
  { id: 'atacado', label: 'Atacado', descricao: 'Vendas para lojistas e fiados' },
  { id: 'taxas-maquininha', label: 'Calculadora de Taxa', descricao: 'Cálculo de taxas de cartão' },
  { id: 'calculadora-upgrade', label: 'Calculadora Upgrade', descricao: 'Avaliação de usados e upgrade' },
  { id: 'clientes', label: 'Clientes', descricao: 'Cadastro e histórico de clientes' },
  { id: 'aparelhos', label: 'Estoque Geral', descricao: 'Aparelhos disponíveis e conferência' },
  { id: 'pecas', label: 'Peças', descricao: 'Estoque de peças e reposição' },
  { id: 'etiquetas', label: 'Etiquetas', descricao: 'Impressão de etiquetas térmicas' },
  { id: 'orders', label: 'OS', descricao: 'Ordens de serviço e assistência' },
  { id: 'tecnicos', label: 'Equipe', descricao: 'Técnicos e comissões' },
  { id: 'agendamentos', label: 'Agenda', descricao: 'Agendamento de entregas e visitas' },
  { id: 'garantias', label: 'Garantias', descricao: 'Controle de prazos e garantias' },
  { id: 'logs', label: 'Logs & Auditoria', descricao: 'Histórico de ações e segurança' },
  { id: 'configuracoes', label: 'Configurações', descricao: 'Dados da loja e preferências' },
];

function sanitizeList(orderCandidate?: string[]): string[] {
  const validDefaultIds = new Set(DEFAULT_TABS_ORDER.map((t) => t.id));
  const rawList = Array.isArray(orderCandidate) ? orderCandidate : [];
  
  const validSaved = rawList.filter((id: string) => typeof id === 'string' && id !== 'whatsapp' && validDefaultIds.has(id));

  const savedSet = new Set(validSaved);
  DEFAULT_TABS_ORDER.forEach((t) => {
    if (!savedSet.has(t.id)) {
      validSaved.push(t.id);
    }
  });

  return validSaved;
}

export function useTabOrder() {
  const { config, atualizarOrdemAbas } = useStoreConfig();

  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    return sanitizeList(config.ordemAbas);
  });

  // Sincroniza sempre que a ordem das abas vier do banco de dados
  useEffect(() => {
    if (config.ordemAbas && Array.isArray(config.ordemAbas) && config.ordemAbas.length > 0) {
      setTabOrder(sanitizeList(config.ordemAbas));
    }
  }, [config.ordemAbas]);

  const saveOrder = useCallback((newOrder: string[]) => {
    const sanitized = sanitizeList(newOrder);
    setTabOrder(sanitized);
    // Salva no banco de dados da loja
    atualizarOrdemAbas(sanitized);
  }, [atualizarOrdemAbas]);

  const moveUp = useCallback((id: string) => {
    setTabOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev];
      const temp = next[idx - 1];
      next[idx - 1] = next[idx];
      next[idx] = temp;
      saveOrder(next);
      return next;
    });
  }, [saveOrder]);

  const moveDown = useCallback((id: string) => {
    setTabOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[idx + 1];
      next[idx + 1] = next[idx];
      next[idx] = temp;
      saveOrder(next);
      return next;
    });
  }, [saveOrder]);

  const resetOrder = useCallback(() => {
    const defaultIds = DEFAULT_TABS_ORDER.map((t) => t.id);
    saveOrder(defaultIds);
  }, [saveOrder]);

  return {
    tabOrder,
    allTabs: DEFAULT_TABS_ORDER,
    moveUp,
    moveDown,
    resetOrder,
    saveOrder,
  };
}

