import { NextRequest } from 'next/server';
import { obterUsuarioServidor } from '@/lib/auth/servidor';
import { verificarPlanoCrmLoja } from '@/lib/crm-bridge/autoProvision';
import { crmBridgeJson, crmBridgeOptionsResponse } from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * GET /api/crm-bridge/minha-loja
 * Retorna URL dinâmica do CRM e status do plano para o usuário autenticado no ERP.
 */
export async function GET(req: NextRequest) {
  const usuario = await obterUsuarioServidor(req);
  if (!usuario) {
    return crmBridgeJson({ ok: false, error: 'Não autenticado.' }, 401, req);
  }

  const lojaId = usuario.lojaId;
  if (!lojaId) {
    return crmBridgeJson(
      {
        ok: true,
        lojaId: null,
        crmFrontendUrl: 'https://crm.phonecenter.tech',
        crmAtivo: usuario.superAdmin,
        planoLiberado: usuario.superAdmin,
        isSuperAdmin: usuario.superAdmin,
      },
      200,
      req
    );
  }

  const [{ config }, plano] = await Promise.all([
    obterConfigCrmLoja(lojaId),
    verificarPlanoCrmLoja(lojaId),
  ]);

  return crmBridgeJson(
    {
      ok: true,
      lojaId,
      crmFrontendUrl: config.crm_frontend_url || 'https://crm.phonecenter.tech',
      crmAtivo: config.crm_ativo,
      modoTenant: config.modo_tenant,
      planoLiberado: usuario.superAdmin || plano.liberado,
      isSuperAdmin: usuario.superAdmin,
    },
    200,
    req
  );
}
