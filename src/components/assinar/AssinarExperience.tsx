'use client';

import { useEffect, useRef, useState } from 'react';
import { useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import AssinarPage from '@/app/assinar/page';
import { NotebookScene } from '@/components/assinar/NotebookScene';
import { ALTURA_ROLAGEM_VH, PROGRESSO_ENTRADA } from '@/lib/assinar/timeline3d';

/**
 * /assinar/3d — página de teste: a mesma /assinar, com uma abertura em que o
 * usuário "entra" pela tela de um notebook conforme rola.
 *
 * Arquitetura:
 *  - AssinarExperience: decide se há animação (movimento reduzido, suporte a 3D)
 *    e o tamanho de tela. Carregada só no navegador (ver a rota), então lê a
 *    tela de forma síncrona e não troca de layout depois do primeiro desenho.
 *  - CenaComRolagem: container alto (a rolagem vira progresso), palco grudado
 *    (sticky) com a cena, e a página real logo abaixo.
 *  - NotebookScene: notebook em CSS 3D; a tela mostra a página real sem interação.
 *  - A página real começa exatamente 100dvh acima do fim do container. No fim da
 *    animação a tela do notebook (identidade) e a página real coincidem pixel a
 *    pixel; o palco some e a página, com toda a lógica original, recebe os cliques.
 *
 * A lógica de assinatura não é tocada: é o mesmo componente AssinarPage.
 */

const CONSULTA_MOBILE = '(max-width: 767px)';

function navegadorSuporta3d(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('transform-style', 'preserve-3d') &&
    CSS.supports('perspective', '1px')
  );
}

export function AssinarExperience() {
  const reduzirMovimento = useReducedMotion();
  const [suporta3d] = useState(navegadorSuporta3d);
  const [mobile, setMobile] = useState(() => window.matchMedia(CONSULTA_MOBILE).matches);

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA_MOBILE);
    const atualizar = () => setMobile(mq.matches);
    mq.addEventListener('change', atualizar);
    return () => mq.removeEventListener('change', atualizar);
  }, []);

  // Sem animação para quem pediu menos movimento ou navegador sem 3D: a página normal.
  if (reduzirMovimento || !suporta3d) return <AssinarPage />;

  return <CenaComRolagem mobile={mobile} />;
}

function CenaComRolagem({ mobile }: { mobile: boolean }) {
  const [entrou, setEntrou] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (p) => setEntrou(p >= PROGRESSO_ENTRADA));

  const alturaVh = mobile ? ALTURA_ROLAGEM_VH.mobile : ALTURA_ROLAGEM_VH.desktop;

  const entrar = () => {
    const el = containerRef.current;
    if (!el) return;
    const fim = el.offsetTop + el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: fim, behavior: 'smooth' });
  };

  return (
    <div className="bg-slate-950">
      <div ref={containerRef} className="relative z-10" style={{ height: `${alturaVh}dvh` }}>
        <div
          className="sticky top-0 h-[100dvh]"
          style={{ visibility: entrou ? 'hidden' : 'visible', pointerEvents: entrou ? 'none' : 'auto' }}
          aria-hidden={entrou}
        >
          <NotebookScene progresso={scrollYProgress} mobile={mobile} onEntrar={entrar}>
            {/* A página real, só para ver: sem foco, sem cliques, sem leitura por leitores de tela. */}
            <div
              aria-hidden
              className="pointer-events-none h-full w-full select-none overflow-hidden"
              {...({ inert: true } as Record<string, boolean>)}
            >
              <AssinarPage />
            </div>
          </NotebookScene>
        </div>
      </div>

      {/* A página real, alinhada ao topo do palco no fim da animação. */}
      <div className="relative z-0" style={{ marginTop: '-100dvh' }}>
        <AssinarPage />
      </div>
    </div>
  );
}
