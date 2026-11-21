import { NextRequest } from 'next/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';
import { enviarDocumentoWhatsApp, enviarTextoWhatsApp } from '@/lib/whatsappService';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * POST /api/crm-bridge/enviar-mensagem
 * Envia texto ou PDF diretamente na conversa ativa do PhoneCenterCRM (EvoCRM)
 * com fallback automático para a instância Evolution API da loja.
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
    const texto = String(body.texto || body.content || '').trim();
    const telefone = String(body.telefone || '').trim();
    const conversationId = body.conversationId ? String(body.conversationId).trim() : '';
    const privateNote = Boolean(body.privateNote);
    const pdfBase64Raw = body.pdfBase64 ? String(body.pdfBase64).trim() : '';
    const fileName = String(body.fileName || 'documento.pdf').trim();

    if (!texto && !pdfBase64Raw) {
      return crmBridgeJson(
        { ok: false, error: 'Informe texto ou pdfBase64 para envio.' },
        400,
        req
      );
    }

    // 1. Se há PDF + telefone -> envia como documento direto via Evolution API
    if (pdfBase64Raw && telefone.replace(/\D/g, '').length >= 10) {
      const pdfLimpo = pdfBase64Raw.replace(/^data:application\/pdf[^,]*,/i, '').replace(/\s/g, '');
      const docRes = await enviarDocumentoWhatsApp({
        lojaId: loja.id,
        telefone,
        base64: pdfLimpo,
        nomeArquivo: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
        legenda: texto || undefined,
      });
      if (docRes.success) {
        return crmBridgeJson(
          { ok: true, canalUsado: 'evolution_api_documento', enviado: true },
          200,
          req
        );
      }
    }

    // 2. Se há conversationId + token do EvoCRM -> envia direto dentro do chat do CRM
    const { config: cfgLoja } = await obterConfigCrmLoja(loja.id);
    const apiUrl = (
      cfgLoja.crm_api_url ||
      process.env.CRM_EVO_API_URL ||
      'https://api-crm.phonecenter.tech'
    ).replace(/\/+$/, '');
    const accessToken = (cfgLoja.crm_access_token || process.env.CRM_EVO_ACCESS_TOKEN || '').trim();

    if (conversationId && accessToken && texto) {
      try {
        const crmRes = await fetch(
          `${apiUrl}/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
              api_access_token: accessToken,
            },
            body: JSON.stringify({
              content: texto,
              message_type: 'outgoing',
              private: privateNote,
            }),
          }
        );

        if (crmRes.ok) {
          return crmBridgeJson(
            { ok: true, canalUsado: 'evocrm', enviado: true, conversationId },
            200,
            req
          );
        }
      } catch {
        // Segue para fallback Evolution API
      }
    }

    // 3. Fallback direto pela Evolution API quando não há conversationId/token (exceto nota privada)
    if (!privateNote && telefone.replace(/\D/g, '').length >= 10 && texto) {
      const waRes = await enviarTextoWhatsApp({
        lojaId: loja.id,
        telefone,
        texto,
      });
      if (waRes.success) {
        return crmBridgeJson(
          { ok: true, canalUsado: 'evolution_api', enviado: true },
          200,
          req
        );
      }
      return crmBridgeJson(
        { ok: false, error: waRes.error || 'Falha ao enviar via Evolution API.' },
        502,
        req
      );
    }

    return crmBridgeJson(
      {
        ok: false,
        error:
          'Configure o Access Token do CRM em /crm-config para enviar direto pelo conversationId ou informe um telefone válido.',
      },
      400,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao enviar mensagem.' },
      500,
      req
    );
  }
}
