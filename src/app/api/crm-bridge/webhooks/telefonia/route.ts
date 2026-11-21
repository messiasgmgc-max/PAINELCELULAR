import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { lookupClienteBridge } from '@/lib/crm-bridge/queries';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

function normalizarStatusChamada(raw: string): 'tocando' | 'em_andamento' | 'finalizada' | 'perdida' {
  const s = raw.toLowerCase();
  if (s.includes('answer') || s.includes('attend') || s.includes('progress') || s.includes('active')) {
    return 'em_andamento';
  }
  if (s.includes('miss') || s.includes('perd') || s.includes('noanswer') || s.includes('busy')) {
    return 'perdida';
  }
  if (s.includes('hangup') || s.includes('end') || s.includes('finish') || s.includes('complet')) {
    return 'finalizada';
  }
  return 'tocando';
}

/**
 * POST /api/crm-bridge/webhooks/telefonia
 * Receptor universal de webhooks PABX/VoIP (Asterisk, 3CX, Zenvia, Twilio ou JSON genérico).
 * Identifica o cliente instantaneamente para exibir popup no CRM Phone!
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, {
    allowWebhookToken: true,
    skipPlanGate: true,
  });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Loja não identificada.' }, 404, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const direcao =
      String(body.direction || body.direcao || '').toLowerCase().includes('out') ||
      String(body.direction || '').toLowerCase() === 'saida'
        ? 'saida'
        : 'entrada';

    const telefone = String(
      direcao === 'entrada'
        ? body.from || body.caller || body.telefone || body.numero || ''
        : body.to || body.callee || body.telefone || body.numero || ''
    ).trim();

    if (!telefone) {
      return crmBridgeJson({ ok: false, error: 'Payload sem número de telefone.' }, 400, req);
    }

    const protocoloExterno = String(
      body.call_id || body.callSid || body.uniqueid || body.protocolo || ''
    ).trim();
    const status = normalizarStatusChamada(
      String(body.status || body.event || body.state || 'ringing')
    );
    const duracaoSeg = Math.max(0, Math.trunc(Number(body.duration || body.duracao_seg || 0)));
    const gravacaoUrl = String(body.recording_url || body.gravacao_url || '').trim();
    const ramal = String(body.ramal || body.extension || '').trim();
    const agenteNome = String(body.agente || body.agent || '').trim();

    const cli = await lookupClienteBridge(loja.id, { telefone }).catch(() => null);

    if (protocoloExterno) {
      const { data: existente } = await supabaseAdmin
        .from('crm_chamadas_telefonia')
        .select('id')
        .eq('loja_id', loja.id)
        .eq('protocolo_externo', protocoloExterno)
        .maybeSingle();

      if (existente?.id) {
        const { data: updated } = await supabaseAdmin
          .from('crm_chamadas_telefonia')
          .update({
            status,
            duracao_seg: duracaoSeg,
            gravacao_url: gravacaoUrl || undefined,
            agente_nome: agenteNome || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existente.id)
          .select('*')
          .single();

        return crmBridgeJson({ ok: true, updated: true, chamada: updated, cliente360: cli }, 200, req);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('crm_chamadas_telefonia')
      .insert({
        loja_id: loja.id,
        direcao,
        telefone,
        cliente_id: cli?.cliente?.id || null,
        cliente_nome: String(body.clienteNome || cli?.cliente?.nome || '').trim(),
        agente_nome: agenteNome,
        ramal,
        status,
        duracao_seg: duracaoSeg,
        gravacao_url: gravacaoUrl,
        protocolo_externo: protocoloExterno,
      })
      .select('*')
      .single();

    if (error) {
      return crmBridgeJson({ ok: false, error: error.message }, 500, req);
    }

    return crmBridgeJson({ ok: true, created: true, chamada: data, cliente360: cli }, 201, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Payload inválido.' },
      400,
      req
    );
  }
}
