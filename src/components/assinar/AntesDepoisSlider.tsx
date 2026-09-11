'use client';

import { animate, motion, useInView, useMotionValue, useMotionValueEvent, useTransform, type AnimationPlaybackControls } from 'framer-motion';
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { AlertTriangle, CheckCircle2, ChevronsLeftRight } from 'lucide-react';
import { deslocamentosDaCortina, posicaoPorPonteiro, posicaoPorTecla, rotuloDoSlider } from '@/lib/assinar/slider';
import { useModoMovimento } from '@/components/assinar/movimento';

/**
 * Antes (caderno e planilha) x depois (sistema) com um puxador arrastável.
 * A cortina anda só com transform (ver lib/assinar/slider). O arraste não usa
 * estado do React: posição num motion value, aria atualizado direto no elemento.
 */
export function AntesDepoisSlider() {
  const animar = useModoMovimento() === 'completo';
  const caixa = useRef<HTMLDivElement>(null);
  const puxador = useRef<HTMLDivElement>(null);
  const posicao = useMotionValue(50);
  const recorte = useTransform(posicao, (p) => `${deslocamentosDaCortina(p).recorte}%`);
  const conteudo = useTransform(posicao, (p) => `${deslocamentosDaCortina(p).conteudo}%`);
  const xPuxador = useTransform(posicao, (p) => `${p}%`);
  const arrastando = useRef<number | null>(null);
  const dica = useRef<AnimationPlaybackControls | null>(null);
  const visto = useInView(caixa, { once: true, amount: 0.6 });

  useMotionValueEvent(posicao, 'change', (p) => {
    const el = puxador.current;
    if (!el) return;
    el.setAttribute('aria-valuenow', String(Math.round(p)));
    el.setAttribute('aria-valuetext', rotuloDoSlider(p));
  });

  // Uma dica de movimento quando aparece pela primeira vez (só com animação ligada).
  useEffect(() => {
    if (!animar || !visto) return;
    dica.current = animate(posicao, [50, 32, 68, 50], { duration: 2.4, ease: 'easeInOut', delay: 0.3 });
    return () => dica.current?.stop();
  }, [animar, visto, posicao]);

  const pararDica = () => dica.current?.stop();

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pararDica();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastando.current = e.pointerId;
    const r = e.currentTarget.getBoundingClientRect();
    posicao.set(posicaoPorPonteiro(e.clientX, r.left, r.width));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (arrastando.current !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    posicao.set(posicaoPorPonteiro(e.clientX, r.left, r.width));
  };
  const soltar = (e: PointerEvent<HTMLDivElement>) => {
    if (arrastando.current === e.pointerId) arrastando.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const nova = posicaoPorTecla(posicao.get(), e.key);
    if (nova === null) return;
    e.preventDefault();
    pararDica();
    posicao.set(nova);
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 sm:py-16">
      <div className="space-y-2 text-center">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Antes e depois</span>
        <h2 className="text-xl font-black text-white sm:text-4xl">Caderno e planilha x Phone Center</h2>
        <p className="text-xs text-slate-400 sm:text-sm">Arraste o puxador para comparar.</p>
      </div>

      <div
        ref={caixa}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        className="relative h-[360px] cursor-ew-resize touch-pan-y select-none overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl sm:h-[400px]"
      >
        {/* ANTES (fica embaixo) */}
        <div className="absolute inset-0">
          <LadoAntes />
        </div>

        {/* DEPOIS (por cima, recortado da esquerda até o puxador) */}
        <motion.div className="absolute inset-0 overflow-hidden" style={{ x: recorte }}>
          <motion.div className="absolute inset-0" style={{ x: conteudo }}>
            <LadoDepois />
          </motion.div>
        </motion.div>

        {/* Puxador */}
        <motion.div className="pointer-events-none absolute inset-0" style={{ x: xPuxador }}>
          <div className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-white/80 shadow-[0_0_20px_rgba(255,255,255,0.4)]" />
          <div
            ref={puxador}
            role="slider"
            tabIndex={0}
            aria-label="Comparar caderno e planilha com o sistema"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={50}
            aria-valuetext={rotuloDoSlider(50)}
            onKeyDown={onKeyDown}
            className="pointer-events-auto absolute left-0 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-slate-950 text-white shadow-xl outline-none focus-visible:ring-4 focus-visible:ring-blue-500/60"
          >
            <ChevronsLeftRight className="h-5 w-5" aria-hidden />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function LadoAntes() {
  return (
    <div aria-hidden className="relative h-full w-full bg-[#1b1a17] p-4 sm:p-6">
      <span className="absolute right-3 top-3 z-10 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
        Antes: caderno e planilha
      </span>

      <div className="flex h-full items-center justify-end gap-4">
        {/* Caderno */}
        <div
          className="hidden h-[82%] w-[42%] -rotate-3 rounded-lg bg-[#f4ecd8] p-4 font-mono text-[11px] text-slate-700 shadow-2xl sm:block"
          style={{ backgroundImage: 'repeating-linear-gradient(180deg, transparent 0 21px, rgba(59,130,246,0.25) 21px 22px)' }}
        >
          <p className="font-bold text-slate-900">Estoque — setembro</p>
          <p className="mt-2 line-through">13 Pro 128 azul — 2.800</p>
          <p>13 Pro 128 azul — vendido?? </p>
          <p>IMEI ... (ver na caixa)</p>
          <p className="mt-2 font-bold text-slate-900">Fiado</p>
          <p>João — pagou 500 (acho)</p>
          <p className="text-red-600">Marcos — quanto falta???</p>
        </div>

        {/* Planilha */}
        <div className="w-full rounded-lg border border-slate-600 bg-white text-[10px] text-slate-800 shadow-2xl sm:w-[46%] sm:rotate-2">
          <div className="border-b border-slate-300 bg-emerald-700 px-2 py-1 font-bold text-white">estoque_final_v3 (2).xlsx</div>
          <div className="grid grid-cols-3">
            {['Modelo', 'IMEI', 'Preço', '14 128GB', '#N/D', '3150', '15 Pro Max', '', '#REF!', '12 64GB', 'vendi', '??'].map((c, i) => (
              <span
                key={i}
                className={`truncate border-b border-r border-slate-200 px-1.5 py-1.5 ${i < 3 ? 'bg-slate-100 font-bold' : ''} ${
                  c.startsWith('#') || c === '??' ? 'font-bold text-red-600' : ''
                }`}
              >
                {c || ' '}
              </span>
            ))}
          </div>
          <div className="space-y-1.5 p-2 text-slate-600">
            <p className="flex items-center gap-1.5 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Qual versão é a certa?
            </p>
            <p className="flex items-center gap-1.5 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Cliente esperando resposta no WhatsApp
            </p>
            <p className="flex items-center gap-1.5 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Lucro do mês: não sei
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LadoDepois() {
  return (
    <div aria-hidden className="relative h-full w-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-4 sm:p-6">
      <span className="absolute left-3 top-3 z-10 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
        Depois: Phone Center
      </span>

      <div className="flex h-full flex-col justify-center gap-2.5 pt-6 sm:w-[60%]">
        {[
          { t: 'iPhone 15 Pro Max 256GB', d: 'IMEI •••4821 · em estoque · R$ 5.290' },
          { t: 'Fiado do João (atacado)', d: 'Saldo atualizado · recibo enviado no WhatsApp' },
          { t: 'Venda no PDV', d: 'Taxa da maquininha descontada · garantia gerada' },
          { t: 'Cliente no WhatsApp', d: '"tem 15 Pro Max?" respondido pelo bot' },
          { t: 'Relatório do dia', d: 'Vendas, lucro e estoque no seu WhatsApp' },
        ].map((item) => (
          <div key={item.t} className="flex items-start gap-2.5 rounded-xl border border-slate-700/80 bg-slate-900/90 p-2.5 text-xs shadow-lg">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <p className="truncate font-bold text-white">{item.t}</p>
              <p className="truncate text-[11px] text-slate-400">{item.d}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
