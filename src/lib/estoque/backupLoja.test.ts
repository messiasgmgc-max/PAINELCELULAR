import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TABELAS_BACKUP,
  caminhoSnapshot,
  dataNoFusoDaLoja,
  ehTabelaBackup,
  exportarLoja,
  montarCsv,
  rodarBackupDiario,
  snapshotsExpirados,
  type BackupLoja,
} from './backupLoja';
import { criarSupabaseFake } from './testes/supabaseFake';

describe('exportarLoja', () => {
  it('pagina além de 1000 linhas e só leva a própria loja', async () => {
    const aparelhos = [
      ...Array.from({ length: 2500 }, (_, i) => ({ id: `a${String(i).padStart(5, '0')}`, loja_id: 'LOJA' })),
      { id: 'outra', loja_id: 'OUTRA' },
    ];
    const fake = criarSupabaseFake({ aparelhos, vendas: [{ id: 'v1', loja_id: 'LOJA' }] });

    const backup = await exportarLoja(fake.client, 'LOJA', new Date('2026-09-11T09:00:00Z'));

    assert.equal(backup.contagens.aparelhos, 2500);
    assert.ok(backup.tabelas.aparelhos.every((a) => a.loja_id === 'LOJA'));
    assert.equal(backup.contagens.vendas, 1);
    assert.equal(backup.contagens.clientes, 0);
    assert.deepEqual(Object.keys(backup.tabelas).sort(), [...TABELAS_BACKUP].sort());
    const leiturasAparelhos = fake.chamadas.filter((c) => c.tabela === 'aparelhos');
    assert.equal(leiturasAparelhos.length, 3, '2500 linhas = 3 páginas de 1000');
  });
});

describe('montarCsv', () => {
  it('usa todas as colunas, escapa aspas e serializa jsonb', () => {
    const csv = montarCsv([
      { id: '1', nome: 'Ana "Cel"', itens: [{ a: 1 }] },
      { id: '2', telefone: '11 9999' },
    ]);
    const [cabecalho, l1, l2] = csv.split('\r\n');
    assert.equal(cabecalho, 'id,nome,itens,telefone');
    assert.equal(l1, '1,"Ana ""Cel""","[{""a"":1}]",');
    assert.equal(l2, '2,,,11 9999');
  });

  it('tabela vazia vira texto vazio', () => {
    assert.equal(montarCsv([]), '');
  });
});

describe('arquivos diários', () => {
  it('data e caminho no horário de Brasília', () => {
    // 01:30 UTC ainda é o dia anterior em São Paulo.
    assert.equal(dataNoFusoDaLoja(new Date('2026-09-12T01:30:00Z')), '2026-09-11');
    assert.equal(caminhoSnapshot('LOJA', '2026-09-11'), 'LOJA/2026-09-11.json.gz');
  });

  it('apaga só os com mais de 30 dias', () => {
    const agora = new Date('2026-09-11T06:00:00Z');
    const expirados = snapshotsExpirados(
      ['2026-09-11.json.gz', '2026-08-12.json.gz', '2026-08-11.json.gz', '2026-01-01.json.gz', 'leia-me.txt'],
      agora
    );
    assert.deepEqual(expirados, ['2026-08-11.json.gz', '2026-01-01.json.gz']);
  });

  it('reconhece só as tabelas do backup', () => {
    assert.equal(ehTabelaBackup('vendas'), true);
    assert.equal(ehTabelaBackup('lojas'), false);
    assert.equal(ehTabelaBackup('../vendas'), false);
  });
});

describe('rodarBackupDiario', () => {
  const backupVazio = (lojaId: string): BackupLoja => ({
    versao: 1,
    loja_id: lojaId,
    gerado_em: '',
    contagens: Object.fromEntries(TABELAS_BACKUP.map((t) => [t, 2])) as BackupLoja['contagens'],
    tabelas: Object.fromEntries(TABELAS_BACKUP.map((t) => [t, []])) as unknown as BackupLoja['tabelas'],
  });

  it('a falha de uma loja não impede as outras e só limpa quem gravou', async () => {
    const enviados: string[] = [];
    const removidos: string[][] = [];
    const r = await rodarBackupDiario(
      {
        listarLojas: async () => [{ id: 'L1', nome: 'Um' }, { id: 'L2', nome: 'Dois' }],
        exportar: async (lojaId) => {
          if (lojaId === 'L1') throw new Error('timeout');
          return backupVazio(lojaId);
        },
        compactar: (json) => new TextEncoder().encode(json),
        enviar: async (caminho) => {
          enviados.push(caminho);
        },
        listarArquivos: async () => ['2026-09-11.json.gz', '2026-07-01.json.gz'],
        remover: async (caminhos) => {
          removidos.push(caminhos);
        },
      },
      new Date('2026-09-11T06:00:00Z')
    );

    assert.equal(r.data, '2026-09-11');
    assert.equal(r.falhas, 1);
    assert.equal(r.resultados[0].ok, false);
    assert.match(r.resultados[0].erro || '', /timeout/);
    assert.deepEqual(enviados, ['L2/2026-09-11.json.gz']);
    assert.deepEqual(removidos, [['L2/2026-07-01.json.gz']]);
    assert.equal(r.resultados[1].linhas, TABELAS_BACKUP.length * 2);
  });
});
