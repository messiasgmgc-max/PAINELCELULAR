import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { crmBridgeJson, crmBridgeOptionsResponse } from '@/lib/crm-bridge/auth';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) {
    return crmBridgeJson({ ok: false, error: 'Token inválido.' }, 400);
  }

  const { data: proposta, error } = await supabaseAdmin
    .from('crm_propostas')
    .select('*')
    .eq('token_publico', token)
    .maybeSingle();

  if (error || !proposta) {
    return crmBridgeJson({ ok: false, error: 'Proposta não encontrada.' }, 404);
  }

  if (proposta.status === 'enviada') {
    await supabaseAdmin
      .from('crm_propostas')
      .update({ status: 'visualizada', updated_at: new Date().toISOString() })
      .eq('id', proposta.id);
    proposta.status = 'visualizada';
  }

  const { data: loja } = await supabaseAdmin
    .from('lojas')
    .select('id, nome')
    .eq('id', proposta.loja_id)
    .maybeSingle();

  return crmBridgeJson({
    ok: true,
    loja: loja || { id: proposta.loja_id, nome: 'PhoneCenter' },
    proposta: {
      protocolo: proposta.protocolo,
      cliente_nome: proposta.cliente_nome,
      vendedor_nome: proposta.vendedor_nome,
      modelo_novo: proposta.modelo_novo,
      valor_aparelho: Number(proposta.valor_aparelho) || 0,
      troca_modelo: proposta.troca_modelo,
      troca_capacidade: proposta.troca_capacidade,
      valor_troca: Number(proposta.valor_troca) || 0,
      entrada_pix: Number(proposta.entrada_pix) || 0,
      saldo_financiar: Number(proposta.saldo_financiar) || 0,
      parcelamento: proposta.parcelamento || [],
      status: proposta.status,
      validade_ate: proposta.validade_ate,
      aceita_em: proposta.aceita_em,
      created_at: proposta.created_at,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) {
    return crmBridgeJson({ ok: false, error: 'Token inválido.' }, 400);
  }

  try {
    const body = await req.json();
    const novoStatus = body?.status === 'recusada' ? 'recusada' : 'aceita';

    const { data: atual } = await supabaseAdmin
      .from('crm_propostas')
      .select('id, status')
      .eq('token_publico', token)
      .maybeSingle();

    if (!atual) {
      return crmBridgeJson({ ok: false, error: 'Proposta não encontrada.' }, 404);
    }

    const { data, error } = await supabaseAdmin
      .from('crm_propostas')
      .update({
        status: novoStatus,
        aceita_em: novoStatus === 'aceita' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', atual.id)
      .select('protocolo, status, aceita_em')
      .single();

    if (error) {
      return crmBridgeJson({ ok: false, error: error.message }, 500);
    }

    return crmBridgeJson({ ok: true, proposta: data });
  } catch {
    return crmBridgeJson({ ok: false, error: 'Corpo da requisição inválido.' }, 400);
  }
}
