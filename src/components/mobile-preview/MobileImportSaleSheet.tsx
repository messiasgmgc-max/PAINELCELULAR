'use client';

import React, { useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Sparkles, Camera, ImagePlus, Loader2, Check, X, FileText } from 'lucide-react';
import { MockVenda } from './MobileSaleRow';

interface MobileImportSaleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onVendaCriada: (novaVenda: MockVenda) => void;
}

export function MobileImportSaleSheet({
  isOpen,
  onClose,
  onVendaCriada,
}: MobileImportSaleSheetProps) {
  const [texto, setTexto] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [processando, setProcessando] = useState(false);

  const handleSimularFoto = () => {
    if (fotos.length >= 3) return;
    // Foto simulada de etiqueta de celular
    setFotos((prev) => [...prev, 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=150&auto=format&fit=crop&q=80']);
  };

  const handleRemoverFoto = (index: number) => {
    setFotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProcessarIA = () => {
    if (!texto.trim() && fotos.length === 0) {
      alert('Cole o texto da venda ou anexe uma foto da etiqueta/caixa.');
      return;
    }

    setProcessando(true);

    // Simula a IA extraindo dados do texto e das fotos do pedido
    setTimeout(() => {
      // Extração inteligente heurística simples para o teste
      const linhas = texto.toLowerCase();
      let modelo = 'iPhone 13';
      let capacidade = '128GB';
      let valor = 2790;
      let cliente = 'Cliente do WhatsApp';
      let forma: 'PIX' | 'Cartão' | 'Dinheiro' = 'PIX';

      if (linhas.includes('14 pro max')) {
        modelo = 'iPhone 14 Pro Max';
        capacidade = '256GB';
        valor = 4600;
      } else if (linhas.includes('15 pro')) {
        modelo = 'iPhone 15 Pro';
        capacidade = '128GB';
        valor = 5100;
      } else if (linhas.includes('12')) {
        modelo = 'iPhone 12';
        capacidade = '128GB';
        valor = 2150;
      } else if (linhas.includes('11')) {
        modelo = 'iPhone 11';
        capacidade = '64GB';
        valor = 1650;
      }

      // Tenta achar nome se começar com "cliente:" ou similar
      const matchCliente = texto.match(/cliente[:\s]+([A-Za-zÀ-ÿ\s]+)/i);
      if (matchCliente && matchCliente[1]) {
        cliente = matchCliente[1].trim();
      }

      // Tenta achar valor
      const matchValor = texto.match(/R?\$?\s?(\d{1,2}\.?\d{3})/i);
      if (matchValor && matchValor[1]) {
        valor = Number(matchValor[1].replace(/\D/g, ''));
      }

      if (linhas.includes('cartão') || linhas.includes('cartao')) forma = 'Cartão';
      if (linhas.includes('dinheiro')) forma = 'Dinheiro';

      const nova: MockVenda = {
        id: String(Date.now()).slice(-4),
        cliente_nome: cliente,
        cliente_telefone: '(31) 9' + Math.floor(10000000 + Math.random() * 90000000),
        cliente_cpf: '000.000.000-00',
        aparelho_modelo: modelo,
        aparelho_capacidade: capacidade,
        aparelho_imei: '35' + Math.floor(1000000000000 + Math.random() * 9000000000000),
        valor_total: valor,
        lucro: valor * 0.18,
        forma_pagamento: forma,
        tipo_venda: 'Varejo',
        vendedor: 'Lucas (IA)',
        created_at: 'Agora mesmo',
        garantia_dias: 90,
      };

      setProcessando(false);
      onVendaCriada(nova);
      onClose();
      setTexto('');
      setFotos([]);
    }, 1200);
  };

  const footer = (
    <div className="grid grid-cols-2 gap-2 w-full">
      <Button
        variant="outline"
        onClick={onClose}
        disabled={processando}
        className="h-11 rounded-xl border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold cursor-pointer"
      >
        Cancelar
      </Button>
      <Button
        onClick={handleProcessarIA}
        disabled={processando}
        className="h-11 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer"
      >
        {processando ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Lendo Pedido...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-cyan-200 animate-pulse" />
            Processar Pedido
          </>
        )}
      </Button>
    </div>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Importar Pedido c/ IA"
      subtitle="Cole o texto do WhatsApp ou envie a foto da etiqueta"
      footer={footer}
    >
      <div className="space-y-3.5">
        {/* Caixa de Texto Inteligente */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              Texto do Pedido / WhatsApp
            </label>
            <button
              onClick={() =>
                setTexto(
                  'Vendi para o cliente Rafael Souza um iPhone 14 Pro Max 256GB por R$ 4.600 no Pix pelo vendedor Jean.'
                )
              }
              className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
            >
              Colar Exemplo
            </button>
          </div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={processando}
            placeholder="Ex: Vendi para o cliente Carlos Silva por R$ 3.500 no Pix. Modelo e IMEI podem vir da foto da etiqueta..."
            rows={4}
            className="w-full bg-slate-800/80 border border-slate-700/90 rounded-2xl p-3 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none resize-none leading-relaxed"
          />
        </div>

        {/* Fotos da Caixa / Etiqueta / Tela Ajustes */}
        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1.5">
            Fotos da Etiqueta / IMEI (Opcional)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {fotos.map((foto, idx) => (
              <div
                key={idx}
                className="relative w-16 h-16 rounded-xl overflow-hidden border border-blue-500/30 group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemoverFoto(idx)}
                  className="absolute top-1 right-1 p-0.5 bg-black/80 rounded-full text-rose-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {fotos.length < 3 && (
              <button
                type="button"
                onClick={handleSimularFoto}
                className="w-16 h-16 rounded-xl border border-dashed border-blue-500/40 hover:border-blue-400 bg-blue-950/20 hover:bg-blue-950/40 text-blue-300 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all"
              >
                <Camera className="w-4 h-4 text-blue-400" />
                <span className="text-[9px] font-semibold">+ Foto</span>
              </button>
            )}
          </div>
          <p className="text-[10.5px] text-slate-400 mt-1">
            Dica: A IA lê o IMEI diretamente da foto da etiqueta ou da tela "Sobre" do aparelho.
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}
