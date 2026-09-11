/**
 * Roteiro da simulação de conversa no WhatsApp em /assinar.
 *
 * É uma ilustração (a tela diz isso): aparelho, fotos e preços são de exemplo.
 * O componente só pergunta "o que aparece no instante t?" e desenha.
 */

export interface MensagemRoteiro {
  id: string;
  autor: 'cliente' | 'bot';
  /** Linhas da mensagem (cada item vira uma linha). */
  linhas: string[];
  /** Quando a mensagem aparece, em ms desde o começo do roteiro. */
  aparecerEmMs: number;
  /** Quanto tempo antes de aparecer mostra "digitando..." (só o bot digita). */
  digitandoMs?: number;
}

export const ROTEIRO_CONVERSA: readonly MensagemRoteiro[] = Object.freeze([
  { id: 'c1', autor: 'cliente', linhas: ['tem 15 Pro Max?'], aparecerEmMs: 700 },
  {
    id: 'b1',
    autor: 'bot',
    linhas: ['Tem sim! iPhone 15 Pro Max em estoque:', '256GB Titânio Natural · bateria 91%', 'R$ 5.290 à vista'],
    aparecerEmMs: 2600,
    digitandoMs: 1100,
  },
  {
    id: 'b2',
    autor: 'bot',
    linhas: ['512GB Preto · bateria 88%', 'R$ 5.790 à vista', 'Quer que eu separe um pra você?'],
    aparecerEmMs: 4300,
    digitandoMs: 900,
  },
  { id: 'c2', autor: 'cliente', linhas: ['quero o de 256 🙌'], aparecerEmMs: 6200 },
]);

/** Pausa com a conversa completa na tela antes de recomeçar. */
export const PAUSA_FINAL_MS = 3800;

export function duracaoDoRoteiro(roteiro: readonly MensagemRoteiro[] = ROTEIRO_CONVERSA): number {
  const ultima = roteiro.reduce((max, m) => Math.max(max, m.aparecerEmMs), 0);
  return ultima + PAUSA_FINAL_MS;
}

export interface EstadoConversa {
  /** Quantas mensagens do começo do roteiro já estão na tela. */
  visiveis: number;
  /** Se o bot está "digitando" a próxima mensagem. */
  digitando: boolean;
}

/** Estado da conversa no instante `tempoMs` (fora do roteiro, repete em ciclo). */
export function estadoDaConversa(tempoMs: number, roteiro: readonly MensagemRoteiro[] = ROTEIRO_CONVERSA): EstadoConversa {
  if (roteiro.length === 0) return { visiveis: 0, digitando: false };
  const duracao = duracaoDoRoteiro(roteiro);
  const t = Number.isFinite(tempoMs) && tempoMs > 0 ? tempoMs % duracao : 0;

  let visiveis = 0;
  for (const m of roteiro) {
    if (t >= m.aparecerEmMs) visiveis += 1;
    else break;
  }
  const proxima = roteiro[visiveis];
  const digitando = Boolean(
    proxima && proxima.autor === 'bot' && proxima.digitandoMs && t >= proxima.aparecerEmMs - proxima.digitandoMs
  );
  return { visiveis, digitando };
}

/** Próximo instante (ms) em que o estado muda — para agendar um único setTimeout. */
export function proximaMudancaEm(tempoMs: number, roteiro: readonly MensagemRoteiro[] = ROTEIRO_CONVERSA): number {
  const duracao = duracaoDoRoteiro(roteiro);
  const t = Number.isFinite(tempoMs) && tempoMs > 0 ? tempoMs % duracao : 0;
  const marcos = roteiro
    .flatMap((m) => (m.digitandoMs ? [m.aparecerEmMs - m.digitandoMs, m.aparecerEmMs] : [m.aparecerEmMs]))
    .concat(duracao)
    .filter((marco) => marco > t)
    .sort((a, b) => a - b);
  return (marcos[0] ?? duracao) - t;
}
