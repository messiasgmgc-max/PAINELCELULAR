'use client';

import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { TILT_NEUTRO, tiltPorOrientacao, tiltPorPonteiro, type EstadoTilt, type PosturaAparelho } from '@/lib/assinar/tilt';
import { useModoMovimento } from '@/components/assinar/movimento';
import { assinarOrientacao, giroscopioDisponivel } from './giroscopio';

interface Props {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Inclinação máxima com o mouse, em graus. */
  maxGraus?: number;
  /** Cor do brilho que acompanha o ponteiro. */
  corBrilho?: string;
}

const MOLA = { stiffness: 220, damping: 22, mass: 0.6 };

/**
 * Cartão que inclina em 3D seguindo o mouse (desktop), o giroscópio de leve
 * (Android) ou o dedo pressionado (fallback), com um brilho que acompanha.
 * Só transform/opacity; valores vão direto para motion values.
 */
export function CartaoTilt({ children, className = '', onClick, maxGraus = 9, corBrilho = 'rgba(96,165,250,0.28)' }: Props) {
  const ligado = useModoMovimento() === 'completo';
  const ref = useRef<HTMLDivElement>(null);
  const naTela = useInView(ref, { amount: 0.3 });

  const rotX = useMotionValue(0);
  const rotY = useMotionValue(0);
  const brilhoX = useMotionValue(50);
  const brilhoY = useMotionValue(50);
  const intensidade = useMotionValue(0);

  const sRotX = useSpring(rotX, MOLA);
  const sRotY = useSpring(rotY, MOLA);
  const sBrilhoX = useSpring(brilhoX, MOLA);
  const sBrilhoY = useSpring(brilhoY, MOLA);
  const sIntensidade = useSpring(intensidade, { stiffness: 180, damping: 28 });
  // A camada de brilho tem 2× o cartão: deslocar (p-50)/2 % dela põe o centro em p % do cartão.
  const xBrilho = useTransform(sBrilhoX, (v) => `${(v - 50) / 2}%`);
  const yBrilho = useTransform(sBrilhoY, (v) => `${(v - 50) / 2}%`);

  const aplicar = (e: EstadoTilt, brilho: number) => {
    rotX.set(e.rotX);
    rotY.set(e.rotY);
    brilhoX.set(e.brilhoX);
    brilhoY.set(e.brilhoY);
    intensidade.set(brilho);
  };

  // Giroscópio: só com o cartão na tela, relativo à postura em que a pessoa segura o celular.
  useEffect(() => {
    if (!ligado || !naTela || !giroscopioDisponivel()) return;
    let referencia: PosturaAparelho | null = null;
    const cancelar = assinarOrientacao((beta, gamma) => {
      if (!referencia) referencia = { beta, gamma };
      aplicar(tiltPorOrientacao(beta, gamma, referencia, 5, 25), 0.6);
    });
    return () => {
      cancelar();
      aplicar(TILT_NEUTRO, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado, naTela]);

  const pressionado = useRef(false);

  const porPonteiro = (ev: PointerEvent<HTMLDivElement>, graus: number) => {
    const caixa = ev.currentTarget.getBoundingClientRect();
    aplicar(tiltPorPonteiro(ev.clientX - caixa.left, ev.clientY - caixa.top, caixa.width, caixa.height, graus), 1);
  };

  const handlers = ligado
    ? {
        onPointerMove: (ev: PointerEvent<HTMLDivElement>) => {
          if (ev.pointerType === 'mouse') porPonteiro(ev, maxGraus);
          else if (pressionado.current) porPonteiro(ev, maxGraus / 2);
        },
        onPointerDown: (ev: PointerEvent<HTMLDivElement>) => {
          if (ev.pointerType === 'mouse') return;
          pressionado.current = true;
          porPonteiro(ev, maxGraus / 2);
        },
        onPointerUp: () => {
          pressionado.current = false;
          if (!giroscopioDisponivel()) aplicar(TILT_NEUTRO, 0);
        },
        onPointerCancel: () => {
          pressionado.current = false;
          aplicar(TILT_NEUTRO, 0);
        },
        onPointerLeave: () => {
          pressionado.current = false;
          aplicar(TILT_NEUTRO, 0);
        },
      }
    : {};

  return (
    <motion.div
      ref={ref}
      onClick={onClick}
      className={`relative ${className}`}
      style={ligado ? { rotateX: sRotX, rotateY: sRotY, transformPerspective: 1000 } : undefined}
      {...handlers}
    >
      {children}
      {ligado && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <motion.div
            className="absolute -left-1/2 -top-1/2 h-[200%] w-[200%]"
            style={{
              x: xBrilho,
              y: yBrilho,
              opacity: sIntensidade,
              background: `radial-gradient(circle at 50% 50%, ${corBrilho}, transparent 38%)`,
            }}
          />
        </div>
      )}
    </motion.div>
  );
}
