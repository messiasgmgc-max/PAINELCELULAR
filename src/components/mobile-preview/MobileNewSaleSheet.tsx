'use client';

import React, { useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ShoppingBag, Sparkles } from 'lucide-react';
import { MockVenda } from './MobileSaleRow';

interface MobileNewSaleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSalvar: (venda: MockVenda) => void;
}

export function MobileNewSaleSheet({ isOpen, onClose, onSalvar }: MobileNewSaleSheetProps) {
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [modelo, setModelo] = useState('');
  const [capacidade, setCapacidade] = useState('128GB');
  const [valorTotal, setValorTotal] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<'PIX' | 'Cartão' | 'Dinheiro'>('PIX');
  const [tipoVenda, setTipoVenda] = useState<'Varejo' | 'Atacado'>('Varejo');

  const formas = ['PIX', 'Cartão', 'Dinheiro'] as const;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNome || !modelo || !valorTotal) {
      alert('Informe o cliente, aparelho e valor da venda.');
      return;
    }

    const valor = Number(valorTotal.replace(/\D/g, ''));
    const nova: MockVenda = {
      id: String(Date.now()).slice(-4),
      cliente_nome: clienteNome,
      cliente_telefone: clienteTelefone || '(31) 99999-8888',
      aparelho_modelo: modelo,
      aparelho_capacidade: capacidade,
      aparelho_imei: '35' + Math.floor(1000000000000 + Math.random() * 9000000000000),
      valor_total: valor,
      lucro: valor * 0.18,
      forma_pagamento: formaPagamento,
      tipo_venda: tipoVenda,
      vendedor: 'Lucas (Você)',
      created_at: 'Agora mesmo',
      garantia_dias: 90,
    };

    onSalvar(nova);
    onClose();
    // Limpa estado
    setClienteNome('');
    setClienteTelefone('');
    setModelo('');
    setValorTotal('');
  };

  const footer = (
    <div className="grid grid-cols-2 gap-2 w-full">
      <Button
        variant="outline"
        onClick={onClose}
        className="h-11 rounded-xl border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold cursor-pointer"
      >
        Cancelar
      </Button>
      <Button
        onClick={handleSubmit}
        className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer"
      >
        <Check className="w-4 h-4" />
        Finalizar Venda
      </Button>
    </div>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Nova Venda"
      subtitle="Finalize e gere a notinha na hora pelo celular"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1">
            Nome do Cliente *
          </label>
          <Input
            value={clienteNome}
            onChange={(e) => setClienteNome(e.target.value)}
            placeholder="Ex: João Silva"
            className="h-11 rounded-xl bg-slate-800/80 border-slate-700 text-white"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Telefone WhatsApp</label>
            <Input
              value={clienteTelefone}
              onChange={(e) => setClienteTelefone(e.target.value)}
              placeholder="(31) 9..."
              className="h-11 rounded-xl bg-slate-800/80 border-slate-700 text-white"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Tipo de Venda</label>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setTipoVenda('Varejo')}
                className={`py-2.5 text-xs rounded-xl font-bold border transition-all cursor-pointer ${
                  tipoVenda === 'Varejo'
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Varejo
              </button>
              <button
                type="button"
                onClick={() => setTipoVenda('Atacado')}
                className={`py-2.5 text-xs rounded-xl font-bold border transition-all cursor-pointer ${
                  tipoVenda === 'Atacado'
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Atacado
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              Aparelho Vendido *
            </label>
            <Input
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Ex: iPhone 13"
              className="h-11 rounded-xl bg-slate-800/80 border-slate-700 text-white"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Capacidade</label>
            <Input
              value={capacidade}
              onChange={(e) => setCapacidade(e.target.value)}
              placeholder="Ex: 128GB"
              className="h-11 rounded-xl bg-slate-800/80 border-slate-700 text-white"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1">
            Valor Total da Venda (R$) *
          </label>
          <Input
            value={valorTotal}
            onChange={(e) => setValorTotal(e.target.value)}
            placeholder="Ex: 2790"
            className="h-11 rounded-xl bg-slate-800/80 border-slate-700 text-emerald-400 font-black text-lg"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1">
            Forma de Pagamento
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {formas.map((f) => (
              <button
                type="button"
                key={f}
                onClick={() => setFormaPagamento(f)}
                className={`py-2 text-xs rounded-xl font-bold border transition-all cursor-pointer ${
                  formaPagamento === f
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/30'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </form>
    </BottomSheet>
  );
}
