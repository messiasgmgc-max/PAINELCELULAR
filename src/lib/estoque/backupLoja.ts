import type { SupabaseClient } from '@supabase/supabase-js';
import { buscarTodasPaginas } from '../supabase/paginar';

/**
 * Backup dos dados de uma loja.
 *
 * O botão "Fazer Backup Agora" de Configurações esperava 2 segundos e dizia que
 * tinha dado certo, sem copiar nada. Aqui fica o que o backup de verdade exporta
 * (a rota GET /api/backup e a cópia diária em /api/cron/backup-diario usam as
 * mesmas funções) e as regras dos arquivos guardados no Storage.
 */

/** Tabelas com `loja_id` que formam o backup. `lojas` fica de fora: guarda token do Mercado Pago. */
export const TABELAS_BACKUP = [
  'aparelhos',
  'vendas',
  'clientes',
  'ordens_servico',
  'garantias',
  'lojistas_devedores',
  'pecas',
  'tecnicos',
  'agendamentos',
] as const;
export type TabelaBackup = (typeof TABELAS_BACKUP)[number];

export const VERSAO_BACKUP = 1;
export const BUCKET_BACKUPS = 'backups';
export const DIAS_RETENCAO_SNAPSHOT = 30;
/** Nome do arquivo diário dentro da pasta da loja: AAAA-MM-DD.json.gz */
export const REGEX_ARQUIVO_SNAPSHOT = /^(\d{4}-\d{2}-\d{2})\.json\.gz$/;

export type LinhaBackup = Record<string, unknown>;

/** Cópia diária listada em Configurações (GET /api/backup/snapshots). */
export interface SnapshotBackup {
  nome: string;
  data: string;
  bytes: number | null;
  criadoEm: string | null;
  /** URL assinada, válida por poucos minutos. */
  url: string | null;
}

export interface BackupLoja {
  versao: number;
  loja_id: string;
  gerado_em: string;
  contagens: Record<TabelaBackup, number>;
  tabelas: Record<TabelaBackup, LinhaBackup[]>;
}

export function ehTabelaBackup(valor: unknown): valor is TabelaBackup {
  return typeof valor === 'string' && (TABELAS_BACKUP as readonly string[]).includes(valor);
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === 'object' && 'message' in erro) return String((erro as { message: unknown }).message);
  return String(erro);
}

/** Todas as linhas da tabela da loja, paginando além do limite de 1000 do PostgREST. */
export async function exportarTabela(supabase: SupabaseClient, lojaId: string, tabela: TabelaBackup): Promise<LinhaBackup[]> {
  try {
    return await buscarTodasPaginas<LinhaBackup>((de, ate) =>
      supabase.from(tabela).select('*').eq('loja_id', lojaId).order('id').range(de, ate)
    );
  } catch (erro) {
    throw new Error(`Falha ao exportar ${tabela}: ${mensagemDeErro(erro)}`);
  }
}

export async function exportarLoja(supabase: SupabaseClient, lojaId: string, agora: Date = new Date()): Promise<BackupLoja> {
  const tabelas = {} as Record<TabelaBackup, LinhaBackup[]>;
  const contagens = {} as Record<TabelaBackup, number>;
  for (const tabela of TABELAS_BACKUP) {
    tabelas[tabela] = await exportarTabela(supabase, lojaId, tabela);
    contagens[tabela] = tabelas[tabela].length;
  }
  return { versao: VERSAO_BACKUP, loja_id: lojaId, gerado_em: agora.toISOString(), contagens, tabelas };
}

/** CSV com todas as colunas que aparecem nas linhas; jsonb vai como JSON. */
export function montarCsv(linhas: LinhaBackup[]): string {
  if (linhas.length === 0) return '';
  const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
  const celula = (valor: unknown) => {
    if (valor === null || valor === undefined) return '';
    const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
    return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return [colunas.map(celula).join(','), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(','))].join('\r\n');
}

/** Data AAAA-MM-DD no horário de Brasília. */
export function dataNoFusoDaLoja(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

export function caminhoSnapshot(lojaId: string, data: string): string {
  return `${lojaId}/${data}.json.gz`;
}

export function nomeArquivoBackup(agora: Date, formato: 'json' | 'csv', tabela?: TabelaBackup): string {
  const data = dataNoFusoDaLoja(agora);
  return formato === 'csv' ? `backup-${tabela || 'tabela'}-${data}.csv` : `backup-loja-${data}.json`;
}

/** Arquivos diários com mais de `dias` dias (o de exatamente `dias` dias atrás fica). */
export function snapshotsExpirados(arquivos: string[], agora: Date, dias: number = DIAS_RETENCAO_SNAPSHOT): string[] {
  const limite = dataNoFusoDaLoja(new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000));
  return arquivos.filter((nome) => {
    const data = nome.match(REGEX_ARQUIVO_SNAPSHOT)?.[1];
    return Boolean(data && data < limite);
  });
}

// ── Cópia diária ────────────────────────────────────────────────────────────

export interface DependenciasBackupDiario {
  listarLojas: () => Promise<Array<{ id: string; nome?: string | null }>>;
  exportar: (lojaId: string) => Promise<BackupLoja>;
  compactar: (json: string) => Uint8Array;
  enviar: (caminho: string, conteudo: Uint8Array) => Promise<void>;
  /** Nomes dos arquivos na pasta da loja. */
  listarArquivos: (lojaId: string) => Promise<string[]>;
  remover: (caminhos: string[]) => Promise<void>;
}

export interface ResultadoBackupLoja {
  lojaId: string;
  nome: string | null;
  ok: boolean;
  caminho?: string;
  bytes?: number;
  linhas?: number;
  removidos: string[];
  erro?: string;
  aviso?: string;
}

export async function rodarBackupDiario(
  deps: DependenciasBackupDiario,
  agora: Date = new Date()
): Promise<{ data: string; resultados: ResultadoBackupLoja[]; falhas: number }> {
  const data = dataNoFusoDaLoja(agora);
  const lojas = await deps.listarLojas();
  const resultados: ResultadoBackupLoja[] = [];

  // Uma loja por vez: a falha de uma não impede o backup das outras.
  for (const loja of lojas) {
    const resultado: ResultadoBackupLoja = { lojaId: loja.id, nome: loja.nome ?? null, ok: false, removidos: [] };
    try {
      const backup = await deps.exportar(loja.id);
      const conteudo = deps.compactar(JSON.stringify(backup));
      const caminho = caminhoSnapshot(loja.id, data);
      await deps.enviar(caminho, conteudo);
      Object.assign(resultado, {
        ok: true,
        caminho,
        bytes: conteudo.byteLength,
        linhas: Object.values(backup.contagens).reduce((soma, n) => soma + n, 0),
      });
    } catch (erro) {
      resultado.erro = mensagemDeErro(erro);
    }

    // Só limpa depois de gravar o de hoje: se o backup falhou, os antigos continuam lá.
    if (resultado.ok) {
      try {
        const antigos = snapshotsExpirados(await deps.listarArquivos(loja.id), agora);
        if (antigos.length > 0) await deps.remover(antigos.map((nome) => `${loja.id}/${nome}`));
        resultado.removidos = antigos;
      } catch (erro) {
        resultado.aviso = `Backup gravado, mas a limpeza dos antigos falhou: ${mensagemDeErro(erro)}`;
      }
    }
    resultados.push(resultado);
  }

  return { data, resultados, falhas: resultados.filter((r) => !r.ok).length };
}
