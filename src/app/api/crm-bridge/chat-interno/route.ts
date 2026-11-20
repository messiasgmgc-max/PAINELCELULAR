import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

const CANAIS_VALIDOS = ['geral', 'vendas', 'trocas', 'assistencia', 'gerencia'];

export async function GET(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const loja = await resolverLojaBridge(req);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404);
  }

  const canalRaw = (req.nextUrl.searchParams.get('canal') || 'geral').toLowerCase();
  const canal = CANAIS_VALIDOS.includes(canalRaw) ? canalRaw : 'geral';

  const { data, error } = await supabaseAdmin
    .from('crm_chat_interno')
    .select('*')
    .eq('loja_id', loja.id)
    .eq('canal', canal)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return crmBridgeJson({
      ok: true,
      loja,
      canal,
      canais: CANAIS_VALIDOS,
      mensagens: [],
      migrationPendente: error.message.includes('does not exist'),
    });
  }

  return crmBridgeJson({
    ok: true,
    loja,
    canal,
    canais: CANAIS_VALIDOS,
    mensagens: (data || []).reverse(),
    migrationPendente: false,
  });
}

export async function POST(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const loja = await resolverLojaBridge(req);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404);
  }

  try {
    const body = await req.json();
    const canalRaw = String(body.canal || 'geral').toLowerCase();
    const canal = CANAIS_VALIDOS.includes(canalRaw) ? canalRaw : 'geral';
    const autorNome = String(body.autorNome || 'Vendedor').trim();
    const autorCargo = String(body.autorCargo || 'equipe').trim();
    const mensagem = String(body.mensagem || '').trim();
    const referenciaTicket = String(body.referenciaTicket || '').trim();

    if (!mensagem) {
      return crmBridgeJson({ ok: false, error: 'Mensagem não pode ser vazia.' }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('crm_chat_interno')
      .insert({
        loja_id: loja.id,
        canal,
        autor_nome: autorNome,
        autor_cargo: autorCargo,
        mensagem: mensagem.slice(0, 2000),
        referencia_ticket: referenciaTicket,
      })
      .select('*')
      .single();

    if (error) {
      return crmBridgeJson({ ok: false, error: error.message }, 500);
    }

    return crmBridgeJson({ ok: true, mensagem: data }, 201);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao enviar mensagem.' },
      500
    );
  }
}
