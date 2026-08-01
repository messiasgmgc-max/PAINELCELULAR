'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface StoreConfig {
  nomeLoja: string;
  logoLoja: string | null; // Base64 data URL
  assinaturaLoja: string | null; // Base64 data URL para recibos/PDFs
  enderecoLoja: string;
  cnpjLoja: string;
  telefoneLoja: string;
  emailLoja: string;
}

const DEFAULT_CONFIG: StoreConfig = {
  nomeLoja: 'Phone Center',
  logoLoja: null,
  assinaturaLoja: null,
  enderecoLoja: 'Endereço não configurado',
  cnpjLoja: 'Não informado',
  telefoneLoja: 'Não informado',
  emailLoja: 'contato@loja.com',
};

const STORAGE_KEY_PREFIX = 'storeConfig';

export function useStoreConfig() {
  const [config, setConfig] = useState<StoreConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [storageKey, setStorageKey] = useState<string | null>(null);

  // Resolve uma chave por loja para evitar vazamento visual entre estabelecimentos
  useEffect(() => {
    let mounted = true;

    const resolverChave = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        let scope = 'global';
        const email = session?.user?.email;

        if (email) {
          const { data: perfil } = await supabase
            .from('perfis')
            .select('loja_id')
            .eq('email', email)
            .maybeSingle();

          if (perfil?.loja_id) {
            scope = String(perfil.loja_id);
          }
        } else if (session?.user?.id) {
          scope = session.user.id;
        }

        setStorageKey(`${STORAGE_KEY_PREFIX}:${scope}`);
      } catch (error) {
        console.error('Erro ao resolver chave da configuração:', error);
        if (mounted) setStorageKey(`${STORAGE_KEY_PREFIX}:global`);
      }
    };

    resolverChave();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      resolverChave();
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  // Carregar config ao mudar a chave resolvida
  useEffect(() => {
    if (!storageKey) return;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setConfig(JSON.parse(saved));
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
      setConfig(DEFAULT_CONFIG);
    } finally {
      setIsLoading(false);
    }
  }, [storageKey]);

  // Salvar config
  const salvarConfig = (novaConfig: StoreConfig) => {
    try {
      const key = storageKey || `${STORAGE_KEY_PREFIX}:global`;
      localStorage.setItem(key, JSON.stringify(novaConfig));
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

  const atualizarAssinaturaLoja = (assinaturaLoja: string | null) => {
    const novaConfig = { ...config, assinaturaLoja };
    salvarConfig(novaConfig);
  };

  // Atualizar dados da empresa
  const atualizarDadosEmpresa = (dados: Partial<StoreConfig>) => {
    const novaConfig = { ...config, ...dados };
    salvarConfig(novaConfig);
  };

  // Remover logo (volta para padrão)
  const removerLogo = () => {
    const novaConfig = { ...config, logoLoja: null };
    salvarConfig(novaConfig);
  };

  const removerAssinatura = () => {
    const novaConfig = { ...config, assinaturaLoja: null };
    salvarConfig(novaConfig);
  };

  // Resetar para padrão
  const resetarConfig = () => {
    const key = storageKey || `${STORAGE_KEY_PREFIX}:global`;
    localStorage.removeItem(key);
    setConfig(DEFAULT_CONFIG);
  };

  return {
    config,
    isLoading,
    salvarConfig,
    atualizarNomeLoja,
    atualizarLogoLoja,
    atualizarAssinaturaLoja,
    atualizarDadosEmpresa,
    removerLogo,
    removerAssinatura,
    resetarConfig,
  };
}
