import { chaveModelo, normalizarCapacidade } from '@/lib/pdv/cadastroRapido';

/**
 * Qual aparelho do estoque entra na venda lida pela IA ("Importar pedido").
 *
 * Antes bastava o nome conter o modelo. O texto dizia "17 Pro Max 256GB Silver, IMEI
 * 358015861866305"; esse IMEI não estava no estoque, e a venda levou o 17 Pro Max Azul
 * de final 8822, que saiu do estoque vendido para a cliente errada.
 *
 * Regra: IMEI informado só casa com esse IMEI. Sem IMEI, só quando há um único aparelho
 * do mesmo modelo, capacidade e cor. Mais de um candidato: a pessoa escolhe.
 */

export interface AparelhoCandidato {
  id: string;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  imei?: string | null;
}

export type EscolhaAparelhoIA<T> =
  | { tipo: 'estoque'; aparelho: T }
  | { tipo: 'criar' }
  | { tipo: 'ambiguo'; candidatos: T[] };

const digitos = (valor: unknown) => String(valor ?? '').replace(/\D/g, '');
const textoCor = (valor: unknown) =>
  String(valor ?? '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .trim()
    .toLowerCase();

function corCompativel(cadastrada: unknown, informada: string): boolean {
  if (!informada) return true;
  const cor = textoCor(cadastrada);
  return !!cor && (cor.includes(informada) || informada.includes(cor));
}

export function escolherAparelhoParaVendaIA<T extends AparelhoCandidato>(params: {
  aparelhos: T[];
  imei?: unknown;
  modelo?: unknown;
  capacidade?: unknown;
  cor?: unknown;
}): EscolhaAparelhoIA<T> {
  const chave = chaveModelo(typeof params.modelo === 'string' ? params.modelo : '');
  const doModelo = (a: T) => !chave || chaveModelo(a.modelo) === chave;

  const imei = digitos(params.imei);
  if (imei.length >= 4) {
    const candidatos = params.aparelhos.filter((a) => {
      const cadastrado = digitos(a.imei);
      if (cadastrado.length < 4) return false;
      if (imei.length >= 15 && cadastrado.length >= 15) return imei === cadastrado;
      // Final de IMEI (a lista do MercadoPhone guarda 4 dígitos) repete entre aparelhos:
      // só vale junto com o modelo.
      const [menor, maior] = imei.length <= cadastrado.length ? [imei, cadastrado] : [cadastrado, imei];
      return maior.endsWith(menor) && doModelo(a);
    });
    if (candidatos.length === 1) return { tipo: 'estoque', aparelho: candidatos[0] };
    return candidatos.length === 0 ? { tipo: 'criar' } : { tipo: 'ambiguo', candidatos };
  }

  if (!chave) return { tipo: 'criar' };

  const capacidade = normalizarCapacidade(typeof params.capacidade === 'string' ? params.capacidade : null);
  const cor = textoCor(params.cor);
  const candidatos = params.aparelhos.filter(
    (a) =>
      doModelo(a) &&
      (!capacidade || normalizarCapacidade(a.capacidade) === capacidade) &&
      corCompativel(a.cor, cor)
  );
  if (candidatos.length === 1) return { tipo: 'estoque', aparelho: candidatos[0] };
  return candidatos.length === 0 ? { tipo: 'criar' } : { tipo: 'ambiguo', candidatos };
}
