import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { crmBridgeJson, crmBridgeOptionsResponse } from '@/lib/crm-bridge/auth';
import { garantirTokensLoja } from '@/lib/crm-bridge/lojaConfig';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * Vínculos diretos de e-mail do CRM -> loja_id do PhoneCenter ERP.
 * Permite que agentes específicos tenham sua loja pré-vinculada automaticamente
 * ao abrir o CRM para simulações, taxas reais e consulta de estoque.
 */
const VINCULOS_EMAIL_DIRETO: Array<{ match: (email: string) => boolean; lojaId: string }> = [
  {
    match: (email) =>
      email === 'messiasgmgc' ||
      email.startsWith('messiasgmgc@') ||
      email.includes('messiasgmgc'),
    lojaId: 'e2858e7b-3046-4211-ac06-3ad45e3ea6af', // Lucas Imports
  },
];

const TAXAS_FALLBACK = [
  { parcelas: 1, porcentagem: 3.15 },
  { parcelas: 2, porcentagem: 4.99 },
  { parcelas: 3, porcentagem: 5.99 },
  { parcelas: 4, porcentagem: 6.99 },
  { parcelas: 5, porcentagem: 7.99 },
  { parcelas: 6, porcentagem: 8.99 },
  { parcelas: 7, porcentagem: 9.99 },
  { parcelas: 8, porcentagem: 10.99 },
  { parcelas: 9, porcentagem: 11.99 },
  { parcelas: 10, porcentagem: 12.99 },
  { parcelas: 11, porcentagem: 13.99 },
  { parcelas: 12, porcentagem: 14.99 },
  { parcelas: 15, porcentagem: 17.99 },
  { parcelas: 18, porcentagem: 20.99 },
];

async function resolverLojaIdPorEmail(emailRaw: string): Promise<string | null> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return null;

  const direto = VINCULOS_EMAIL_DIRETO.find((v) => v.match(email));
  if (direto) return direto.lojaId;

  // Fallback: busca na tabela perfis pelo e-mail se existir
  try {
    const { data } = await supabaseAdmin
      .from('perfis')
      .select('loja_id')
      .ilike('email', email)
      .limit(1);
    const lojaId = data?.[0]?.loja_id ? String(data[0].loja_id) : null;
    if (lojaId) return lojaId;
  } catch {
    // ignora se a tabela não tiver coluna email
  }

  return null;
}

/**
 * GET /api/crm-bridge/bootstrap-agente?email=...
 * Resolve automaticamente a loja vinculada ao e-mail do agente no CRM,
 * retornando loja_id, nome da loja, bridge_token e taxas reais da maquininha.
 */
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase();
  const lojaIdParam = (req.nextUrl.searchParams.get('loja_id') || '').trim();

  let lojaId = lojaIdParam || (await resolverLojaIdPorEmail(email));
  if (!lojaId) {
    return crmBridgeJson(
      { ok: false, vinculado: false, error: 'Nenhum vínculo automático encontrado para este e-mail.' },
      404,
      req
    );
  }

  const { data: lojaRow } = await supabaseAdmin
    .from('lojas')
    .select('id, nome')
    .eq('id', lojaId)
    .limit(1);

  const loja = lojaRow?.[0]
    ? { id: String(lojaRow[0].id), nome: String(lojaRow[0].nome || 'PhoneCenter').trim() }
    : { id: lojaId, nome: 'Lucas Imports' };

  const tokens = await garantirTokensLoja(loja.id);

  const { data: taxasDb } = await supabaseAdmin
    .from('taxas_maquininha')
    .select('parcelas, porcentagem')
    .eq('loja_id', loja.id)
    .eq('ativo', true)
    .order('parcelas', { ascending: true });

  const taxas =
    taxasDb && taxasDb.length > 0
      ? (taxasDb as Array<{ parcelas: number; porcentagem: number }>).map((t) => ({
          parcelas: Number(t.parcelas),
          porcentagem: Number(t.porcentagem),
        }))
      : TAXAS_FALLBACK;

  return crmBridgeJson(
    {
      ok: true,
      vinculado: true,
      email: email || undefined,
      loja,
      bridgeToken: tokens.bridgeToken || '',
      taxas,
    },
    200,
    req
  );
}
