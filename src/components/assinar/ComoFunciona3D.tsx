'use client';

import { motion, motionValue, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useRef, type ComponentType } from 'react';
import { BarChart3, Bot, PackagePlus, ShoppingCart } from 'lucide-react';
import { estadoDaEtapa } from '@/lib/assinar/etapas';
import { useModoMovimento } from '@/components/assinar/movimento';

interface Etapa {
  Icone: ComponentType<{ className?: string }>;
  titulo: string;
  texto: string;
  detalhe: string;
  cor: string;
}

const ETAPAS: Etapa[] = [
  {
    Icone: PackagePlus,
    titulo: 'Cadastrar',
    texto: 'Coloque o aparelho no estoque pelo IMEI: digitando, lendo o código ou pela foto da etiqueta.',
    detalhe: 'Estoque por IMEI',
    cor: 'from-blue-500/25 text-blue-300 border-blue-500/40',
  },
  {
    Icone: ShoppingCart,
    titulo: 'Vender',
    texto: 'No PDV a taxa da maquininha já sai do lucro e a garantia do aparelho é gerada na venda.',
    detalhe: 'Lucro líquido na hora',
    cor: 'from-indigo-500/25 text-indigo-300 border-indigo-500/40',
  },
  {
    Icone: Bot,
    titulo: 'Bot responde',
    texto: 'O cliente pergunta no WhatsApp e o bot responde com o que está no seu estoque e o preço.',
    detalhe: 'Atendimento no WhatsApp',
    cor: 'from-emerald-500/25 text-emerald-300 border-emerald-500/40',
  },
  {
    Icone: BarChart3,
    titulo: 'Relatório',
    texto: 'O relatório do dia chega no seu WhatsApp: vendas, lucro e o que saiu do estoque.',
    detalhe: 'Relatório diário',
    cor: 'from-amber-500/25 text-amber-300 border-amber-500/40',
  },
];

/** Motion value parado em 1 (estado final) para quando não há animação. */
const FALLBACK = motionValue(1);

/** "Como funciona": quatro etapas que se levantam em 3D conforme a seção rola. */
export function ComoFunciona3D() {
  const animar = useModoMovimento() === 'completo';
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.65'] });
  const linha = useTransform(scrollYProgress, [0, 0.9], [0, 1]);

  return (
    <section ref={ref} className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6 sm:py-16">
      <div className="space-y-2 text-center">
        <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Como funciona</span>
        <h2 className="text-xl font-black text-white sm:text-4xl">Do cadastro ao relatório, em quatro passos</h2>
        <p className="mx-auto max-w-2xl text-xs text-slate-400 sm:text-sm">
          O mesmo aparelho, do momento em que entra na loja até aparecer no seu relatório.
        </p>
      </div>

      <div className="relative" style={animar ? { perspective: 1100 } : undefined}>
        {/* Linha que liga as etapas (desktop) */}
        <div aria-hidden className="absolute left-[12%] right-[12%] top-9 hidden h-0.5 bg-slate-800 md:block">
          <motion.div
            className="h-full origin-left bg-gradient-to-r from-blue-500 via-emerald-400 to-amber-400"
            style={animar ? { scaleX: linha } : undefined}
          />
        </div>

        <ol className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {ETAPAS.map((etapa, i) => (
            <CartaEtapa key={etapa.titulo} etapa={etapa} indice={i} progresso={animar ? scrollYProgress : null} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function CartaEtapa({ etapa, indice, progresso }: { etapa: Etapa; indice: number; progresso: MotionValue<number> | null }) {
  const total = ETAPAS.length;
  // Com progresso nulo (menos movimento) os transforms ficam no estado final e nem são aplicados.
  const origem = progresso ?? null;
  const opacidade = useTransform(origem ?? FALLBACK, (p) => estadoDaEtapa(p, indice, total).opacidade);
  const rotX = useTransform(origem ?? FALLBACK, (p) => estadoDaEtapa(p, indice, total).rotX);
  const y = useTransform(origem ?? FALLBACK, (p) => estadoDaEtapa(p, indice, total).y);
  const z = useTransform(origem ?? FALLBACK, (p) => estadoDaEtapa(p, indice, total).z);
  const escala = useTransform(origem ?? FALLBACK, (p) => estadoDaEtapa(p, indice, total).escala);
  const { Icone } = etapa;

  return (
    <motion.li
      className="relative rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-black/30"
      style={progresso ? { opacity: opacidade, rotateX: rotX, y, z, scale: escala, transformOrigin: '50% 100%' } : undefined}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-gradient-to-br to-transparent ${etapa.cor}`}>
          <Icone className="h-6 w-6" />
        </span>
        <div>
          <span className="font-mono text-[11px] font-bold text-slate-500">Passo {indice + 1}</span>
          <h3 className="text-base font-black text-white">{etapa.titulo}</h3>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-300 sm:text-sm">{etapa.texto}</p>
      <span className="mt-3 inline-block rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-300">{etapa.detalhe}</span>
    </motion.li>
  );
}
