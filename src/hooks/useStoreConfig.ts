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
  garantiaDias: number;
  chavePix: string;
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
  garantiaDias: 90,
  chavePix: '',
};

export function useStoreConfig(providedLojaId?: string | null) {
  const [config, setConfig] = useState<StoreConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [activeLojaId, setActiveLojaId] = useState<string | null>(providedLojaId || null);

  // Sincroniza activeLojaId sempre que providedLojaId mudar
  useEffect(() => {
    if (providedLojaId) {
      setActiveLojaId(providedLojaId);
    }
  }, [providedLojaId]);

  // Busca dados oficiais diretamente da tabela 'lojas' no Supabase sem NENHUM cache local
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

      let currentLojaId: string | null = providedLojaId || activeLojaId;

      // Se não foi passado via parâmetro, busca da sessão + tabela 'perfis' ou pega a primeira loja cadastrada no banco
      if (!currentLojaId) {
        const { data: { session } } = await supabase.auth.getSession();
        const userEmail = session?.user?.email;

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
      }

      if (!currentLojaId) {
        const { data: primeiraLoja } = await supabase
          .from('lojas')
          .select('id')
          .limit(1)
          .maybeSingle();

        if (primeiraLoja?.id) {
          currentLojaId = String(primeiraLoja.id);
        }
      }

      let lojaDb: any = null;
      if (currentLojaId) {
        setActiveLojaId(currentLojaId);
        const { data: foundLoja } = await supabase
          .from('lojas')
          .select('*')
          .eq('id', currentLojaId)
          .maybeSingle();
        lojaDb = foundLoja;
      }

      if (!lojaDb) {
        const { data: fallbackLoja } = await supabase
          .from('lojas')
          .select('*')
          .limit(1)
          .maybeSingle();
        if (fallbackLoja) {
          lojaDb = fallbackLoja;
          setActiveLojaId(String(fallbackLoja.id));
        }
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
          garantiaDias: Number(lojaDb.garantia_dias || lojaDb.dias_garantia || DEFAULT_CONFIG.garantiaDias),
          chavePix: lojaDb.chave_pix || lojaDb.pix || lojaDb.chave_pix_cobranca || lojaDb.chavePix || DEFAULT_CONFIG.chavePix,
        };
        setConfig(configDb);
        return;
      }
    } catch (error) {
      console.error('Erro ao carregar dados oficiais da loja:', error);
    } finally {
      setIsLoading(false);
    }
  }, [providedLojaId, activeLojaId]);

  useEffect(() => {
    fetchStoreConfig();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      fetchStoreConfig();
    });

    return () => {
      listener?.subscription?.unsubscribe?.();
    };
  }, [fetchStoreConfig]);

  // Salva no banco de dados da loja correta e atualiza o estado imediatamente
  const salvarConfig = async (novaConfig: Partial<StoreConfig>) => {
    try {
      const configAtualizada: StoreConfig = { ...config, ...novaConfig };
      setConfig(configAtualizada);

      let targetId = providedLojaId || activeLojaId;

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

      if (!targetId) {
        const { data: primeiraLoja } = await supabase
          .from('lojas')
          .select('id')
          .limit(1)
          .maybeSingle();
        if (primeiraLoja?.id) targetId = String(primeiraLoja.id);
      }

      const updatePayload: Record<string, any> = {};
      if (novaConfig.nomeLoja !== undefined) updatePayload.nome = novaConfig.nomeLoja;
      if (novaConfig.subtituloLoja !== undefined) updatePayload.subtitulo = novaConfig.subtituloLoja;
      if (novaConfig.logoLoja !== undefined) updatePayload.logo_url = novaConfig.logoLoja;
      if (novaConfig.assinaturaLoja !== undefined) updatePayload.assinatura_url = novaConfig.assinaturaLoja;
      if (novaConfig.enderecoLoja !== undefined) updatePayload.endereco = novaConfig.enderecoLoja;
      if (novaConfig.cnpjLoja !== undefined) updatePayload.cnpj = novaConfig.cnpjLoja;
      if (novaConfig.telefoneLoja !== undefined) updatePayload.telefone = novaConfig.telefoneLoja;
      if (novaConfig.emailLoja !== undefined) updatePayload.email = novaConfig.emailLoja;
      if (novaConfig.chavePix !== undefined) {
        updatePayload.chave_pix = novaConfig.chavePix;
        updatePayload.pix = novaConfig.chavePix;
        updatePayload.chave_pix_cobranca = novaConfig.chavePix;
      }
      if (novaConfig.garantiaDias !== undefined) {
        updatePayload.garantia_dias = novaConfig.garantiaDias;
        updatePayload.dias_garantia = novaConfig.garantiaDias;
      }

      if (targetId) {
        const { error } = await supabase
          .from('lojas')
          .update(updatePayload)
          .eq('id', targetId);

        if (error) {
          console.error('Erro ao atualizar dados da loja no Supabase:', error);
          throw error;
        }
      } else {
        const { data: novaLoja } = await supabase
          .from('lojas')
          .insert([{
            nome: novaConfig.nomeLoja || 'Minha Loja',
            subtitulo: novaConfig.subtituloLoja || 'Sistema de Gestão',
            endereco: novaConfig.enderecoLoja || '',
            cnpj: novaConfig.cnpjLoja || '',
            telefone: novaConfig.telefoneLoja || '',
            email: novaConfig.emailLoja || '',
            logo_url: novaConfig.logoLoja || null,
            assinatura_url: novaConfig.assinaturaLoja || null,
          }])
          .select()
          .maybeSingle();

        if (novaLoja?.id) {
          targetId = String(novaLoja.id);
          setActiveLojaId(targetId);
        }
      }

      await fetchStoreConfig();
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
    lojaId: activeLojaId,
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
