import { estaNoEstoque, type EstadoCicloAparelho } from './ciclo';

/**
 * Edição em massa do estoque: cor, capacidade e observação de vários aparelhos de uma vez.
 *
 * Só campos cadastrais mudam aqui. Ativo, status e saída continuam no módulo de ciclo de
 * vida. A observação é trocada sem perder os trechos técnicos que a lista do WhatsApp,
 * as etiquetas e a remontagem leem ("ID: ...", "Bateria: ...", "IMEI: ...").
 */

export interface AparelhoEditavel extends EstadoCicloAparelho {
  id: string;
  marca?: string | null;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  imei?: string | null;
  observacoes?: string | null;
}

export interface GrupoModelo {
  modelo: string;
  aparelhos: AparelhoEditavel[];
}

/** O que a pessoa escolheu mudar. null = não mexer; observação '' = apagar. */
export interface MudancasEmMassa {
  cor: string | null;
  capacidade: string | null;
  observacao: string | null;
}

const SEGMENTO_TECNICO = /^(ID|IMEI|Bateria|Saúde|Saude|BAIXA_ESTOQUE)\s*:/i;
const ROTULO_OBSERVACAO = /^(obs|observa[cç][aã]o|observa[cç][oõ]es)\s*:\s*/i;

export function nomeDoModelo(modelo: unknown): string {
  const texto = typeof modelo === 'string' ? modelo.replace(/^Apple\s+/i, '').trim() : '';
  return texto || 'Sem modelo';
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** Aparelhos no estoque agrupados por modelo, em ordem natural ("iPhone 11" antes de "iPhone 16"). */
export function agruparPorModelo(aparelhos: AparelhoEditavel[]): GrupoModelo[] {
  const grupos = new Map<string, AparelhoEditavel[]>();
  for (const aparelho of aparelhos) {
    if (!estaNoEstoque(aparelho)) continue;
    const modelo = nomeDoModelo(aparelho.modelo);
    const lista = grupos.get(modelo) || [];
    lista.push(aparelho);
    grupos.set(modelo, lista);
  }

  const comparar = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
  return Array.from(grupos.entries())
    .sort(([a], [b]) => comparar(a, b))
    .map(([modelo, lista]) => ({
      modelo,
      aparelhos: [...lista].sort(
        (a, b) =>
          comparar(texto(a.capacidade), texto(b.capacidade)) ||
          comparar(texto(a.cor), texto(b.cor)) ||
          comparar(texto(a.imei), texto(b.imei))
      ),
    }));
}

/** Cores já usadas para o modelo na loja (qualquer situação), da mais comum para a menos. */
export function coresUsadas(modelo: string, aparelhos: AparelhoEditavel[]): string[] {
  const alvo = nomeDoModelo(modelo).toLowerCase();
  const contagem = new Map<string, number>();
  for (const aparelho of aparelhos) {
    if (nomeDoModelo(aparelho.modelo).toLowerCase() !== alvo) continue;
    const cor = texto(aparelho.cor);
    if (!cor) continue;
    contagem.set(cor, (contagem.get(cor) || 0) + 1);
  }
  return Array.from(contagem.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([cor]) => cor);
}

function segmentos(observacoes: unknown): string[] {
  return String(observacoes ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Observação atual para mostrar na tela: o texto livre, sem "Obs:" e sem os trechos técnicos. */
export function observacaoAtual(observacoes: unknown): string {
  return segmentos(observacoes)
    .filter((s) => !SEGMENTO_TECNICO.test(s))
    .map((s) => s.replace(ROTULO_OBSERVACAO, '').trim())
    .filter(Boolean)
    .join(' | ');
}

/** Troca o texto livre da observação e mantém ID, bateria e IMEI. Texto vazio apaga a observação. */
export function trocarObservacao(observacoes: unknown, nova: string): string {
  const tecnicos = segmentos(observacoes).filter((s) => SEGMENTO_TECNICO.test(s));
  const limpa = nova.replace(/\|/g, '/').trim();
  return [limpa ? `Obs: ${limpa}` : '', ...tecnicos].filter(Boolean).join(' | ');
}

/** Campos que mudam neste aparelho, ou null se nada muda. */
export function montarAlteracao(aparelho: AparelhoEditavel, mudancas: MudancasEmMassa): Record<string, string> | null {
  const dados: Record<string, string> = {};

  const cor = mudancas.cor?.trim();
  if (cor && cor !== texto(aparelho.cor)) dados.cor = cor;

  const capacidade = mudancas.capacidade?.trim();
  if (capacidade && capacidade !== texto(aparelho.capacidade)) dados.capacidade = capacidade;

  if (mudancas.observacao !== null) {
    const nova = trocarObservacao(aparelho.observacoes, mudancas.observacao);
    if (nova !== String(aparelho.observacoes ?? '').trim()) dados.observacoes = nova;
  }

  return Object.keys(dados).length > 0 ? dados : null;
}
