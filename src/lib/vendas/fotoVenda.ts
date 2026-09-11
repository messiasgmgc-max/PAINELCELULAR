import { chaveModelo, imeiValido, normalizarCapacidade } from '../pdv/cadastroRapido';

/**
 * Venda inteligente com foto: o que a IA de visão leu na etiqueta, na caixa ou na
 * tela "Ajustes > Geral > Sobre" entra na venda lida do texto.
 *
 * O texto manda no que o lojista escreveu; a foto completa o que faltou. O IMEI da
 * foto só é usado se passar no dígito verificador: um OCR que troca 8 por 3 não
 * pode casar com outro aparelho do estoque e baixá-lo.
 */

export const MAX_FOTOS_VENDA = 3;

export const PROMPT_FOTO_VENDA = `Você lê fotos de celulares para registrar uma VENDA numa loja.
A foto pode ser: etiqueta ou caixa do aparelho, tela "Ajustes > Geral > Sobre" do iPhone, tela de saúde da bateria, tela do *#06#, nota fiscal ou o próprio aparelho.

Extraia só o que estiver legível. Não invente: se não tiver certeza, use null.
Responda SOMENTE com este JSON:
{
  "imeis": ["IMEI com 15 dígitos, só números; inclua IMEI e IMEI2 se aparecerem"],
  "numero_serie": "número de série (ex: F2LXK0ABCD12) ou null",
  "modelo": "nome comercial do modelo (ex: iPhone 13 Pro Max, Galaxy S23) ou null",
  "capacidade": "armazenamento (ex: 128GB, 1TB) ou null",
  "cor": "cor em português ou null",
  "saude_bateria": número inteiro de 1 a 100 ou null,
  "condicao": "novo" se lacrado, "seminovo" se usado, ou null
}

Regras:
- Copie os dígitos do IMEI exatamente como aparecem, sem completar nem corrigir.
- Não confunda IMEI com EID, ICCID, MEID, número do modelo (ex: MLPF3BZ/A, A2633) ou código de barras do produto (EAN/UPC).
- Capacidade é o armazenamento, não a memória RAM.`;

export interface LeituraFotoVenda {
  /** IMEIs de 15 dígitos que passam no dígito verificador, na ordem lida. */
  imeis: string[];
  /** Números lidos como IMEI que não passam no dígito verificador. */
  imeisInvalidos: string[];
  numeroSerie: string | null;
  modelo: string | null;
  capacidade: string | null;
  cor: string | null;
  saudeBateria: number | null;
  condicao: 'novo' | 'seminovo' | null;
}

export type CampoDaFoto = 'imei' | 'numeroSerie' | 'modelo' | 'capacidade' | 'cor' | 'condicao' | 'saudeBateria';

export interface AparelhoLido {
  imei?: string | null;
  numeroSerie?: string | null;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  condicao?: string | null;
  saudeBateria?: number | null;
  [campo: string]: unknown;
}

export interface VendaLida {
  aparelho?: AparelhoLido | null;
  valorTotal?: unknown;
  formaPagamento?: unknown;
  dataVenda?: unknown;
  camposFaltantes?: unknown;
  [campo: string]: unknown;
}

export interface ResultadoFotosVenda {
  /** O que o lojista precisa conferir antes de gravar. */
  avisos: string[];
  /** Campos do aparelho que vieram da foto (e não do texto). */
  camposDaFoto: CampoDaFoto[];
  /** IMEIs válidos das fotos (IMEI 1 e 2), para casar com o estoque. */
  imeis: string[];
}

function textoOuNull(valor: unknown): string | null {
  const texto = String(valor ?? '').trim().replace(/\s+/g, ' ');
  if (!texto || /^(null|undefined|n\/?a|-+|desconhecid[oa]|ileg[ií]vel)$/i.test(texto)) return null;
  return texto;
}

function unicos(valores: string[]): string[] {
  return Array.from(new Set(valores));
}

/** Chave de modelo sem a marca na frente: "Samsung Galaxy S23" e "Galaxy S23" são o mesmo. */
function chaveSemMarca(modelo: string): string {
  return chaveModelo(modelo).replace(/^(?:samsung|motorola|xiaomi|apple)\s+/, '');
}

/** Resposta crua da IA de visão para uma leitura com tipos garantidos. */
export function normalizarLeituraFoto(bruto: unknown): LeituraFotoVenda {
  const dados = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;

  const candidatos = [...(Array.isArray(dados.imeis) ? dados.imeis : []), dados.imei, dados.imei1, dados.imei2];
  const imeis: string[] = [];
  const imeisInvalidos: string[] = [];
  for (const candidato of candidatos) {
    const digitos = String(candidato ?? '').replace(/\D/g, '');
    if (digitos.length < 8) continue;
    const lista = digitos.length === 15 && imeiValido(digitos) ? imeis : imeisInvalidos;
    if (!lista.includes(digitos)) lista.push(digitos);
  }

  // Série é alfanumérica; só dígitos costuma ser IMEI ou EAN lido no campo errado.
  const serie = (textoOuNull(dados.numero_serie ?? dados.numeroSerie) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const numeroSerie = serie.length >= 8 && serie.length <= 14 && !/^\d+$/.test(serie) ? serie : null;

  const bateria = Number(String(dados.saude_bateria ?? dados.saudeBateria ?? '').match(/\d{1,3}/)?.[0]);
  const saudeBateria = Number.isInteger(bateria) && bateria >= 1 && bateria <= 100 ? bateria : null;

  const condicaoTexto = String(dados.condicao ?? '').toLowerCase();
  const condicao = /semi|usad/.test(condicaoTexto) ? 'seminovo' : /novo|lacrad/.test(condicaoTexto) ? 'novo' : null;

  return {
    imeis,
    imeisInvalidos,
    numeroSerie,
    modelo: textoOuNull(dados.modelo),
    capacidade: normalizarCapacidade(textoOuNull(dados.capacidade)),
    cor: textoOuNull(dados.cor),
    saudeBateria,
    condicao,
  };
}

/**
 * Junta as leituras das fotos no aparelho da venda (altera `venda.aparelho`).
 * `null` numa posição = aquela foto não pôde ser lida.
 */
export function mesclarFotosNaVenda(venda: VendaLida, leituras: Array<LeituraFotoVenda | null>): ResultadoFotosVenda {
  const avisos: string[] = [];
  const camposDaFoto: CampoDaFoto[] = [];
  const aparelho: AparelhoLido = venda.aparelho ?? {};
  venda.aparelho = aparelho;

  leituras.forEach((leitura, indice) => {
    if (!leitura) avisos.push(`Não consegui ler a foto ${indice + 1}. Tire outra mais nítida ou digite os dados.`);
  });
  const lidas = leituras.filter((leitura): leitura is LeituraFotoVenda => leitura !== null);
  if (!lidas.length) return { avisos, camposDaFoto, imeis: [] };

  const primeiro = <K extends Exclude<keyof LeituraFotoVenda, 'imeis' | 'imeisInvalidos'>>(campo: K) =>
    lidas.map((leitura) => leitura[campo]).find((valor) => valor !== null) ?? null;

  // IMEI
  const imeis = unicos(lidas.flatMap((leitura) => leitura.imeis));
  const invalidos = unicos(lidas.flatMap((leitura) => leitura.imeisInvalidos));
  const imeiTexto = String(aparelho.imei ?? '').replace(/[\s./-]/g, '');
  if (!imeiTexto) {
    if (imeis.length) {
      aparelho.imei = imeis[0];
      camposDaFoto.push('imei');
    } else if (invalidos.length) {
      avisos.push(`O IMEI lido na foto (${invalidos[0]}) não confere pelo dígito verificador. Não usei: confira o número e digite.`);
    }
  } else if (/^\d{15}$/.test(imeiTexto) && imeis.length && !imeis.includes(imeiTexto)) {
    if (!imeiValido(imeiTexto)) {
      aparelho.imei = imeis[0];
      camposDaFoto.push('imei');
      avisos.push(`O IMEI do texto (${imeiTexto}) não confere pelo dígito verificador; usei o da foto (${imeis[0]}).`);
    } else {
      avisos.push(`O IMEI do texto (${imeiTexto}) é diferente do da foto (${imeis.join(' / ')}). Mantive o do texto: confira.`);
    }
  }

  const serie = primeiro('numeroSerie');
  if (serie) {
    if (!textoOuNull(aparelho.numeroSerie)) {
      aparelho.numeroSerie = serie;
      camposDaFoto.push('numeroSerie');
    }
    // O campo da venda é "IMEI / Nº de Série": sem IMEI, a série identifica o aparelho.
    if (!textoOuNull(aparelho.imei)) {
      aparelho.imei = serie;
      camposDaFoto.push('imei');
    }
  }

  const modelo = primeiro('modelo');
  if (modelo) {
    const modeloTexto = textoOuNull(aparelho.modelo);
    if (!modeloTexto) {
      aparelho.modelo = modelo;
      camposDaFoto.push('modelo');
    } else if (chaveSemMarca(modeloTexto) !== chaveSemMarca(modelo)) {
      avisos.push(`Modelo no texto: ${modeloTexto}; na foto: ${modelo}. Mantive o do texto.`);
    }
  }

  const capacidade = primeiro('capacidade');
  if (capacidade) {
    const capacidadeTexto = normalizarCapacidade(textoOuNull(aparelho.capacidade));
    if (!capacidadeTexto) {
      aparelho.capacidade = capacidade;
      camposDaFoto.push('capacidade');
    } else if (capacidadeTexto !== capacidade) {
      avisos.push(`Capacidade no texto: ${capacidadeTexto}; na foto: ${capacidade}. Mantive a do texto.`);
    }
  }

  const cor = primeiro('cor');
  if (cor && !textoOuNull(aparelho.cor)) {
    aparelho.cor = cor;
    camposDaFoto.push('cor');
  }

  const condicao = primeiro('condicao');
  if (condicao && !textoOuNull(aparelho.condicao)) {
    aparelho.condicao = condicao;
    camposDaFoto.push('condicao');
  }

  const bateria = primeiro('saudeBateria');
  if (bateria && !(Number(aparelho.saudeBateria) > 0)) {
    aparelho.saudeBateria = bateria;
    camposDaFoto.push('saudeBateria');
  }

  const leuAlgo = imeis.length > 0 || invalidos.length > 0 || [serie, modelo, capacidade, cor, condicao, bateria].some((v) => v !== null);
  if (!leuAlgo) {
    avisos.push('A IA não achou dados do aparelho nas fotos. Confira se a etiqueta ou a tela aparece inteira e nítida.');
  }

  return { avisos, camposDaFoto: unicos(camposDaFoto) as CampoDaFoto[], imeis };
}

const CAMPOS_OBRIGATORIOS = ['modelo', 'capacidade', 'valorTotal', 'formaPagamento', 'dataVenda'] as const;
const CAMPOS_OPCIONAIS = new Set(['imei', 'cpf', 'dataNascimento', 'data_nascimento']);

/**
 * Campos que o lojista ainda precisa preencher. Os obrigatórios são conferidos nos
 * dados (a foto ou o regex podem ter preenchido o que a IA do texto listou como
 * faltando); outros campos que a IA listou continuam, menos os opcionais.
 */
export function camposFaltantesDaVenda(venda: VendaLida): string[] {
  const aparelho = venda.aparelho ?? {};
  const presente: Record<(typeof CAMPOS_OBRIGATORIOS)[number], boolean> = {
    modelo: textoOuNull(aparelho.modelo) !== null,
    capacidade: textoOuNull(aparelho.capacidade) !== null,
    valorTotal: Number(venda.valorTotal) > 0,
    formaPagamento: textoOuNull(venda.formaPagamento) !== null,
    dataVenda: textoOuNull(venda.dataVenda) !== null,
  };
  const daIA = Array.isArray(venda.camposFaltantes) ? venda.camposFaltantes.map(String) : [];
  const extras = daIA.filter((campo) => !CAMPOS_OPCIONAIS.has(campo) && !(campo in presente));
  return unicos([...CAMPOS_OBRIGATORIOS.filter((campo) => !presente[campo]), ...extras]);
}
