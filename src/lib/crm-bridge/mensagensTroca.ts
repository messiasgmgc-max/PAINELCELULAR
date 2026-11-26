export interface DadosPreAvaliacaoTroca {
  nomeLoja?: string;
  nomeCliente?: string;
  modeloUsado: string;
  capacidadeUsado?: string;
  valorAvaliado: number;
  modeloNovo?: string;
  valorNovo?: number;
  diferencaPix?: number;
  parcela12x?: number;
}

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Mensagem pronta para pedir os dados do celular usado na troca ("volta do telefone").
 */
export function mensagemPedirAvaliacaoTroca(opts?: {
  nomeCliente?: string;
  nomeLoja?: string;
  modeloInteresse?: string;
}): string {
  const saudacao = opts?.nomeCliente ? `Olá, *${opts.nomeCliente}*! ` : 'Olá! ';
  const interesse = opts?.modeloInteresse
    ? `Para calcular a volta no *${opts.modeloInteresse}*, `
    : 'Para agilizar a avaliação do seu aparelho na troca, ';

  return [
    `📱 *Avaliação do seu aparelho na troca${opts?.nomeLoja ? ` — ${opts.nomeLoja}` : ''}*`,
    '',
    `${saudacao}${interesse}me envie por favor:`,
    '',
    '1️⃣ *Modelo e armazenamento* (ex: iPhone 13 128GB)',
    '2️⃣ *Saúde da bateria (%)* — Ajustes > Bateria > Saúde',
    '3️⃣ *Já teve alguma peça trocada?* (tela, bateria, tampa)',
    '4️⃣ *Face ID, câmeras e botões* funcionam 100%?',
    '5️⃣ *Tem marcas de uso, riscos ou trincados?*',
    '6️⃣ *Possui caixa e cabo original?*',
    '',
    '📸 Se puder, mande *fotos da frente, traseira* e um *print da saúde da bateria*!',
    'Assim já te passo o valor certinho da avaliação e a simulação da volta 🚀',
  ].join('\n');
}

/**
 * Template fixo padrão para orçamento de troca (volta do telefone).
 * Variáveis suportadas:
 *  - {{modelo_usado}}
 *  - {{valor_troca}}
 *  - {{modelo_novo}}
 *  - {{valor_novo}}
 *  - {{valor_volta}}
 *  - {{parcela_12x}}
 */
export const TEMPLATE_ORCAMENTO_TROCA_PADRAO = [
  '📱 *Orçamento de Troca*',
  '',
  'Pegamos o seu *{{modelo_usado}}* com *{{valor_volta}}* de volta no *{{modelo_novo}}* (valor à vista {{valor_novo}}).',
  '',
  '💳 *No cartão:* 12x de {{parcela_12x}}',
  '',
  '✅ *6 meses de garantia*',
  '🎁 *Brindes inclusos:* capa, película e carregador',
  '',
  '_Avaliação sujeita à conferência presencial do aparelho._',
  'Bora fechar? 🚀',
].join('\n');

/**
 * Mensagem pronta com o resultado da pré-avaliação da troca + volta usando template fixo com variáveis.
 */
export function mensagemResultadoAvaliacaoTroca(
  dados: DadosPreAvaliacaoTroca,
  templateCustom?: string
): string {
  const usado = [dados.modeloUsado, dados.capacidadeUsado].filter(Boolean).join(' ') || 'seu aparelho';
  const novo = dados.modeloNovo || 'aparelho escolhido';
  const valorNovo = Number(dados.valorNovo || 0);
  const valorTroca = Number(dados.valorAvaliado || 0);
  const valorVolta =
    dados.diferencaPix != null ? Number(dados.diferencaPix) : Math.max(0, valorNovo - valorTroca);

  const tpl = (templateCustom || TEMPLATE_ORCAMENTO_TROCA_PADRAO).trim();
  let texto = tpl
    .replace(/\{\{modelo_usado\}\}/gi, usado)
    .replace(/\{\{valor_troca\}\}/gi, fmtBRL(valorTroca))
    .replace(/\{\{modelo_novo\}\}/gi, novo)
    .replace(/\{\{valor_novo\}\}/gi, fmtBRL(valorNovo))
    .replace(/\{\{valor_volta\}\}/gi, fmtBRL(valorVolta))
    .replace(
      /\{\{parcela_12x\}\}/gi,
      dados.parcela12x && dados.parcela12x > 0 ? fmtBRL(dados.parcela12x) : fmtBRL(valorVolta / 12)
    );

  if (dados.nomeCliente) {
    texto = `Olá, *${dados.nomeCliente}*!\n\n${texto}`;
  }
  return texto;
}

/**
 * Mensagem pronta para agendar conferência presencial do aparelho usado.
 */
export function mensagemAgendarConferenciaTroca(opts?: {
  nomeCliente?: string;
  nomeLoja?: string;
  modeloNovo?: string;
}): string {
  const saudacao = opts?.nomeCliente ? `Perfeito, *${opts.nomeCliente}*! ` : 'Perfeito! ';
  const prod = opts?.modeloNovo ? ` do *${opts.modeloNovo}*` : '';
  return [
    `${saudacao}Para fecharmos a troca${prod}, fazemos uma conferência rápida do seu aparelho presencialmente (leva cerca de 5 minutinhos).`,
    '',
    '✅ Já transferimos todos os seus dados na hora com segurança.',
    '📍 Qual horário fica melhor para você passar hoje ou amanhã?',
  ].join('\n');
}
