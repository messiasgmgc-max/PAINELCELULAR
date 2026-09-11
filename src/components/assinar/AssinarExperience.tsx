'use client';

import { useEffect, useRef, useState } from 'react';
import { useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import AssinarPage from '@/components/assinar/AssinarPage';
import { NotebookScene } from '@/components/assinar/NotebookScene';
import { ALTURA_ROLAGEM_VH, PROGRESSO_ENTRADA } from '@/lib/assinar/timeline3d';

/**
 * /assinar — a página de assinatura com uma abertura em que o usuário "entra"
 * pela tela de um notebook (celular, no mobile) conforme rola.
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
  // Quem tem "efeitos de animação" desligados no sistema vê a página normal, mas com aviso
  // e a opção de ver a animação mesmo assim (ou ?animacao=1 na URL).
  const [forcarAnimacao, setForcarAnimacao] = useState(
    () => new URLSearchParams(window.location.search).get('animacao') === '1'
  );

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA_MOBILE);
    const atualizar = () => setMobile(mq.matches);
    mq.addEventListener('change', atualizar);
    return () => mq.removeEventListener('change', atualizar);
  }, []);

  // Sem animação para quem pediu menos movimento ou navegador sem 3D: a página normal, avisando.
  if (!suporta3d || (reduzirMovimento && !forcarAnimacao)) {
    return (
      <>
        <div
          role="status"
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200"
        >
          {suporta3d ? (
            <>
              <span>Animação 3D desligada: seu sistema pede menos movimento (efeitos de animação desativados).</span>
              <button
                type="button"
                onClick={() => setForcarAnimacao(true)}
                className="font-bold text-white underline underline-offset-4 hover:text-amber-100"
              >
                Ver a animação mesmo assim
              </button>
            </>
          ) : (
            <span>Animação 3D indisponível neste navegador; mostrando a página normal.</span>
          )}
        </div>
        <AssinarPage />
      </>
    );
  }

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
