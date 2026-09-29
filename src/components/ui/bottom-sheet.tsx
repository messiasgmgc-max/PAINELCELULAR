'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeight = 'max-h-[88vh]',
}: BottomSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Fecha no ESC e bloqueia scroll do body
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop com blur escuro */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
      />

      {/* Conteúdo deslizante (Bottom Sheet) */}
      <div
        ref={contentRef}
        className={`relative z-10 w-full bg-slate-900 border-t border-slate-700/80 rounded-t-[28px] shadow-2xl flex flex-col ${maxHeight} overflow-hidden animate-in slide-in-from-bottom duration-300`}
      >
        {/* Barra superior com Drag Indicator */}
        <div className="pt-2.5 pb-1 flex flex-col items-center shrink-0 cursor-grab active:cursor-grabbing select-none">
          <div className="w-12 h-1.5 bg-slate-600/80 rounded-full hover:bg-slate-500 transition-colors" />
        </div>

        {/* Cabeçalho do Sheet */}
        {(title || subtitle) && (
          <div className="px-5 py-3 border-b border-slate-800/80 flex items-center justify-between shrink-0">
            <div className="min-w-0 pr-3">
              {title && <h3 className="font-bold text-base text-white truncate">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Área de rolagem do conteúdo */}
        <div className="flex-1 overflow-y-auto px-5 py-4 overscroll-contain space-y-4">
          {children}
        </div>

        {/* Rodapé fixo para botões de ação (sempre visível acima do teclado) */}
        {footer && (
          <div className="px-5 py-3.5 border-t border-slate-800/80 bg-slate-900/95 backdrop-blur-md shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
