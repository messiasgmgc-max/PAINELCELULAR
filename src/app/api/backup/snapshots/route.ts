import { NextResponse } from 'next/server';
import { lojaEfetiva, PAPEIS_GESTAO } from '@/lib/auth/acesso';
import { exigirAcesso } from '@/lib/auth/servidor';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { BUCKET_BACKUPS, REGEX_ARQUIVO_SNAPSHOT, type SnapshotBackup } from '@/lib/estoque/backupLoja';

export const dynamic = 'force-dynamic';

/** Validade da URL assinada de download (segundos). */
const VALIDADE_URL_SEGUNDOS = 15 * 60;

/**
 * GET /api/backup/snapshots -> cópias diárias da própria loja no bucket privado
 * `backups`, com URL assinada de download gerada aqui (service role). O bucket
 * não é público e o navegador nunca recebe caminho sem assinatura.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const acesso = await exigirAcesso(request, { lojaId: null, papeis: PAPEIS_GESTAO });
    if (!acesso.ok) return acesso.resposta;

    const lojaId = lojaEfetiva(acesso.usuario, searchParams.get('loja_id'));
    if (!lojaId) return NextResponse.json({ error: 'Seu usuário não está ligado a nenhuma loja.' }, { status: 403 });

    const { data: arquivos, error } = await supabaseAdmin.storage
      .from(BUCKET_BACKUPS)
      .list(lojaId, { limit: 100, sortBy: { column: 'name', order: 'desc' } });
    if (error) {
      // Bucket ainda não criado (migration 20260913_estoque_bucket_backups pendente): lista vazia, não erro.
      if (/not found/i.test(error.message)) return NextResponse.json({ snapshots: [], aviso: 'O bucket de backups ainda não foi criado.' });
      throw error;
    }

    const diarios = (arquivos || []).filter((a) => REGEX_ARQUIVO_SNAPSHOT.test(a.name));
    const snapshots: SnapshotBackup[] = [];
    for (const arquivo of diarios) {
      const caminho = `${lojaId}/${arquivo.name}`;
      const { data: assinada } = await supabaseAdmin.storage
        .from(BUCKET_BACKUPS)
        .createSignedUrl(caminho, VALIDADE_URL_SEGUNDOS, { download: arquivo.name });
      snapshots.push({
        nome: arquivo.name,
        data: arquivo.name.match(REGEX_ARQUIVO_SNAPSHOT)?.[1] || '',
        bytes: typeof arquivo.metadata?.size === 'number' ? arquivo.metadata.size : null,
        criadoEm: arquivo.created_at || null,
        url: assinada?.signedUrl || null,
      });
    }

    return NextResponse.json({ snapshots, validadeSegundos: VALIDADE_URL_SEGUNDOS });
  } catch (err: any) {
    console.error('[Backup] Falha ao listar snapshots:', err);
    return NextResponse.json({ error: err?.message || 'Não foi possível listar os backups.' }, { status: 500 });
  }
}
