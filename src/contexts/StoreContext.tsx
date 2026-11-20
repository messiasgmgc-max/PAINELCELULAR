'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { TipoPlano, PeriodoFaturamento, obterPlanoPorTipo } from '@/lib/planos-config';
import { lerAssinatura, type AcaoAssinatura, type EstadoAssinatura } from '@/lib/planos/assinatura';
import { lerDescontoLoja, type DescontoLoja } from '@/lib/planos/desconto';

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
  corTema: string;
  ordemAbas: string[];
  mpAccessToken: string;
  mpPublicKey: string;
}

export const DEFAULT_CONFIG: StoreConfig = {
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
  corTema: 'padrao',
  ordemAbas: [],
  mpAccessToken: '',
  mpPublicKey: '',
};

export interface StorePlanData {
  lojaId: string | null;
  nomeLoja: string;
  planoTipo: TipoPlano;
  periodoFaturamento: PeriodoFaturamento;
  planoStatus: 'ativo' | 'vitalicio' | 'pendente' | 'vencido' | 'bloqueado';
  valorMensalidade: number;
  dataVencimento: string | null;
  planoTrialAte: string | null;
  isTrialAtivo: boolean;
  trialPlanosUsados: string[];
  apiKey: string | null;
  chavePixCobranca: string;
  comprovanteUrl: string | null;
  solicitacaoStatus: 'nenhuma' | 'pendente_aprovacao' | 'aprovado' | 'rejeitado';
  solicitacaoAt: string | null;
  observacaoPlano: string | null;
  diasParaVencer: number;
  isBloqueado: boolean;
  isVitalicio: boolean;
  /** Cancelamento pelo painel: a loja segue liberada até o vencimento já pago. */
  assinatura: EstadoAssinatura;
  /** Desconto em vigor dado pelo administrador (já aplicado no PIX e no cartão). */
  desconto: DescontoLoja | null;
}

export const DEFAULT_PLAN: StorePlanData = {
  lojaId: null,
  nomeLoja: 'Phone Center',
  planoTipo: 'entrada',
  periodoFaturamento: 'mensal',
  planoStatus: 'ativo',
  valorMensalidade: 99.90,
  dataVencimento: null,
  planoTrialAte: null,
  isTrialAtivo: false,
  trialPlanosUsados: [],
  apiKey: null,
  chavePixCobranca: 'financeiro@phonecenter.com.br',
  comprovanteUrl: null,
  solicitacaoStatus: 'nenhuma',
  solicitacaoAt: null,
  observacaoPlano: null,
  diasParaVencer: 30,
  isBloqueado: false,
  isVitalicio: false,
  assinatura: lerAssinatura(null, null),
  desconto: null,
};

const STORE_CACHE_PREFIX = 'phonecenter_store_swr_v1:';
const REVALIDATE_INTERVAL_MS = 30_000;

export function mapLojaToConfig(lojaDb: any): StoreConfig {
  if (!lojaDb) return DEFAULT_CONFIG;
  return {
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
    corTema: lojaDb.cor_tema || DEFAULT_CONFIG.corTema,
    ordemAbas: Array.isArray(lojaDb.ordem_abas) ? lojaDb.ordem_abas : [],
    mpAccessToken: lojaDb.mp_access_token || '',
    mpPublicKey: lojaDb.mp_public_key || '',
  };
}

export function mapLojaToPlan(loja: any, syncVencidoNoBanco = false): StorePlanData {
  if (!loja) return DEFAULT_PLAN;

  let diasParaVencer = 30;
  let isVencidoPorData = false;

  const rawStatus = (loja.plano_status || 'ativo').toLowerCase();
  const isVitalicio = rawStatus === 'vitalicio';

  if (isVitalicio) {
    diasParaVencer = 99999;
    isVencidoPorData = false;
  } else if (loja.data_vencimento) {
    const parts = String(loja.data_vencimento).split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const venc = new Date(year, month, day, 23, 59, 59, 999);
      const diffTime = venc.getTime() - Date.now();
      diasParaVencer = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      isVencidoPorData = diffTime < 0;
    }
  }

  let status: StorePlanData['planoStatus'] = 'ativo';
  if (!loja.ativo || rawStatus === 'bloqueado') {
    status = 'bloqueado';
  } else if (isVitalicio) {
    status = 'vitalicio';
  } else if (rawStatus === 'vencido' || isVencidoPorData) {
    status = 'vencido';
  } else if (rawStatus === 'pendente') {
    status = 'pendente';
  } else {
    status = 'ativo';
  }

  const isBloqueado = status === 'bloqueado' || status === 'vencido';

  let isTrialAtivo = false;
  if (loja.plano_trial_ate) {
    const trialEnd = new Date(loja.plano_trial_ate).getTime();
    isTrialAtivo = trialEnd > Date.now();
  }

  // Sincroniza no banco se constava como ativo mas a data já venceu (e não é vitalício)
  if (syncVencidoNoBanco && isVencidoPorData && loja.plano_status === 'ativo' && !isTrialAtivo && !isVitalicio && loja.id) {
    supabase.from('lojas').update({ plano_status: 'vencido' }).eq('id', loja.id).then();
  }

  const planoTipo = (loja.plano_tipo || 'entrada') as TipoPlano;
  const periodoFaturamento = (loja.periodo_cobranca || 'mensal') as PeriodoFaturamento;
  const trialPlanosUsados = Array.isArray(loja.trial_planos_usados) ? loja.trial_planos_usados : [];

  return {
    lojaId: loja.id,
    nomeLoja: loja.nome || 'Phone Center',
    planoTipo,
    periodoFaturamento,
    planoStatus: status,
    valorMensalidade: Number(loja.valor_mensalidade) || obterPlanoPorTipo(planoTipo).precos.mensal.valorMensal,
    dataVencimento: loja.data_vencimento || null,
    planoTrialAte: loja.plano_trial_ate || null,
    isTrialAtivo,
    trialPlanosUsados,
    apiKey: loja.api_key || null,
    chavePixCobranca: loja.chave_pix_cobranca || 'financeiro@phonecenter.com.br',
    comprovanteUrl: loja.comprovante_url || null,
    solicitacaoStatus: (loja.solicitacao_liberacao_status as any) || 'nenhuma',
    solicitacaoAt: loja.solicitacao_liberacao_at || null,
    observacaoPlano: loja.observacao_plano || null,
    diasParaVencer,
    isBloqueado,
    isVitalicio,
    assinatura: lerAssinatura(loja.configuracoes, loja.data_vencimento),
    desconto: lerDescontoLoja(loja),
  };
}

function clearStoreCache(keepLojaId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const keepKey = keepLojaId ? `${STORE_CACHE_PREFIX}${keepLojaId}` : null;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('storeConfig:') || (key.startsWith(STORE_CACHE_PREFIX) && key !== keepKey)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignora erro de storage (ex: modo privado)
  }
}

function readStoreCache(lojaId: string): any | null {
  if (typeof window === 'undefined' || !lojaId) return null;
  try {
    const raw = localStorage.getItem(`${STORE_CACHE_PREFIX}${lojaId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && String(parsed.lojaId) === String(lojaId) && parsed.loja) {
      return parsed.loja;
    }
  } catch {
    // Ignora cache corrompido
  }
  return null;
}

function writeStoreCache(lojaId: string, loja: any) {
  if (typeof window === 'undefined' || !lojaId || !loja) return;
  clearStoreCache(lojaId);

  // Nunca salvar segredos ou comprovantes pesados no localStorage
  const { comprovante_url: _c, mp_access_token: _mp, ...base } = loja;
  const key = `${STORE_CACHE_PREFIX}${lojaId}`;

  const trySave = (candidate: any): boolean => {
    try {
      localStorage.setItem(key, JSON.stringify({ lojaId, updatedAt: Date.now(), loja: candidate }));
      return true;
    } catch {
      return false;
    }
  };

  if (trySave(base)) return;
  // Se assinatura Base64 exceder a cota do navegador, tenta sem ela
  const { assinatura_url: _a, ...semAssinatura } = base;
  if (trySave(semAssinatura)) return;
  // Se a logo Base64 também for muito grande, salva pelo menos nome, tema, plano e ordem das abas
  const { logo_url: _l, ...leve } = semAssinatura;
  trySave(leve);
}

export interface StoreContextValue {
  lojaId: string | null;
  config: StoreConfig;
  planData: StorePlanData;
  isLoadingConfig: boolean;
  isLoadingPlan: boolean;
  historicoPagamentos: any[];
  loadingHistorico: boolean;
  fetchStore: (force?: boolean) => Promise<void>;
  salvarConfig: (novaConfig: Partial<StoreConfig>) => Promise<void>;
  resetarConfig: () => void;
  fetchHistorico: () => Promise<void>;
  enviarSolicitacaoLiberacao: (comprovanteBase64?: string, observacao?: string) => Promise<boolean>;
  solicitarTrial: (novoPlano: TipoPlano) => Promise<any>;
  iniciarCheckoutCartao: (plano?: TipoPlano, periodo?: PeriodoFaturamento) => Promise<any>;
  alterarAssinatura: (acao: AcaoAssinatura, motivo?: string) => Promise<any>;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { usuario, authReady } = useAuth();
  const targetLojaId = usuario?.lojaId ? String(usuario.lojaId) : null;

  const [config, setConfig] = useState<StoreConfig>(DEFAULT_CONFIG);
  const [planData, setPlanData] = useState<StorePlanData>(DEFAULT_PLAN);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(true);
  const [isLoadingPlan, setIsLoadingPlan] = useState<boolean>(true);
  const [historicoPagamentos, setHistoricoPagamentos] = useState<any[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState<boolean>(false);

  const lastFetchedLojaIdRef = useRef<string | null>(null);
  const lastFetchedAtRef = useRef<number>(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const inFlightLojaIdRef = useRef<string | null>(null);
  const rawLojaRef = useRef<any>(null);

  // Hidratação instantânea (0ms) via cache escopado por lojaId enquanto busca o banco em segundo plano
  useEffect(() => {
    if (!targetLojaId) {
      if (authReady) {
        rawLojaRef.current = null;
        lastFetchedLojaIdRef.current = null;
        lastFetchedAtRef.current = 0;
        setConfig(DEFAULT_CONFIG);
        setPlanData(DEFAULT_PLAN);
        setHistoricoPagamentos([]);
        setIsLoadingConfig(false);
        setIsLoadingPlan(false);
        clearStoreCache(null);
      }
      return;
    }

    const cachedLoja = readStoreCache(targetLojaId);
    if (cachedLoja) {
      rawLojaRef.current = cachedLoja;
      setConfig(mapLojaToConfig(cachedLoja));
      setPlanData(mapLojaToPlan(cachedLoja, false));
      setIsLoadingConfig(false);
      setIsLoadingPlan(false);
    } else {
      // Se trocou de loja sem cache local, limpa dados da loja anterior imediatamente
      if (lastFetchedLojaIdRef.current && lastFetchedLojaIdRef.current !== targetLojaId) {
        rawLojaRef.current = null;
        setConfig(DEFAULT_CONFIG);
        setPlanData(DEFAULT_PLAN);
        setHistoricoPagamentos([]);
      }
      setIsLoadingConfig(true);
      setIsLoadingPlan(true);
    }
  }, [targetLojaId, authReady]);

  // Busca única e deduplicada na tabela `lojas` (sempre sincroniza com a fonte oficial no Supabase)
  const fetchStore = useCallback(async (force = false) => {
    if (!targetLojaId) {
      setConfig(DEFAULT_CONFIG);
      setPlanData(DEFAULT_PLAN);
      setIsLoadingConfig(false);
      setIsLoadingPlan(false);
      return;
    }

    // Se já há uma requisição em andamento para a mesma loja, reutiliza a mesma Promise
    if (!force && inFlightRef.current && inFlightLojaIdRef.current === targetLojaId) {
      return inFlightRef.current;
    }

    const run = async () => {
      const hasCachedData = rawLojaRef.current && String(rawLojaRef.current.id) === targetLojaId;
      if (!hasCachedData) {
        setIsLoadingConfig(true);
        setIsLoadingPlan(true);
      }

      try {
        const { data: lojaDb, error } = await supabase
          .from('lojas')
          .select('*')
          .eq('id', targetLojaId)
          .maybeSingle();

        if (error) {
          console.warn('Erro ao buscar dados da loja:', error.message);
          return;
        }

        if (lojaDb) {
          rawLojaRef.current = lojaDb;
          lastFetchedLojaIdRef.current = targetLojaId;
          lastFetchedAtRef.current = Date.now();
          setConfig(mapLojaToConfig(lojaDb));
          setPlanData(mapLojaToPlan(lojaDb, true));
          writeStoreCache(targetLojaId, lojaDb);
        } else {
          rawLojaRef.current = null;
          setConfig(DEFAULT_CONFIG);
          setPlanData(DEFAULT_PLAN);
        }
      } catch (err) {
        console.error('Erro ao carregar dados oficiais da loja:', err);
      } finally {
        setIsLoadingConfig(false);
        setIsLoadingPlan(false);
        if (inFlightLojaIdRef.current === targetLojaId) {
          inFlightRef.current = null;
          inFlightLojaIdRef.current = null;
        }
      }
    };

    const promise = run();
    inFlightRef.current = promise;
    inFlightLojaIdRef.current = targetLojaId;
    return promise;
  }, [targetLojaId]);

  // Sempre busca do banco ao montar ou mudar de loja (Stale-While-Revalidate: 0ms visual + 100% sincronizado com o banco)
  useEffect(() => {
    if (!targetLojaId) return;
    fetchStore();
  }, [targetLojaId, fetchStore]);

  // Revalida silenciosamente ao voltar para a aba se passou mais de 30s desde a última sincronização
  useEffect(() => {
    if (!targetLojaId || typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastFetchedAtRef.current;
        if (elapsed >= REVALIDATE_INTERVAL_MS) {
          fetchStore();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [targetLojaId, fetchStore]);

  const salvarConfig = useCallback(async (novaConfig: Partial<StoreConfig>) => {
    try {
      setConfig((prev) => ({ ...prev, ...novaConfig }));

      let resolvedId = targetLojaId;
      if (!resolvedId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          const { data: perfil } = await supabase
            .from('perfis')
            .select('loja_id')
            .eq('email', session.user.email)
            .maybeSingle();
          if (perfil?.loja_id) resolvedId = String(perfil.loja_id);
        }
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
      if (novaConfig.corTema !== undefined) {
        updatePayload.cor_tema = novaConfig.corTema;
      }
      if (novaConfig.ordemAbas !== undefined) {
        updatePayload.ordem_abas = novaConfig.ordemAbas;
      }
      if (novaConfig.mpAccessToken !== undefined) {
        updatePayload.mp_access_token = novaConfig.mpAccessToken;
      }
      if (novaConfig.mpPublicKey !== undefined) {
        updatePayload.mp_public_key = novaConfig.mpPublicKey;
      }

      if (resolvedId) {
        const { error } = await supabase
          .from('lojas')
          .update(updatePayload)
          .eq('id', resolvedId);

        if (error) {
          console.error('Erro ao atualizar dados da loja no Supabase:', error);
          throw error;
        }

        if (rawLojaRef.current) {
          const merged = { ...rawLojaRef.current, ...updatePayload };
          rawLojaRef.current = merged;
          writeStoreCache(resolvedId, merged);
        }
      } else {
        await supabase
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
      }

      await fetchStore(true);
    } catch (error) {
      console.error('Erro ao salvar configuração no banco:', error);
      throw error;
    }
  }, [targetLojaId, fetchStore]);

  const resetarConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
  }, []);

  const fetchHistorico = useCallback(async () => {
    const resolvedId = planData.lojaId || targetLojaId;
    if (!resolvedId) return;

    try {
      setLoadingHistorico(true);
      const { data, error } = await supabase
        .from('historico_pagamentos_planos')
        .select('*')
        .eq('loja_id', resolvedId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistoricoPagamentos(data || []);
    } catch (err) {
      console.error('Erro ao buscar histórico de pagamentos:', err);
    } finally {
      setLoadingHistorico(false);
    }
  }, [planData.lojaId, targetLojaId]);

  const enviarSolicitacaoLiberacao = useCallback(async (comprovanteBase64?: string, observacao?: string) => {
    const resolvedId = planData.lojaId || targetLojaId;
    if (!resolvedId) throw new Error('Loja não encontrada');

    try {
      const now = new Date().toISOString();
      const updates: any = {
        solicitacao_liberacao_status: 'pendente_aprovacao',
        solicitacao_liberacao_at: now,
      };

      if (comprovanteBase64) updates.comprovante_url = comprovanteBase64;
      if (observacao) updates.observacao_plano = observacao;

      const { error } = await supabase
        .from('lojas')
        .update(updates)
        .eq('id', resolvedId);

      if (error) throw error;

      await supabase.from('historico_pagamentos_planos').insert({
        loja_id: resolvedId,
        valor: planData.valorMensalidade,
        status: 'pendente_aprovacao',
        comprovante_url: comprovanteBase64 || null,
        observacao: observacao || 'Solicitação de liberação enviada pelo lojista',
        forma_pagamento: 'comprovante_pix',
      });

      await fetchStore(true);
      await fetchHistorico();
      return true;
    } catch (err: any) {
      console.error('Erro ao enviar solicitação de liberação:', err);
      throw err;
    }
  }, [planData.lojaId, planData.valorMensalidade, targetLojaId, fetchStore, fetchHistorico]);

  const solicitarTrial = useCallback(async (novoPlano: TipoPlano) => {
    const resolvedId = planData.lojaId || targetLojaId;
    if (!resolvedId) throw new Error('Loja não identificada');

    const res = await fetch('/api/planos/solicitar-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lojaId: resolvedId, novoPlano }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao ativar teste');

    await fetchStore(true);
    await fetchHistorico();
    return data;
  }, [planData.lojaId, targetLojaId, fetchStore, fetchHistorico]);

  const iniciarCheckoutCartao = useCallback(async (
    plano: TipoPlano = planData.planoTipo,
    periodo: PeriodoFaturamento = planData.periodoFaturamento
  ) => {
    const resolvedId = planData.lojaId || targetLojaId;
    if (!resolvedId) throw new Error('Loja não identificada');

    const res = await fetch('/api/planos/pagar-cartao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lojaId: resolvedId,
        plano,
        periodo,
        email: usuario?.email,
        nome: usuario?.nome || planData.nomeLoja,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao gerar checkout');

    return data;
  }, [planData.lojaId, planData.planoTipo, planData.periodoFaturamento, planData.nomeLoja, targetLojaId, usuario?.email, usuario?.nome]);

  const alterarAssinatura = useCallback(async (acao: AcaoAssinatura, motivo?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Entre de novo para alterar a assinatura.');

    const res = await fetch('/api/planos/assinatura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ acao, motivo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível alterar a assinatura.');

    await fetchStore(true);
    return data;
  }, [fetchStore]);

  return (
    <StoreContext.Provider
      value={{
        lojaId: targetLojaId,
        config,
        planData,
        isLoadingConfig,
        isLoadingPlan,
        historicoPagamentos,
        loadingHistorico,
        fetchStore,
        salvarConfig,
        resetarConfig,
        fetchHistorico,
        enviarSolicitacaoLiberacao,
        solicitarTrial,
        iniciarCheckoutCartao,
        alterarAssinatura,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStoreContext(): StoreContextValue | undefined {
  return useContext(StoreContext);
}
