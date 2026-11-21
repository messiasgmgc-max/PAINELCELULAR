import { NextRequest } from 'next/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { consultarProcedenciaImeiBridge } from '@/lib/crm-bridge/imei';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * GET /api/crm-bridge/imei?imei=...
 * Valida dígito verificador Luhn do IMEI e consulta procedência/restrições/OS no ERP da loja.
 */
export async function GET(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  const imei = req.nextUrl.searchParams.get('imei') || '';
  if (!imei.trim()) {
    return crmBridgeJson({ ok: false, error: 'Informe o parâmetro imei.' }, 400, req);
  }

  const resultado = await consultarProcedenciaImeiBridge(loja.id, imei);
  return crmBridgeJson({ ok: true, loja, ...resultado }, 200, req);
}
