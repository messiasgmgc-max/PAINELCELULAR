'use client';

import { useState, useEffect } from 'react';

interface StoreConfig {
  nomeLoja: string;
  logoLoja: string | null; // Base64 data URL
}

const DEFAULT_CONFIG: StoreConfig = {
  nomeLoja: 'Phone Center',
  logoLoja: null,
};

const STORAGE_KEY = 'storeConfig';

export function useStoreConfig() {
  const [config, setConfig] = useState<StoreConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar config ao montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setConfig(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Salvar config
  const salvarConfig = (novaConfig: StoreConfig) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(novaConfig));
      setConfig(novaConfig);
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
    }
  };

  // Atualizar nome da loja
  const atualizarNomeLoja = (nomeLoja: string) => {
    const novaConfig = { ...config, nomeLoja: nomeLoja || 'Phone Center' };
    salvarConfig(novaConfig);
  };

  // Atualizar logo da loja
  const atualizarLogoLoja = (logoLoja: string | null) => {
    const novaConfig = { ...config, logoLoja };
    salvarConfig(novaConfig);
  };

  // Remover logo (volta para padrão)
  const removerLogo = () => {
    const novaConfig = { ...config, logoLoja: null };
    salvarConfig(novaConfig);
  };

  // Resetar para padrão
  const resetarConfig = () => {
    localStorage.removeItem(STORAGE_KEY);
    setConfig(DEFAULT_CONFIG);
  };

  return {
    config,
    isLoading,
    salvarConfig,
    atualizarNomeLoja,
    atualizarLogoLoja,
    removerLogo,
    resetarConfig,
  };
}
