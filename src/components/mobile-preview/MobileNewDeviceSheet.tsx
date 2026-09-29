'use client';

import React, { useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Check, Sparkles } from 'lucide-react';
import { MockAparelho } from './MobileDeviceRow';

interface MobileNewDeviceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSalvar: (aparelho: MockAparelho) => void;
}

export function MobileNewDeviceSheet({ isOpen, onClose, onSalvar }: MobileNewDeviceSheetProps) {
  const [modelo, setModelo] = useState('');
  const [capacidade, setCapacidade] = useState('128GB');
  const [cor, setCor] = useState('');
  const [bateria, setBateria] = useState('');
  const [precoVenda, setPrecoVenda] = useState('');
  const [imei, setImei] = useState('');

  const capacidades = ['64GB', '128GB', '256GB', '512GB', '1TB'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelo || !precoVenda) {
      alert('Informe o modelo e o preço de venda.');
      return;
    }

    const novo: MockAparelho = {
      id: String(Date.now()),
      modelo,
      capacidade,
      cor: cor || 'Preto',
      bateria: bateria ? Number(bateria) : 100,
      preco_venda: Number(precoVenda.replace(/\D/g, '')),
      status: 'Em estoque',
      imei: imei || '35' + Math.floor(1000000000000 + Math.random() * 9000000000000),
      categoria: 'iPhones Novos',
    };

    onSalvar(novo);
    onClose();
    // Limpa estado
    setModelo('');
    setCor('');
    setBateria('');
    setPrecoVenda('');
    setImei('');
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
        className="h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold gap-1.5 shadow-lg shadow-blue-600/30 cursor-pointer"
      >
        <Check className="w-4 h-4" />
        Cadastrar
      </Button>
    </div>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Aparelho"
      subtitle="Cadastre o dispositivo direto pelo celular"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1">
            Modelo do Aparelho *
          </label>
          <Input
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="Ex: iPhone 14 Pro"
            className="h-11 rounded-xl bg-slate-800/80 border-slate-700 text-white"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1">
            Capacidade de Armazenamento
          </label>
          <div className="grid grid-cols-5 gap-1">
            {capacidades.map((cap) => (
              <button
                type="button"
                key={cap}
                onClick={() => setCapacidade(cap)}
                className={`py-2 text-xs rounded-xl font-bold border transition-all cursor-pointer ${
                  capacidade === cap
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {cap}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Cor</label>
            <Input
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              placeholder="Ex: Titânio Natural"
              className="h-11 rounded-xl bg-slate-800/80 border-slate-700 text-white"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Bateria (%)</label>
            <Input
              type="number"
              value={bateria}
              onChange={(e) => setBateria(e.target.value)}
              placeholder="Ex: 95"
              className="h-11 rounded-xl bg-slate-800/80 border-slate-700 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              Preço de Venda (R$) *
            </label>
            <Input
              value={precoVenda}
              onChange={(e) => setPrecoVenda(e.target.value)}
              placeholder="Ex: 3800"
              className="h-11 rounded-xl bg-slate-800/80 border-slate-700 text-cyan-300 font-bold"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">IMEI</label>
            <Input
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              placeholder="15 dígitos"
              className="h-11 rounded-xl bg-slate-800/80 border-slate-700 text-white font-mono text-xs"
            />
          </div>
        </div>
      </form>
    </BottomSheet>
  );
}
