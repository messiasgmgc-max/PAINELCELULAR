import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import {
  dispararMetaCapiPurchase,
  obterDashboardAnunciosBridge,
  registrarLeadAnuncioBridge,
} from '@/lib/crm-bridge/fase5';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  const dias = Number(req.nextUrl.searchParams.get('dias') || 30);
  const dashboard = await obterDashboardAnunciosBridge(
    loja.id,
    Number.isFinite(dias) ? dias : 30
  );
  return crmBridgeJson({ ok: true, loja, ...dashboard }, 200, req);
}

export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  try {
    const body = await req.json();
    const lead = await registrarLeadAnuncioBridge(
      loja.id,
      {
        origem: String(body.origem || 'meta_ctwa'),
        ctwaClid: String(body.ctwaClid || ''),
        sourceId: String(body.sourceId || ''),
        campaignName: String(body.campaignName || ''),
        adHeadline: String(body.adHeadline || ''),
        adBody: String(body.adBody || ''),
        sourceUrl: String(body.sourceUrl || ''),
      },
      {
        nome: body.contatoNome ? String(body.contatoNome) : '',
        telefone: body.contatoTelefone ? String(body.contatoTelefone) : '',
      }
    );
    return crmBridgeJson({ ok: true, loja, lead }, 201, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao criar lead.' },
      500,
      req
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  try {
    const body = await req.json();
    const leadId = String(body.id || '').trim();
    const status = String(body.status || 'convertido').trim();
    const valorVenda = Math.max(0, Number(body.valorVenda) || 0);

    if (!leadId) {
      return crmBridgeJson({ ok: false, error: 'Informe id do lead.' }, 400, req);
    }

    const { data: lead, error } = await supabaseAdmin
      .from('crm_leads_anuncio')
      .update({
        status,
        valor_venda: valorVenda,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .eq('loja_id', loja.id)
      .select('*')
      .single();

    if (error || !lead) {
      return crmBridgeJson({ ok: false, error: error?.message || 'Lead não encontrado.' }, 404, req);
    }

    let capiResult: { sent: boolean; reason?: string } = { sent: false };
    if (status === 'convertido' && valorVenda > 0 && !lead.capi_enviado) {
      const { config: cfgLoja } = await obterConfigCrmLoja(loja.id);
      capiResult = await dispararMetaCapiPurchase({
        telefone: String(lead.contato_telefone || ''),
        ctwaClid: String(lead.ctwa_clid || ''),
        valor: valorVenda,
        eventId: `pc_lead_${lead.id}`,
        pixelId: cfgLoja.meta_pixel_id || undefined,
        accessToken: cfgLoja.meta_capi_access_token || undefined,
      });
      if (capiResult.sent) {
        await supabaseAdmin
          .from('crm_leads_anuncio')
          .update({ capi_enviado: true, capi_enviado_em: new Date().toISOString() })
          .eq('id', lead.id);
      }
    }

    return crmBridgeJson({ ok: true, lead, capi: capiResult }, 200, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao atualizar lead.' },
      500,
      req
    );
  }
}
