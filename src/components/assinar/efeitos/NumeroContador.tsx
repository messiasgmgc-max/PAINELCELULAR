'use client';

import { useInView } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { contadorTerminou, formatarContador, valorDoContador } from '@/lib/assinar/contador';
import { useModoMovimento } from '@/components/assinar/movimento';

interface Props {
  valor: number;
  casas?: number;
  prefixo?: string;
  sufixo?: string;
  duracaoMs?: number;
  className?: string;
}

/**
 * Número que conta de 0 até `valor` quando entra na tela (uma vez).
 * Escreve no textContent a cada frame: nenhum setState durante a contagem.
 * Com menos movimento (ou na prévia) mostra direto o valor final.
 */
export function NumeroContador({ valor, casas = 0, prefixo = '', sufixo = '', duracaoMs = 1400, className }: Props) {
  const animar = useModoMovimento() === 'completo';
  const ref = useRef<HTMLSpanElement>(null);
  const visto = useInView(ref, { once: true, amount: 0.6 });
  const final = formatarContador(valor, casas);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!animar) {
      el.textContent = final;
      return;
    }
    if (!visto) return;
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const decorrido = agora - inicio;
      el.textContent = formatarContador(valorDoContador(0, valor, decorrido, duracaoMs), casas);
      if (!contadorTerminou(decorrido, duracaoMs)) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [animar, visto, valor, casas, duracaoMs, final]);

  return (
    <span className={className} aria-label={`${prefixo}${final}${sufixo}`}>
      <span aria-hidden>{prefixo}</span>
      <span aria-hidden ref={ref} className="tabular-nums">
        {animar ? formatarContador(0, casas) : final}
      </span>
      <span aria-hidden>{sufixo}</span>
    </span>
  );
}
