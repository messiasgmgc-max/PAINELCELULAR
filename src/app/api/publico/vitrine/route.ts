import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';
import { buscarEstoqueBridge } from '@/lib/crm-bridge/queries';
import { formatarTelefoneWhatsApp } from '@/lib/whatsappService';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * Endpoint público (somente leitura, sem custo/IMEI/clientes) que alimenta
 * a página Link na Bio + Vitrine WhatsApp (/bio).
 * Oculta aparelhos marcados como 'reservado' e devolve automaticamente o WhatsApp da loja.
 */
export async function GET(req: NextRequest) {
  const loja = await resolverLojaBridge(req);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Loja não encontrada.' }, 404, req);
  }

  const q = req.nextUrl.searchParams.get('q') || '';
  const condicao = req.nextUrl.searchParams.get('condicao') || undefined;

  const [itensRaw, cfgRes, lojaRowRes] = await Promise.all([
    buscarEstoqueBridge(loja.id, { q, condicao, limit: 80 }),
    obterConfigCrmLoja(loja.id),
    supabaseAdmin.from('lojas').select('telefone').eq('id', loja.id).maybeSingle(),
  ]);

  const itens = itensRaw.filter((i) => !i.reservado).slice(0, 60);
  const waRaw =
    cfgRes.config.whatsapp_bio_numero || String(lojaRowRes.data?.telefone || '');
  const whatsapp = waRaw.replace(/\D/g, '').length >= 10
    ? formatarTelefoneWhatsApp(waRaw)
    : '';

  return crmBridgeJson(
    {
      ok: true,
      loja: { id: loja.id, nome: loja.nome, whatsapp },
      total: itens.length,
      itens: itens.map((i) => ({
        id: i.id,
        marca: i.marca,
        modelo: i.modelo,
        capacidade: i.capacidade,
        cor: i.cor,
        condicao: i.condicao,
        saudeBateria: i.saudeBateria,
        preco: i.preco,
        categoria: i.categoria,
      })),
    },
    200,
    req
  );
}
