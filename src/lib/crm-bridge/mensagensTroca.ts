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
 * Mensagem pronta com o resultado da pré-avaliação da troca + volta.
 */
export function mensagemResultadoAvaliacaoTroca(dados: DadosPreAvaliacaoTroca): string {
  const usado = [dados.modeloUsado, dados.capacidadeUsado].filter(Boolean).join(' ');
  const linhas: string[] = [
    `🔄 *PRÉ-AVALIAÇÃO DE TROCA${dados.nomeLoja ? ` — ${dados.nomeLoja.toUpperCase()}` : ''}*`,
    '',
  ];

  if (dados.nomeCliente) {
    linhas.push(`Olá, *${dados.nomeCliente}*! Segue sua pré-avaliação:`);
    linhas.push('');
  }

  linhas.push(`📱 Seu aparelho: *${usado}*`);
  linhas.push(`✅ Valor estimado na troca: *${fmtBRL(dados.valorAvaliado)}*`);

  if (dados.modeloNovo && dados.valorNovo && dados.valorNovo > 0) {
    const diff = dados.diferencaPix ?? Math.max(0, dados.valorNovo - dados.valorAvaliado);
    linhas.push('');
    linhas.push(`✨ Aparelho escolhido: *${dados.modeloNovo}* (${fmtBRL(dados.valorNovo)})`);
    linhas.push(`⚡ *Volta no Pix:* ${fmtBRL(diff)}`);
    if (dados.parcela12x && dados.parcela12x > 0) {
      linhas.push(`💳 *Ou em 12x no cartão:* 12x de ${fmtBRL(dados.parcela12x)}`);
    }
  }

  linhas.push('');
  linhas.push('_*Pré-avaliação sujeita à conferência presencial do aparelho na loja._');
  linhas.push('Quer que eu reserve o aparelho ou agende sua visita hoje? 🚀');
  return linhas.join('\n');
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
