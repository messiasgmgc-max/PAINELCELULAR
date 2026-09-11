'use client';

import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { Hand } from 'lucide-react';
import { anguloDeRepouso, anguloPorArraste, inclinacaoPorArraste, tiltPorPonteiro } from '@/lib/assinar/tilt';
import { useModoMovimento } from '@/components/assinar/movimento';

/**
 * iPhone em CSS 3D no topo da /assinar: gira com o mouse, arrastando (mouse ou
 * dedo) e pelas setas do teclado; a frente mostra uma tela ilustrativa do painel.
 *
 * Pose de repouso fixa (GIRO_BASE/INCL_BASE): a cópia da prévia dentro do
 * notebook fica nela, então a troca pela página real não dá salto.
 */

const GIRO_BASE = -16;
const INCL_BASE = 6;
const ESPESSURA = 12;
const MOLA = { stiffness: 120, damping: 18, mass: 0.8 };

export function IPhone3D({ className = '' }: { className?: string }) {
  const modo = useModoMovimento();
  const interativo = modo !== 'previa';
  const seguirMouse = modo === 'completo';

  const giro = useMotionValue(GIRO_BASE);
  const incl = useMotionValue(INCL_BASE);
  const sGiro = useSpring(giro, MOLA);
  const sIncl = useSpring(incl, MOLA);
  const arraste = useRef<{ id: number; x: number; y: number; giro: number; incl: number } | null>(null);

  const voltaAtual = () => anguloDeRepouso(giro.get() - GIRO_BASE);
  const repousar = () => {
    giro.set(GIRO_BASE + voltaAtual());
    incl.set(INCL_BASE);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!interativo || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arraste.current = { id: e.pointerId, x: e.clientX, y: e.clientY, giro: giro.get(), incl: incl.get() };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const a = arraste.current;
    if (a && a.id === e.pointerId) {
      giro.set(anguloPorArraste(a.giro, e.clientX - a.x));
      incl.set(inclinacaoPorArraste(a.incl, e.clientY - a.y));
      return;
    }
    if (seguirMouse && e.pointerType === 'mouse') {
      const caixa = e.currentTarget.getBoundingClientRect();
      const t = tiltPorPonteiro(e.clientX - caixa.left, e.clientY - caixa.top, caixa.width, caixa.height, 22);
      giro.set(GIRO_BASE + voltaAtual() + t.rotY);
      incl.set(INCL_BASE + t.rotX * 0.5);
    }
  };

  const soltar = (e: PointerEvent<HTMLDivElement>) => {
    if (arraste.current?.id === e.pointerId) arraste.current = null;
    repousar();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interativo) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      giro.set(giro.get() + (e.key === 'ArrowLeft' ? -45 : 45));
    } else if (e.key === 'Home' || e.key === 'Escape') {
      repousar();
    }
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div
        role="img"
        aria-label="Ilustração do painel Phone Center num iPhone. Arraste ou use as setas para girar."
        tabIndex={interativo ? 0 : -1}
        onKeyDown={onKeyDown}
        onPointerDown={interativo ? onPointerDown : undefined}
        onPointerMove={interativo ? onPointerMove : undefined}
        onPointerUp={interativo ? soltar : undefined}
        onPointerCancel={interativo ? soltar : undefined}
        onPointerLeave={interativo ? (e) => !arraste.current && soltar(e) : undefined}
        className="relative cursor-grab touch-pan-y select-none rounded-3xl px-8 py-6 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:cursor-grabbing [--h:400px] [--w:196px] sm:[--h:460px] sm:[--w:226px]"
        style={{ perspective: 1200 }}
      >
        {/* Sombra no chão */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-1/2 h-8 w-[70%] -translate-x-1/2 rounded-[100%] bg-black/60 blur-xl"
        />
        <motion.div
          className="relative h-[var(--h)] w-[var(--w)]"
          style={{ transformStyle: 'preserve-3d', rotateY: sGiro, rotateX: sIncl }}
        >
          {/* Laterais: dão a espessura quando o aparelho gira. */}
          <div
            aria-hidden
            className="absolute bottom-[44px] left-1/2 top-[44px] bg-gradient-to-b from-slate-400 via-slate-600 to-slate-400"
            style={{ width: ESPESSURA, marginLeft: -ESPESSURA / 2, transform: 'rotateY(90deg) translateZ(calc(var(--w) / 2))' }}
          />
          <div
            aria-hidden
            className="absolute bottom-[44px] left-1/2 top-[44px] bg-gradient-to-b from-slate-400 via-slate-600 to-slate-400"
            style={{ width: ESPESSURA, marginLeft: -ESPESSURA / 2, transform: 'rotateY(-90deg) translateZ(calc(var(--w) / 2))' }}
          />
          <div
            aria-hidden
            className="absolute left-[44px] right-[44px] top-1/2 bg-gradient-to-r from-slate-500 via-slate-400 to-slate-500"
            style={{ height: ESPESSURA, marginTop: -ESPESSURA / 2, transform: 'rotateX(90deg) translateZ(calc(var(--h) / 2))' }}
          />
          <div
            aria-hidden
            className="absolute left-[44px] right-[44px] top-1/2 bg-gradient-to-r from-slate-500 via-slate-400 to-slate-500"
            style={{ height: ESPESSURA, marginTop: -ESPESSURA / 2, transform: 'rotateX(-90deg) translateZ(calc(var(--h) / 2))' }}
          />

          {/* Traseira */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-[42px] border border-white/10 bg-gradient-to-br from-slate-500 via-slate-700 to-slate-800"
            style={{ transform: `rotateY(180deg) translateZ(${ESPESSURA / 2}px)`, backfaceVisibility: 'hidden' }}
          >
            <div className="absolute left-3 top-3 grid aspect-square w-[44%] grid-cols-2 gap-1.5 rounded-[24px] border border-white/10 bg-slate-800/80 p-2.5 shadow-inner">
              <span className="rounded-full bg-black ring-2 ring-slate-600" />
              <span className="rounded-full bg-black/0" />
              <span className="rounded-full bg-black ring-2 ring-slate-600" />
              <span className="rounded-full bg-black ring-2 ring-slate-600" />
            </div>
            <span className="absolute inset-x-0 top-1/2 text-center text-[11px] font-bold tracking-[0.2em] text-white/40">PHONE CENTER</span>
          </div>

          {/* Frente */}
          <div
            className="absolute inset-0 rounded-[42px] bg-gradient-to-b from-slate-500 via-slate-700 to-slate-600 p-[3px] shadow-2xl shadow-blue-900/40"
            style={{ transform: `translateZ(${ESPESSURA / 2}px)`, backfaceVisibility: 'hidden' }}
          >
            <div className="h-full w-full rounded-[39px] bg-black p-[7px]">
              <div className="relative h-full w-full overflow-hidden rounded-[32px] bg-slate-950">
                <TelaDoSistema />
                <div aria-hidden className="absolute left-1/2 top-2 h-[22px] w-[34%] -translate-x-1/2 rounded-full bg-black" />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 30%, transparent 55%)' }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Hand className="h-3.5 w-3.5" aria-hidden /> Tela ilustrativa · arraste para girar
      </p>
    </div>
  );
}

/** Tela ilustrativa do painel (valores de exemplo). */
function TelaDoSistema() {
  return (
    <div aria-hidden className="flex h-full flex-col gap-2 px-3 pb-3 pt-9 text-left text-[9px] leading-tight text-slate-300 sm:text-[10px]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black text-white sm:text-xs">Phone Center</span>
        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-400">Loja aberta</span>
      </div>

      <div className="rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-600/25 to-indigo-600/10 p-2">
        <span className="text-slate-400">Vendas de hoje (exemplo)</span>
        <p className="font-mono text-base font-black text-white sm:text-lg">R$ 11.730</p>
        <span className="text-emerald-400">Lucro líquido, já sem a taxa da maquininha</span>
      </div>

      <div className="flex gap-1 font-bold">
        <span className="rounded-md bg-blue-600 px-2 py-1 text-white">Estoque</span>
        <span className="rounded-md bg-slate-800 px-2 py-1">PDV</span>
        <span className="rounded-md bg-slate-800 px-2 py-1">OS</span>
        <span className="rounded-md bg-slate-800 px-2 py-1">Atacado</span>
      </div>

      {[
        { nome: 'iPhone 15 Pro Max 256GB', info: 'IMEI •••4821 · bateria 91%', preco: 'R$ 5.290' },
        { nome: 'iPhone 14 128GB', info: 'IMEI •••0937 · seminovo', preco: 'R$ 3.150' },
        { nome: 'iPhone 13 Pro 256GB', info: 'Trade-in · avaliar entrada', preco: 'R$ 2.700' },
      ].map((item) => (
        <div key={item.nome} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/80 p-1.5">
          <div className="min-w-0">
            <p className="truncate font-bold text-white">{item.nome}</p>
            <p className="truncate text-slate-500">{item.info}</p>
          </div>
          <span className="shrink-0 font-mono font-bold text-emerald-400">{item.preco}</span>
        </div>
      ))}

      <div className="mt-auto rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2">
        <p className="font-bold text-emerald-300">Bot no WhatsApp</p>
        <p className="text-slate-300">"tem 15 Pro Max?" → respondido com estoque e preço</p>
      </div>
    </div>
  );
}
