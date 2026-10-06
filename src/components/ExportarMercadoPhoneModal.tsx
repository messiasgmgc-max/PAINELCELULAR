'use client';

import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Smartphone, 
  FileUp,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalPortal } from '@/components/ModalPortal';
import { exportarEstoqueParaMercadoPhone, AparelhoExportacaoMP } from '@/lib/estoque/exportarMercadoPhone';
import toast from 'react-hot-toast';

interface ExportarMercadoPhoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelhos: AparelhoExportacaoMP[];
}

export function ExportarMercadoPhoneModal({
  isOpen,
  onClose,
  aparelhos,
}: ExportarMercadoPhoneModalProps) {
  const [exportando, setExportando] = useState(false);
  const [arquivoModelo, setArquivoModelo] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const totalAparelhos = aparelhos.length;

  const handleExportarDireto = async () => {
    if (totalAparelhos === 0) {
      toast.error('Nenhum aparelho ativo em estoque para exportar.');
      return;
    }

    setExportando(true);
    try {
      const nomeGerado = await exportarEstoqueParaMercadoPhone(aparelhos);
      toast.success(`Planilha "${nomeGerado}" baixada com sucesso!`);
      onClose();
    } catch (err: any) {
      console.error('Erro ao exportar para Mercado Phone:', err);
      toast.error(`Falha na exportação: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setExportando(false);
    }
  };

  const handleExportarComModelo = async () => {
    if (!arquivoModelo) {
      toast.error('Selecione uma planilha modelo primeiro.');
      return;
    }

    if (totalAparelhos === 0) {
      toast.error('Nenhum aparelho ativo em estoque para exportar.');
      return;
    }

    setExportando(true);
    try {
      const nomeBase = arquivoModelo.name.replace(/\.xlsx$/i, '');
      const nomeArquivo = `${nomeBase}_com_estoque.xlsx`;
      await exportarEstoqueParaMercadoPhone(aparelhos, {
        nomeArquivo,
        templateCustomizado: arquivoModelo,
      });
      toast.success(`Planilha "${nomeArquivo}" gerada com seu modelo e baixada!`);
      onClose();
    } catch (err: any) {
      console.error('Erro ao preencher modelo do Mercado Phone:', err);
      toast.error(`Falha ao preencher modelo: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setExportando(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Por favor, selecione um arquivo no formato Excel (.xlsx).');
      return;
    }

    setArquivoModelo(file);
    toast.success(`Modelo "${file.name}" carregado!`);
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl text-white my-auto flex flex-col space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  Exportar para o Mercado Phone
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold border border-blue-500/30">
                    MP .xlsx
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Planilha oficial estruturada para importação direta de estoque no Mercado Phone
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={exportando}
              className="text-slate-400 hover:text-white rounded-full -mr-2 -mt-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Card Resumo do Estoque */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Aparelhos em Estoque Ativo
                </span>
                <span className="text-lg font-extrabold text-white">
                  {totalAparelhos} {totalAparelhos === 1 ? 'aparelho' : 'aparelhos'}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Modelo oficial idêntico ao MP
              </span>
              <span className="flex items-center gap-1.5 text-cyan-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> IMEI e Seriais preservados como texto
              </span>
            </div>
          </div>

          {/* Opção 1: Download Imediato com Template Embutido (Recomendado) */}
          <div className="space-y-3 bg-blue-950/20 border border-blue-500/20 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-blue-300 block">
                  1. Exportação Direta (Recomendado)
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Gera e baixa a planilha oficial com todos os aparelhos ativos preenchidos em 1 clique.
                </p>
              </div>
            </div>

            <Button
              onClick={handleExportarDireto}
              disabled={exportando || totalAparelhos === 0}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm h-11 rounded-xl shadow-lg shadow-blue-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              {exportando ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Gerando Planilha...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Baixar Planilha Mercado Phone (.xlsx)
                </>
              )}
            </Button>
          </div>

          {/* Opção 2: Usar arquivo modelo enviado pelo usuário */}
          <div className="space-y-3 bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
            <div>
              <span className="text-xs font-bold text-slate-300 block">
                2. Preencher em cima de um arquivo .xlsx existente
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Se você baixou um modelo recente do Mercado Phone, envie aqui para que ele escreva seu estoque nele.
              </p>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx"
              className="hidden"
            />

            {arquivoModelo ? (
              <div className="flex items-center justify-between p-3 bg-slate-900 border border-emerald-500/30 rounded-xl">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileUp className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{arquivoModelo.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {(arquivoModelo.size / 1024).toFixed(1)} KB · Modelo pronto para preencher
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setArquivoModelo(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="h-8 text-[11px] text-rose-300 border-rose-500/30 hover:bg-rose-500/10 cursor-pointer"
                  >
                    Remover
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleExportarComModelo}
                    disabled={exportando || totalAparelhos === 0}
                    className="h-8 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Preencher e Baixar
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-800 hover:border-blue-500/50 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-900/40 hover:bg-slate-900/80"
              >
                <Upload className="w-5 h-5 mx-auto text-slate-400 mb-1" />
                <p className="text-xs font-semibold text-slate-300">
                  Clique para selecionar sua planilha modelo .xlsx do Mercado Phone
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  O sistema manterá as colunas e inserirá todos os aparelhos ativos
                </p>
              </div>
            )}
          </div>

          {/* Dicas e Instruções */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-200/90 leading-relaxed">
              <strong>Como importar no Mercado Phone:</strong> Acesse sua conta no Mercado Phone, vá em 
              <strong> Estoque &gt; Importar &gt; Planilha Excel</strong> e anexe o arquivo .xlsx baixado.
            </div>
          </div>

          {/* Rodapé */}
          <div className="flex justify-end pt-2 border-t border-white/5">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={exportando}
              className="text-xs text-slate-300 hover:text-white border-slate-700 hover:bg-slate-800 h-9 px-4 rounded-xl cursor-pointer"
            >
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
