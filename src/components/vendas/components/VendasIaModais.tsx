'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Aparelho, Tecnico, Venda } from '@/lib/db/types';
import { estaNoEstoque, type EstadoCicloAparelho } from '@/lib/estoque/ciclo';
import { inferirMarcaPorModelo } from '@/lib/marcaUtils';
import { cn, getAparelhoCodigo } from '@/lib/utils';
import { MAX_FOTOS_VENDA, type CampoDaFoto } from '@/lib/vendas/fotoVenda';
import { ComboboxAparelhos } from './ProdutoCombobox';
import { toast } from 'sonner';
import {
  AlertCircle,
  Camera,
  Check,
  CreditCard,
  ImagePlus,
  Loader2,
  PackageCheck,
  Plus,
  Repeat,
  Send,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

const aparelhoNoEstoque = (a: Aparelho): boolean =>
  estaNoEstoque(a as unknown as EstadoCicloAparelho);

export interface DadosFaltantesFormState {
  clienteNome: string;
  clienteTelefone: string;
  clienteEmail: string;
  marca: string;
  modelo: string;
  capacidade: string;
  cor: string;
  condicao: 'seminovo' | 'novo';
  imei: string;
  bateria: string;
  preco: string;
  custo: string;
  isUpgrade: boolean;
  tradeInMarca: string;
  tradeInModelo: string;
  tradeInCapacidade: string;
  tradeInCor: string;
  tradeInImei: string;
  tradeInBateria: string;
  tradeInValor: string;
  tradeInEntrarNoEstoque: boolean;
  valorVolta: string;
  vendedor: string;
  formaPagamento: string;
  pagamentos: Array<{ id: string; metodo: string; valor: string; parcelas?: number }>;
  dataVenda: string;
  observacoes: string;
}

export interface VendasIaModaisProps {
  isClient: boolean;

  showCompletarFormularioModal: boolean;
  vendaParaCompletarFormulario: Venda | null;
  textoFormularioPedido: string;
  setTextoFormularioPedido: (v: string) => void;
  processandoFormulario: boolean;
  onFecharCompletarFormulario: () => void;
  onSubmitCompletarFormulario: (e: React.FormEvent) => void;

  showImportarPedidoModal: boolean;
  textoPedido: string;
  setTextoPedido: (v: string) => void;
  fotosVenda: string[];
  setFotosVenda: React.Dispatch<React.SetStateAction<string[]>>;
  preparandoFotoVenda: boolean;
  processingAiText: boolean;
  adicionarFotosVenda: (arquivos: File[]) => Promise<void>;
  onFecharImportarPedido: () => void;
  onProcessarTextoVenda: () => void;

  showDadosFaltantesModal: boolean;
  onFecharDadosFaltantes: () => void;
  aiParsedData: any;
  leituraFotoVenda: { avisos: string[]; camposDaFoto: CampoDaFoto[] } | null;
  aparelhos: Aparelho[];
  tecnicos: Tecnico[];
  selectedStockAparelhoId: string;
  setSelectedStockAparelhoId: (id: string) => void;
  dadosFaltantesForm: DadosFaltantesFormState;
  setDadosFaltantesForm: React.Dispatch<React.SetStateAction<DadosFaltantesFormState>>;
  seloDaFoto: (campo: CampoDaFoto) => React.ReactNode;
  aplicarVendaAI: (parsedData: any) => Promise<void>;
}

export function VendasIaModais({
  isClient,
  showCompletarFormularioModal,
  vendaParaCompletarFormulario,
  textoFormularioPedido,
  setTextoFormularioPedido,
  processandoFormulario,
  onFecharCompletarFormulario,
  onSubmitCompletarFormulario,
  showImportarPedidoModal,
  textoPedido,
  setTextoPedido,
  fotosVenda,
  setFotosVenda,
  preparandoFotoVenda,
  processingAiText,
  adicionarFotosVenda,
  onFecharImportarPedido,
  onProcessarTextoVenda,
  showDadosFaltantesModal,
  onFecharDadosFaltantes,
  aiParsedData,
  leituraFotoVenda,
  aparelhos,
  tecnicos,
  selectedStockAparelhoId,
  setSelectedStockAparelhoId,
  dadosFaltantesForm,
  setDadosFaltantesForm,
  seloDaFoto,
  aplicarVendaAI,
}: VendasIaModaisProps) {
  if (!isClient) return null;

  return (
    <>
      {/* Modal: Completar com Formulário (IA extrai dados → salva venda → envia recibo) */}
      {showCompletarFormularioModal &&
        vendaParaCompletarFormulario &&
        createPortal(
          <div className="modal-overlay modal-overlay-fit z-[60]">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
              <div className="modal-header">
                <div>
                  <h3 className="modal-title flex items-center gap-2 text-orange-400 font-bold">
                    <Sparkles className="w-5 h-5 text-orange-400 animate-pulse" /> Completar com
                    Formulário
                  </h3>
                  <p className="modal-subtitle">
                    Cole o formulário padrão de pedido e o valor total. A IA vai ler, preencher os
                    dados da venda e já enviar o comprovante (PDF) por WhatsApp e e-mail para o
                    cliente.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onFecharCompletarFormulario}
                  disabled={processandoFormulario}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="modal-body-scroll">
                <form onSubmit={onSubmitCompletarFormulario} className="space-y-4">
                  <div className="rounded-lg bg-white/5 border border-white/10 p-3 flex flex-col gap-1 text-xs text-slate-300">
                    <span className="font-bold text-slate-100 text-sm">
                      Venda #{vendaParaCompletarFormulario.id?.slice(-6).toUpperCase()}
                    </span>
                    <span>
                      Cliente atual:{' '}
                      <span className="text-amber-300">
                        {vendaParaCompletarFormulario.clienteNome || '—'}
                      </span>
                    </span>
                    <span>
                      Valor atual:{' '}
                      <span className="text-green-400 font-mono">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(vendaParaCompletarFormulario.valor || 0)}
                      </span>
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Formulário de pedido
                    </label>
                    <textarea
                      className="input-glass min-h-[200px] font-sans text-sm p-3 border-orange-500/20 focus:border-orange-500"
                      placeholder={
                        'Cole aqui o formulário padrão de pedido com os dados do cliente, aparelho e valor total.\n\nEx:\nNome: João Silva\nTelefone: (11) 99999-9999\nModelo: iPhone 14 Pro\nValor: R$ 4.500,00\nForma de pagamento: PIX'
                      }
                      value={textoFormularioPedido}
                      onChange={(e) => setTextoFormularioPedido(e.target.value)}
                      disabled={processandoFormulario}
                      autoFocus
                    />
                  </div>

                  <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                    Após processar, os dados da venda são atualizados e o comprovante em PDF é
                    enviado automaticamente por WhatsApp e e-mail (caso o cliente tenha esses dados
                    cadastrados).
                  </p>

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={onFecharCompletarFormulario}
                      disabled={processandoFormulario}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={processandoFormulario || !textoFormularioPedido.trim()}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 font-bold gap-2 shadow-lg shadow-orange-500/20"
                    >
                      {processandoFormulario ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Processando com IA…
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" /> Processar e Enviar Recibo
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

      {/* Modal Importar Pedido via Groq IA */}
      {showImportarPedidoModal &&
        createPortal(
          <div className="modal-overlay modal-overlay-fit z-[60]">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
              <div className="modal-header">
                <div>
                  <h3 className="modal-title flex items-center gap-2 text-blue-400 font-bold">
                    <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" /> Venda Inteligente
                    (texto e foto)
                  </h3>
                  <p className="modal-subtitle">
                    Cole o texto da venda e, se quiser, a foto da etiqueta, da caixa ou da tela
                    Ajustes › Sobre: a IA lê o IMEI e os dados do aparelho.
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onFecharImportarPedido}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="modal-body-scroll">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onProcessarTextoVenda();
                  }}
                  className="space-y-4"
                >
                  <textarea
                    className="input-glass min-h-[160px] font-sans text-sm p-3 border-blue-500/20 focus:border-blue-500"
                    placeholder="Ex: Vendi para o cliente Carlos Silva por R$ 3.500 no Pix pelo vendedor Lucas. (Modelo e IMEI podem vir da foto.)"
                    value={textoPedido}
                    onChange={(e) => setTextoPedido(e.target.value)}
                    onPaste={(e) => {
                      const arquivos = Array.from(e.clipboardData.files).filter((arquivo) =>
                        arquivo.type.startsWith('image/')
                      );
                      if (!arquivos.length) return;
                      if (!e.clipboardData.getData('text/plain')) e.preventDefault();
                      void adicionarFotosVenda(arquivos);
                    }}
                    disabled={processingAiText}
                  />
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {fotosVenda.map((foto, indice) => (
                        <div
                          key={indice}
                          className="relative h-20 w-20 overflow-hidden rounded-lg border border-white/10 bg-black/30"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={foto}
                            alt={`Foto ${indice + 1} da venda`}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setFotosVenda((atuais) => atuais.filter((_, i) => i !== indice))
                            }
                            disabled={processingAiText}
                            className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white hover:bg-red-600"
                            aria-label={`Remover foto ${indice + 1}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {fotosVenda.length < MAX_FOTOS_VENDA && (
                        <label
                          className={cn(
                            'flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-blue-500/40 text-[11px] font-semibold text-blue-300 transition hover:bg-blue-500/10',
                            (processingAiText || preparandoFotoVenda) &&
                              'pointer-events-none opacity-50'
                          )}
                        >
                          {preparandoFotoVenda ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <ImagePlus className="h-5 w-5" />
                          )}
                          Foto
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            disabled={processingAiText || preparandoFotoVenda}
                            onChange={(e) => {
                              const arquivos = Array.from(e.target.files ?? []);
                              e.target.value = '';
                              void adicionarFotosVenda(arquivos);
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Até {MAX_FOTOS_VENDA} fotos (etiqueta, caixa, Ajustes › Sobre, bateria). No
                      computador, dá para colar um print com Ctrl+V no texto.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={onFecharImportarPedido}
                      disabled={processingAiText}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={processingAiText || preparandoFotoVenda}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 font-bold gap-2 shadow-lg shadow-blue-500/20"
                    >
                      {processingAiText ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />{' '}
                          {fotosVenda.length
                            ? 'Lendo texto e fotos com IA...'
                            : 'Lendo texto com IA...'}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" /> Processar e Gerar Venda
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

      {/* Modal Popup de Preenchimento de Dados Faltantes */}
      {showDadosFaltantesModal &&
        createPortal(
          <div className="modal-overlay modal-overlay-fit z-[75]">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full max-w-xl my-4 border-amber-500/30">
              <div className="modal-header bg-amber-500/10 border-b border-amber-500/20">
                <div>
                  <h3 className="modal-title flex items-center gap-2 text-amber-400 font-bold">
                    <AlertCircle className="w-5 h-5 text-amber-400 animate-bounce" />
                    {aiParsedData?.camposFaltantes?.length
                      ? 'Dados Pendentes para Concluir Venda'
                      : 'Confira os dados antes de gerar a venda'}
                  </h3>
                  <p className="modal-subtitle text-slate-300">
                    {aiParsedData?.camposFaltantes?.length
                      ? 'A IA leu a venda, mas faltam informações cruciais. Preencha abaixo para finalizar:'
                      : 'A IA leu a foto do aparelho. Confira principalmente o IMEI antes de confirmar.'}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onFecharDadosFaltantes}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="modal-body-scroll p-4 space-y-4">
                {leituraFotoVenda && leituraFotoVenda.avisos.length > 0 && (
                  <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                    <p className="flex items-center gap-1.5 font-bold text-amber-300">
                      <Camera className="h-4 w-4" /> Confira o que veio da foto
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {leituraFotoVenda.avisos.map((aviso) => (
                        <li key={aviso}>{aviso}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Opção de Seleção de Aparelho do Estoque */}
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-1.5">
                  <label className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1.5">
                    <ShoppingCart className="w-4 h-4" /> Selecionar Aparelho do Estoque (Opcional)
                  </label>
                  <ComboboxAparelhos
                    aparelhos={aparelhos}
                    value={selectedStockAparelhoId}
                    onChange={(selectedId) => {
                      setSelectedStockAparelhoId(selectedId);
                      if (selectedId) {
                        const ap = aparelhos.find((a) => a.id === selectedId);
                        if (ap) {
                          setDadosFaltantesForm((prev) => ({
                            ...prev,
                            marca: ap.marca,
                            modelo: ap.modelo,
                            capacidade: ap.capacidade || '128GB',
                            cor: ap.cor || '',
                            imei: ap.imei || ap.numeroSerie || '',
                            bateria: String(ap.saudeBateria || ap.saude_bateria || ''),
                            preco: String(ap.preco),
                            custo: String((ap as any).custo || 0),
                          }));
                        }
                      }
                    }}
                  />
                </div>

                {/* Formulário de Preenchimento Manual Rápido */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300">Nome do Cliente</label>
                    <input
                      type="text"
                      className="input-glass mt-1"
                      placeholder="Ex: Carlos Silva"
                      value={dadosFaltantesForm.clienteNome}
                      onChange={(e) =>
                        setDadosFaltantesForm({ ...dadosFaltantesForm, clienteNome: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300">Telefone Cliente</label>
                    <input
                      type="tel"
                      className="input-glass mt-1"
                      placeholder="Ex: 31999998888"
                      value={dadosFaltantesForm.clienteTelefone}
                      onChange={(e) =>
                        setDadosFaltantesForm({
                          ...dadosFaltantesForm,
                          clienteTelefone: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300">
                      E-mail do Cliente (Para envio de recibo)
                    </label>
                    <input
                      type="email"
                      className="input-glass mt-1"
                      placeholder="Ex: cliente@email.com"
                      value={dadosFaltantesForm.clienteEmail}
                      onChange={(e) =>
                        setDadosFaltantesForm({ ...dadosFaltantesForm, clienteEmail: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        Modelo do Celular <span className="text-red-400">*</span>
                        {seloDaFoto('modelo')}
                        {dadosFaltantesForm.marca && (
                          <span className="px-1.5 py-0.2 text-[10px] rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-sans font-semibold">
                            {dadosFaltantesForm.marca}
                          </span>
                        )}
                      </span>
                      {aiParsedData?.camposFaltantes?.includes('modelo') && (
                        <span className="text-amber-400 text-[10px] font-mono">⚠️ FALTANDO</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required
                      className="input-glass mt-1"
                      placeholder="Ex: Poco X8 Pro, iPhone 15, Galaxy S24..."
                      value={dadosFaltantesForm.modelo}
                      onChange={(e) => {
                        const val = e.target.value;
                        const novaMarca = inferirMarcaPorModelo(val, dadosFaltantesForm.marca);
                        setDadosFaltantesForm((prev) => ({
                          ...prev,
                          modelo: val,
                          marca: novaMarca,
                        }));
                        if (selectedStockAparelhoId) {
                          const apSel = aparelhos.find((a) => a.id === selectedStockAparelhoId);
                          if (
                            apSel &&
                            val.trim().length > 3 &&
                            !apSel.modelo.toLowerCase().includes(val.toLowerCase()) &&
                            !val.toLowerCase().includes(apSel.modelo.toLowerCase())
                          ) {
                            setSelectedStockAparelhoId('');
                          }
                        }
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>
                        Capacidade GB <span className="text-red-400">*</span>
                        {seloDaFoto('capacidade')}
                      </span>
                      {aiParsedData?.camposFaltantes?.includes('capacidade') && (
                        <span className="text-amber-400 text-[10px] font-mono">⚠️ FALTANDO</span>
                      )}
                    </label>
                    <select
                      className="input-glass mt-1"
                      value={dadosFaltantesForm.capacidade}
                      onChange={(e) =>
                        setDadosFaltantesForm({ ...dadosFaltantesForm, capacidade: e.target.value })
                      }
                    >
                      {dadosFaltantesForm.capacidade &&
                        !['64GB', '128GB', '256GB', '512GB', '1TB'].includes(
                          dadosFaltantesForm.capacidade
                        ) && (
                          <option value={dadosFaltantesForm.capacidade}>
                            {dadosFaltantesForm.capacidade}
                          </option>
                        )}
                      <option value="64GB">64GB</option>
                      <option value="128GB">128GB</option>
                      <option value="256GB">256GB</option>
                      <option value="512GB">512GB</option>
                      <option value="1TB">1TB</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300">Condição do Aparelho</label>
                    <select
                      className="input-glass mt-1 font-semibold text-emerald-400"
                      value={dadosFaltantesForm.condicao}
                      onChange={(e) =>
                        setDadosFaltantesForm({
                          ...dadosFaltantesForm,
                          condicao: e.target.value as 'seminovo' | 'novo',
                        })
                      }
                    >
                      <option value="seminovo">Seminovo</option>
                      <option value="novo">Novo / Lacrado</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300">
                      Cor do Aparelho{seloDaFoto('cor')}
                    </label>
                    <input
                      type="text"
                      className="input-glass mt-1"
                      placeholder="Ex: Grafite, Preto, Azul, Dourado..."
                      value={dadosFaltantesForm.cor}
                      onChange={(e) =>
                        setDadosFaltantesForm({ ...dadosFaltantesForm, cor: e.target.value })
                      }
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-300">
                      IMEI / Nº de Série (Opcional){seloDaFoto('imei')}
                    </label>
                    <input
                      type="text"
                      className="input-glass mt-1 font-mono"
                      placeholder="Ex: 358921098492041 ou 4 dígitos"
                      value={dadosFaltantesForm.imei}
                      onChange={(e) =>
                        setDadosFaltantesForm({ ...dadosFaltantesForm, imei: e.target.value })
                      }
                    />
                    {(() => {
                      const imeiLimpo = (dadosFaltantesForm.imei || '').trim().toLowerCase();
                      if (imeiLimpo.length < 3) return null;

                      const apEstoque = aparelhos.find((a) => {
                        if (!aparelhoNoEstoque(a)) return false;
                        const aImei = (
                          a.imei ||
                          a.numeroSerie ||
                          (a as any).codigo ||
                          ''
                        ).toLowerCase();
                        return (
                          aImei === imeiLimpo || (imeiLimpo.length >= 4 && aImei.endsWith(imeiLimpo))
                        );
                      });

                      const apSaida = !apEstoque
                        ? aparelhos.find((a) => {
                            if (aparelhoNoEstoque(a)) return false;
                            const aImei = (
                              a.imei ||
                              a.numeroSerie ||
                              (a as any).codigo ||
                              ''
                            ).toLowerCase();
                            return (
                              aImei === imeiLimpo ||
                              (imeiLimpo.length >= 4 && aImei.endsWith(imeiLimpo))
                            );
                          })
                        : null;

                      if (apEstoque) {
                        const modForm = (dadosFaltantesForm.modelo || '').toLowerCase();
                        const modEst = (apEstoque.modelo || '').toLowerCase();
                        const mesmoModelo =
                          modForm && (modEst.includes(modForm) || modForm.includes(modEst));

                        return (
                          <div
                            className={`mt-2 p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 border animate-in fade-in-50 ${
                              mesmoModelo
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {mesmoModelo ? (
                                <PackageCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                              )}
                              <span>
                                {mesmoModelo ? (
                                  <>
                                    <strong>IMEI encontrado no estoque ativo:</strong>{' '}
                                    {apEstoque.marca} {apEstoque.modelo}{' '}
                                    {apEstoque.capacidade || ''} (ID: {getAparelhoCodigo(apEstoque)})
                                  </>
                                ) : (
                                  <>
                                    <strong>Atenção de Modelo:</strong> Este IMEI pertence no estoque
                                    a{' '}
                                    <strong>
                                      {apEstoque.marca} {apEstoque.modelo}
                                    </strong>
                                    , mas você informou <strong>{dadosFaltantesForm.modelo}</strong>.
                                  </>
                                )}
                              </span>
                            </div>
                            {selectedStockAparelhoId !== apEstoque.id && mesmoModelo && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 text-[11px] px-2 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20"
                                onClick={() => setSelectedStockAparelhoId(apEstoque.id)}
                              >
                                Vincular a este
                              </Button>
                            )}
                          </div>
                        );
                      }

                      if (apSaida) {
                        return (
                          <div className="mt-2 p-2.5 rounded-xl text-xs flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 text-blue-300 animate-in fade-in-50">
                            <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                            <span>
                              <strong>Aparelho já passou pelo sistema:</strong> {apSaida.marca}{' '}
                              {apSaida.modelo} {apSaida.capacidade || ''} (Saída registrada
                              anteriormente
                              {apSaida.cliente ? ` para ${apSaida.cliente}` : ''}). Esta nova
                              venda/entrada manterá o histórico anterior intacto!
                            </span>
                          </div>
                        );
                      }

                      return null;
                    })()}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300">
                      Saúde da Bateria % (Opcional){seloDaFoto('saudeBateria')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      inputMode="numeric"
                      className="input-glass mt-1"
                      placeholder="Ex: 88"
                      value={dadosFaltantesForm.bateria}
                      onChange={(e) =>
                        setDadosFaltantesForm({ ...dadosFaltantesForm, bateria: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>
                        Valor Total (R$) <span className="text-red-400">*</span>
                      </span>
                      {aiParsedData?.camposFaltantes?.includes('valorTotal') && (
                        <span className="text-amber-400 text-[10px] font-mono">⚠️ FALTANDO</span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="input-glass mt-1 font-bold text-emerald-400"
                      placeholder="Ex: 3500"
                      value={dadosFaltantesForm.preco}
                      onChange={(e) => {
                        const novoPreco = e.target.value;
                        const precoNum = Number(novoPreco || 0);
                        const trocaNum = dadosFaltantesForm.isUpgrade
                          ? Number(dadosFaltantesForm.tradeInValor || 0)
                          : 0;
                        const volta = Math.max(0, precoNum - trocaNum);
                        setDadosFaltantesForm((prev) => ({
                          ...prev,
                          preco: novoPreco,
                          pagamentos:
                            prev.pagamentos.length === 1
                              ? [{ ...prev.pagamentos[0], valor: volta > 0 ? String(volta) : '' }]
                              : prev.pagamentos,
                        }));
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>
                        Data da Venda <span className="text-red-400">*</span>
                      </span>
                      {aiParsedData?.camposFaltantes?.includes('dataVenda') && (
                        <span className="text-amber-400 text-[10px] font-mono">⚠️ FALTANDO</span>
                      )}
                    </label>
                    <input
                      type="date"
                      required
                      className="input-glass mt-1"
                      value={dadosFaltantesForm.dataVenda}
                      onChange={(e) =>
                        setDadosFaltantesForm({ ...dadosFaltantesForm, dataVenda: e.target.value })
                      }
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-300">Vendedor</label>
                    <select
                      className="input-glass mt-1"
                      value={dadosFaltantesForm.vendedor}
                      onChange={(e) =>
                        setDadosFaltantesForm({ ...dadosFaltantesForm, vendedor: e.target.value })
                      }
                    >
                      <option value="">Vendedor</option>
                      {tecnicos.map((t) => (
                        <option key={t.id} value={t.nome}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* SEÇÃO DINÂMICA DE FORMAS DE PAGAMENTO */}
                  <div className="sm:col-span-2 space-y-2 p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800">
                    <div className="flex items-center justify-between pb-2 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-slate-200">
                          Formas de Pagamento <span className="text-red-400">*</span>
                        </span>
                        {aiParsedData?.camposFaltantes?.includes('formaPagamento') && (
                          <span className="text-amber-400 text-[10px] font-mono">⚠️ FALTANDO</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 cursor-pointer"
                        onClick={() => {
                          setDadosFaltantesForm((prev) => {
                            const totalNecessario =
                              prev.isUpgrade && Number(prev.tradeInValor) > 0
                                ? Math.max(
                                    0,
                                    (Number(prev.preco) || 0) - (Number(prev.tradeInValor) || 0)
                                  )
                                : Number(prev.preco) || 0;
                            const totalJaDistribuido = prev.pagamentos.reduce(
                              (acc, p) => acc + (Number(p.valor) || 0),
                              0
                            );
                            const saldo = Math.max(0, totalNecessario - totalJaDistribuido);
                            const ultimoMetodo =
                              prev.pagamentos[prev.pagamentos.length - 1]?.metodo || 'pix';
                            const novoMetodo =
                              ultimoMetodo === 'pix'
                                ? 'cartao_credito'
                                : ultimoMetodo === 'cartao_credito'
                                ? 'dinheiro'
                                : 'pix';

                            return {
                              ...prev,
                              pagamentos: [
                                ...prev.pagamentos,
                                {
                                  id: Date.now().toString(),
                                  metodo: novoMetodo,
                                  valor: saldo > 0 ? String(saldo) : '',
                                  parcelas: 1,
                                },
                              ],
                            };
                          });
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar outra forma (Pix + Cartão...)
                      </Button>
                    </div>

                    <div className="space-y-2 pt-1">
                      {dadosFaltantesForm.pagamentos.map((pag, index) => {
                        const isCartaoOuParcelado =
                          pag.metodo === 'cartao_credito' || pag.metodo === 'parcelado';
                        return (
                          <div
                            key={pag.id}
                            className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 flex flex-wrap sm:flex-nowrap items-center gap-2"
                          >
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold shrink-0 min-w-[65px]">
                              <span>Forma {index + 1}:</span>
                            </div>

                            <div className="flex-1 min-w-[130px]">
                              <select
                                className="input-glass text-xs py-1.5"
                                value={pag.metodo}
                                onChange={(e) => {
                                  const novoMetodo = e.target.value;
                                  setDadosFaltantesForm((prev) => ({
                                    ...prev,
                                    pagamentos: prev.pagamentos.map((p, i) =>
                                      i === index ? { ...p, metodo: novoMetodo } : p
                                    ),
                                  }));
                                }}
                              >
                                <option value="pix">Pix</option>
                                <option value="cartao_credito">Cartão de Crédito</option>
                                <option value="cartao_debito">Cartão de Débito</option>
                                <option value="dinheiro">Dinheiro</option>
                                <option value="parcelado">Parcelado</option>
                                <option value="boleto">Boleto</option>
                                <option value="fiado">Fiado / A Prazo</option>
                              </select>
                            </div>

                            {isCartaoOuParcelado && (
                              <div className="w-24 shrink-0">
                                <select
                                  className="input-glass text-xs py-1.5"
                                  value={pag.parcelas || 1}
                                  onChange={(e) => {
                                    const parc = Number(e.target.value) || 1;
                                    setDadosFaltantesForm((prev) => ({
                                      ...prev,
                                      pagamentos: prev.pagamentos.map((p, i) =>
                                        i === index ? { ...p, parcelas: parc } : p
                                      ),
                                    }));
                                  }}
                                >
                                  {Array.from({ length: 18 }, (_, k) => k + 1).map((n) => (
                                    <option key={n} value={n}>
                                      {n}x
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div className="w-32 shrink-0">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                  R$
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0,00"
                                  className="input-glass text-xs py-1.5 pl-8 font-bold text-emerald-400"
                                  value={pag.valor}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setDadosFaltantesForm((prev) => ({
                                      ...prev,
                                      pagamentos: prev.pagamentos.map((p, i) =>
                                        i === index ? { ...p, valor: val } : p
                                      ),
                                    }));
                                  }}
                                />
                              </div>
                            </div>

                            {dadosFaltantesForm.pagamentos.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0 cursor-pointer"
                                onClick={() => {
                                  setDadosFaltantesForm((prev) => ({
                                    ...prev,
                                    pagamentos: prev.pagamentos.filter((_, i) => i !== index),
                                  }));
                                }}
                                title="Remover esta forma de pagamento"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {(() => {
                      const totalPagar =
                        dadosFaltantesForm.isUpgrade && Number(dadosFaltantesForm.tradeInValor) > 0
                          ? Math.max(
                              0,
                              (Number(dadosFaltantesForm.preco) || 0) -
                                (Number(dadosFaltantesForm.tradeInValor) || 0)
                            )
                          : Number(dadosFaltantesForm.preco) || 0;
                      const totalDistribuido = dadosFaltantesForm.pagamentos.reduce(
                        (acc, p) => acc + (Number(p.valor) || 0),
                        0
                      );
                      const dif = totalPagar - totalDistribuido;
                      const bateu = Math.abs(dif) < 0.01;

                      return (
                        <div className="pt-2 flex flex-wrap items-center justify-between text-xs gap-2 border-t border-white/5">
                          <div className="text-slate-400 flex items-center gap-2">
                            <span>
                              Total a Pagar:{' '}
                              <strong className="text-white">R$ {totalPagar.toFixed(2)}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Soma das Formas:{' '}
                              <strong className={bateu ? 'text-emerald-400' : 'text-amber-400'}>
                                R$ {totalDistribuido.toFixed(2)}
                              </strong>
                            </span>
                          </div>

                          {bateu ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                              <Check className="w-3.5 h-3.5" /> Total conferido
                            </span>
                          ) : dif > 0 ? (
                            <div className="flex items-center gap-2">
                              <span className="text-amber-400 text-[11px] font-semibold">
                                Faltam R$ {dif.toFixed(2)}
                              </span>
                              <button
                                type="button"
                                className="text-[11px] text-emerald-400 hover:underline font-bold cursor-pointer"
                                onClick={() => {
                                  setDadosFaltantesForm((prev) => {
                                    if (prev.pagamentos.length === 0) return prev;
                                    const ultimoIdx = prev.pagamentos.length - 1;
                                    const valorAtual = Number(prev.pagamentos[ultimoIdx].valor) || 0;
                                    const novoValor = (valorAtual + dif).toFixed(2);
                                    return {
                                      ...prev,
                                      pagamentos: prev.pagamentos.map((p, i) =>
                                        i === ultimoIdx ? { ...p, valor: novoValor } : p
                                      ),
                                    };
                                  });
                                }}
                              >
                                Completar no último
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-red-400 text-[11px] font-semibold">
                                Passou R$ {Math.abs(dif).toFixed(2)} do total!
                              </span>
                              <button
                                type="button"
                                className="text-[11px] text-emerald-400 hover:underline font-bold cursor-pointer"
                                onClick={() => {
                                  setDadosFaltantesForm((prev) => {
                                    if (prev.pagamentos.length === 0) return prev;
                                    const ultimoIdx = prev.pagamentos.length - 1;
                                    const valorAtual = Number(prev.pagamentos[ultimoIdx].valor) || 0;
                                    const novoValor = Math.max(0, valorAtual + dif).toFixed(2);
                                    return {
                                      ...prev,
                                      pagamentos: prev.pagamentos.map((p, i) =>
                                        i === ultimoIdx ? { ...p, valor: novoValor } : p
                                      ),
                                    };
                                  });
                                }}
                              >
                                Ajustar no último
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* SEÇÃO DE UPGRADE / APARELHO NA TROCA (TRADE-IN) */}
                <div className="pt-2 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/40 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                        <Repeat className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">
                          Venda com Upgrade / Aparelho na Troca
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Cliente entrega celular usado como entrada para abater o valor
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dadosFaltantesForm.isUpgrade}
                        onChange={(e) => {
                          const ativo = e.target.checked;
                          const precoNum = Number(dadosFaltantesForm.preco || 0);
                          const trocaNum = ativo
                            ? Number(dadosFaltantesForm.tradeInValor || 0)
                            : 0;
                          const volta = Math.max(0, precoNum - trocaNum);
                          setDadosFaltantesForm({
                            ...dadosFaltantesForm,
                            isUpgrade: ativo,
                            tradeInValor: ativo ? dadosFaltantesForm.tradeInValor : '',
                            pagamentos:
                              dadosFaltantesForm.pagamentos.length === 1
                                ? [
                                    {
                                      ...dadosFaltantesForm.pagamentos[0],
                                      valor: volta > 0 ? String(volta) : '',
                                    },
                                  ]
                                : dadosFaltantesForm.pagamentos,
                          });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {dadosFaltantesForm.isUpgrade && (
                    <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-3 animate-in fade-in-50">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-emerald-500/20">
                        <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Repeat className="w-3.5 h-3.5 text-emerald-400" /> Dados do Aparelho que
                          Entrou na Troca
                        </span>

                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                            <input
                              type="checkbox"
                              checked={!dadosFaltantesForm.tradeInEntrarNoEstoque}
                              onChange={(e) => {
                                setDadosFaltantesForm({
                                  ...dadosFaltantesForm,
                                  tradeInEntrarNoEstoque: !e.target.checked,
                                });
                              }}
                              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                            />
                            <span
                              className={
                                dadosFaltantesForm.tradeInEntrarNoEstoque
                                  ? 'text-slate-300 hover:text-white'
                                  : 'text-amber-300 font-semibold'
                              }
                            >
                              Não adicionar ao estoque
                            </span>
                          </label>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              dadosFaltantesForm.tradeInEntrarNoEstoque
                                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                            }`}
                          >
                            {dadosFaltantesForm.tradeInEntrarNoEstoque
                              ? 'Entrará no Estoque'
                              : 'Não entrará no Estoque'}
                          </span>
                        </div>
                      </div>

                      {!dadosFaltantesForm.tradeInEntrarNoEstoque && (
                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            O abatimento financeiro de entrada será aplicado na venda, mas o aparelho
                            usado <strong>não será cadastrado no estoque</strong> da loja.
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                            <span>
                              Modelo que Entrou <span className="text-red-400">*</span>
                            </span>
                            {dadosFaltantesForm.tradeInMarca && (
                              <span className="px-1.5 py-0.2 text-[9px] rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-sans font-semibold">
                                {dadosFaltantesForm.tradeInMarca}
                              </span>
                            )}
                          </label>
                          <input
                            type="text"
                            required={dadosFaltantesForm.isUpgrade}
                            className="input-glass mt-1 text-xs"
                            placeholder="Ex: iPhone 11, Poco X5 Pro, Galaxy S21"
                            value={dadosFaltantesForm.tradeInModelo}
                            onChange={(e) => {
                              const val = e.target.value;
                              const marcaTroca = inferirMarcaPorModelo(
                                val,
                                dadosFaltantesForm.tradeInMarca
                              );
                              setDadosFaltantesForm((prev) => ({
                                ...prev,
                                tradeInModelo: val,
                                tradeInMarca: marcaTroca,
                              }));
                            }}
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300">
                            Capacidade GB
                          </label>
                          <select
                            className="input-glass mt-1 text-xs"
                            value={dadosFaltantesForm.tradeInCapacidade}
                            onChange={(e) =>
                              setDadosFaltantesForm({
                                ...dadosFaltantesForm,
                                tradeInCapacidade: e.target.value,
                              })
                            }
                          >
                            <option value="64GB">64GB</option>
                            <option value="128GB">128GB</option>
                            <option value="256GB">256GB</option>
                            <option value="512GB">512GB</option>
                            <option value="1TB">1TB</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300">
                            Valor de Avaliação / Entrada (R$){' '}
                            {!dadosFaltantesForm.tradeInEntrarNoEstoque ? (
                              <span className="text-amber-400 font-normal text-[10px]">
                                (Opcional)
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal text-[10px]">
                                (R$ 0 se não abater)
                              </span>
                            )}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            className="input-glass mt-1 font-bold text-emerald-400 text-xs"
                            placeholder="0.00"
                            value={dadosFaltantesForm.tradeInValor}
                            onChange={(e) => {
                              const novoValorTroca = e.target.value;
                              const precoNum = Number(dadosFaltantesForm.preco || 0);
                              const trocaNum = Number(novoValorTroca || 0);
                              const volta = Math.max(0, precoNum - trocaNum);
                              setDadosFaltantesForm((prev) => ({
                                ...prev,
                                tradeInValor: novoValorTroca,
                                pagamentos:
                                  prev.pagamentos.length === 1
                                    ? [
                                        {
                                          ...prev.pagamentos[0],
                                          valor: volta > 0 ? String(volta) : '',
                                        },
                                      ]
                                    : prev.pagamentos,
                              }));
                            }}
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300">Cor</label>
                          <input
                            type="text"
                            className="input-glass mt-1 text-xs"
                            placeholder="Ex: Preto, Branco, Azul..."
                            value={dadosFaltantesForm.tradeInCor}
                            onChange={(e) =>
                              setDadosFaltantesForm({
                                ...dadosFaltantesForm,
                                tradeInCor: e.target.value,
                              })
                            }
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[11px] font-bold text-slate-300">
                            IMEI da Troca (Opcional)
                          </label>
                          <input
                            type="text"
                            className="input-glass mt-1 font-mono text-xs"
                            placeholder="Ex: 358921098492041"
                            value={dadosFaltantesForm.tradeInImei}
                            onChange={(e) =>
                              setDadosFaltantesForm({
                                ...dadosFaltantesForm,
                                tradeInImei: e.target.value,
                              })
                            }
                          />
                          {(() => {
                            const imeiTrocaLimpo = (dadosFaltantesForm.tradeInImei || '')
                              .trim()
                              .toLowerCase();
                            if (imeiTrocaLimpo.length < 3) return null;
                            const apExistente = aparelhos.find((a) => {
                              const aImei = (
                                a.imei ||
                                a.numeroSerie ||
                                (a as any).codigo ||
                                ''
                              ).toLowerCase();
                              return (
                                aImei === imeiTrocaLimpo ||
                                (imeiTrocaLimpo.length >= 4 && aImei.endsWith(imeiTrocaLimpo))
                              );
                            });
                            if (!apExistente) return null;
                            return (
                              <div className="mt-1.5 p-2 rounded-xl text-[11px] flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 text-blue-300">
                                <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span>
                                  <strong>Aparelho já passou pelo sistema anteriormente:</strong>{' '}
                                  {apExistente.marca} {apExistente.modelo}{' '}
                                  {apExistente.capacidade || ''} (ID:{' '}
                                  {getAparelhoCodigo(apExistente)}). Entrará como novo ciclo de troca
                                  mantendo o histórico anterior!
                                </span>
                              </div>
                            );
                          })()}
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300">
                            Saúde Bateria % (Opcional)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            className="input-glass mt-1 text-xs"
                            placeholder="Ex: 85"
                            value={dadosFaltantesForm.tradeInBateria}
                            onChange={(e) =>
                              setDadosFaltantesForm({
                                ...dadosFaltantesForm,
                                tradeInBateria: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      {/* Resumo Financeiro da Troca */}
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-emerald-500/20 text-xs flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="text-slate-400">
                            Aparelho Adquirido:{' '}
                            <strong className="text-slate-200">
                              R$ {Number(dadosFaltantesForm.preco || 0).toFixed(2)}
                            </strong>
                          </div>
                          <div className="text-emerald-400">
                            (-) Entrada da Troca:{' '}
                            <strong className="text-emerald-300">
                              - R$ {Number(dadosFaltantesForm.tradeInValor || 0).toFixed(2)}
                            </strong>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-slate-400">
                            (=) Volta Restante a Pagar
                          </div>
                          <div className="text-base font-black text-emerald-400 font-mono">
                            R${' '}
                            {Math.max(
                              0,
                              (Number(dadosFaltantesForm.preco) || 0) -
                                (Number(dadosFaltantesForm.tradeInValor) || 0)
                            ).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-3 border-t border-white/10">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 cursor-pointer"
                    onClick={onFecharDadosFaltantes}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 bg-green-600 hover:bg-green-700 font-bold shadow-lg shadow-green-500/20 cursor-pointer"
                    onClick={async () => {
                      if (
                        !dadosFaltantesForm.modelo ||
                        !dadosFaltantesForm.preco ||
                        !dadosFaltantesForm.dataVenda
                      ) {
                        toast.error('Preencha a Data da Venda, modelo e valor do aparelho!');
                        return;
                      }

                      if (dadosFaltantesForm.isUpgrade) {
                        if (
                          !dadosFaltantesForm.tradeInModelo ||
                          !dadosFaltantesForm.tradeInModelo.trim()
                        ) {
                          toast.error('Informe o modelo do aparelho que entrou na troca!');
                          return;
                        }
                      }

                      const precoTotalNum = Number(dadosFaltantesForm.preco);
                      const valorEntradaTrocaNum = dadosFaltantesForm.isUpgrade
                        ? Number(dadosFaltantesForm.tradeInValor)
                        : 0;
                      const valorVoltaNum = dadosFaltantesForm.isUpgrade
                        ? Math.max(0, precoTotalNum - valorEntradaTrocaNum)
                        : precoTotalNum;

                      const pagamentosValidos = dadosFaltantesForm.pagamentos
                        .map((p) => ({
                          id: p.id,
                          metodo: p.metodo,
                          valor: Number(p.valor) || 0,
                          parcelas: p.parcelas || 1,
                        }))
                        .filter((p) => p.valor > 0);

                      if (pagamentosValidos.length === 0) {
                        toast.error('Informe pelo menos uma forma de pagamento com valor!');
                        return;
                      }

                      const somaPags = pagamentosValidos.reduce((acc, p) => acc + p.valor, 0);
                      if (Math.abs(somaPags - valorVoltaNum) > 0.05) {
                        toast.error(
                          `A soma das formas de pagamento (R$ ${somaPags.toFixed(2)}) não confere com o total a pagar (R$ ${valorVoltaNum.toFixed(2)})!`
                        );
                        return;
                      }

                      const tradeInEntrarNoEstoque =
                        dadosFaltantesForm.tradeInEntrarNoEstoque !== false;

                      onFecharDadosFaltantes();
                      await aplicarVendaAI({
                        cliente: {
                          nome: dadosFaltantesForm.clienteNome,
                          telefone: dadosFaltantesForm.clienteTelefone,
                          email: dadosFaltantesForm.clienteEmail,
                          cpf: aiParsedData?.cliente?.cpf || null,
                          dataNascimento:
                            aiParsedData?.cliente?.dataNascimento ||
                            (aiParsedData?.cliente as any)?.data_nascimento ||
                            null,
                        },
                        aparelho: {
                          marca: dadosFaltantesForm.marca,
                          modelo: dadosFaltantesForm.modelo,
                          capacidade: dadosFaltantesForm.capacidade,
                          cor: dadosFaltantesForm.cor,
                          condicao: dadosFaltantesForm.condicao,
                          imei: dadosFaltantesForm.imei,
                          saudeBateria:
                            Number(dadosFaltantesForm.bateria) > 0
                              ? Number(dadosFaltantesForm.bateria)
                              : null,
                          preco: precoTotalNum,
                          custo: Number(dadosFaltantesForm.custo),
                        },
                        isUpgrade: dadosFaltantesForm.isUpgrade,
                        tradeInEntrarNoEstoque,
                        tradeIn: dadosFaltantesForm.isUpgrade
                          ? {
                              marca: dadosFaltantesForm.tradeInMarca,
                              modelo: dadosFaltantesForm.tradeInModelo,
                              capacidade: dadosFaltantesForm.tradeInCapacidade,
                              cor: dadosFaltantesForm.tradeInCor,
                              imei: dadosFaltantesForm.tradeInImei || null,
                              bateria:
                                Number(dadosFaltantesForm.tradeInBateria) > 0
                                  ? Number(dadosFaltantesForm.tradeInBateria)
                                  : null,
                              valor: valorEntradaTrocaNum,
                              condicao: 'seminovo',
                              observacoes: 'Recebido como troca (trade-in) no pedido',
                              entrarNoEstoque: tradeInEntrarNoEstoque,
                            }
                          : null,
                        valorEntradaTroca:
                          valorEntradaTrocaNum > 0 ? valorEntradaTrocaNum : null,
                        valorVolta: valorVoltaNum,
                        vendedor: dadosFaltantesForm.vendedor,
                        formaPagamento: pagamentosValidos[0]?.metodo || 'pix',
                        pagamentos: pagamentosValidos,
                        valorTotal: precoTotalNum,
                        dataVenda: dadosFaltantesForm.dataVenda,
                        observacoes: dadosFaltantesForm.observacoes,
                      });
                    }}
                  >
                    Confirmar e Gerar Venda
                  </Button>
                </div>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
    </>
  );
}
