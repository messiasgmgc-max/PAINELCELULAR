'use client';

import React, { useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { MockVenda } from './MobileSaleRow';
import {
  FileText,
  MessageCircle,
  Mail,
  Edit,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  User,
  CreditCard,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

interface MobileSaleDetailsSheetProps {
  venda: MockVenda | null;
  isOpen: boolean;
  onClose: () => void;
  onGerarPdf: (venda: MockVenda) => void;
  onEnviarWhatsapp: (venda: MockVenda) => void;
  onEnviarEmail: (venda: MockVenda) => void;
  onEditar: (venda: MockVenda) => void;
  onCancelar: (venda: MockVenda) => void;
}

export function MobileSaleDetailsSheet({
  venda,
  isOpen,
  onClose,
  onGerarPdf,
  onEnviarWhatsapp,
  onEnviarEmail,
  onEditar,
  onCancelar,
}: MobileSaleDetailsSheetProps) {
  const [copiedImei, setCopiedImei] = useState(false);

  if (!venda) return null;

  const handleCopyImei = () => {
    if (venda.aparelho_imei) {
      navigator.clipboard.writeText(venda.aparelho_imei);
      setCopiedImei(true);
      setTimeout(() => setCopiedImei(false), 2000);
    }
  };

  const footer = (
    <div className="space-y-2 w-full">
      {/* Botões Principais no Alcance do Polegar */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => onGerarPdf(venda)}
          className="h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold gap-1.5 shadow-lg shadow-blue-600/30 cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          Ver Recibo PDF
        </Button>
        <Button
          onClick={() => onEnviarWhatsapp(venda)}
          className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          onClick={() => onEnviarEmail(venda)}
          className="h-9 rounded-xl border-slate-700 hover:bg-slate-800 text-slate-300 text-xs gap-1 cursor-pointer"
        >
          <Mail className="w-3.5 h-3.5 text-blue-400" />
          E-mail
        </Button>
        <Button
          variant="outline"
          onClick={() => onEditar(venda)}
          className="h-9 rounded-xl border-slate-700 hover:bg-slate-800 text-slate-300 text-xs gap-1 cursor-pointer"
        >
          <Edit className="w-3.5 h-3.5 text-blue-400" />
          Editar
        </Button>
        <Button
          variant="outline"
          onClick={() => onCancelar(venda)}
          className="h-9 rounded-xl border-rose-500/30 bg-rose-950/20 text-rose-300 hover:bg-rose-900/30 text-xs gap-1 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          Estornar
        </Button>
      </div>
    </div>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={venda.cliente_nome}
      subtitle={`Venda #${venda.id} • ${venda.created_at}`}
      footer={footer}
    >
      <div className="space-y-3.5">
        {/* Bloco de Valor e Lucro */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950/50 rounded-2xl border border-slate-800">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
              Valor da Venda
            </span>
            <span className="text-xl font-black text-emerald-400">
              R$ {venda.valor_total.toLocaleString('pt-BR')}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Pagamento: <strong className="text-white">{venda.forma_pagamento}</strong>
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
              Lucro Estimado
            </span>
            <span className="text-xl font-black text-cyan-300 flex items-center gap-1">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              R$ {(venda.lucro || venda.valor_total * 0.18).toLocaleString('pt-BR')}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Vendedor: <strong className="text-white">{venda.vendedor}</strong>
            </span>
          </div>
        </div>

        {/* Dados do Aparelho Vendido */}
        <div className="bg-slate-800/40 rounded-2xl p-3 border border-slate-700/50 space-y-2">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Aparelho Entregue
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Modelo:</span>
            <span className="font-bold text-white">
              {venda.aparelho_modelo} ({venda.aparelho_capacidade})
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Garantia Oferecida:</span>
            <span className="font-bold text-blue-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {venda.garantia_dias || 90} dias
            </span>
          </div>

          {venda.aparelho_imei && (
            <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block">IMEI:</span>
                <span className="font-mono text-xs text-slate-200">{venda.aparelho_imei}</span>
              </div>
              <button
                onClick={handleCopyImei}
                className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs flex items-center gap-1 transition-all cursor-pointer"
              >
                {copiedImei ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="text-[10px]">{copiedImei ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Dados do Cliente */}
        <div className="bg-slate-800/40 rounded-2xl p-3 border border-slate-700/50 space-y-2 text-xs">
          <div className="font-bold text-slate-300 uppercase tracking-wider">
            Dados do Cliente
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Telefone / WhatsApp:</span>
            <span className="font-semibold text-white">
              {venda.cliente_telefone || '(31) 99876-5432'}
            </span>
          </div>
          {venda.cliente_cpf && (
            <div className="flex items-center justify-between">
              <span className="text-slate-400">CPF:</span>
              <span className="font-mono text-slate-300">{venda.cliente_cpf}</span>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
