'use client';

import React from 'react';
import { X, Smartphone, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatarSaudeBateria, getAparelhoCodigo } from '@/lib/utils';
import { DesambiguacaoModalProps } from './types';

export function ModalEscolhaAmbigua({
  codigoDigitado,
  candidatos,
  onSelecionar,
  onCancelar,
}: DesambiguacaoModalProps) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-md w-full p-4 sm:p-5 shadow-2xl space-y-4 text-white">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">Vários aparelhos encontrados</h4>
              <p className="text-xs text-slate-400 font-mono">Final / Termo: &quot;{codigoDigitado}&quot;</p>
            </div>
          </div>
          <button
            onClick={onCancelar}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-300">
          Selecione qual aparelho corresponde ao item que você conferiu:
        </p>

        <div className="max-h-[50dvh] overflow-y-auto space-y-2 pr-1 scrollbar-soft">
          {candidatos.map((item) => {
            const imei = item.imei || item.numeroSerie || '-';
            const saude = formatarSaudeBateria(item);
            const codigo = getAparelhoCodigo(item);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelecionar(item)}
                className="w-full text-left p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/60 hover:bg-cyan-950/20 transition-all flex items-center justify-between gap-3 group cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white group-hover:text-cyan-300">
                      {item.modelo}
                    </span>
                    {item.capacidade && (
                      <span className="text-[11px] text-slate-400">{item.capacidade}</span>
                    )}
                    {item.cor && (
                      <span className="text-[11px] text-cyan-400">{item.cor}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                    <span>IMEI: {imei}</span>
                    {codigo && <span>· ID: {codigo}</span>}
                    {saude && <span>· 🔋 {saude}</span>}
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-slate-600 group-hover:text-cyan-400 shrink-0 transition-colors" />
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-slate-800 flex justify-end">
          <Button variant="outline" size="sm" onClick={onCancelar} className="text-xs">
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
