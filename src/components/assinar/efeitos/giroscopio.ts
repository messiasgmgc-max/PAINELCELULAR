'use client';

/**
 * Um único ouvinte de `deviceorientation` para todos os cartões da /assinar.
 *
 * Só liga em aparelho de toque e quando o navegador entrega o giroscópio sem
 * pedir permissão (Android). No iPhone o Safari exige um pedido de permissão;
 * não pedimos: o cartão cai no fallback (inclina seguindo o dedo).
 */

type Ouvinte = (beta: number, gamma: number) => void;

const ouvintes = new Set<Ouvinte>();

function aoOrientar(evento: DeviceOrientationEvent) {
  if (typeof evento.beta !== 'number' || typeof evento.gamma !== 'number') return;
  ouvintes.forEach((o) => o(evento.beta as number, evento.gamma as number));
}

export function giroscopioDisponivel(): boolean {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false;
  const pedePermissao = typeof (window.DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function';
  const toque = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  return toque && !pedePermissao;
}

/** Assina as leituras; devolve a função para cancelar. */
export function assinarOrientacao(ouvinte: Ouvinte): () => void {
  if (ouvintes.size === 0) window.addEventListener('deviceorientation', aoOrientar, { passive: true });
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
    if (ouvintes.size === 0) window.removeEventListener('deviceorientation', aoOrientar);
  };
}
