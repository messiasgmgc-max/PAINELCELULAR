import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';
import {
  listarRegrasPosVendaLoja,
  renderizarTemplatePosVenda,
} from '@/lib/crm-bridge/posVenda';
import { enviarTextoWhatsApp } from '@/lib/whatsappService';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

const ROTULOS_STATUS_OS: Record<string, string> = {
  aguardando_pecas: 'Aguardando Peças',
  em_andamento: 'Em Análise / Reparo',
  concluido: 'Concluído',
  aguardando_retirada: 'Pronto para Retirada',
  entregue: 'Entregue',
};

/**
 * POST /api/crm-bridge/notificar-os
 * Dispara atualização de status da Ordem de Serviço diretamente para o cliente no WhatsApp/CRM.
 */
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
    const body = (await req.json()) as Record<string, unknown>;
    const numeroOS = String(body.numeroOS || body.osId || 'S/N').trim();
    const clienteNome = String(body.clienteNome || 'Cliente').trim();
    const clienteTelefone = String(body.clienteTelefone || '').trim();
    const aparelhoModelo = String(body.aparelhoModelo || 'Aparelho').trim();
    const statusRaw = String(body.status || 'em_andamento').trim();
    const statusLabel = ROTULOS_STATUS_OS[statusRaw] || statusRaw;
    const valorTotal = body.valorTotal != null ? Number(body.valorTotal) : 0;
    const observacoes = String(body.observacoes || '').trim();
    const conversationId = body.conversationId ? String(body.conversationId).trim() : '';

    const { regras } = await listarRegrasPosVendaLoja(loja.id);
    const regraOs = regras.find((r) => r.tipo === 'os_status');
    let texto = renderizarTemplatePosVenda(
      regraOs?.template_mensagem ||
        'Olá {{cliente}}! Atualização da OS #{{os_numero}} ({{aparelho}}) na {{loja}}: *{{os_status}}*.',
      {
        cliente: clienteNome,
        loja: loja.nome,
        aparelho: aparelhoModelo,
        osNumero: numeroOS,
        osStatus: statusLabel,
      }
    );

    if (valorTotal > 0) {
      texto += `\n💰 Valor do serviço: *R$ ${valorTotal.toFixed(2).replace('.', ',')}*`;
    }
    if (observacoes) {
      texto += `\n📝 Obs: ${observacoes}`;
    }

    let enviado = false;
    let canal = '';

    if (conversationId) {
      const { config: cfg } = await obterConfigCrmLoja(loja.id);
      const token = (cfg.crm_access_token || process.env.CRM_EVO_ACCESS_TOKEN || '').trim();
      if (token) {
        const apiUrl = (
          cfg.crm_api_url ||
          process.env.CRM_EVO_API_URL ||
          'https://api-crm.phonecenter.tech'
        ).replace(/\/+$/, '');
        const r = await fetch(
          `${apiUrl}/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              api_access_token: token,
            },
            body: JSON.stringify({ content: texto, message_type: 'outgoing', private: false }),
          }
        );
        if (r.ok) {
          enviado = true;
          canal = 'evocrm';
        }
      }
    }

    if (!enviado && clienteTelefone.replace(/\D/g, '').length >= 10) {
      const wa = await enviarTextoWhatsApp({
        lojaId: loja.id,
        telefone: clienteTelefone,
        texto,
      });
      enviado = wa.success;
      if (wa.success) canal = 'evolution_api';
    }

    if (enviado) {
      try {
        await supabaseAdmin.from('crm_pos_venda_disparos').upsert(
          {
            loja_id: loja.id,
            regra_tipo: 'os_status',
            referencia_id: `os_${numeroOS}_${statusRaw}`,
            cliente_nome: clienteNome,
            cliente_telefone: clienteTelefone,
            mensagem: texto,
            status: 'enviado',
          },
          { onConflict: 'loja_id,regra_tipo,referencia_id' }
        );
      } catch {
        // não bloqueia
      }
    }

    return crmBridgeJson({ ok: enviado, enviado, canal, texto }, enviado ? 200 : 400, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao notificar OS.' },
      500,
      req
    );
  }
}
