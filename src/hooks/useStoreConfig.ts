'use client';

import { useCallback } from 'react';
import {
  useStoreContext,
  DEFAULT_CONFIG,
  type StoreConfig,
} from '@/contexts/StoreContext';

export type { StoreConfig };

export function useStoreConfig(_providedLojaId?: string | null) {
  const ctx = useStoreContext();

  const salvarConfig = useCallback(
    async (novaConfig: Partial<StoreConfig>) => {
      if (!ctx) return;
      await ctx.salvarConfig(novaConfig);
    },
    [ctx]
  );

  const fetchStoreConfig = useCallback(async () => {
    if (!ctx) return;
    await ctx.fetchStore(true);
  }, [ctx]);

  const atualizarNomeLoja = useCallback(
    (nomeLoja: string) => {
      salvarConfig({ nomeLoja });
    },
    [salvarConfig]
  );

  const atualizarLogoLoja = useCallback(
    (logoLoja: string | null) => {
      salvarConfig({ logoLoja });
    },
    [salvarConfig]
  );

  const atualizarAssinaturaLoja = useCallback(
    (assinaturaLoja: string | null) => {
      salvarConfig({ assinaturaLoja });
    },
    [salvarConfig]
  );

  const atualizarDadosEmpresa = useCallback(
    (dados: Partial<StoreConfig>) => {
      salvarConfig(dados);
    },
    [salvarConfig]
  );

  const removerLogo = useCallback(() => {
    salvarConfig({ logoLoja: null });
  }, [salvarConfig]);

  const removerAssinatura = useCallback(() => {
    salvarConfig({ assinaturaLoja: null });
  }, [salvarConfig]);

  const resetarConfig = useCallback(() => {
    ctx?.resetarConfig();
  }, [ctx]);

  const atualizarCorTema = useCallback(
    (corTema: string) => {
      salvarConfig({ corTema });
    },
    [salvarConfig]
  );

  const atualizarOrdemAbas = useCallback(
    (ordemAbas: string[]) => {
      salvarConfig({ ordemAbas });
    },
    [salvarConfig]
  );

  return {
    config: ctx?.config ?? DEFAULT_CONFIG,
    isLoading: ctx?.isLoadingConfig ?? false,
    lojaId: ctx?.lojaId ?? null,
    fetchStoreConfig,
    salvarConfig,
    atualizarNomeLoja,
    atualizarLogoLoja,
    atualizarAssinaturaLoja,
    atualizarDadosEmpresa,
    atualizarCorTema,
    atualizarOrdemAbas,
    removerLogo,
    removerAssinatura,
    resetarConfig,
  };
}
