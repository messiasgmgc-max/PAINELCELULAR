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
  const [lojaId, setLojaId] = useState<string | null>(null);

  // Resolve uma chave por loja e busca os dados reais da tabela 'lojas' no Supabase
  useEffect(() => {
    let mounted = true;

    const resolverChaveEBuscarLoja = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        let scope = 'global';
        let currentLojaId: string | null = null;
        const email = session?.user?.email;

        if (email) {
          const { data: perfil } = await supabase
            .from('perfis')
            .select('loja_id')
            .eq('email', email)
            .maybeSingle();

          if (perfil?.loja_id) {
            scope = String(perfil.loja_id);
            currentLojaId = String(perfil.loja_id);
          }
        } else if (session?.user?.id) {
          scope = session.user.id;
        }

        setLojaId(currentLojaId);
        const resolvedKey = `${STORAGE_KEY_PREFIX}:${scope}`;
        setStorageKey(resolvedKey);

        // 1. Tenta primeiro carregar do localStorage como cache rápido
        const saved = localStorage.getItem(resolvedKey);
        if (saved && mounted) {
          try {
            setConfig(prev => ({ ...prev, ...JSON.parse(saved) }));
          } catch (e) {
            // ignore
          }
        }

        // 2. Carrega os dados oficiais atualizados da tabela 'lojas' (com fallback para a primeira loja)
        let lojaDb: any = null;
        if (currentLojaId) {
          const { data } = await supabase
            .from('lojas')
            .select('*')
            .eq('id', currentLojaId)
            .maybeSingle();
          lojaDb = data;
        }

        if (!lojaDb) {
          const { data } = await supabase
            .from('lojas')
            .select('*')
            .limit(1)
            .maybeSingle();
          lojaDb = data;
          if (lojaDb?.id) setLojaId(String(lojaDb.id));
        }

        if (lojaDb && mounted) {
          const configDb: StoreConfig = {
            nomeLoja: lojaDb.nome || DEFAULT_CONFIG.nomeLoja,
            logoLoja: lojaDb.logo_url || null,
            assinaturaLoja: lojaDb.assinatura_url || null,
            enderecoLoja: lojaDb.endereco || DEFAULT_CONFIG.enderecoLoja,
            cnpjLoja: lojaDb.cnpj || DEFAULT_CONFIG.cnpjLoja,
            telefoneLoja: lojaDb.telefone || DEFAULT_CONFIG.telefoneLoja,
            emailLoja: lojaDb.email || DEFAULT_CONFIG.emailLoja,
          };

          setConfig(configDb);
          localStorage.setItem(resolvedKey, JSON.stringify(configDb));
        }
      } catch (error) {
        console.error('Erro ao resolver chave ou carregar dados da loja:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    resolverChaveEBuscarLoja();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      resolverChaveEBuscarLoja();
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  // Salvar config
  const salvarConfig = async (novaConfig: StoreConfig) => {
    try {
      const key = storageKey || `${STORAGE_KEY_PREFIX}:global`;
      localStorage.setItem(key, JSON.stringify(novaConfig));
      setConfig(novaConfig);

      let targetId = lojaId;
      if (!targetId) {
        const { data: firstStore } = await supabase.from('lojas').select('id').limit(1).maybeSingle();
        if (firstStore?.id) {
          targetId = String(firstStore.id);
          setLojaId(targetId);
        }
      }

      if (targetId) {
        await supabase.from('lojas').update({
          nome: novaConfig.nomeLoja,
          logo_url: novaConfig.logoLoja,
          assinatura_url: novaConfig.assinaturaLoja,
          endereco: novaConfig.enderecoLoja,
          cnpj: novaConfig.cnpjLoja,
          telefone: novaConfig.telefoneLoja,
          email: novaConfig.emailLoja,
        }).eq('id', targetId);
      }
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
