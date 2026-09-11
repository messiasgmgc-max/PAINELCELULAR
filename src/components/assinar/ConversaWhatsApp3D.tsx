'use client';

import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { CheckCheck, Info, MessageCircle } from 'lucide-react';
import { ROTEIRO_CONVERSA, duracaoDoRoteiro, estadoDaConversa, proximaMudancaEm, type EstadoConversa } from '@/lib/assinar/conversa';
import { CartaoTilt } from '@/components/assinar/efeitos/CartaoTilt';
import { useModoMovimento } from '@/components/assinar/movimento';

const CONVERSA_COMPLETA: EstadoConversa = { visiveis: ROTEIRO_CONVERSA.length, digitando: false };

/**
 * Simulação roteirizada: cliente pergunta "tem 15 Pro Max?" e o bot responde com
 * estoque e preço. Ilustrativa (a tela avisa). Só roda com a seção na tela; muda
 * de estado poucas vezes por ciclo (um setTimeout por marco do roteiro).
 */
export function ConversaWhatsApp3D() {
  const animar = useModoMovimento() === 'completo';
  const ref = useRef<HTMLDivElement>(null);
  const naTela = useInView(ref, { amount: 0.35 });
  const [estado, setEstado] = useState<EstadoConversa>(animar ? { visiveis: 0, digitando: false } : CONVERSA_COMPLETA);
  const tempo = useRef(0);

  useEffect(() => {
    if (!animar) {
      setEstado(CONVERSA_COMPLETA);
      return;
    }
    if (!naTela) return;
    const inicio = performance.now() - tempo.current;
    let espera: ReturnType<typeof setTimeout>;
    const tique = () => {
      const agora = (performance.now() - inicio) % duracaoDoRoteiro();
      tempo.current = agora;
      setEstado((anterior) => {
        const novo = estadoDaConversa(agora);
        return novo.visiveis === anterior.visiveis && novo.digitando === anterior.digitando ? anterior : novo;
      });
      espera = setTimeout(tique, proximaMudancaEm(agora) + 20);
    };
    tique();
    return () => clearTimeout(espera);
  }, [animar, naTela]);

  const mensagens = ROTEIRO_CONVERSA.slice(0, estado.visiveis);

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-16 md:grid-cols-2">
      <div className="space-y-4 text-center md:text-left">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
          <MessageCircle className="h-4 w-4" /> Bot no WhatsApp
        </span>
        <h2 className="text-xl font-black text-white sm:text-4xl">O cliente pergunta. O bot responde com o seu estoque.</h2>
        <p className="text-xs leading-relaxed text-slate-300 sm:text-sm">
          Quem chama perguntando por um modelo recebe o que você tem cadastrado e o preço, sem esperar você largar o balcão.
          O bot roda nos nossos servidores: não precisa deixar computador nem WhatsApp Web aberto.
        </p>
        <p className="inline-flex items-start gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-left text-[11px] text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Simulação ilustrativa: aparelhos e preços são de exemplo. No seu WhatsApp o bot usa o seu estoque.
        </p>
      </div>

      <div ref={ref} className="flex justify-center">
        <CartaoTilt className="rounded-[40px]" maxGraus={7} corBrilho="rgba(52,211,153,0.18)">
          <div
            className="w-[270px] rounded-[40px] border border-slate-700 bg-black p-2 shadow-2xl shadow-emerald-900/30 sm:w-[300px]"
            style={animar ? { transform: 'rotateY(-10deg) rotateX(4deg)' } : undefined}
          >
            <div className="flex h-[440px] flex-col overflow-hidden rounded-[32px] bg-[#0b141a]" aria-live="off">
              {/* Cabeçalho do chat */}
              <div className="flex items-center gap-2 bg-[#202c33] px-3 pb-2 pt-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-black text-white">PC</span>
                <div className="leading-tight">
                  <p className="text-xs font-bold text-white">Sua Loja</p>
                  <p className="text-[10px] text-emerald-400">{estado.digitando ? 'digitando…' : 'online'}</p>
                </div>
              </div>

              {/* Mensagens */}
              <div className="flex flex-1 flex-col justify-end gap-1.5 overflow-hidden px-2.5 py-3">
                {mensagens.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={animar ? { opacity: 0, y: 14, scale: 0.96 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    className={`max-w-[85%] rounded-xl px-2.5 py-1.5 text-[11px] leading-snug shadow ${
                      m.autor === 'cliente' ? 'self-end rounded-tr-sm bg-[#005c4b] text-white' : 'self-start rounded-tl-sm bg-[#202c33] text-slate-100'
                    }`}
                    style={{ transformOrigin: m.autor === 'cliente' ? '100% 100%' : '0% 100%' }}
                  >
                    {m.linhas.map((linha, i) => (
                      <p key={i} className={i === 0 && m.autor === 'bot' ? 'font-bold' : undefined}>
                        {linha}
                      </p>
                    ))}
                    <span className="mt-0.5 flex items-center justify-end gap-0.5 text-[9px] text-slate-400">
                      {m.autor === 'bot' ? 'bot' : '09:41'}
                      {m.autor === 'cliente' && <CheckCheck className="h-3 w-3 text-sky-400" aria-hidden />}
                    </span>
                  </motion.div>
                ))}
                {estado.digitando && (
                  <div className="flex gap-1 self-start rounded-xl rounded-tl-sm bg-[#202c33] px-3 py-2.5" aria-hidden>
                    {[0, 150, 300].map((atraso) => (
                      <span key={atraso} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${atraso}ms` }} />
                    ))}
                  </div>
                )}
              </div>

              {/* Campo de digitação (decorativo) */}
              <div className="flex items-center gap-2 bg-[#202c33] px-2.5 py-2">
                <span className="h-7 flex-1 rounded-full bg-[#2a3942]" />
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600">
                  <MessageCircle className="h-3.5 w-3.5 text-white" aria-hidden />
                </span>
              </div>
            </div>
          </div>
        </CartaoTilt>
      </div>
    </section>
  );
}
