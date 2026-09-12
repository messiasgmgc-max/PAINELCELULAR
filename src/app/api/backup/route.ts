import { NextResponse } from 'next/server';
import { lojaEfetiva, PAPEIS_GESTAO } from '@/lib/auth/acesso';
import { exigirAcesso } from '@/lib/auth/servidor';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { ehTabelaBackup, exportarLoja, exportarTabela, montarCsv, nomeArquivoBackup } from '@/lib/estoque/backupLoja';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/backup                      -> JSON com todas as tabelas da loja
 * GET /api/backup?formato=csv&tabela=vendas -> CSV de uma tabela
 *
 * Só gestão (admin/gerente) e sempre a própria loja; o super admin pode passar
 * ?loja_id=. O botão "Fazer Backup Agora" de Configurações baixa o arquivo.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const acesso = await exigirAcesso(request, { lojaId: null, papeis: PAPEIS_GESTAO });
    if (!acesso.ok) return acesso.resposta;

    const lojaId = lojaEfetiva(acesso.usuario, searchParams.get('loja_id'));
    if (!lojaId) return NextResponse.json({ error: 'Seu usuário não está ligado a nenhuma loja.' }, { status: 403 });

    const agora = new Date();
    const formato = searchParams.get('formato') === 'csv' ? 'csv' : 'json';

    if (formato === 'csv') {
      const tabela = searchParams.get('tabela');
      if (!ehTabelaBackup(tabela)) {
        return NextResponse.json({ error: 'Informe uma tabela válida em ?tabela=.' }, { status: 400 });
      }
      const csv = montarCsv(await exportarTabela(supabaseAdmin, lojaId, tabela));
      // BOM: o Excel abre acentos certos.
      return new NextResponse(`﻿${csv}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${nomeArquivoBackup(agora, 'csv', tabela)}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const backup = await exportarLoja(supabaseAdmin, lojaId, agora);
    return new NextResponse(JSON.stringify(backup), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomeArquivoBackup(agora, 'json')}"`,
        'Cache-Control': 'no-store',
        'X-Backup-Contagens': JSON.stringify(backup.contagens),
      },
    });
  } catch (err: any) {
    console.error('[Backup] Falha ao exportar a loja:', err);
    return NextResponse.json({ error: err?.message || 'Não foi possível gerar o backup.' }, { status: 500 });
  }
}
