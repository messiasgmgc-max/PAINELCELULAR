import { imeiValido } from '../pdv/cadastroRapido';

/**
 * Tratamento do que a câmera leu, igual para o leitor nativo (ML Kit no app)
 * e para o html5-qrcode (navegador e Electron).
 *
 * O valor segue para o `onScan` do jeito de sempre: quem interpreta IMEI e
 * serial (inclusive o "S" do código da caixa da Apple) é o PDV e o cadastro
 * rápido. Aqui só se tira o que atrapalha a comparação: caracteres de controle
 * (FNC1/GS do Code128 e GS1, quebras de linha do QR) e espaço nas pontas.
 */

/**
 * Formatos pedidos ao ML Kit (valores do enum `BarcodeFormat` do plugin).
 * Code128 é o do IMEI e do serial na caixa do iPhone; EAN/UPC dos acessórios;
 * QR e DataMatrix de etiquetas; ITF de caixa de transporte.
 */
export const FORMATOS_LEITOR_NATIVO = [
  'CODE_128',
  'CODE_39',
  'EAN_13',
  'EAN_8',
  'UPC_A',
  'UPC_E',
  'QR_CODE',
  'DATA_MATRIX',
  'ITF',
] as const;

export type FormatoLeitorNativo = (typeof FORMATOS_LEITOR_NATIVO)[number];

/** Mesmo código parado na frente da câmera não é lido de novo antes desse intervalo. */
export const INTERVALO_REPETICAO_MS = 2000;

const CARACTERES_DE_CONTROLE = /[\x00-\x1f\x7f]+/g;

export function normalizarValorLido(bruto: unknown): string {
  return String(bruto ?? '').replace(CARACTERES_DE_CONTROLE, ' ').trim();
}

/** Código como o plugin entrega: `rawValue` é o conteúdo; `displayValue` pode vir formatado. */
export interface CodigoDetectado {
  rawValue?: string | null;
  displayValue?: string | null;
  format?: string | null;
}

/**
 * Escolhe um valor entre os códigos que apareceram no mesmo quadro.
 *
 * A caixa do iPhone tem vários códigos lado a lado (UPC, part number, serial,
 * IMEI). Se um deles é um IMEI válido, é ele que identifica o aparelho;
 * senão, fica o primeiro que o ML Kit devolveu.
 */
export function escolherCodigoLido(codigos: CodigoDetectado[] | null | undefined): string | null {
  const valores = (codigos || [])
    .map((c) => normalizarValorLido(c?.rawValue || c?.displayValue))
    .filter(Boolean);
  if (valores.length === 0) return null;
  return valores.find((v) => imeiValido(v)) ?? valores[0];
}

export interface UltimaLeitura {
  valor: string;
  instante: number;
}

/**
 * O leitor contínuo (PDV em lote) recebe o mesmo código a cada quadro enquanto
 * ele está na frente da câmera. Só aceita de novo depois que o código some por
 * `intervaloMs`: cada repetição renova o instante.
 */
export function registrarLeitura(
  valor: string,
  ultima: UltimaLeitura | null,
  agora: number,
  intervaloMs = INTERVALO_REPETICAO_MS
): { aceitar: boolean; ultima: UltimaLeitura } {
  const repetida = !!ultima && ultima.valor === valor && agora - ultima.instante < intervaloMs;
  return { aceitar: !repetida, ultima: { valor, instante: agora } };
}
