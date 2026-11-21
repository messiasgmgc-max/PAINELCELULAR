import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

const ACADEMY_PADRAO = [
  {
    id: 'builtin-1',
    titulo: 'Script de Abordagem Rápida para Leads de iPhone (WhatsApp)',
    categoria: 'vendas',
    tipo: 'playbook',
    duracao: '4 min',
    video_url: '',
    conteudo_markdown:
      '1. Responda em menos de 3 minutos chamando pelo primeiro nome.\n2. Confirme disponibilidade exata (GB, cor, saúde de bateria) usando a aba Estoque do /crm-sidebar.\n3. Pergunte logo na segunda mensagem: "Vai pagar à vista no Pix, parcelar ou quer dar seu usado na troca?"\n4. Gere o link oficial de proposta para aumentar a taxa de fechamento.',
    builtin: true,
  },
  {
    id: 'builtin-2',
    titulo: 'Como Avaliar Troca (Upgrade) Sem Perder Margem',
    categoria: 'trocas',
    tipo: 'guia',
    duracao: '6 min',
    video_url: '',
    conteudo_markdown:
      '• Sempre peça foto da Saúde da Bateria + 4 ângulos do aparelho antes de cravar valor.\n• Use o botão "Avaliar Foto com IA" no /crm-sidebar para preencher deduções automáticas.\n• Deixe claro: "Pré-avaliação sujeita à conferência presencial de Face ID, câmeras e True Tone."',
    builtin: true,
  },
  {
    id: 'builtin-3',
    titulo: 'Quebra de Objeção no Parcelamento em até 18x',
    categoria: 'vendas',
    tipo: 'script',
    duracao: '5 min',
    video_url: '',
    conteudo_markdown:
      'Nunca mande "juros de X%". Mande o valor da parcela fechado com as taxas reais da loja pelo Simulador.\nExemplo: "Com seu iPhone 13 na entrada, seu 15 Pro sai por apenas 12x de R$ 289 no cartão com 90 dias de garantia."',
    builtin: true,
  },
  {
    id: 'builtin-4',
    titulo: 'Fechando Reserva via Pix Antes do Cliente Sair do Chat',
    categoria: 'conversao',
    tipo: 'guia',
    duracao: '3 min',
    video_url: '',
    conteudo_markdown:
      'Seminovos têm giro rápido (1 unidade por cor/bateria). Quando o cliente pedir tempo para pensar, ofereça segurar a unidade por R$ 200 de sinal na aba Pix — ao pagar, o IMEI trava automaticamente no estoque.',
    builtin: true,
  },
  {
    id: 'builtin-5',
    titulo: 'Pós-Venda Automático & Máquina de Upgrade (D+7 a D+300)',
    categoria: 'pos-venda',
    tipo: 'estrategia',
    duracao: '5 min',
    video_url: '',
    conteudo_markdown:
      '• D+7: Peça avaliação no Google Meu Negócio enquanto a satisfação está no auge.\n• D+180 / D+300: Ative o envio automático mostrando quanto o aparelho do cliente vale na troca hoje.',
    builtin: true,
  },
  {
    id: 'builtin-6',
    titulo: 'Boas Práticas Anti-Ban para Campanhas no WhatsApp',
    categoria: 'campanhas',
    tipo: 'guia',
    duracao: '4 min',
    video_url: '',
    conteudo_markdown:
      '• Mantenha intervalo aleatório entre 25s e 65s e janela das 09h às 19h.\n• Nunca dispare lista fria desconhecida — use os segmentos nativos do ERP (ex: iPhone 7–13, garantia vencendo).\n• Se um chip tomar bloqueio, use "Migrar Tickets" em Ops para transferir atendimentos em segundos.',
    builtin: true,
  },
];

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
    .from('crm_academy_conteudos')
    .select('*')
    .eq('loja_id', loja.id)
    .eq('ativo', true)
    .order('ordem', { ascending: true });

  const custom = ((data || []) as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    builtin: false,
  }));

  return crmBridgeJson(
    {
      ok: true,
      loja,
      conteudos: [...custom, ...ACADEMY_PADRAO],
      migrationPendente: Boolean(error?.message?.includes('does not exist')),
    },
    200,
    req
  );
}

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
    const titulo = String(body.titulo || '').trim();
    if (!titulo) {
      return crmBridgeJson({ ok: false, error: 'Informe o título do treinamento.' }, 400, req);
    }

    const { data, error } = await supabaseAdmin
      .from('crm_academy_conteudos')
      .insert({
        loja_id: loja.id,
        titulo,
        categoria: String(body.categoria || 'vendas').trim(),
        tipo: String(body.tipo || 'guia').trim(),
        duracao: String(body.duracao || '5 min').trim(),
        video_url: String(body.videoUrl || '').trim(),
        conteudo_markdown: String(body.conteudo || '').trim(),
        ordem: Number(body.ordem || 0),
        ativo: true,
      })
      .select('*')
      .single();

    if (error) {
      return crmBridgeJson({ ok: false, error: error.message }, 500, req);
    }

    return crmBridgeJson({ ok: true, conteudo: data }, 201, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao criar conteúdo.' },
      500,
      req
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) {
    return crmBridgeJson({ ok: false, error: 'Informe id para excluir.' }, 400, req);
  }

  const { error } = await supabaseAdmin
    .from('crm_academy_conteudos')
    .delete()
    .eq('id', id)
    .eq('loja_id', loja.id);

  if (error) {
    return crmBridgeJson({ ok: false, error: error.message }, 500, req);
  }

  return crmBridgeJson({ ok: true, deleted: true }, 200, req);
}
