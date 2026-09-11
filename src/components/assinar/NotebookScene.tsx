'use client';

import { motion, useTransform, type MotionValue } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { estadoDaCena, type EstadoCena } from '@/lib/assinar/timeline3d';

/**
 * Notebook 3D em CSS (perspective + preserve-3d), controlado pelo progresso do scroll.
 *
 * Por que CSS 3D e não Three.js: a exigência é que a tela do notebook mostre a
 * interface REAL de /assinar (HTML/React), e que no fim ela seja a própria página.
 * Em WebGL isso exigiria CSS3DRenderer/drei Html, que é este mesmo mecanismo com
 * uma biblioteca de ~600 KB no meio. Aqui a tela É um elemento de 100vw × 100dvh:
 * quando o conjunto chega em escala 1 sem rotação, ela coincide com a viewport.
 */

interface Props {
  progresso: MotionValue<number>;
  mobile: boolean;
  /** Conteúdo mostrado dentro da tela (a página real, sem interação). */
  children: ReactNode;
  onEntrar: () => void;
}

const ESPESSURA_MOLDURA = 14;
const PROFUNDIDADE_BASE = '86dvh';

function useCenaProp<K extends keyof EstadoCena>(progresso: MotionValue<number>, mobile: boolean, chave: K) {
  return useTransform(progresso, (p) => estadoDaCena(p, mobile)[chave]);
}

export function NotebookScene({ progresso, mobile, children, onEntrar }: Props) {
  const tampa = useCenaProp(progresso, mobile, 'tampa');
  const inclinacao = useCenaProp(progresso, mobile, 'inclinacao');
  const giro = useCenaProp(progresso, mobile, 'giro');
  const escala = useCenaProp(progresso, mobile, 'escala');
  const deslocY = useTransform(progresso, (p) => `${estadoDaCena(p, mobile).deslocY}%`);
  const ui = useCenaProp(progresso, mobile, 'ui');
  const brilho = useCenaProp(progresso, mobile, 'brilho');
  const chassi = useCenaProp(progresso, mobile, 'chassi');
  const raio = useCenaProp(progresso, mobile, 'raio');
  const raioMoldura = useTransform(raio, (r) => r + ESPESSURA_MOLDURA);
  const intro = useCenaProp(progresso, mobile, 'intro');
  const botoes = useCenaProp(progresso, mobile, 'botoes');
  const escuroDaTela = useTransform(ui, (u) => 1 - u);

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-slate-950 text-slate-100"
      style={{ perspective: mobile ? '1100px' : '1700px', perspectiveOrigin: '50% 38%' }}
    >
      {/* Luz de estúdio: dois focos suaves, nada de partículas. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-20%] h-[70vh] w-[90vw] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="absolute bottom-[-30%] right-[-10%] h-[60vh] w-[60vw] rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      {/* Conjunto: tampa + base. Origem no centro da tela para a escala fechar na viewport. */}
      <motion.div
        className="absolute inset-0 will-change-transform"
        style={{
          transformStyle: 'preserve-3d',
          transformOrigin: '50% 50%',
          rotateX: inclinacao,
          rotateY: giro,
          scale: escala,
          y: deslocY,
        }}
      >
        {!mobile && (
          <>
            {/* Sombra no chão, no plano da base. */}
            <motion.div
              className="absolute left-[6%] right-[6%] top-full"
              style={{
                height: PROFUNDIDADE_BASE,
                transformOrigin: '50% 0%',
                transform: 'rotateX(90deg) translateZ(-36px)',
                background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.6), rgba(0,0,0,0) 70%)',
                filter: 'blur(28px)',
                opacity: chassi,
              }}
            />

            {/* Base com teclado e trackpad: deitada, vindo em direção à câmera. */}
            <motion.div
              className="absolute left-[-1.2%] right-[-1.2%] top-full"
              style={{
                height: PROFUNDIDADE_BASE,
                transformOrigin: '50% 0%',
                // 6px abaixo do plano da tampa: sem disputa de profundidade quando fechado.
                transform: 'rotateX(90deg) translateZ(-6px)',
                borderRadius: '0 0 28px 28px',
                background: 'linear-gradient(180deg, #2b3240 0%, #1d222d 55%, #161a23 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.5), 0 40px 80px rgba(0,0,0,0.45)',
                opacity: chassi,
              }}
            >
              {/* Dobradiça */}
              <div className="absolute inset-x-[8%] top-0 h-[3.5%] rounded-b-md bg-slate-900/80 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]" />
              {/* Teclado: grade de teclas em gradientes, sem imagem. */}
              <div
                className="absolute left-[9%] right-[9%] top-[10%] h-[40%] rounded-lg"
                style={{
                  backgroundColor: 'rgba(15,19,27,0.9)',
                  backgroundImage:
                    'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 5.2%, transparent 5.2% 6.66%), repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 78%, transparent 78% 100%)',
                  backgroundSize: '100% 100%, 100% 16.6%',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
                }}
              />
              {/* Barra de espaço */}
              <div className="absolute left-[32%] right-[32%] top-[52%] h-[5%] rounded-md bg-white/[0.06]" />
              {/* Trackpad */}
              <div className="absolute left-[36%] right-[36%] top-[63%] h-[27%] rounded-xl border border-white/10 bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
            </motion.div>
          </>
        )}

        {/* Tampa: gira na dobradiça (borda inferior). Em p=1 é exatamente a viewport. */}
        <motion.div
          className="absolute inset-0 will-change-transform"
          style={{ transformStyle: 'preserve-3d', transformOrigin: '50% 100%', rotateX: tampa }}
        >
          {/* Costas da tampa: o que se vê com o notebook fechado. */}
          <motion.div
            className="pointer-events-none absolute"
            style={{
              inset: -ESPESSURA_MOLDURA,
              borderRadius: raioMoldura,
              transform: 'rotateY(180deg)',
              backfaceVisibility: 'hidden',
              background: 'linear-gradient(160deg, #2c3342 0%, #1c212b 60%, #171b24 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 30px 90px rgba(0,0,0,0.55)',
              opacity: chassi,
            }}
          >
            <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/[0.06]" />
          </motion.div>

          {/* Moldura (bezel) fora da área da tela, para a tela manter 100vw × 100dvh. */}
          <motion.div
            className="pointer-events-none absolute"
            style={{
              inset: -ESPESSURA_MOLDURA,
              borderRadius: raioMoldura,
              backfaceVisibility: 'hidden',
              background: 'linear-gradient(180deg, #11161f, #0b0f16)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 30px 90px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(0,0,0,0.6)',
              opacity: chassi,
            }}
          />
          {/* Câmera do notebook */}
          <motion.div
            className="pointer-events-none absolute left-1/2 top-[-9px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-slate-700 ring-1 ring-black/60"
            style={{ opacity: chassi }}
          />

          {/* A tela. */}
          <motion.div
            className="absolute inset-0 overflow-hidden bg-slate-950"
            style={{ borderRadius: raio, contain: 'paint', backfaceVisibility: 'hidden' }}
          >
            {children}
            {/* Tela apagada antes da interface acender. */}
            <motion.div className="pointer-events-none absolute inset-0 bg-[#05070c]" style={{ opacity: escuroDaTela }} />
            {/* Reflexo do vidro, some conforme a câmera entra. */}
            <motion.div
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: brilho,
                background:
                  'linear-gradient(112deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 28%, rgba(255,255,255,0) 52%), radial-gradient(circle at 18% 0%, rgba(96,165,250,0.18), transparent 45%)',
              }}
            />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Texto de abertura */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-[7%] px-4 text-center"
        style={{ opacity: intro }}
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">
          Phone Center
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl" style={{ textWrap: 'balance' }}>
          Entre no sistema.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-400 sm:text-base">
          Role para abrir o notebook e assinar por dentro dele.
        </p>
      </motion.div>

      {/* Ações: continuar rolando ou pular direto para a assinatura. */}
      <motion.div
        className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+22px)] flex flex-col items-center gap-3 px-4"
        style={{ opacity: botoes }}
      >
        <button
          type="button"
          onClick={onEntrar}
          className="group inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 text-sm font-bold text-white shadow-lg shadow-black/30 backdrop-blur transition hover:bg-white/[0.12]"
        >
          Rolar para entrar
          <ArrowDown className="h-4 w-4 transition group-hover:translate-y-0.5" />
        </button>
        <button type="button" onClick={onEntrar} className="text-xs font-semibold text-slate-400 underline-offset-4 hover:text-white hover:underline">
          Pular animação e ir para a assinatura
        </button>
      </motion.div>
    </div>
  );
}
