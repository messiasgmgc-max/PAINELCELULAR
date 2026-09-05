'use client';

import { useState, useEffect, useCallback } from 'react';

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

const STORAGE_KEY = 'painel_celular_tab_order_v2';
const EVENT_KEY = 'painel_celular_tab_order_change';

function getSanitizedOrder(): string[] {
  if (typeof window === 'undefined') {
    return DEFAULT_TABS_ORDER.map((t) => t.id);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TABS_ORDER.map((t) => t.id);

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_TABS_ORDER.map((t) => t.id);

    const validDefaultIds = new Set(DEFAULT_TABS_ORDER.map((t) => t.id));
    // Filtra IDs que não existem mais (e remove explicitamente whatsapp)
    const validSaved = parsed.filter((id: string) => typeof id === 'string' && id !== 'whatsapp' && validDefaultIds.has(id));

    // Adiciona ao fim qualquer tab que não esteja no salvo
    const savedSet = new Set(validSaved);
    DEFAULT_TABS_ORDER.forEach((t) => {
      if (!savedSet.has(t.id)) {
        validSaved.push(t.id);
      }
    });

    return validSaved;
  } catch (e) {
    console.error('Erro ao ler ordem das abas do localStorage:', e);
    return DEFAULT_TABS_ORDER.map((t) => t.id);
  }
}

export function useTabOrder() {
  const [tabOrder, setTabOrder] = useState<string[]>(() => getSanitizedOrder());

  const saveOrder = useCallback((newOrder: string[]) => {
    setTabOrder(newOrder);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder));
        window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: newOrder }));
      } catch (err) {
        console.error('Erro ao salvar ordem das abas:', err);
      }
    }
  }, []);

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

  useEffect(() => {
    const handleStorageChange = () => {
      setTabOrder(getSanitizedOrder());
    };

    window.addEventListener(EVENT_KEY, handleStorageChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(EVENT_KEY, handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return {
    tabOrder,
    allTabs: DEFAULT_TABS_ORDER,
    moveUp,
    moveDown,
    resetOrder,
    saveOrder,
  };
}
