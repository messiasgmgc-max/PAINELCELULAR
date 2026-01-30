'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveCardProps {
  children: ReactNode;
  className?: string;
  compact?: boolean; // Para mobile, usar menos padding
}

export function ResponsiveCard({ children, className, compact }: ResponsiveCardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-gray-200 shadow-sm transition-shadow hover:shadow-md',
        compact ? 'p-2 sm:p-4' : 'p-4 sm:p-6',
        className
      )}
    >
      {children}
    </div>
  );
}

interface ResponsiveGridProps {
  children: ReactNode;
  columns?: 'auto' | '1' | '2' | '3' | '4';
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Responsive grid que ajusta colunas baseado no breakpoint
 * - mobile: 1 coluna
 * - sm (640px): 2 colunas
 * - md (768px): 3 colunas
 * - lg (1024px): 4 colunas (ou o especificado)
 */
export function ResponsiveGrid({
  children,
  columns = 'auto',
  gap = 'md',
  className,
}: ResponsiveGridProps) {
  const gapClass = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
  }[gap];

  const columnClass = {
    auto: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    '1': 'grid-cols-1',
    '2': 'grid-cols-1 sm:grid-cols-2',
    '3': 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
    '4': 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  }[columns];

  return (
    <div className={cn('grid', columnClass, gapClass, className)}>
      {children}
    </div>
  );
}

interface ResponsiveTableProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}

/**
 * Wrapper para tabelas que permite scroll horizontal em mobile
 */
export function ResponsiveTable({
  children,
  className,
  scrollable = true,
}: ResponsiveTableProps) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="inline-block min-w-full">
        {children}
      </div>
    </div>
  );
}

interface ResponsiveModalProps {
  children: ReactNode;
  className?: string;
  isOpen: boolean;
}

/**
 * Modal que se adapta a tamanho de tela
 * - Mobile: fullscreen
 * - Desktop: centered modal
 */
export function ResponsiveModal({
  children,
  className,
  isOpen,
}: ResponsiveModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={(e) => {
          // Previne fechar ao clicar fora em mobile
          if (window.innerWidth >= 640) {
            (e.currentTarget as HTMLDivElement).parentElement?.click?.();
          }
        }}
      />
      <div
        className={cn(
          'relative w-full bg-white rounded-t-lg sm:rounded-lg shadow-lg',
          'sm:max-w-md max-h-[90vh] sm:max-h-[80vh] overflow-y-auto',
          'p-4 sm:p-6',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
