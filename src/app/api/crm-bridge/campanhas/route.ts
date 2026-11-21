import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import {
  calcularDelayAntiBanMs,
  listarDestinatariosSegmento,
  SegmentoCampanha,
  validarJanelaAntiBan,
} from '@/lib/crm-bridge/campanhas';
import { enviarTextoWhatsApp } from '@/lib/whatsappService';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

const SEGMENTOS_DISPONIVEIS: Array<{ id: SegmentoCampanha; label: string }> = [
  { id: 'sem_compra_90d', label: 'Clientes sem compra há 90+ dias' },
  { id: 'upgrade_iphones_antigos', label: 'Compradores de iPhone 7 ao 13 (Oferta Upgrade)' },
  { id: 'garantia_vencendo_30d', label: 'Garantia vencendo nos próximos 30 dias' },
  { id: 'leads_nao_convertidos', label: 'Leads de Anúncio ainda não convertidos' },
  { id: 'todos_clientes', label: 'Base Completa de Clientes' },
];

/**
 * GET /api/crm-bridge/campanhas
 * Lista campanhas anti-ban da loja e a contagem prévia de cada segmento.
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

  const { data, error } = await supabaseAdmin
    .from('crm_campanhas_antiban')
    .select('*')
    .eq('loja_id', loja.id)
    .order('created_at', { ascending: false })
    .limit(40);

  const migrationPendente = Boolean(error?.message?.includes('does not exist'));

  const contagens = await Promise.all(
    SEGMENTOS_DISPONIVEIS.map(async (s) => {
      const lista = await listarDestinatariosSegmento(loja.id, s.id).catch(() => []);
      return { id: s.id, label: s.label, total: lista.length };
    })
  );

  return crmBridgeJson(
    {
      ok: true,
      loja,
      campanhas: data || [],
      segmentos: contagens,
      migrationPendente,
    },
    200,
    req
  );
}

/**
 * POST /api/crm-bridge/campanhas
 * Cria nova campanha com parâmetros de proteção anti-ban.
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const nome = String(body.nome || '').trim();
    const segmento = String(body.segmento || 'sem_compra_90d').trim();
    const mensagem = String(body.mensagem || '').trim();
    if (!nome || !mensagem) {
      return crmBridgeJson({ ok: false, error: 'Informe nome e mensagem da campanha.' }, 400, req);
    }

    const destinatarios = await listarDestinatariosSegmento(loja.id, segmento);

    const { data, error } = await supabaseAdmin
      .from('crm_campanhas_antiban')
      .insert({
        loja_id: loja.id,
        nome,
        segmento,
        mensagem,
        delay_min_seg: Math.max(5, Number(body.delayMinSeg) || 25),
        delay_max_seg: Math.max(10, Number(body.delayMaxSeg) || 65),
        limite_diario: Math.max(1, Math.min(500, Number(body.limiteDiario) || 80)),
        janela_inicio: String(body.janelaInicio || '09:00'),
        janela_fim: String(body.janelaFim || '19:00'),
        status: 'rascunho',
        total_alvo: destinatarios.length,
      })
      .select('*')
      .single();

    if (error) {
      return crmBridgeJson({ ok: false, error: error.message }, 500, req);
    }

    return crmBridgeJson({ ok: true, campanha: data, totalAlvo: destinatarios.length }, 201, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao criar campanha.' },
      500,
      req
    );
  }
}

/**
 * PATCH /api/crm-bridge/campanhas
 * Executa disparo em lote respeitando janela horária, limite diário e intervalo anti-ban.
 */
export async function PATCH(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = String(body.id || '').trim();
    const action = String(body.action || 'disparar_lote').trim();
    if (!id) {
      return crmBridgeJson({ ok: false, error: 'Informe id da campanha.' }, 400, req);
    }

    const { data: camp } = await supabaseAdmin
      .from('crm_campanhas_antiban')
      .select('*')
      .eq('id', id)
      .eq('loja_id', loja.id)
      .maybeSingle();

    if (!camp) {
      return crmBridgeJson({ ok: false, error: 'Campanha não encontrada.' }, 404, req);
    }

    if (action === 'pausar' || action === 'cancelar') {
      const { data: upd } = await supabaseAdmin
        .from('crm_campanhas_antiban')
        .update({ status: action === 'pausar' ? 'pausada' : 'cancelada', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      return crmBridgeJson({ ok: true, campanha: upd }, 200, req);
    }

    const ignorarJanela = Boolean(body.ignorarJanela);
    if (!ignorarJanela) {
      const check = validarJanelaAntiBan(
        String(camp.janela_inicio || '09:00'),
        String(camp.janela_fim || '19:00')
      );
      if (!check.permitido) {
        return crmBridgeJson({ ok: false, error: check.motivo }, 409, req);
      }
    }

    const destinatarios = await listarDestinatariosSegmento(loja.id, String(camp.segmento));
    const jaEnviados = Number(camp.total_enviados) || 0;
    const restanteLimite = Math.max(0, (Number(camp.limite_diario) || 80) - jaEnviados);
    const tamanhoLote = Math.min(
      Math.max(1, Number(body.tamanhoLote) || 10),
      Math.min(20, restanteLimite || 10)
    );

    const fatia = destinatarios.slice(jaEnviados, jaEnviados + tamanhoLote);
    if (fatia.length === 0) {
      await supabaseAdmin
        .from('crm_campanhas_antiban')
        .update({ status: 'concluida', updated_at: new Date().toISOString() })
        .eq('id', id);
      return crmBridgeJson(
        { ok: true, enviadosAgora: 0, concluida: true, mensagem: 'Todos os destinatários já receberam.' },
        200,
        req
      );
    }

    let enviadosAgora = 0;
    let errosAgora = 0;

    for (let i = 0; i < fatia.length; i++) {
      const dest = fatia[i];
      const texto = String(camp.mensagem || '')
        .replace(/\{\{cliente\}\}/g, dest.nome.split(' ')[0] || 'Cliente')
        .replace(/\{\{loja\}\}/g, loja.nome);

      const resWa = await enviarTextoWhatsApp({
        lojaId: loja.id,
        telefone: dest.telefone,
        texto,
      });

      if (resWa.success) enviadosAgora += 1;
      else errosAgora += 1;

      if (i < fatia.length - 1) {
        // Delay aleatório anti-ban limitado a 1500ms dentro da chamada síncrona HTTP para evitar timeout
        const rawDelay = calcularDelayAntiBanMs(
          Number(camp.delay_min_seg) || 25,
          Number(camp.delay_max_seg) || 65
        );
        await new Promise((r) => setTimeout(r, Math.min(rawDelay, 1500)));
      }
    }

    const novoTotalEnviados = jaEnviados + enviadosAgora;
    const novoTotalErros = (Number(camp.total_erros) || 0) + errosAgora;
    const concluida = novoTotalEnviados >= destinatarios.length;

    const { data: campAtualizada } = await supabaseAdmin
      .from('crm_campanhas_antiban')
      .update({
        total_alvo: destinatarios.length,
        total_enviados: novoTotalEnviados,
        total_erros: novoTotalErros,
        status: concluida ? 'concluida' : 'em_andamento',
        ultimo_disparo_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    return crmBridgeJson(
      {
        ok: true,
        enviadosAgora,
        errosAgora,
        concluida,
        campanha: campAtualizada,
      },
      200,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao disparar campanha.' },
      500,
      req
    );
  }
}
