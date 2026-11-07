"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Home, ChevronDown, ChevronUp } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string; cause?: any };
  reset?: () => void;
}) {
  const [errorDetails, setErrorDetails] = useState<Record<string, any>>({});
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const details: Record<string, any> = {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      digest: error?.digest,
    };

    if (typeof window !== "undefined") {
      details.url = window.location.href;
    }
    details.timestamp = new Date().toISOString();

    setErrorDetails(details);
    console.error("[Phone Center Error Boundary]:", error);
  }, [error]);

  const handleRecarregar = () => {
    if (typeof reset === "function") {
      reset();
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-6 p-4 bg-slate-950 text-white select-none">
      <div className="flex flex-col items-center text-center max-w-md space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-950/40">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          Ops! Algo deu errado ao carregar esta tela
        </h2>
        <p className="text-xs sm:text-sm text-slate-400">
          Identificamos uma inconsistência temporária. Você pode tentar recarregar ou voltar para o início do Phone Center.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap justify-center">
        <Button
          onClick={handleRecarregar}
          variant="default"
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl px-5 py-2.5 flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-950/50"
        >
          <RotateCcw className="w-4 h-4" />
          Tentar Novamente
        </Button>

        <Button
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = "/";
          }}
          variant="outline"
          className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold rounded-xl px-4 py-2.5 flex items-center gap-2 cursor-pointer"
        >
          <Home className="w-4 h-4 text-slate-400" />
          Voltar ao Início
        </Button>
      </div>

      {error?.message && (
        <div className="w-full max-w-lg mt-2">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-[11px] text-slate-500 hover:text-slate-400 flex items-center gap-1 mx-auto cursor-pointer"
          >
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showDetails ? "Ocultar detalhes técnicos" : "Ver detalhes técnicos"}
          </button>

          {showDetails && (
            <div className="mt-2 p-3 rounded-xl bg-slate-900 border border-slate-800 text-left font-mono text-[11px] text-rose-300/90 break-words space-y-1">
              <p><strong>Erro:</strong> {error.message}</p>
              {error.digest && <p className="text-slate-500"><strong>Digest:</strong> {error.digest}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
