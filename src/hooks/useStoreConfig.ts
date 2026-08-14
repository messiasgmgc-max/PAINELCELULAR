'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface StoreConfig {
  nomeLoja: string;
  subtituloLoja: string;
  logoLoja: string | null;
  assinaturaLoja: string | null;
  enderecoLoja: string;
  cnpjLoja: string;
  telefoneLoja: string;
  emailLoja: string;
}

const DEFAULT_CONFIG: StoreConfig = {
  nomeLoja: 'Phone Center',
  subtituloLoja: 'Sistema de Gestão',
  logoLoja: null,
  assinaturaLoja: null,
  enderecoLoja: 'Endereço não configurado',
  cnpjLoja: 'Não informado',
  telefoneLoja: 'Não informado',
  emailLoja: 'contato@loja.com',
};

export function useStoreConfig() {
  const [config, setConfig] = useState<StoreConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [lojaId, setLojaId] = useState<string | null>(null);

  // Busca dados diretamente do Supabase sem NENHUM CACHE de localStorage
  const fetchStoreConfig = useCallback(async () => {
    try {
      setIsLoading(true);

      // Limpar resquícios do localStorage para evitar interferência de cache legado
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('storeConfig:')) {
            localStorage.removeItem(key);
          }
        });
      }

      const { data: { session } } = await supabase.auth.getSession();
      const userEmail = session?.user?.email;

      let currentLojaId: string | null = null;

      if (userEmail) {
        const { data: perfil } = await supabase
          .from('perfis')
          .select('loja_id')
          .eq('email', userEmail)
          .maybeSingle();

        if (perfil?.loja_id) {
          currentLojaId = String(perfil.loja_id);
        }
      }

      setLojaId(currentLojaId);

      if (currentLojaId) {
        const { data: lojaDb, error } = await supabase
          .from('lojas')
          .select('*')
          .eq('id', currentLojaId)
          .maybeSingle();

        if (error) {
          console.error('Erro ao buscar loja no Supabase:', error);
        }

        if (lojaDb) {
          const configDb: StoreConfig = {
            nomeLoja: lojaDb.nome || DEFAULT_CONFIG.nomeLoja,
            subtituloLoja: lojaDb.subtitulo || DEFAULT_CONFIG.subtituloLoja,
            logoLoja: lojaDb.logo_url || null,
            assinaturaLoja: lojaDb.assinatura_url || null,
            enderecoLoja: lojaDb.endereco || DEFAULT_CONFIG.enderecoLoja,
            cnpjLoja: lojaDb.cnpj || DEFAULT_CONFIG.cnpjLoja,
            telefoneLoja: lojaDb.telefone || DEFAULT_CONFIG.telefoneLoja,
            emailLoja: lojaDb.email || DEFAULT_CONFIG.emailLoja,
          };
          setConfig(configDb);
          return;
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados oficiais da loja:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStoreConfig();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      fetchStoreConfig();
    });

    return () => {
      listener?.subscription?.unsubscribe?.();
    };
  }, [fetchStoreConfig]);

  // Salva no banco de dados e atualiza o estado imediatamente
  const salvarConfig = async (novaConfig: Partial<StoreConfig>) => {
    try {
      const configAtualizada: StoreConfig = { ...config, ...novaConfig };
      setConfig(configAtualizada);

      let targetId = lojaId;

      if (!targetId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          const { data: perfil } = await supabase
            .from('perfis')
            .select('loja_id')
            .eq('email', session.user.email)
            .maybeSingle();
          if (perfil?.loja_id) targetId = String(perfil.loja_id);
        }
      }

      if (targetId) {
        const updatePayload: Record<string, any> = {};
        if (novaConfig.nomeLoja !== undefined) updatePayload.nome = novaConfig.nomeLoja;
        if (novaConfig.subtituloLoja !== undefined) updatePayload.subtitulo = novaConfig.subtituloLoja;
        if (novaConfig.logoLoja !== undefined) updatePayload.logo_url = novaConfig.logoLoja;
        if (novaConfig.assinaturaLoja !== undefined) updatePayload.assinatura_url = novaConfig.assinaturaLoja;
        if (novaConfig.enderecoLoja !== undefined) updatePayload.endereco = novaConfig.enderecoLoja;
        if (novaConfig.cnpjLoja !== undefined) updatePayload.cnpj = novaConfig.cnpjLoja;
        if (novaConfig.telefoneLoja !== undefined) updatePayload.telefone = novaConfig.telefoneLoja;
        if (novaConfig.emailLoja !== undefined) updatePayload.email = novaConfig.emailLoja;

        const { error } = await supabase
          .from('lojas')
          .update(updatePayload)
          .eq('id', targetId);

        if (error) {
          console.error('Erro ao salvar loja no Supabase:', error);
          throw error;
        }
      }
    } catch (error) {
      console.error('Erro ao salvar configuração no banco:', error);
      throw error;
    }
  };

  const atualizarNomeLoja = (nomeLoja: string) => {
    salvarConfig({ nomeLoja });
  };

  const atualizarLogoLoja = (logoLoja: string | null) => {
    salvarConfig({ logoLoja });
  };

  const atualizarAssinaturaLoja = (assinaturaLoja: string | null) => {
    salvarConfig({ assinaturaLoja });
  };

  const atualizarDadosEmpresa = (dados: Partial<StoreConfig>) => {
    salvarConfig(dados);
  };

  const removerLogo = () => {
    salvarConfig({ logoLoja: null });
  };

  const removerAssinatura = () => {
    salvarConfig({ assinaturaLoja: null });
  };

  const resetarConfig = () => {
    setConfig(DEFAULT_CONFIG);
  };

  return {
    config,
    isLoading,
    lojaId,
    fetchStoreConfig,
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
