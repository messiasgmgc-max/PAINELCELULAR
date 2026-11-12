import { NextResponse } from 'next/server';
import { exigirAcesso } from '@/lib/auth/servidor';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  buscarGrupoWhatsAppPorNome,
  enviarTextoWhatsApp,
  formatarTelefoneWhatsApp,
} from '@/lib/whatsappService';

const TELEFONE_DONO_FALLBACK = '5531993586377';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lojaId, textoRelatorio } = body || {};

    const acesso = await exigirAcesso(request, { lojaId: lojaId || null });
    if (!acesso.ok) return acesso.resposta;

    const texto = typeof textoRelatorio === 'string' ? textoRelatorio.trim() : '';
    if (!texto) {
      return NextResponse.json(
        { error: 'textoRelatorio é obrigatório' },
        { status: 400 }
      );
    }

    let pvDestino = TELEFONE_DONO_FALLBACK;
    if (lojaId) {
      const { data: loja } = await supabaseAdmin
        .from('lojas')
        .select('dono_whatsapp, telefone')
        .eq('id', lojaId)
        .maybeSingle();

      const rawPv = loja?.dono_whatsapp || loja?.telefone || '';
      const formatted = formatarTelefoneWhatsApp(rawPv);
      if (formatted && formatted.length >= 10) {
        pvDestino = formatted;
      }
    }

    const [pvResultado, grupoEstoqueJid] = await Promise.all([
      enviarTextoWhatsApp({ lojaId: lojaId || null, telefone: pvDestino, texto }),
      buscarGrupoWhatsAppPorNome(lojaId || null, 'ESTOQUE'),
    ]);

    let grupoResultado: { jid: string; success: boolean; error?: string } | null = null;
    if (grupoEstoqueJid) {
      const resGrupo = await enviarTextoWhatsApp({
        lojaId: lojaId || null,
        telefone: grupoEstoqueJid,
        texto,
      });
      grupoResultado = { jid: grupoEstoqueJid, ...resGrupo };
    }

    return NextResponse.json({
      success: pvResultado.success || Boolean(grupoResultado?.success),
      pv: { destino: pvDestino, ...pvResultado },
      grupoEstoque: grupoResultado,
    });
  } catch (err: any) {
    console.error('[Conferência Notificar] Erro inesperado:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro ao enviar notificação da conferência' },
      { status: 500 }
    );
  }
}
