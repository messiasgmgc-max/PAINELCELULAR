"use client";

import { useState, useEffect } from "react";
import { Aparelho } from "@/lib/db/types";
import { extrairDadosManutencao, montarTagRetornoManutencao } from "@/lib/manutencao";
import { getAparelhoCodigo, parseMonetaryValue } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { ModalPortal } from "@/components/ModalPortal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, X, Wrench, Calendar, DollarSign, BatteryCharging, Check } from "lucide-react";
import { toast } from "sonner";

interface RetornarManutencaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelho: Aparelho | null;
  onSuccess: () => Promise<void> | void;
}

export function RetornarManutencaoModal({
  isOpen,
  onClose,
  aparelho,
  onSuccess,
}: RetornarManutencaoModalProps) {
  const [dataRetorno, setDataRetorno] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [custoReparo, setCustoReparo] = useState<string>("");
  const [somarAoCusto, setSomarAoCusto] = useState(true);
  const [novaSaudeBateria, setNovaSaudeBateria] = useState<string>("");
  const [solucao, setSolucao] = useState<string>("");
  const [salvando, setSalvando] = useState(false);

  const dadosManut = aparelho ? extrairDadosManutencao(aparelho) : null;

  useEffect(() => {
    if (isOpen) {
      setDataRetorno(new Date().toISOString().split("T")[0]);
      setCustoReparo("");
      setSomarAoCusto(true);
      setNovaSaudeBateria("");
      setSolucao("");
    }
  }, [isOpen]);

  if (!isOpen || !aparelho) return null;

  const custoReparoNum = parseMonetaryValue(custoReparo);
  const custoAtual = aparelho.custo || 0;
  const novoCustoFinal = somarAoCusto ? custoAtual + custoReparoNum : custoAtual;

  const handleConfirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aparelho) return;

    setSalvando(true);
    const toastId = toast.loading(`Retornando ${aparelho.modelo} ao estoque da loja...`);

    try {
      const dataIso = new Date(dataRetorno + "T12:00:00").toISOString();
      const tagRetorno = montarTagRetornoManutencao({
        tecnicoNome: dadosManut?.tecnicoNome,
        custoReparo: custoReparoNum,
        dataRetorno: dataIso,
        solucao: solucao.trim() || undefined,
      });

      const obsAtual = aparelho.observacoes || "";
      const novaObservacao = obsAtual ? `${obsAtual}\n${tagRetorno}` : tagRetorno;

      const payload: Record<string, any> = {
        status: "disponivel",
        condicao: aparelho.condicao === "vendido" ? "seminovo" : (aparelho.condicao || "seminovo"),
        ativo: true,
        custo: novoCustoFinal,
        tecnico_id: null,
        tecnico_nome: null,
        motivo_manutencao: null,
        data_manutencao: null,
        observacoes: novaObservacao,
      };

      if (novaSaudeBateria.trim()) {
        payload.saude_bateria = novaSaudeBateria.trim().endsWith("%") ? novaSaudeBateria.trim() : `${novaSaudeBateria.trim()}%`;
      }

      // Atualização com resiliência
      let lastError: any = null;
      let sucesso = false;

      for (let tentativa = 0; tentativa < 4; tentativa++) {
        const res = await supabase.from("aparelhos").update(payload).eq("id", aparelho.id);
        if (!res.error) {
          sucesso = true;
          break;
        }

        lastError = res.error;
        const errorText = `${res.error.message || ""} ${res.error.details || ""}`;
        const columnMatch = errorText.match(/'([^']+)' column/) || errorText.match(/'([^']+)'/);
        const col = columnMatch?.[1];

        if (col && Object.prototype.hasOwnProperty.call(payload, col)) {
          delete payload[col];
          continue;
        }

        delete payload.tecnico_id;
        delete payload.tecnico_nome;
        delete payload.data_manutencao;
        delete payload.motivo_manutencao;
        delete payload.status;
      }

      if (!sucesso) {
        const fallbackRes = await supabase
          .from("aparelhos")
          .update({
            ativo: true,
            custo: novoCustoFinal,
            observacoes: novaObservacao,
          })
          .eq("id", aparelho.id);
        if (fallbackRes.error) throw fallbackRes.error;
      }

      toast.success(
        `✅ ${aparelho.modelo} recebido de volta! Aparelho retornado ao estoque da loja.`,
        { id: toastId, duration: 5000 }
      );

      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Erro ao retornar do técnico:", err);
      toast.error(`Erro ao dar retorno: ${err?.message || "Falha desconhecida"}`, { id: toastId });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto my-auto flex flex-col">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/30">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg text-white">
                  Receber / Retornar do Técnico
                </h3>
                <p className="text-xs text-slate-400">
                  O aparelho voltará para o estoque físico disponível na loja
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={salvando}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Dados Atuais da Manutenção */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm">
                {aparelho.marca} {aparelho.modelo} {aparelho.capacidade || ""} {aparelho.cor || ""}
              </span>
              <span className="font-mono text-cyan-400 font-bold bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-lg">
                ID: {getAparelhoCodigo(aparelho)}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800/60 space-y-1 text-slate-300">
              <p className="flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-400">Técnico responsável:</span>{" "}
                <span className="font-bold text-amber-300">
                  {dadosManut?.tecnicoNome || "Técnico"}
                </span>
              </p>
              {dadosManut?.motivo && (
                <p className="text-slate-400">
                  <span className="text-slate-500">Serviço/Defeito:</span> {dadosManut.motivo}
                </p>
              )}
              {dadosManut?.dataEnvio && (
                <p className="text-slate-400">
                  <span className="text-slate-500">Enviado em:</span>{" "}
                  {new Date(dadosManut.dataEnvio).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleConfirmar} className="space-y-4">
            {/* Data de Retorno */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                Data de Retorno ao Estoque *
              </label>
              <input
                type="date"
                value={dataRetorno}
                onChange={(e) => setDataRetorno(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none"
                required
              />
            </div>

            {/* Custo do Reparo / Peça */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Custo do Reparo / Cobrado pelo Técnico (opcional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-slate-500">R$</span>
                <input
                  type="text"
                  placeholder="0,00"
                  value={custoReparo}
                  onChange={(e) => setCustoReparo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none"
                />
              </div>

              {custoReparoNum > 0 && (
                <div className="pt-1.5 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="chkSomarCusto"
                    checked={somarAoCusto}
                    onChange={(e) => setSomarAoCusto(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="chkSomarCusto" className="text-xs text-slate-300 cursor-pointer">
                    Somar ao custo do aparelho (Custo total: R$ {novoCustoFinal.toFixed(2).replace(".", ",")})
                  </label>
                </div>
              )}
            </div>

            {/* Nova Saúde da Bateria (se trocou bateria) */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                Nova Saúde da Bateria % (opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: 100%"
                value={novaSaudeBateria}
                onChange={(e) => setNovaSaudeBateria(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none"
              />
            </div>

            {/* Solução / O que foi feito */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Relatório / Solução Realizada (opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Tela original substituída, testes de touch e Face ID aprovados."
                value={solucao}
                onChange={(e) => setSolucao(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none"
              />
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={salvando}
                className="text-xs sm:text-sm text-slate-400 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvando}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold rounded-xl px-5 text-xs sm:text-sm shadow-md shadow-emerald-950/40 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {salvando ? "Processando..." : "Confirmar Retorno à Loja"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
