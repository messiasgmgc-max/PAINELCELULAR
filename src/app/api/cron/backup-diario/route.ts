import { NextResponse } from 'next/server';
import { gzipSync } from 'node:zlib';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { BUCKET_BACKUPS, exportarLoja, rodarBackupDiario } from '@/lib/estoque/backupLoja';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Cópia diária de cada loja ativa em Storage (bucket privado `backups`):
 * `<loja_id>/<AAAA-MM-DD>.json.gz`, com limpeza dos arquivos com mais de 30 dias.
 *
 * Disparada pelo Vercel Cron (vercel.json, 06:00 UTC) com
 * `Authorization: Bearer ${CRON_SECRET}`. Sem o segredo configurado a rota não roda.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const resultado = await rodarBackupDiario({
      listarLojas: async () => {
        const { data, error } = await supabaseAdmin.from('lojas').select('id, nome').neq('ativo', false).order('id');
        if (error) throw new Error(`Falha ao listar as lojas: ${error.message}`);
        return (data || []) as Array<{ id: string; nome: string | null }>;
      },
      exportar: (lojaId) => exportarLoja(supabaseAdmin, lojaId),
      compactar: (json) => new Uint8Array(gzipSync(Buffer.from(json, 'utf8'))),
      enviar: async (caminho, conteudo) => {
        const { error } = await supabaseAdmin.storage
          .from(BUCKET_BACKUPS)
          .upload(caminho, Buffer.from(conteudo), { contentType: 'application/gzip', upsert: true });
        if (error) throw new Error(`Falha ao gravar ${caminho}: ${error.message}`);
      },
      listarArquivos: async (lojaId) => {
        const { data, error } = await supabaseAdmin.storage.from(BUCKET_BACKUPS).list(lojaId, { limit: 1000 });
        if (error) throw new Error(error.message);
        return (data || []).map((a) => a.name);
      },
      remover: async (caminhos) => {
        const { error } = await supabaseAdmin.storage.from(BUCKET_BACKUPS).remove(caminhos);
        if (error) throw new Error(error.message);
      },
    });

    for (const r of resultado.resultados) {
      if (!r.ok) console.error(`[Backup diário] Loja ${r.lojaId} (${r.nome || 'sem nome'}): ${r.erro}`);
      else if (r.aviso) console.warn(`[Backup diário] Loja ${r.lojaId}: ${r.aviso}`);
    }

    return NextResponse.json(
      { ok: resultado.falhas === 0, data: resultado.data, lojas: resultado.resultados.length, falhas: resultado.falhas, resultados: resultado.resultados },
      { status: resultado.falhas === 0 ? 200 : 207 }
    );
  } catch (err: any) {
    console.error('[Backup diário] Falha geral:', err);
    return NextResponse.json({ error: err?.message || 'Falha ao rodar o backup diário.' }, { status: 500 });
  }
}
