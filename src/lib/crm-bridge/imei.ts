import { supabaseAdmin } from '@/integrations/supabase/server';

export interface ValidacaoImei {
  valido: boolean;
  limpo: string;
  motivo?: string;
}

/**
 * Valida formato (15 dígitos) e dígito verificador Luhn padrão GSMA de IMEI.
 */
export function validarImeiLuhn(imei: string): ValidacaoImei {
  const limpo = String(imei || '').replace(/\D/g, '');
  if (limpo.length !== 15) {
    return {
      valido: false,
      limpo,
      motivo: 'IMEI deve conter exatamente 15 dígitos numéricos.',
    };
  }
  if (/^(\d)\1{14}$/.test(limpo)) {
    return {
      valido: false,
      limpo,
      motivo: 'IMEI inválido (sequência repetida).',
    };
  }

  let soma = 0;
  for (let i = 0; i < 15; i++) {
    let dig = Number(limpo[i]);
    if (i % 2 === 1) {
      dig *= 2;
      if (dig > 9) dig -= 9;
    }
    soma += dig;
  }

  const ok = soma % 10 === 0;
  return {
    valido: ok,
    limpo,
    motivo: ok ? undefined : 'Dígito verificador Luhn inválido para este IMEI.',
  };
}

export async function consultarProcedenciaImeiBridge(lojaId: string, imeiRaw: string) {
  const validacao = validarImeiLuhn(imeiRaw);
  const cleanImei = validacao.limpo;

  if (cleanImei.length < 8) {
    return {
      validacao,
      restricaoInterna: false,
      motivoRestricao: null as string | null,
      aparelhos: [] as Array<Record<string, unknown>>,
      garantias: [] as Array<Record<string, unknown>>,
      ordensServico: [] as Array<Record<string, unknown>>,
    };
  }

  const [apRes, restricaoRes, osRes, garRes] = await Promise.all([
    supabaseAdmin
      .from('aparelhos')
      .select('id, modelo, capacidade, cor, condicao, status, preco, custo, observacoes, imei, ativo')
      .eq('loja_id', lojaId)
      .ilike('imei', `%${cleanImei}%`)
      .limit(10),
    supabaseAdmin
      .from('aparelhos')
      .select('id, modelo, status, observacoes')
      .eq('imei', cleanImei)
      .or(
        'status.eq.bloqueado,observacoes.ilike.%furto%,observacoes.ilike.%roubo%,observacoes.ilike.%bloqueado%'
      )
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('ordens_servico')
      .select('id, "numeroOS", "clienteNome", "aparelhoModelo", defeito, status, "dataEntrada"')
      .eq('loja_id', lojaId)
      .ilike('imei', `%${cleanImei}%`)
      .order('dataEntrada', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('garantias')
      .select('id, "clienteNome", "aparelhoModelo", "dataFim", status')
      .eq('loja_id', lojaId)
      .ilike('aparelhoModelo', `%${cleanImei}%`)
      .limit(5),
  ]);

  const aparRestrito = restricaoRes.data as Record<string, unknown> | null;

  return {
    validacao,
    restricaoInterna: Boolean(aparRestrito),
    motivoRestricao: aparRestrito
      ? `Consta alerta de restrição interna (${String(aparRestrito.modelo || 'Identificado')} — ${String(aparRestrito.status || 'bloqueado')})`
      : null,
    aparelhos: (apRes.data || []) as Array<Record<string, unknown>>,
    ordensServico: (osRes.data || []) as Array<Record<string, unknown>>,
    garantias: (garRes.data || []) as Array<Record<string, unknown>>,
  };
}
