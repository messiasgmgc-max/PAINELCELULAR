"use client";

import React, { useState } from "react";
import type { Aparelho } from "@/lib/db/types";
import type { GrupoModeloEstoque } from "@/lib/estoque/resumoEstoque";
import { AparelhoCard } from "./AparelhoCard";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Smartphone, AlertCircle, Wrench } from "lucide-react";

interface AparelhoGrupoCardProps {
  grupo: GrupoModeloEstoque;
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

export function AparelhoGrupoCard({
  grupo,
  ocultarCustos = false,
  onEdit,
  onDelete,
  onPDF,
  onVender,
  onManutencao,
  onRetornoManutencao,
}: AparelhoGrupoCardProps) {
  const [aberto, setAberto] = useState(false);

  const faixaPreco =
    grupo.menorPreco !== null && grupo.maiorPreco !== null
      ? grupo.menorPreco === grupo.maiorPreco
        ? formatarBRL(grupo.menorPreco)
        : `${formatarBRL(grupo.menorPreco)} – ${formatarBRL(grupo.maiorPreco)}`
      : null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setAberto((prev) => !prev)}
        className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-900/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-500 dark:text-cyan-300 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm sm:text-base text-white truncate">
                {grupo.titulo}
              </h4>
              <Badge className="bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30 text-[11px] px-2 py-0 tabular-nums">
                {grupo.totalUnidades} un.
              </Badge>
              {grupo.emManutencaoCount > 0 && (
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-[10px] px-2 py-0 gap-1">
                  <Wrench className="w-3 h-3" />
                  {grupo.emManutencaoCount} c/ técnico
                </Badge>
              )}
            </div>

            {grupo.capacidades.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {grupo.capacidades.map((cap) => (
                  <span
                    key={cap}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-900/80 border border-slate-800 text-slate-300"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            {faixaPreco ? (
              <p className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {faixaPreco}
              </p>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                <AlertCircle className="w-3.5 h-3.5" />
                Sem preço
              </span>
            )}
            {grupo.semPrecoCount > 0 && faixaPreco && (
              <p className="text-[10px] text-amber-500 dark:text-amber-400">
                {grupo.semPrecoCount} sem preço
              </p>
            )}
          </div>

          <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-400">
            {aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {aberto && (
        <div className="p-3 pt-2 border-t border-slate-800 space-y-2 bg-slate-900/80">
          {grupo.itens.map((aparelho, idx) => (
            <AparelhoCard
              key={aparelho.id || `grp-${grupo.chave}-${idx}`}
              aparelho={aparelho}
              density="detailed"
              ocultarCustos={ocultarCustos}
              onEdit={onEdit}
              onDelete={onDelete}
              onPDF={onPDF}
              onVender={onVender}
              onManutencao={onManutencao}
              onRetornoManutencao={onRetornoManutencao}
            />
          ))}
        </div>
      )}
    </div>
  );
}
