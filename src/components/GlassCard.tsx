import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

export const GlassCard = ({ children, className = "", hoverEffect = false }: GlassCardProps) => {
  return (
    <div 
      className={`
        glass 
        p-6 
        ${hoverEffect ? 'glass-hover cursor-pointer' : ''} 
        ${className}
      `}
    >
      {/* Brilho sutil no topo para simular reflexo de luz */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-50 rounded-t-3xl pointer-events-none" />
      
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};