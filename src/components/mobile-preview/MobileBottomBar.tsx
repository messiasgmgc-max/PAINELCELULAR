'use client';

import React from 'react';
import {
  Search,
  Plus,
  Filter,
  QrCode,
  CheckSquare,
  Sparkles,
  Repeat,
  Calendar,
  FileSpreadsheet,
  DollarSign,
  Eye,
  MessageCircle,
  RotateCcw,
  CreditCard,
} from 'lucide-react';

interface MobileBottomBarProps {
  activeTab: 'estoque' | 'vendas' | 'taxas';
  onSearchClick: () => void;
  onFilterClick: () => void;
  onNewDeviceClick: () => void;
  onConferirClick: () => void;
  onImportarPedidoClick?: () => void;
  onVincularVendidoClick?: () => void;
  onTaxasWhatsappClick?: () => void;
  onTaxasToggleModoClick?: () => void;
  onTaxasResetClick?: () => void;
  filtrosAtivosCount: number;
}

export function MobileBottomBar({
  activeTab,
  onSearchClick,
  onFilterClick,
  onNewDeviceClick,
  onConferirClick,
  onImportarPedidoClick,
  onVincularVendidoClick,
  onTaxasWhatsappClick,
  onTaxasToggleModoClick,
  onTaxasResetClick,
  filtrosAtivosCount,
}: MobileBottomBarProps) {
  // BARRA INFERIOR ADAPTADA PARA A ABA DE TAXAS
  if (activeTab === 'taxas') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 p-2 sm:p-3 pointer-events-none flex justify-center">
        <nav className="pointer-events-auto w-full max-w-md h-16 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-cyan-500/30 shadow-2xl shadow-black/70 px-2 flex items-center justify-around gap-1">
          {/* 1. Rolar p/ o Campo de Valor */}
          <button
            onClick={onSearchClick}
            className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-cyan-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[50px]"
            title="Ir para o campo de valor"
          >
            <DollarSign className="w-5 h-5 text-cyan-400" />
            <span className="text-[10px] font-medium tracking-tight">Valor</span>
          </button>

          {/* 2. Alternar Modo Cliente / Lojista */}
          <button
            onClick={onTaxasToggleModoClick}
            className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-amber-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[52px]"
            title="Alternar Modo Cliente / Lojista"
          >
            <Eye className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] font-medium tracking-tight">Margens</span>
          </button>

          {/* 3. Botão Principal Central (+ WHATSAPP COMPARTILHAR) */}
          <button
            onClick={onTaxasWhatsappClick}
            className="relative -top-3 bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-2xl w-14 h-14 flex flex-col items-center justify-center shadow-lg shadow-emerald-500/30 border-2 border-slate-900 active:scale-90 transition-all cursor-pointer shrink-0"
            title="Copiar Simulação Completa para o WhatsApp"
          >
            <MessageCircle className="w-6 h-6 stroke-[2.2]" />
            <span className="text-[8.5px] font-bold tracking-tight -mt-0.5">WhatsApp</span>
          </button>

          {/* 4. Zerar Valor */}
          <button
            onClick={onTaxasResetClick}
            className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-rose-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[50px]"
            title="Limpar Campo de Valor"
          >
            <RotateCcw className="w-5 h-5 text-slate-400 hover:text-rose-400" />
            <span className="text-[10px] font-medium tracking-tight">Zerar</span>
          </button>

          {/* 5. Alternar Maquininha */}
          <button
            onClick={onFilterClick}
            className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-cyan-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[50px]"
            title="Próxima Maquininha"
          >
            <CreditCard className="w-5 h-5 text-cyan-400" />
            <span className="text-[10px] font-medium tracking-tight">Máquina</span>
          </button>
        </nav>
      </div>
    );
  }

  // BARRA INFERIOR ADAPTADA PARA A ABA DE VENDAS
  if (activeTab === 'vendas') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 p-2 sm:p-3 pointer-events-none flex justify-center">
        <nav className="pointer-events-auto w-full max-w-md h-16 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-emerald-500/20 shadow-2xl shadow-black/70 px-2 flex items-center justify-around gap-1">
          {/* 1. Busca de Vendas */}
          <button
            onClick={onSearchClick}
            className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-emerald-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[50px]"
            title="Buscar Venda"
          >
            <Search className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight">Buscar</span>
          </button>

          {/* 2. Importar Pedido c/ IA (O botão que você usa muito!) */}
          <button
            onClick={onImportarPedidoClick}
            className="relative flex flex-col items-center justify-center gap-0.5 text-cyan-400 hover:text-cyan-300 active:scale-95 transition-all p-1 rounded-xl hover:bg-cyan-950/30 cursor-pointer min-w-[56px]"
            title="Importar Pedido via Texto ou Foto"
          >
            <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span className="text-[9.5px] font-bold tracking-tight text-cyan-300">Importar</span>
          </button>

          {/* 3. Botão Principal Central (+ NOVA VENDA) */}
          <button
            onClick={onNewDeviceClick}
            className="relative -top-3 bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-2xl w-14 h-14 flex flex-col items-center justify-center shadow-lg shadow-emerald-500/30 border-2 border-slate-900 active:scale-90 transition-all cursor-pointer shrink-0"
            title="Cadastrar Nova Venda Manual"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
            <span className="text-[9px] font-bold tracking-tight -mt-0.5">Venda</span>
          </button>

          {/* 4. Vincular Já Vendido */}
          <button
            onClick={onVincularVendidoClick}
            className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-blue-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[50px]"
            title="Vincular Aparelho Já Vendido"
          >
            <Repeat className="w-5 h-5 text-blue-400" />
            <span className="text-[10px] font-medium tracking-tight">Vincular</span>
          </button>

          {/* 5. Filtros / Período */}
          <button
            onClick={onFilterClick}
            className="relative flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-emerald-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[50px]"
            title="Filtros de Venda"
          >
            <div className="relative">
              <Filter className="w-5 h-5" />
              {filtrosAtivosCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-emerald-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md">
                  {filtrosAtivosCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium tracking-tight">Filtros</span>
          </button>
        </nav>
      </div>
    );
  }

  // BARRA INFERIOR ADAPTADA PARA A ABA DE ESTOQUE
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-2 sm:p-3 pointer-events-none flex justify-center">
      <nav className="pointer-events-auto w-full max-w-md h-16 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-blue-500/20 shadow-2xl shadow-black/70 px-2 flex items-center justify-around gap-1">
        {/* 1. Busca no Estoque */}
        <button
          onClick={onSearchClick}
          className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-blue-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[50px]"
          title="Buscar Aparelho"
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight">Buscar</span>
        </button>

        {/* 2. Filtros de Estoque com Badge */}
        <button
          onClick={onFilterClick}
          className="relative flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-blue-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[50px]"
          title="Filtros de Estoque"
        >
          <div className="relative">
            <Filter className="w-5 h-5" />
            {filtrosAtivosCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-blue-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md animate-pulse">
                {filtrosAtivosCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium tracking-tight">Filtros</span>
        </button>

        {/* 3. Botão Principal Central (+ NOVO APARELHO) */}
        <button
          onClick={onNewDeviceClick}
          className="relative -top-3 bg-gradient-to-tr from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-2xl w-14 h-14 flex flex-col items-center justify-center shadow-lg shadow-blue-500/30 border-2 border-slate-900 active:scale-90 transition-all cursor-pointer shrink-0"
          title="Cadastrar Novo Aparelho"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
          <span className="text-[9px] font-bold tracking-tight -mt-0.5">Novo</span>
        </button>

        {/* 4. Conferir Estoque */}
        <button
          onClick={onConferirClick}
          className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-blue-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[50px]"
          title="Conferência de Estoque"
        >
          <CheckSquare className="w-5 h-5 text-blue-400" />
          <span className="text-[10px] font-medium tracking-tight">Conferir</span>
        </button>

        {/* 5. Scanner */}
        <button
          onClick={onConferirClick}
          className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-blue-400 active:scale-95 transition-all p-1 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[50px]"
          title="Scanner de IMEI / QR"
        >
          <QrCode className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight">Scanner</span>
        </button>
      </nav>
    </div>
  );
}
