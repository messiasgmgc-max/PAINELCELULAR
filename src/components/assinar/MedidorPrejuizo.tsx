'use client';

import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import {
  LIMITES_CALCULADORA,
  PADRAO_CALCULADORA,
  anguloDoMedidor,
  calcularPrejuizo,
  escalaDasBarras,
  formatarReais,
  mensalidadesCobertas,
  type EntradaPrejuizo,
} from '@/lib/assinar/calculadora';
import { PLANOS_SISTEMA } from '@/lib/planos-config';
import { useModoMovimento } from '@/components/assinar/movimento';

const FUNDO_DE_ESCALA = 10000;
const MOLA = { stiffness: 140, damping: 20 };

/**
 * Calculadora de prejuízo com medidor e barras animadas (aversão à perda).
 * Os três números são do lojista; a conta aparece escrita embaixo.
 */
export function MedidorPrejuizo() {
  const animar = useModoMovimento() === 'completo';
  const [entrada, setEntrada] = useState<EntradaPrejuizo>({ ...PADRAO_CALCULADORA });
  const mensalidade = PLANOS_SISTEMA.entrada.precos.mensal.valorMensal;
  const r = calcularPrejuizo(entrada);
  const barras = escalaDasBarras(r.prejuizoMes, mensalidade);
  const mensalidades = mensalidadesCobertas(r.prejuizoMes, mensalidade);

  const angulo = useMotionValue(anguloDoMedidor(r.prejuizoMes, FUNDO_DE_ESCALA));
  const escalaPrejuizo = useMotionValue(barras.prejuizo);
  const escalaMensalidade = useMotionValue(barras.mensalidade);
  const sAngulo = useSpring(angulo, MOLA);
  const sPrejuizo = useSpring(escalaPrejuizo, MOLA);
  const sMensalidade = useSpring(escalaMensalidade, MOLA);

  useEffect(() => {
    angulo.set(anguloDoMedidor(r.prejuizoMes, FUNDO_DE_ESCALA));
    escalaPrejuizo.set(barras.prejuizo);
    escalaMensalidade.set(barras.mensalidade);
  }, [r.prejuizoMes, barras.prejuizo, barras.mensalidade, angulo, escalaPrejuizo, escalaMensalidade]);

  const alterar = (campo: keyof EntradaPrejuizo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEntrada((anterior) => ({ ...anterior, [campo]: Number(e.target.value) }));

  const controles: { campo: keyof EntradaPrejuizo; rotulo: string; valor: string }[] = [
    { campo: 'vendasMes', rotulo: 'Aparelhos vendidos por mês', valor: `${entrada.vendasMes}/mês` },
    { campo: 'lucroMedio', rotulo: 'Lucro médio por aparelho', valor: formatarReais(entrada.lucroMedio) },
    { campo: 'percentualPerdido', rotulo: 'Vendas que você perde por demorar a responder', valor: `${entrada.percentualPerdido}%` },
  ];

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-5 shadow-2xl sm:p-8">
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <div className="space-y-4">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
              <TrendingDown className="h-4 w-4" /> Calculadora de venda perdida
            </span>
            <h2 className="text-lg font-black text-white sm:text-2xl">Quanto sua loja deixa na mesa todo mês?</h2>
            <p className="text-xs leading-relaxed text-slate-300">
              Quando o cliente pede um iPhone e a resposta demora, ele pergunta em outra loja. Coloque os números da sua loja:
            </p>

            {controles.map(({ campo, rotulo, valor }) => {
              const limite = LIMITES_CALCULADORA[campo];
              return (
                <label key={campo} className="block space-y-1.5">
                  <span className="flex justify-between gap-3 text-xs font-bold text-slate-300">
                    <span>{rotulo}</span>
                    <span className="shrink-0 font-mono text-blue-400">{valor}</span>
                  </span>
                  <input
                    type="range"
                    min={limite.min}
                    max={limite.max}
                    step={limite.passo}
                    value={entrada[campo]}
                    onChange={alterar(campo)}
                    className="h-3 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-blue-500"
                  />
                </label>
              );
            })}
          </div>

          <div className="flex flex-col justify-center gap-5 rounded-2xl border border-red-500/30 bg-slate-950/90 p-5 shadow-lg shadow-red-500/5">
            {/* Medidor */}
            <div className="relative mx-auto h-[110px] w-[220px]" aria-hidden>
              <svg viewBox="0 0 220 110" className="absolute inset-0 h-full w-full">
                <defs>
                  <linearGradient id="medidor-prejuizo" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
                <path d="M 15 105 A 95 95 0 0 1 205 105" fill="none" stroke="url(#medidor-prejuizo)" strokeWidth="14" strokeLinecap="round" />
              </svg>
              <motion.div
                className="absolute bottom-[5px] left-1/2 h-[86px] w-1 -ml-0.5 origin-bottom rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)]"
                style={{ rotate: animar ? sAngulo : angulo }}
              />
              <span className="absolute bottom-0 left-1/2 h-4 w-4 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-slate-900" />
              <span className="absolute -bottom-5 left-0 text-[10px] text-slate-500">R$ 0</span>
              <span className="absolute -bottom-5 right-0 text-[10px] text-slate-500">R$ 10 mil+</span>
            </div>

            <div className="pt-3 text-center">
              <span className="text-xs font-semibold text-slate-400">Venda perdida estimada por mês</span>
              <p className="font-mono text-3xl font-black text-red-400 sm:text-4xl" aria-live="polite">
                {formatarReais(r.prejuizoMes)}
              </p>
              <p className="text-[11px] text-slate-400">
                {formatarReais(r.prejuizoAno)} por ano · {r.vendasPerdidasMes.toLocaleString('pt-BR')} aparelhos/mês
              </p>
            </div>

            {/* Barras: prejuízo x mensalidade */}
            <div className="space-y-2.5 text-[11px]">
              <div>
                <div className="mb-1 flex justify-between text-slate-300">
                  <span>Você perde por mês</span>
                  <span className="font-mono font-bold text-red-400">{formatarReais(r.prejuizoMes)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                  <motion.div className="h-full origin-left rounded-full bg-gradient-to-r from-amber-500 to-red-500" style={{ scaleX: animar ? sPrejuizo : escalaPrejuizo }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-slate-300">
                  <span>Plano Entrada</span>
                  <span className="font-mono font-bold text-emerald-400">R$ {mensalidade.toFixed(2).replace('.', ',')}/mês</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                  <motion.div className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ scaleX: animar ? sMensalidade : escalaMensalidade }} />
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] text-slate-300">
              {mensalidades >= 1 ? (
                <>
                  Essa perda pagaria <strong className="text-white">{mensalidades} {mensalidades === 1 ? 'mensalidade' : 'mensalidades'}</strong> do plano Entrada.
                </>
              ) : (
                <>Com esses números a perda ainda é menor que a mensalidade do plano Entrada.</>
              )}
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-[10px] text-slate-500">
          Conta: aparelhos vendidos × % perdido × lucro médio. É uma estimativa com os números que você escolheu, não uma promessa de resultado.
        </p>
      </div>
    </section>
  );
}
