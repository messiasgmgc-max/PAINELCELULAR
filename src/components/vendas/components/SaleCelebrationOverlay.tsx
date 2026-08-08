'use client';

import { createPortal } from 'react-dom';
import { SALE_EMOJIS } from '../utils/vendasUtils';

interface SaleCelebrationOverlayProps {
  show: boolean;
  emoji: string;
}

export function SaleCelebrationOverlay({ show, emoji }: SaleCelebrationOverlayProps) {
  if (!show || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" />
      <div className="relative z-10 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-75 duration-300">
        <div className="text-8xl sm:text-9xl mb-4 animate-bounce drop-shadow-2xl">
          {emoji || SALE_EMOJIS[0]}
        </div>
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-extrabold text-2xl sm:text-4xl px-8 py-4 rounded-3xl shadow-2xl tracking-wide uppercase border-2 border-white/30 animate-pulse">
          Venda Finalizada!
        </div>
      </div>
      {/* Confetti particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 45 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-3 h-3 rounded-sm animate-ping opacity-80"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'][i % 6],
              animationDuration: `${1 + Math.random() * 1.5}s`,
              animationDelay: `${Math.random() * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}
