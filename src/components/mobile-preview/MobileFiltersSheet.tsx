'use client';

import React from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { RotateCcw, Check, Sparkles } from 'lucide-react';

interface FilterState {
  categoria: string;
  capacidade: string;
  bateriaMin: string;
  status: string;
}

interface MobileFiltersSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filtros: FilterState;
  setFiltros: React.Dispatch<React.SetStateAction<FilterState>>;
  totalEncontrados: number;
}

export function MobileFiltersSheet({
  isOpen,
  onClose,
  filtros,
  setFiltros,
  totalEncontrados,
}: MobileFiltersSheetProps) {
  const categorias = ['Todas', 'iPhones Novos', 'Seminovos', 'Xiaomi / Android', 'Acessórios'];
  const capacidades = ['Todas', '64GB', '128GB', '256GB', '512GB', '1TB'];
  const statusOptions = ['Todos', 'Em estoque', 'Reservado', 'Vendido'];
  const baterias = ['Todas', '80%+', '85%+', '90%+', '100%'];

  const limparFiltros = () => {
    setFiltros({
      categoria: 'Todas',
      capacidade: 'Todas',
      bateriaMin: 'Todas',
      status: 'Todos',
    });
  };

  const footer = (
    <div className="grid grid-cols-2 gap-2 w-full">
      <Button
        variant="outline"
        onClick={limparFiltros}
        className="h-11 rounded-xl border-slate-700 hover:bg-slate-800 text-slate-300 gap-1.5 cursor-pointer font-semibold"
      >
        <RotateCcw className="w-4 h-4" />
        Limpar
      </Button>
      <Button
        onClick={onClose}
        className="h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold gap-1.5 shadow-lg shadow-blue-600/30 cursor-pointer"
      >
        <Check className="w-4 h-4" />
        Ver {totalEncontrados} Itens
      </Button>
    </div>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Filtros do Estoque"
      subtitle="Refine sua busca por capacidade, saúde e status"
      footer={footer}
    >
      <div className="space-y-4">
        {/* 1. Categorias */}
        <div>
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
            Categoria
          </label>
          <div className="flex flex-wrap gap-1.5">
            {categorias.map((cat) => {
              const active = filtros.categoria === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setFiltros((prev) => ({ ...prev, categoria: cat }))}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium border transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-600 border-blue-500 text-white font-bold shadow-md shadow-blue-600/20'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-700/80'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Capacidade */}
        <div>
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
            Armazenamento (GB)
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {capacidades.map((cap) => {
              const active = filtros.capacidade === cap;
              return (
                <button
                  key={cap}
                  onClick={() => setFiltros((prev) => ({ ...prev, capacidade: cap }))}
                  className={`text-xs py-2 rounded-xl font-medium border text-center transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-600 border-blue-500 text-white font-bold shadow-md shadow-blue-600/20'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-700/80'
                  }`}
                >
                  {cap}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Saúde da Bateria */}
        <div>
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
            Saúde da Bateria
          </label>
          <div className="flex flex-wrap gap-1.5">
            {baterias.map((bat) => {
              const active = filtros.bateriaMin === bat;
              return (
                <button
                  key={bat}
                  onClick={() => setFiltros((prev) => ({ ...prev, bateriaMin: bat }))}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium border transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-600 border-blue-500 text-white font-bold shadow-md shadow-blue-600/20'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-700/80'
                  }`}
                >
                  {bat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Status */}
        <div>
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
            Status do Aparelho
          </label>
          <div className="grid grid-cols-2 gap-2">
            {statusOptions.map((st) => {
              const active = filtros.status === st;
              return (
                <button
                  key={st}
                  onClick={() => setFiltros((prev) => ({ ...prev, status: st }))}
                  className={`text-xs py-2 px-3 rounded-xl font-medium border text-center transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-600 border-blue-500 text-white font-bold shadow-md shadow-blue-600/20'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-700/80'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
