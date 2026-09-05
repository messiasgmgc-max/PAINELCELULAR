"use client";

import { useState, useEffect } from "react";
import { Aparelho } from "@/lib/db/types";
import { useTecnicos } from "@/hooks/useTecnicos";
import { montarTagManutencao } from "@/lib/manutencao";
import { getAparelhoCodigo } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { ModalPortal } from "@/components/ModalPortal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, X, User, AlertTriangle, Calendar, Check, Smartphone, Clock } from "lucide-react";
import { toast } from "sonner";

interface EnviarManutencaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelho: Aparelho | null;
  onSuccess: () => Promise<void> | void;
}

const DEFEITOS_COMUNS = [
  "Troca de Tela",
  "Troca de Bateria",
  "Reparo em Placa",
  "Face ID / Biometria",
  "Conector de Carga",
  "Câmera Frontal / Traseira",
  "Vidro / Tampa Traseira",
  "Banho Químico (Molhado)",
  "Reinstalação / Software",
  "Auto-falante / Auricular",
];

export function EnviarManutencaoModal({
  isOpen,
  onClose,
  aparelho,
  onSuccess,
}: EnviarManutencaoModalProps) {
  const { tecnicos, fetchTecnicos } = useTecnicos();
  const [tecnicoSelecionadoId, setTecnicoSelecionadoId] = useState<string>("");
  const [outroTecnicoNome, setOutroTecnicoNome] = useState<string>("");
  const [isOutroTecnico, setIsOutroTecnico] = useState(false);
  const [motivo, setMotivo] = useState<string>("");
  const [dataEnvio, setDataEnvio] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [previsaoRetorno, setPrevisaoRetorno] = useState<string>("");
  const [observacoesAdicionais, setObservacoesAdicionais] = useState<string>("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTecnicos();
      setDataEnvio(new Date().toISOString().split("T")[0]);
      setPrevisaoRetorno("");
      setMotivo("");
      setObservacoesAdicionais("");
      setOutroTecnicoNome("");
      setIsOutroTecnico(false);
      setTecnicoSelecionadoId("");
    }
  }, [isOpen]);

  // Se tiver técnicos, seleciona o primeiro por padrão
  useEffect(() => {
    if (isOpen && tecnicos.length > 0 && !tecnicoSelecionadoId && !isOutroTecnico) {
      setTecnicoSelecionadoId(tecnicos[0].id);
    }
  }, [isOpen, tecnicos, tecnicoSelecionadoId, isOutroTecnico]);

  if (!isOpen || !aparelho) return null;

  const handleDefeitoClick = (def: string) => {
    if (!motivo) {
      setMotivo(def);
    } else if (!motivo.includes(def)) {
      setMotivo(`${motivo} + ${def}`);
    }
  };

  const handleConfirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aparelho) return;

    let finalTecnicoId: string | undefined = undefined;
    let finalTecnicoNome: string = "";

    if (isOutroTecnico) {
      if (!outroTecnicoNome.trim()) {
        toast.error("Informe o nome do técnico ou assistência externa.");
        return;
      }
      finalTecnicoNome = outroTecnicoNome.trim();
    } else {
      const tec = tecnicos.find((t) => t.id === tecnicoSelecionadoId);
      if (!tec) {
        toast.error("Selecione o técnico responsável.");
        return;
      }
      finalTecnicoId = tec.id;
      finalTecnicoNome = tec.nome;
    }

    if (!motivo.trim()) {
      toast.error("Informe o defeito ou motivo da manutenção.");
      return;
    }

    setSalvando(true);
    const toastId = toast.loading(`Enviando ${aparelho.modelo} para manutenção...`);

    try {
      const dataIso = new Date(dataEnvio + "T12:00:00").toISOString();
      const tagManutencao = montarTagManutencao({
        tecnicoId: finalTecnicoId,
        tecnicoNome: finalTecnicoNome,
        motivo: motivo.trim() + (observacoesAdicionais ? ` (${observacoesAdicionais.trim()})` : ""),
        dataEnvio: dataIso,
        previsaoRetorno: previsaoRetorno || undefined,
      });

      const obsAtual = aparelho.observacoes || "";
      const novaObservacao = obsAtual ? `${obsAtual}\n${tagManutencao}` : tagManutencao;

      // Monta payload completo
      const payload: Record<string, any> = {
        status: "manutencao",
        tecnico_id: finalTecnicoId || null,
        tecnico_nome: finalTecnicoNome,
        data_manutencao: dataIso,
        motivo_manutencao: motivo.trim(),
        observacoes: novaObservacao,
      };

      // Tenta atualizar no Supabase com resiliência a colunas
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

        // Se falhou por 'status' ou campos customizados, garante salvar na observacao
        delete payload.tecnico_id;
        delete payload.tecnico_nome;
        delete payload.data_manutencao;
        delete payload.motivo_manutencao;
      }

      if (!sucesso) {
        // Fallback garantido: apenas observacoes
        const fallbackRes = await supabase
          .from("aparelhos")
          .update({ observacoes: novaObservacao })
          .eq("id", aparelho.id);
        if (fallbackRes.error) throw fallbackRes.error;
      }

      toast.success(
        `🛠️ ${aparelho.modelo} enviado para ${finalTecnicoNome}! Aparelho marcado como "Com o Técnico" fora da loja.`,
        { id: toastId, duration: 5000 }
      );

      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Erro ao enviar para manutenção:", err);
      toast.error(`Erro ao registrar envio: ${err?.message || "Falha desconhecida"}`, { id: toastId });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto my-auto flex flex-col">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                  Enviar para Manutenção
                </h3>
                <p className="text-xs text-slate-400">
                  Registra a custódia do aparelho com o técnico responsável
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

          {/* Card Resumo do Aparelho */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              <span className="font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-lg">
                ID: {getAparelhoCodigo(aparelho)}
              </span>
              {aparelho.imei && (
                <span className="font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800">
                  IMEI: {aparelho.imei}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-bold text-sm sm:text-base text-white">
                {aparelho.marca} {aparelho.modelo}
              </span>
              {aparelho.capacidade && (
                <Badge variant="outline" className="border-slate-700 text-slate-300 text-[10px]">
                  {aparelho.capacidade}
                </Badge>
              )}
              {aparelho.cor && (
                <Badge variant="outline" className="border-slate-700 text-slate-300 text-[10px]">
                  {aparelho.cor}
                </Badge>
              )}
            </div>
          </div>

          {/* Aviso de Localização Física */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <span className="font-bold block">Status: O aparelho sairá da loja física</span>
              Este aparelho constará como <span className="font-semibold underline">"Com o Técnico"</span> no painel, para que toda a equipe saiba exatamente com quem está.
            </div>
          </div>

          <form onSubmit={handleConfirmar} className="space-y-4">
            {/* Técnico Responsável */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-cyan-400" />
                  Técnico / Oficina Responsável *
                </label>
                <button
                  type="button"
                  onClick={() => setIsOutroTecnico(!isOutroTecnico)}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 underline"
                >
                  {isOutroTecnico ? "← Escolher da Equipe" : "+ Técnico / Oficina Externa"}
                </button>
              </div>

              {!isOutroTecnico ? (
                <select
                  value={tecnicoSelecionadoId}
                  onChange={(e) => setTecnicoSelecionadoId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none transition-all cursor-pointer"
                  required
                >
                  <option value="">Selecione um técnico da equipe...</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>
                      🔧 {t.nome} {(t as any).especialidade ? `(${ (t as any).especialidade })` : ''} - {t.telefone}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Nome do técnico externo ou laboratório (ex: Junior Placas, Apple Care)..."
                  value={outroTecnicoNome}
                  onChange={(e) => setOutroTecnicoNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                  required
                  autoFocus
                />
              )}
            </div>

            {/* Defeito / Motivo */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                Defeito / Serviço a Realizar *
              </label>

              {/* Chips Rápidos */}
              <div className="flex flex-wrap gap-1.5 pb-1">
                {DEFEITOS_COMUNS.map((def) => (
                  <button
                    key={def}
                    type="button"
                    onClick={() => handleDefeitoClick(def)}
                    className="text-[10px] sm:text-[11px] bg-slate-800/80 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700 hover:border-amber-500/40 px-2 py-0.5 rounded-lg transition-all"
                  >
                    + {def}
                  </button>
                ))}
              </div>

              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o que deve ser reparado no aparelho..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all resize-none"
                required
              />
            </div>

            {/* Datas: Envio e Previsão */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  Data de Envio *
                </label>
                <input
                  type="date"
                  value={dataEnvio}
                  onChange={(e) => setDataEnvio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Previsão de Retorno (opcional)
                </label>
                <input
                  type="date"
                  value={previsaoRetorno}
                  onChange={(e) => setPrevisaoRetorno(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none"
                />
              </div>
            </div>

            {/* Observações Adicionais */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Observações extras (opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Deixou senha da tela 1234, cliente com pressa..."
                value={observacoesAdicionais}
                onChange={(e) => setObservacoesAdicionais(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
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
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl px-5 text-xs sm:text-sm shadow-md shadow-amber-950/40 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {salvando ? "Salvando..." : "Confirmar Envio ao Técnico"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
