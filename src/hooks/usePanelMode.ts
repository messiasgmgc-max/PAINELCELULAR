'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

export function usePanelMode() {
  const { usuario } = useAuth();
  const [isModoSimples, setIsModoSimplesState] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const storageKey = usuario?.id 
    ? `phonecenter_modo_simples_${usuario.id}`
    : 'phonecenter_modo_simples_guest';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        // Se já houver preferência salva pelo usuário
        setIsModoSimplesState(saved === 'true');
      } else {
        // Padrão obrigatório: Modo Simples ativo por padrão
        setIsModoSimplesState(true);
      }
    } catch {
      setIsModoSimplesState(true);
    } finally {
      setIsLoaded(true);
    }
  }, [storageKey]);

  const setModoSimples = useCallback((value: boolean) => {
    setIsModoSimplesState(value);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, String(value));
      } catch (err) {
        console.warn('Falha ao salvar preferência de modo simples no localStorage:', err);
      }
    }
  }, [storageKey]);

  const toggleModoSimples = useCallback(() => {
    setModoSimples(!isModoSimples);
  }, [isModoSimples, setModoSimples]);

  return {
    isModoSimples,
    isLoaded,
    setModoSimples,
    toggleModoSimples,
  };
}
