"use client";

import React, { useState } from "react";
import { Aparelho } from "@/lib/db/types";
import { getAparelhoCodigo, cn, formatarSaudeBateria } from "@/lib/utils";
import { extrairDadosManutencao } from "@/lib/manutencao";
import {
  calcularDiasEmEstoque,
  classificarBateria,
  montarTextoCompartilharAparelho,
  obterCustoAparelho,
  obterPercentualBateria,
  obterPrecoAtacado,
  obterPrecoVenda,
  obterQuantidadeAparelho,
} from "@/lib/estoque/resumoEstoque";
import { Badge } from "@/components/ui/badge";
import {
  MoreVertical,
  FileText,
  Edit2,
  Trash2,
  Check,
  ShoppingBag,
  Wrench,
  ChevronDown,
  ChevronUp,
  Copy,
  Battery,
  Clock,
  AlertCircle,
  Share2,
  Smartphone,
  Headphones,
  Package,
  Sparkles,
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
  density?: "compact" | "detailed";
  ocultarCustos?: boolean;
  onEdit: (aparelho: Aparelho) => void;
  onDelete: (id: string) => void;
  onPDF: (aparelho: Aparelho) => void;
  onVender: (aparelho: Aparelho) => void;
  onManutencao: (aparelho: Aparelho) => void;
  onRetornoManutencao: (aparelho: Aparelho) => void;
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function corBateriaTexto(nivel: ReturnType<typeof classificarBateria>): string {
  if (nivel === "otima") return "text-emerald-600 dark:text-emerald-400";
  if (nivel === "boa") return "text-amber-600 dark:text-amber-400";
  if (nivel === "atencao") return "text-rose-600 dark:text-rose-400";
  return "text-slate-400";
}

function badgeCondicao(condicao: string): { label: string; className: string } {
  if (condicao === "novo") {
    return {
      label: "Novo",
      className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
    };
  }
  if (condicao === "seminovo") {
    return {
      label: "Seminovo",
      className: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30",
    };
  }
  if (condicao === "danificado") {
    return {
      label: "Danificado",
      className: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30",
    };
  }
  return {
    label: "Usado",
    className: "bg-slate-800 text-slate-400 border-slate-800",
  };
}

function renderIconeCategoria(categoria?: string) {
  if (categoria === "acessorio") return <Headphones className="w-4 h-4" />;
  if (categoria === "perfume") return <Sparkles className="w-4 h-4" />;
  if (categoria === "outro") return <Package className="w-4 h-4" />;
  return <Smartphone className="w-4 h-4" />;
}

export function AparelhoCard({
  aparelho,
  density = "detailed",
  ocultarCustos = false,
  onEdit,
  onDelete,
  onPDF,
  onVender,
  onManutencao,
  onRetornoManutencao,
}: AparelhoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!aparelho) return null;

  const precoNum = obterPrecoVenda(aparelho);
  const custoNum = obterCustoAparelho(aparelho);
  const precoAtacadoNum = obterPrecoAtacado(aparelho);
  const quantidadeNum = obterQuantidadeAparelho(aparelho);
  const semPreco = precoNum <= 0;
  const lucroEstimado = precoNum > 0 && custoNum > 0 ? precoNum - custoNum : null;

  const saudeBat = formatarSaudeBateria(aparelho);
  const batPct = obterPercentualBateria(aparelho);
  const nivelBat = classificarBateria(batPct);
  const diasEstoque = calcularDiasEmEstoque(aparelho);
  const paradoLongo = diasEstoque !== null && diasEstoque >= 30;

  const dadosManut = extrairDadosManutencao(aparelho);
  const estaEmManutencao = dadosManut.emManutencao;

  const codigoCurto = getAparelhoCodigo(aparelho);
  const identificador = aparelho.imei || aparelho.numeroSerie || codigoCurto;
  const condicaoInfo = badgeCondicao(aparelho.condicao);

  const subtituloSpecs = [
    aparelho.capacidade,
    aparelho.cor,
    aparelho.tamanho_ml,
    aparelho.tipo_perfume,
    aparelho.tipo_acessorio,
  ]
    .filter(Boolean)
    .join(" • ");

  const handleCopiarImei = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!identificador) return;
    navigator.clipboard.writeText(String(identificador));
    toast.success(`Copiado: ${identificador}`);
  };

  const handleCopiarOferta = (e: React.MouseEvent) => {
    e.stopPropagation();
    const texto = montarTextoCompartilharAparelho(aparelho);
    navigator.clipboard.writeText(texto);
    toast.success("Oferta copiada para enviar no WhatsApp!");
  };

  const handleCopyDesc = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(aparelho.observacoes || "");
    toast.success("Observação copiada!");
  };

  // MODO COMPACTO (linha densa de ~54px quando recolhido)
  if (density === "compact" && !expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        className={cn(
          "w-full min-h-[54px] px-3 py-2 rounded-xl border transition-all cursor-pointer select-none flex items-center justify-between gap-2.5 group",
          estaEmManutencao
            ? "bg-amber-500/10 border-amber-500/40 hover:border-amber-400/60"
            : "bg-slate-950/60 hover:bg-slate-900/80 border-slate-800 hover:border-cyan-500/40"
        )}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 font-mono text-[10px] font-bold",
            estaEmManutencao
              ? "bg-amber-500/15 border-amber-500/35 text-amber-500 dark:text-amber-300"
              : "bg-slate-800 border-slate-800 text-cyan-500 dark:text-cyan-300"
          )}
        >
          {codigoCurto.slice(-4)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-xs sm:text-sm text-white truncate">
              {aparelho.modelo || "Sem Modelo"}
            </span>
            {aparelho.capacidade && (
              <span className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-300 px-1.5 py-0.5 bg-cyan-500/15 rounded border border-cyan-500/25 shrink-0">
                {aparelho.capacidade}
              </span>
            )}
            {quantidadeNum > 1 && (
              <span className="text-[10px] font-semibold text-slate-300 px-1.5 py-0.5 bg-slate-800 rounded shrink-0">
                ×{quantidadeNum}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate mt-0.5">
            {aparelho.cor && <span className="truncate">{aparelho.cor}</span>}
            {saudeBat && (
              <span className={cn("inline-flex items-center gap-0.5 font-semibold shrink-0", corBateriaTexto(nivelBat))}>
                <Battery className="w-3 h-3" />
                {saudeBat}
              </span>
            )}
            <span className="font-mono text-[10px] text-slate-400 truncate hidden sm:inline">
              {identificador}
            </span>
            {estaEmManutencao && (
              <span className="text-amber-500 dark:text-amber-400 font-semibold shrink-0">
                • Com técnico
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            {semPreco ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                Sem preço
              </span>
            ) : (
              <div className="font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatarBRL(precoNum)}
              </div>
            )}
            <span
              className={cn(
                "text-[9px] px-1.5 py-0 font-semibold rounded border inline-block mt-0.5",
                condicaoInfo.className
              )}
            >
              {condicaoInfo.label}
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (estaEmManutencao) onRetornoManutencao(aparelho);
              else onVender(aparelho);
            }}
            title={estaEmManutencao ? "Receber da manutenção" : "Vender aparelho"}
            className="hidden sm:inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-colors cursor-pointer"
          >
            {estaEmManutencao ? (
              <>
                <Check className="w-3.5 h-3.5" /> Receber
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" /> Vender
              </>
            )}
          </button>

          <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors" />
        </div>
      </div>
    );
  }

  // MODO DETALHADO (ou Compacto expandido): card estruturado em 3 zonas
  return (
    <div
      className={cn(
        "rounded-2xl border p-3.5 sm:p-4 transition-all duration-200",
        estaEmManutencao
          ? "bg-amber-500/10 border-amber-500/40 hover:border-amber-400/60"
          : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.05fr)_auto] gap-3 items-center">
        {/* Zona 1: Identidade, Specs, Bateria e IMEI */}
        <div
          className="flex items-start gap-3 min-w-0 cursor-pointer select-none"
          onClick={() => setExpanded(!expanded)}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 mt-0.5",
              estaEmManutencao
                ? "bg-amber-500/15 border-amber-500/35 text-amber-500 dark:text-amber-300"
                : "bg-slate-800 border-slate-800 text-cyan-500 dark:text-cyan-400"
            )}
          >
            {estaEmManutencao ? <Wrench className="w-4 h-4" /> : renderIconeCategoria(aparelho.categoria)}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Linha 1: Modelo + Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm sm:text-[15px] text-white truncate">
                {aparelho.modelo || "Sem Modelo"}
              </h4>

              <Badge
                variant="outline"
                className={cn("text-[10px] font-semibold px-2 py-0 border", condicaoInfo.className)}
              >
                {condicaoInfo.label}
              </Badge>

              {quantidadeNum > 1 && (
                <Badge className="bg-slate-800 text-slate-200 border border-slate-800 text-[10px] px-2 py-0">
                  {quantidadeNum} un.
                </Badge>
              )}

              {estaEmManutencao && (
                <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40 text-[10px] px-2 py-0">
                  Com técnico{dadosManut.tecnicoNome ? `: ${dadosManut.tecnicoNome}` : ""}
                </Badge>
              )}
            </div>

            {/* Linha 2: Specs + Bateria com cor semântica */}
            <div className="flex items-center gap-2.5 flex-wrap text-xs text-slate-300">
              {subtituloSpecs && <span className="font-medium">{subtituloSpecs}</span>}

              {saudeBat && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-md bg-slate-900/80 border border-slate-800 text-[11px]",
                    corBateriaTexto(nivelBat)
                  )}
                  title="Saúde da bateria"
                >
                  <Battery className="w-3.5 h-3.5" />
                  {saudeBat}
                </span>
              )}

              {diasEstoque !== null && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px]",
                    paradoLongo
                      ? "text-amber-600 dark:text-amber-400 font-semibold"
                      : "text-slate-400"
                  )}
                  title={`Cadastrado há ${diasEstoque} dia(s)`}
                >
                  <Clock className="w-3 h-3" />
                  {diasEstoque === 0 ? "Hoje" : `há ${diasEstoque}d`}
                </span>
              )}
            </div>

            {/* Linha 3: Código + IMEI copiável em 1 clique */}
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
              <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-md">
                ID {codigoCurto}
              </span>
              {identificador && identificador !== codigoCurto && (
                <button
                  type="button"
                  onClick={handleCopiarImei}
                  className="inline-flex items-center gap-1 font-mono text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                  title="Clique para copiar o IMEI / Serial"
                >
                  <span>IMEI: {identificador}</span>
                  <Copy className="w-3 h-3 opacity-70" />
                </button>
              )}
              {identificador === codigoCurto && (
                <button
                  type="button"
                  onClick={handleCopiarImei}
                  className="inline-flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                  title="Copiar código"
                >
                  <Copy className="w-3 h-3 opacity-70" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Zona 2: Painel de Preços (Varejo / Atacado / Custo) */}
        <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                Venda Varejo
              </span>
              {semPreco ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Sem preço
                  </span>
                  <button
                    type="button"
                    onClick={() => onEdit(aparelho)}
                    className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                  >
                    + Precificar
                  </button>
                </div>
              ) : (
                <p className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatarBRL(precoNum)}
                </p>
              )}
            </div>

            {precoAtacadoNum > 0 && (
              <div className="text-right shrink-0 pl-2 border-l border-slate-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 block">
                  Atacado
                </span>
                <p className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-300 tabular-nums">
                  {formatarBRL(precoAtacadoNum)}
                </p>
              </div>
            )}
          </div>

          {!ocultarCustos && custoNum > 0 && (
            <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-slate-800 text-[11px] text-slate-400 tabular-nums">
              <span>Custo: {formatarBRL(custoNum)}</span>
              {lucroEstimado !== null && (
                <span
                  className={cn(
                    "font-semibold",
                    lucroEstimado >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-500 dark:text-rose-400"
                  )}
                >
                  {lucroEstimado >= 0 ? "+" : ""}
                  {formatarBRL(lucroEstimado)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Zona 3: Ações Diretas (1 clique no balcão) */}
        <div className="flex items-center justify-end gap-1.5 pt-1 lg:pt-0 border-t lg:border-t-0 border-slate-800">
          {estaEmManutencao ? (
            <Button
              size="sm"
              onClick={() => onRetornoManutencao(aparelho)}
              className="h-9 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-sm cursor-pointer"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Receber
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onVender(aparelho)}
              className="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm cursor-pointer"
            >
              <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
              Vender
            </Button>
          )}

          <button
            type="button"
            onClick={handleCopiarOferta}
            title="Copiar oferta pronta p/ WhatsApp"
            className="p-2 rounded-xl bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 transition-colors cursor-pointer"
          >
            <Share2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => onEdit(aparelho)}
            title="Editar aparelho"
            className="p-2 rounded-xl bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-blue-400 hover:border-blue-500/40 transition-colors cursor-pointer"
          >
            <Edit2 className="h-4 w-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Mais opções"
                className="p-2 rounded-xl bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52 bg-slate-900 border border-slate-800 text-slate-200 rounded-xl shadow-xl z-[9999]"
            >
              {!estaEmManutencao && (
                <DropdownMenuItem
                  onClick={() => onManutencao(aparelho)}
                  className="cursor-pointer hover:bg-slate-800 rounded-lg"
                >
                  <Wrench className="mr-2 h-4 w-4 text-amber-400" />
                  Enviar p/ Técnico
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onPDF(aparelho)}
                className="cursor-pointer hover:bg-slate-800 rounded-lg"
              >
                <FileText className="mr-2 h-4 w-4 text-blue-400" />
                PDF Garantia / Certificado
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onEdit(aparelho)}
                className="cursor-pointer hover:bg-slate-800 rounded-lg"
              >
                <Edit2 className="mr-2 h-4 w-4 text-cyan-400" />
                Editar detalhes
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-800" />
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setExpanded(true);
                  setShowDeleteConfirm(true);
                }}
                className="cursor-pointer hover:bg-rose-950/50 text-rose-400 focus:bg-rose-950/50 focus:text-rose-400 rounded-lg"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Deletar do estoque
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Recolher detalhes" : "Ver mais detalhes"}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Área expandida sob demanda (observações, acessórios, manutenção e confirmação de exclusão) */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            {aparelho.marca && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                  Marca
                </span>
                <span className="font-semibold text-slate-200">{aparelho.marca}</span>
              </div>
            )}
            {aparelho.acessorios && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                  Acessórios inclusos
                </span>
                <span className="font-medium text-slate-200">{aparelho.acessorios}</span>
              </div>
            )}
            {estaEmManutencao && dadosManut.motivo && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                <span className="text-[10px] uppercase tracking-wider text-amber-500 dark:text-amber-300 block">
                  Motivo da Manutenção
                </span>
                <span className="font-medium text-amber-600 dark:text-amber-200">
                  {dadosManut.motivo}
                </span>
              </div>
            )}
          </div>

          {aparelho.observacoes && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-0.5">
                  Observações
                </span>
                <p className="text-xs text-slate-300 whitespace-pre-wrap break-words">
                  {aparelho.observacoes}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyDesc}
                className="text-xs border-slate-800 bg-slate-800/80 text-slate-300 h-8 shrink-0 cursor-pointer"
              >
                <Copy className="w-3 h-3 mr-1.5" />
                Copiar
              </Button>
            </div>
          )}

          {showDeleteConfirm && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/35 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-xs text-rose-500 dark:text-rose-200 font-medium">
                Tem certeza que deseja deletar este aparelho permanentemente?
              </p>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="h-7 text-xs border-slate-700 cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onDelete(aparelho.id)}
                  className="h-7 text-xs cursor-pointer"
                >
                  Sim, Deletar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
