'use client';

import { useState } from 'react';
import { 
  User, 
  CreditCard, 
  Shield, 
  LogOut, 
  ChevronDown, 
  Building2, 
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Smartphone,
  Sparkles,
  SlidersHorizontal
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useStorePlan } from '@/hooks/useStorePlan';
import { usePanelMode } from '@/hooks/usePanelMode';
import { checkIsSuperAdmin } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface UserAccountMenuProps {
  onOpenMeuPlano: () => void;
  onNavigateSuperAdmin?: () => void;
  currentTab?: string;
}

export function UserAccountMenu({ onOpenMeuPlano, onNavigateSuperAdmin, currentTab }: UserAccountMenuProps) {
  const { usuario, logout } = useAuth();
  const { planData } = useStorePlan();
  const { isModoSimples, toggleModoSimples } = usePanelMode();

  if (!usuario) return null;

  const isSuperAdmin = checkIsSuperAdmin(usuario);

  const getPlanBadge = () => {
    switch (planData.planoStatus) {
      case 'ativo':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">🟢 Ativo</Badge>;
      case 'pendente':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">⏳ Pendente</Badge>;
      case 'vencido':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">⚠️ Vencido</Badge>;
      case 'bloqueado':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">🔴 Bloqueado</Badge>;
      default:
        return null;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 rounded-2xl transition cursor-pointer text-left">
          <div className="w-7 h-7 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/30">
            {usuario.nome ? usuario.nome.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </div>
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-xs font-bold text-white max-w-[120px] truncate">{usuario.nome}</span>
            <span className="text-[10px] text-slate-400 capitalize leading-none">{usuario.role}</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 bg-slate-900 border border-slate-800 text-slate-100 p-2 rounded-2xl shadow-2xl z-[1000]">
        <DropdownMenuLabel className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 mb-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-white truncate">{usuario.nome}</p>
            {getPlanBadge()}
          </div>
          <p className="text-[11px] text-slate-400 truncate">{usuario.email}</p>
          <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-400 font-semibold">
            <Building2 className="w-3 h-3" /> {planData.nomeLoja}
          </div>
          {planData.planoStatus === 'vencido' && (
            <div className="text-[10px] text-orange-400 font-semibold mt-1.5 flex items-center gap-1 bg-orange-500/10 px-2 py-0.5 rounded-lg border border-orange-500/20">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>Plano vencido</span>
            </div>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-slate-800 my-1" />

        {/* Opção Meu Plano */}
        <DropdownMenuItem 
          onClick={onOpenMeuPlano}
          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800 focus:bg-slate-800 text-xs font-medium cursor-pointer text-slate-200"
        >
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            <span>Meu Plano & Mensalidade</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">R$ {planData.valorMensalidade.toFixed(2).replace('.', ',')}</span>
        </DropdownMenuItem>

        {/* Alternar Modo Simples / Completo */}
        <DropdownMenuItem 
          onClick={toggleModoSimples}
          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800 focus:bg-slate-800 text-xs font-medium cursor-pointer text-slate-200"
        >
          <div className="flex items-center gap-2">
            {isModoSimples ? (
              <Sparkles className="w-4 h-4 text-amber-400" />
            ) : (
              <SlidersHorizontal className="w-4 h-4 text-blue-400" />
            )}
            <span>Visualização:</span>
          </div>
          <Badge className={isModoSimples ? "bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]" : "bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]"}>
            {isModoSimples ? "Modo Simples" : "Modo Completo"}
          </Badge>
        </DropdownMenuItem>

        {/* Opção Super Admin (se permitido) */}
        {isSuperAdmin && onNavigateSuperAdmin && (
          <DropdownMenuItem 
            onClick={onNavigateSuperAdmin}
            className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium cursor-pointer ${
              currentTab === 'superadmin' ? 'bg-indigo-600/30 text-indigo-300' : 'hover:bg-slate-800 focus:bg-slate-800 text-indigo-400'
            }`}
          >
            <Shield className="w-4 h-4 text-indigo-400" />
            <span>Painel Super Admin</span>
          </DropdownMenuItem>
        )}

        {/* Instalar App Web */}
        <DropdownMenuItem 
          onClick={() => {
            const btn = document.querySelector('button[title="Instalar App"]') as HTMLButtonElement;
            if (btn) btn.click();
            else {
              alert('Para instalar o app: no Safari toque em Compartilhar -> Adicionar à Tela de Início. No Chrome/Edge, clique no ícone de instalar na barra de navegação!');
            }
          }}
          className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-800 focus:bg-slate-800 text-xs font-medium cursor-pointer text-indigo-300"
        >
          <Smartphone className="w-4 h-4 text-indigo-400" />
          <span>Instalar App Web</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-slate-800 my-1" />

        {/* Trocar de Conta / Ir para Login */}
        <DropdownMenuItem 
          onClick={logout}
          className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-800 focus:bg-slate-800 text-xs font-medium cursor-pointer text-amber-400"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Trocar de Conta / Fazer Login</span>
        </DropdownMenuItem>

        {/* Sair do Sistema */}
        <DropdownMenuItem 
          onClick={logout}
          className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-red-500/20 focus:bg-red-500/20 text-xs font-medium cursor-pointer text-red-400"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair do Sistema</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
