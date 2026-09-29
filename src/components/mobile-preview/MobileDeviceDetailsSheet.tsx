'use client';

import React, { useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { MockAparelho } from './MobileDeviceRow';
import {
  Smartphone,
  Copy,
  Check,
  Edit,
  ShoppingCart,
  Trash2,
  Share2,
  ArrowDownCircle,
  FileText,
} from 'lucide-react';

interface MobileDeviceDetailsSheetProps {
  aparelho: MockAparelho | null;
  isOpen: boolean;
  onClose: () => void;
  onVender: (aparelho: MockAparelho) => void;
  onEditar: (aparelho: MockAparelho) => void;
  onBaixar: (aparelho: MockAparelho) => void;
}

export function MobileDeviceDetailsSheet({
  aparelho,
  isOpen,
  onClose,
  onVender,
  onEditar,
  onBaixar,
}: MobileDeviceDetailsSheetProps) {
  const [copiedImei, setCopiedImei] = useState(false);

  if (!aparelho) return null;

  const handleCopyImei = () => {
    if (aparelho.imei) {
      navigator.clipboard.writeText(aparelho.imei);
      setCopiedImei(true);
      setTimeout(() => setCopiedImei(false), 2000);
    }
  };

  const footer = (
    <div className="space-y-2 w-full">
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => onVender(aparelho)}
          className="h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold gap-1.5 shadow-lg shadow-blue-600/30 cursor-pointer"
        >
          <ShoppingCart className="w-4 h-4" />
          Vender Agora
        </Button>
        <Button
          variant="outline"
          onClick={() => onEditar(aparelho)}
          className="h-11 rounded-xl border-blue-500/30 bg-blue-950/20 text-blue-300 hover:bg-blue-900/30 font-semibold gap-1.5 cursor-pointer"
        >
          <Edit className="w-4 h-4" />
          Editar Dados
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => onBaixar(aparelho)}
          className="h-9 rounded-xl border-slate-700 hover:bg-slate-800 text-slate-300 text-xs gap-1.5 cursor-pointer"
        >
          <ArrowDownCircle className="w-3.5 h-3.5 text-blue-400" />
          Dar Baixa
        </Button>
        <Button
          variant="outline"
          onClick={() => alert('Aparelho excluído da prévia de teste')}
          className="h-9 rounded-xl border-rose-500/30 bg-rose-950/20 text-rose-300 hover:bg-rose-900/30 text-xs gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          Excluir
        </Button>
      </div>
    </div>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={aparelho.modelo}
      subtitle={`${aparelho.capacidade} • ${aparelho.cor}`}
      footer={footer}
    >
      <div className="space-y-4">
        {/* Bloco de Preços em Destaque */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950/50 rounded-2xl border border-slate-800">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
              Preço de Varejo
            </span>
            <span className="text-lg font-black text-cyan-300">
              R$ {aparelho.preco_venda.toLocaleString('pt-BR')}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
              Preço Atacado
            </span>
            <span className="text-lg font-black text-blue-400">
              R$ {(aparelho.preco_atacado || aparelho.preco_venda - 200).toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        {/* Ficha Técnica Rápida */}
        <div className="bg-slate-800/40 rounded-2xl p-3 border border-slate-700/50 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Status atual:</span>
            <span className="font-bold text-blue-300 px-2 py-0.5 rounded-full bg-blue-950/60 border border-blue-500/30">
              {aparelho.status}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Saúde da Bateria:</span>
            <span className="font-bold text-emerald-400">
              {aparelho.bateria ? `${aparelho.bateria}%` : 'Não informada'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Condição / Origem:</span>
            <span className="font-semibold text-white">
              {aparelho.condicao || 'Seminovo Impecável (Grade A)'}
            </span>
          </div>

          {/* IMEI exibido uma única vez com clique para copiar (Conforme pedido pelo usuário) */}
          <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 block">IMEI do Aparelho:</span>
              <span className="font-mono text-xs text-slate-200">
                {aparelho.imei || '359482019482018'}
              </span>
            </div>
            <button
              onClick={handleCopyImei}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs flex items-center gap-1 transition-all cursor-pointer"
              title="Copiar IMEI"
            >
              {copiedImei ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="text-[10px]">{copiedImei ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
