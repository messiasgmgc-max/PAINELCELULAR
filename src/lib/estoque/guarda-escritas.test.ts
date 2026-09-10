import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Teste-guarda do ciclo de vida do estoque.
 *
 * Falha se alguma escrita na tabela `aparelhos` puder mudar `ativo`/`status`
 * sem passar por `src/lib/estoque/` — que é o único lugar que grava a linha
 * correspondente em `movimentacoes_estoque`. Foi a ausência dessa trilha que
 * deixou o incidente de 10/09/2026 invisível até a loja abrir de manhã.
 *
 * Toda escrita direta que sobrar fora do módulo precisa declarar por que é
 * segura, com um comentário na linha do `.from('aparelhos')` ou até 3 linhas
 * acima:
 *   // estoque-guard: sem-ciclo  -> não mexe em ativo/status/data_saida/motivo_saida
 *   // estoque-guard: auditado   -> insert seguido de registrarEntradaEstoque
 *
 * O marcador é uma afirmação revisável, não uma licença: DELETE em `aparelhos`
 * falha mesmo com marcador.
 */

const RAIZ = resolve(process.cwd(), 'src');
const MODULO_ESTOQUE = join(RAIZ, 'lib', 'estoque') + sep;

function listarFontes(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === 'node_modules' || nome === '.next') continue;
      saida.push(...listarFontes(caminho));
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      saida.push(caminho);
    }
  }
  return saida;
}

const REGEX_FROM_APARELHOS = /\.from\(\s*(['"`])aparelhos\1\s*\)/g;
const REGEX_ESCRITA = /\.(update|insert|upsert|delete)\s*\(/;
const REGEX_MARCADOR = /estoque-guard:\s*(sem-ciclo|auditado)/;

interface Ocorrencia {
  arquivo: string;
  linha: number;
  operacao: string;
  trecho: string;
  marcador: string | null;
}

/** Recorta a instrução que começa no `.from('aparelhos')`: até o `;` ou ~900 caracteres. */
function recortarInstrucao(fonte: string, inicio: number): string {
  const fimPontoVirgula = fonte.indexOf(';', inicio);
  const limite = inicio + 900;
  const fim = fimPontoVirgula === -1 ? limite : Math.min(fimPontoVirgula, limite);
  const trecho = fonte.slice(inicio, fim);
  // Uma nova consulta encadeada no recorte já é outra instrução.
  const proxima = trecho.slice(1).search(/\.from\(/);
  return proxima === -1 ? trecho : trecho.slice(0, proxima + 1);
}

function procurarMarcador(linhas: string[], indiceLinha: number): string | null {
  for (let i = indiceLinha; i >= Math.max(0, indiceLinha - 3); i -= 1) {
    const achado = linhas[i].match(REGEX_MARCADOR);
    if (achado) return achado[1];
    // Linha anterior terminando em ';' pertence a outra instrução.
    if (i < indiceLinha && linhas[i].trim().endsWith(';')) break;
  }
  return null;
}

function mapearEscritas(): Ocorrencia[] {
  const ocorrencias: Ocorrencia[] = [];

  for (const arquivo of listarFontes(RAIZ)) {
    if (arquivo.startsWith(MODULO_ESTOQUE)) continue;

    const fonte = readFileSync(arquivo, 'utf8');
    const linhas = fonte.split(/\r?\n/);

    for (const achado of fonte.matchAll(REGEX_FROM_APARELHOS)) {
      const inicio = achado.index ?? 0;
      const instrucao = recortarInstrucao(fonte, inicio);
      const escrita = instrucao.match(REGEX_ESCRITA);
      if (!escrita) continue;

      const indiceLinha = fonte.slice(0, inicio).split(/\r?\n/).length - 1;
      ocorrencias.push({
        arquivo: relative(process.cwd(), arquivo).split(sep).join('/'),
        linha: indiceLinha + 1,
        operacao: escrita[1],
        trecho: instrucao.replace(/\s+/g, ' ').slice(0, 140),
        marcador: procurarMarcador(linhas, indiceLinha),
      });
    }
  }

  return ocorrencias;
}

function formatar(lista: Ocorrencia[]): string {
  return lista.map((o) => `  ${o.arquivo}:${o.linha}  .${o.operacao}()  ${o.trecho}`).join('\n');
}

describe('Guarda: toda escrita de ciclo de vida em aparelhos é auditada', () => {
  const escritas = mapearEscritas();

  it('encontra as escritas (o próprio guarda não está cego)', () => {
    // Sanidade: se a varredura parar de achar o padrão, o teste passaria à toa.
    const fonteModulo = readFileSync(join(MODULO_ESTOQUE, 'movimentacoes.ts'), 'utf8');
    assert.match(fonteModulo, REGEX_FROM_APARELHOS);
    assert.ok(listarFontes(RAIZ).length > 50, 'a varredura deveria ver o código-fonte inteiro');
  });

  it('nenhuma escrita direta em aparelhos fica sem justificativa', () => {
    const semMarcador = escritas.filter((o) => o.operacao !== 'delete' && !o.marcador);
    assert.equal(
      semMarcador.length,
      0,
      'Escritas em aparelhos fora de src/lib/estoque sem "estoque-guard":\n' +
        formatar(semMarcador) +
        '\n\nSe muda ativo/status, use aplicarMudancaEstoque. Se é cadastro, chame registrarEntradaEstoque e marque ' +
        '"estoque-guard: auditado". Se garantidamente não toca o ciclo de vida, marque "estoque-guard: sem-ciclo".'
    );
  });

  it('não existe DELETE em aparelhos fora do módulo de estoque', () => {
    const deletes = escritas.filter((o) => o.operacao === 'delete');
    assert.equal(
      deletes.length,
      0,
      'DELETE físico em aparelhos apaga o histórico do aparelho. Converta para baixa com ' +
        "patchSaida('baixado', 'baixa_manual'):\n" +
        formatar(deletes)
    );
  });

  it('insert marcado como sem-ciclo é um erro de classificação', () => {
    // Um cadastro sempre inicia o ciclo de vida (entrada no estoque).
    const inserts = escritas.filter((o) => (o.operacao === 'insert' || o.operacao === 'upsert') && o.marcador === 'sem-ciclo');
    assert.equal(
      inserts.length,
      0,
      'Cadastro de aparelho é entrada no estoque: registre com registrarEntradaEstoque e marque "auditado":\n' +
        formatar(inserts)
    );
  });
});

describe('Guarda: condicao nunca recebe "vendido"', () => {
  it('nenhum código grava o literal condicao: "vendido"', () => {
    const regex = /\bcondicao\s*:\s*(['"`])vendido\1/g;
    const achados: string[] = [];

    for (const arquivo of listarFontes(RAIZ)) {
      const fonte = readFileSync(arquivo, 'utf8');
      for (const achado of fonte.matchAll(regex)) {
        const linha = fonte.slice(0, achado.index ?? 0).split(/\r?\n/).length;
        achados.push(`  ${relative(process.cwd(), arquivo).split(sep).join('/')}:${linha}`);
      }
    }

    assert.equal(
      achados.length,
      0,
      "condicao é o estado físico do aparelho. Para venda use status='vendido' (patchSaida):\n" + achados.join('\n')
    );
  });
});
