import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { crmBridgeJson, crmBridgeOptionsResponse } from '@/lib/crm-bridge/auth';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

async function registrarAlertaPropostaNoChat(
  lojaId: string,
  mensagem: string,
  protocolo: string
) {
  try {
    await supabaseAdmin.from('crm_chat_interno').insert({
      loja_id: lojaId,
      canal: 'vendas',
      autor_nome: 'Alerta Proposta',
      autor_cargo: 'sistema',
      mensagem,
      referencia_ticket: protocolo,
    });
  } catch {
    // Não bloqueia o cliente visualizando a proposta
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) {
    return crmBridgeJson({ ok: false, error: 'Token inválido.' }, 400, req);
  }

  const { data: proposta, error } = await supabaseAdmin
    .from('crm_propostas')
    .select('*')
    .eq('token_publico', token)
    .maybeSingle();

  if (error || !proposta) {
    return crmBridgeJson({ ok: false, error: 'Proposta não encontrada.' }, 404, req);
  }

  if (proposta.status === 'enviada') {
    await supabaseAdmin
      .from('crm_propostas')
      .update({ status: 'visualizada', updated_at: new Date().toISOString() })
      .eq('id', proposta.id);
    proposta.status = 'visualizada';

    await registrarAlertaPropostaNoChat(
      String(proposta.loja_id),
      `🔥 ${proposta.cliente_nome || 'Cliente'} acabou de abrir a proposta ${proposta.protocolo} (${proposta.modelo_novo})! Hora de fazer follow-up.`,
      String(proposta.protocolo || '')
    );
  }

  const { data: loja } = await supabaseAdmin
    .from('lojas')
    .select('id, nome')
    .eq('id', proposta.loja_id)
    .maybeSingle();

  return crmBridgeJson(
    {
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
    },
    200,
    req
  );
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) {
    return crmBridgeJson({ ok: false, error: 'Token inválido.' }, 400, req);
  }

  try {
    const body = await req.json();
    const novoStatus = body?.status === 'recusada' ? 'recusada' : 'aceita';

    const { data: atual } = await supabaseAdmin
      .from('crm_propostas')
      .select('id, loja_id, protocolo, cliente_nome, modelo_novo, status')
      .eq('token_publico', token)
      .maybeSingle();

    if (!atual) {
      return crmBridgeJson({ ok: false, error: 'Proposta não encontrada.' }, 404, req);
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
      return crmBridgeJson({ ok: false, error: error.message }, 500, req);
    }

    await registrarAlertaPropostaNoChat(
      String(atual.loja_id),
      novoStatus === 'aceita'
        ? `🎉 PROPOSTA ACEITA! ${atual.cliente_nome || 'Cliente'} aceitou ${atual.protocolo} (${atual.modelo_novo})! Pode fechar a venda e emitir notinha.`
        : `⚠️ Proposta ${atual.protocolo} (${atual.modelo_novo}) foi recusada por ${atual.cliente_nome || 'Cliente'}.`,
      String(atual.protocolo || '')
    );

    return crmBridgeJson({ ok: true, proposta: data }, 200, req);
  } catch {
    return crmBridgeJson({ ok: false, error: 'Corpo da requisição inválido.' }, 400, req);
  }
}
