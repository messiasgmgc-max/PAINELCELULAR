import React, { useState } from "react";
import { Aparelho } from "@/lib/db/types";
import { getAparelhoCodigo, cn, formatarSaudeBateria } from "@/lib/utils";
import { extrairDadosManutencao } from "@/lib/manutencao";
import { Badge } from "@/components/ui/badge";
import { 
  MoreVertical, FileText, Edit2, Trash2, Check, ShoppingBag, Wrench, Calendar, 
  ChevronDown, ChevronUp, Copy
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface AparelhoCardProps {
  aparelho: Aparelho;
  density?: 'compact' | 'detailed';
  onEdit: (aparelho: Aparelho) => void;
  onDelete: (id: string) => void;
  onPDF: (aparelho: Aparelho) => void;
  onVender: (aparelho: Aparelho) => void;
  onManutencao: (aparelho: Aparelho) => void;
  onRetornoManutencao: (aparelho: Aparelho) => void;
}


function extractDataSaida(aparelho: any): string | null {
  if (aparelho.data_saida) {
    const d = new Date(aparelho.data_saida);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('pt-BR');
  }
  if (aparelho.dataSaida) {
    const d = new Date(aparelho.dataSaida);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('pt-BR');
  }
  if (aparelho.observacoes) {
    const m = aparelho.observacoes.match(/em (\d{2}\/\d{2}\/\d{4})/);
    if (m) return m[1];
    const m2 = aparelho.observacoes.match(/BAIXA_ESTOQUE:\s?(\d{2}\/\d{2}\/\d{4})/);
    if (m2) return m2[1];
  }
  return null;
}

export function AparelhoCard({ 
  aparelho, 
  density = 'detailed',
  onEdit, 
  onDelete, 
  onPDF, 
  onVender, 
  onManutencao, 
  onRetornoManutencao 
}: AparelhoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const custoNum = (aparelho as any).custo || 0;
  const precoAtacadoNum = (aparelho as any).precoAtacado;
  const saudeBat = formatarSaudeBateria(aparelho);
  const dadosManut = extrairDadosManutencao(aparelho);
  const estaEmManutencao = dadosManut.emManutencao;

  const identificador = aparelho.imei || aparelho.numeroSerie || getAparelhoCodigo(aparelho);

  const handleCopyDesc = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(aparelho.observacoes || "");
    toast.success("Descrição copiada para a área de transferência!");
  };

  // MODO COMPACTO (52px de altura quando recolhido)
  if (density === 'compact' && !expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        className={cn(
          "w-full min-h-[52px] px-3 py-1.5 rounded-xl border transition-all cursor-pointer select-none flex items-center justify-between gap-2.5 group",
          estaEmManutencao
            ? "bg-amber-950/20 border-amber-500/50"
            : "bg-slate-900/80 hover:bg-slate-800/90 active:bg-blue-950/40 border-slate-800/90 hover:border-blue-500/40"
        )}
      >
        {/* ID / Badge */}
        <div className="w-8 h-8 rounded-lg bg-blue-950/50 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400 font-mono text-[10px] font-bold">
          {getAparelhoCodigo(aparelho).slice(-3)}
        </div>

        {/* Modelo + Capacidade + Cor */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs sm:text-sm text-white truncate">
              {aparelho.modelo}
            </span>
            {aparelho.capacidade && (
              <span className="text-[10px] font-semibold text-blue-400 px-1 py-0.2 bg-blue-950/60 rounded border border-blue-500/20 shrink-0">
                {aparelho.capacidade}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400 truncate">
            {aparelho.cor && <span className="truncate">{aparelho.cor}</span>}
            {saudeBat && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-emerald-400 font-medium">🔋 {saudeBat}</span>
              </>
            )}
            {estaEmManutencao && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400 font-bold">Manut.</span>
              </>
            )}
          </div>
        </div>

        {/* Preço e Chevron */}
        <div className="flex items-center gap-2 shrink-0 text-right">
          <div>
            <div className="font-bold text-xs sm:text-sm text-emerald-400">
              R$ {aparelho.preco.toFixed(2).replace(".", ",")}
            </div>
            <span className={cn(
              "text-[9px] px-1.5 py-0.2 font-semibold rounded border block mt-0.5",
              aparelho.condicao === 'novo' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
              aparelho.condicao === 'seminovo' ? 'text-blue-300 border-blue-500/30 bg-blue-500/10' :
              'text-slate-400 border-slate-700 bg-slate-800'
            )}>
              {aparelho.condicao === 'novo' ? 'Novo' : aparelho.condicao === 'seminovo' ? 'Seminovo' : 'Usado'}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl sm:rounded-3xl p-3 sm:p-5 transition-all shadow-md",
        estaEmManutencao
          ? "bg-amber-950/20 border-2 border-amber-500/60 shadow-amber-950/20"
          : "bg-slate-900/90 border border-slate-800/90 hover:border-cyan-500/40"
      )}
    >
      <div 
        className="flex items-center justify-between gap-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded-md shrink-0">
              ID: {getAparelhoCodigo(aparelho)}
            </span>
            {estaEmManutencao && (
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] shrink-0">
                Em Manutenção
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-[10px] bg-slate-950/50 uppercase", 
              aparelho.condicao === 'novo' ? 'text-emerald-400 border-emerald-500/30' :
              aparelho.condicao === 'seminovo' ? 'text-blue-400 border-blue-500/30' : 'text-slate-400 border-slate-700'
            )}>
              {aparelho.condicao === 'novo' ? '✨ Novo' : aparelho.condicao === 'seminovo' ? '💎 Semi' : '📦 Usado'}
            </Badge>
          </div>

          <div className="flex items-baseline gap-2 flex-wrap">
            <h4 className="font-extrabold text-sm sm:text-base text-white truncate max-w-[200px] sm:max-w-none">
              {aparelho.modelo}
            </h4>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold truncate">
              {aparelho.capacidade && <span>{aparelho.capacidade}</span>}
              {aparelho.cor && <span>• {aparelho.cor}</span>}
              {saudeBat && <span className="text-cyan-400">• 🔋 {saudeBat}</span>}
            </div>
          </div>

          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-slate-500 font-mono truncate">
              ID/IMEI: {identificador}
            </span>
            <span className="font-extrabold text-sm text-emerald-400 ml-auto">
              R$ {aparelho.preco.toFixed(2).replace(".", ",")}
            </span>
          </div>
        </div>

        <div className="shrink-0 p-2 text-slate-500">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {custoNum > 0 && (
              <div className="text-xs bg-slate-950/50 px-3 py-2 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block">Custo</span>
                <span className="font-semibold text-slate-300">R$ {custoNum.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            {precoAtacadoNum ? (
              <div className="text-xs text-blue-300 bg-blue-500/10 px-3 py-2 rounded-xl border border-blue-500/30">
                <span className="text-[10px] text-blue-400/80 block font-bold">Atacado</span>
                <span className="font-bold">R$ {Number(precoAtacadoNum).toFixed(2).replace(".", ",")}</span>
              </div>
            ) : null}
            {aparelho.observacoes && (
              <div className="col-span-2 sm:col-span-4 flex justify-start">
                <Button variant="outline" size="sm" onClick={handleCopyDesc} className="text-xs border-slate-700 bg-slate-900 text-slate-300 h-8">
                  <Copy className="w-3 h-3 mr-2" /> Copiar Descrição
                </Button>
              </div>
            )}
          </div>

          {showDeleteConfirm && (
            <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl space-y-2">
              <p className="text-xs text-rose-200 font-medium">Tem certeza que deseja deletar permanentemente?</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => onDelete(aparelho.id)} className="h-7 text-xs">Sim, Deletar</Button>
                <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(false)} className="h-7 text-xs border-slate-600">Cancelar</Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 justify-end flex-wrap pt-2">
            {estaEmManutencao ? (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRetornoManutencao(aparelho); }}
                className="text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 shadow-md h-8 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5 mr-1.5" /> Receber Manut.
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onVender(aparelho); }}
                  className="text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 shadow-md h-8 cursor-pointer"
                >
                  <ShoppingBag className="h-3.5 w-3.5 mr-1.5" /> Vender
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); onManutencao(aparelho); }}
                  className="text-xs text-blue-300 border-blue-500/30 bg-blue-950/20 hover:bg-blue-900/30 h-8 cursor-pointer"
                >
                  <Wrench className="h-3.5 w-3.5 mr-1" /> Manut.
                </Button>
              </>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" onClick={(e) => e.stopPropagation()} className="h-8 w-8 p-0 border-slate-700 bg-slate-800 text-slate-300">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-slate-900 border-slate-800 text-slate-200 z-[9999]">
                <DropdownMenuItem onClick={() => onPDF(aparelho)} className="cursor-pointer hover:bg-slate-800">
                  <FileText className="mr-2 h-4 w-4 text-blue-400" /> PDF Garantia/Etiqueta
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(aparelho)} className="cursor-pointer hover:bg-slate-800">
                  <Edit2 className="mr-2 h-4 w-4 text-blue-400" /> Editar Aparelho
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-800" />
                <DropdownMenuItem 
                  onClick={(e) => { e.preventDefault(); setShowDeleteConfirm(true); }} 
                  className="cursor-pointer hover:bg-rose-950/50 text-rose-400 focus:bg-rose-950/50 focus:text-rose-400"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Deletar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
}
