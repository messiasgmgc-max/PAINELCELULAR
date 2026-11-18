'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Venda } from '@/lib/db/types';
import { getVendaDataExibicao } from '@/lib/utils';
import {
  FileText,
  Loader2,
  Mail,
  PackageCheck,
  Printer,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';

export interface NovoClienteFormState {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
}

export interface VendasConfirmacaoModaisProps {
  isClient: boolean;

  vendaParaDesfazer: Venda | null;
  desfazendoVenda: boolean;
  onFecharDesfazer: () => void;
  onConfirmarDesfazer: (venda: Venda) => void;

  vendaParaExcluirCancelada: Venda | null;
  excluindoVendaCancelada: boolean;
  onFecharExcluirCancelada: () => void;
  onConfirmarExcluirCancelada: () => void;

  vendaParaDescancelar: Venda | null;
  descancelandoVenda: boolean;
  onFecharDescancelar: () => void;
  onConfirmarDescancelar: () => void;

  showReenviarNotinhaPrompt: boolean;
  vendaEditadaNotinha: Venda | null;
  onFecharReenviarNotinha: () => void;
  onGerarCupomTermico: (venda: Venda) => void;
  onGerarReciboA4: (venda: Venda) => void;
  onReenviarRecibo: (venda: Venda, canal: 'todos' | 'email' | 'whatsapp') => void;

  showNovoCliente: boolean;
  novoClienteData: NovoClienteFormState;
  setNovoClienteData: React.Dispatch<React.SetStateAction<NovoClienteFormState>>;
  onFecharNovoCliente: () => void;
  onSubmitNovoCliente: (e: React.FormEvent) => void;

  showDeleteAllModal: boolean;
  confirmDeleteEmail: string;
  setConfirmDeleteEmail: (val: string) => void;
  confirmDeletePassword: string;
  setConfirmDeletePassword: (val: string) => void;
  deletingAllVendas: boolean;
  onCancelDeleteAll: () => void;
  onSubmitDeleteAll: (e: React.FormEvent) => void;
}

export function VendasConfirmacaoModais({
  isClient,
  vendaParaDesfazer,
  desfazendoVenda,
  onFecharDesfazer,
  onConfirmarDesfazer,
  vendaParaExcluirCancelada,
  excluindoVendaCancelada,
  onFecharExcluirCancelada,
  onConfirmarExcluirCancelada,
  vendaParaDescancelar,
  descancelandoVenda,
  onFecharDescancelar,
  onConfirmarDescancelar,
  showReenviarNotinhaPrompt,
  vendaEditadaNotinha,
  onFecharReenviarNotinha,
  onGerarCupomTermico,
  onGerarReciboA4,
  onReenviarRecibo,
  showNovoCliente,
  novoClienteData,
  setNovoClienteData,
  onFecharNovoCliente,
  onSubmitNovoCliente,
  showDeleteAllModal,
  confirmDeleteEmail,
  setConfirmDeleteEmail,
  confirmDeletePassword,
  setConfirmDeletePassword,
  deletingAllVendas,
  onCancelDeleteAll,
  onSubmitDeleteAll,
}: VendasConfirmacaoModaisProps) {
  if (!isClient) return null;

  return (
    <>
      {/* Modal de Confirmação — Desfazer Venda */}
      {vendaParaDesfazer &&
        createPortal(
          <div className="modal-overlay modal-overlay-fit z-[80]">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
              <div className="modal-header">
                <h3 className="modal-title flex items-center gap-2 text-amber-400 font-bold">
                  <Undo2 className="w-5 h-5" /> Desfazer Venda
                </h3>
                <button
                  type="button"
                  onClick={onFecharDesfazer}
                  disabled={desfazendoVenda}
                  className="text-slate-400 hover:text-white disabled:opacity-40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="modal-body space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
                  <p className="text-sm font-bold text-white">
                    Venda #{vendaParaDesfazer.id.slice(-6).toUpperCase()}
                  </p>
                  <p className="text-xs text-slate-400">
                    {vendaParaDesfazer.clienteNome} ·{' '}
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      vendaParaDesfazer.valor
                    )}
                    {' · '}
                    {getVendaDataExibicao(vendaParaDesfazer).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                {(() => {
                  const itensComAparelho = (vendaParaDesfazer.itens || []).filter((i) => i.aparelhoId);
                  if (itensComAparelho.length === 0) {
                    return (
                      <p className="text-xs text-slate-400">
                        Esta venda não tem aparelho vinculado ao estoque; nada será devolvido.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <PackageCheck className="w-3.5 h-3.5" />
                        Volta{itensComAparelho.length > 1 ? 'm' : ''} ao estoque:
                      </p>
                      <ul className="space-y-1">
                        {itensComAparelho.map((item) => (
                          <li key={item.id} className="text-xs text-slate-300 pl-5">
                            • {item.descricao}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                  A venda continua no histórico como cancelada e deixa de contar no faturamento e no fiado.
                </p>
              </div>

              <div className="flex gap-2 justify-end p-4 border-t border-white/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onFecharDesfazer}
                  disabled={desfazendoVenda}
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={() => onConfirmarDesfazer(vendaParaDesfazer)}
                  disabled={desfazendoVenda}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
                >
                  {desfazendoVenda ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Desfazendo...
                    </>
                  ) : (
                    <>
                      <Undo2 className="mr-2 h-4 w-4" /> Desfazer e devolver ao estoque
                    </>
                  )}
                </Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

      {/* Modal de Confirmação — Excluir Venda Cancelada */}
      {vendaParaExcluirCancelada &&
        createPortal(
          <div className="modal-overlay modal-overlay-fit z-[80]">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4 border-rose-500/30">
              <div className="modal-header bg-rose-500/10 border-b border-rose-500/20">
                <h3 className="modal-title flex items-center gap-2 text-rose-400 font-bold">
                  <Trash2 className="w-5 h-5 text-rose-400" /> Excluir Venda Cancelada
                </h3>
                <button
                  type="button"
                  onClick={onFecharExcluirCancelada}
                  disabled={excluindoVendaCancelada}
                  className="text-slate-400 hover:text-white disabled:opacity-40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="modal-body p-4 space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
                  <p className="text-sm font-bold text-white">
                    Venda #{vendaParaExcluirCancelada.id.slice(-6).toUpperCase()}
                  </p>
                  <p className="text-xs text-slate-400">
                    {vendaParaExcluirCancelada.clienteNome} ·{' '}
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      vendaParaExcluirCancelada.valor
                    )}
                    {' · '}
                    {getVendaDataExibicao(vendaParaExcluirCancelada).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 space-y-1 text-xs text-rose-200">
                  <p className="font-bold text-rose-300">⚠️ Atenção: Ação Irreversível</p>
                  <p>
                    Esta venda cancelada será removida definitivamente do banco de dados. Os relatórios
                    históricos desta venda serão apagados.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end p-4 border-t border-white/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onFecharExcluirCancelada}
                  disabled={excluindoVendaCancelada}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={onConfirmarExcluirCancelada}
                  disabled={excluindoVendaCancelada}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold"
                >
                  {excluindoVendaCancelada ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Excluindo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" /> Confirmar Exclusão
                    </>
                  )}
                </Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

      {/* Modal de Confirmação — Reativar (Descancelar) Venda */}
      {vendaParaDescancelar &&
        createPortal(
          <div className="modal-overlay modal-overlay-fit z-[80]">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4 border-emerald-500/30">
              <div className="modal-header bg-emerald-500/10 border-b border-emerald-500/20">
                <h3 className="modal-title flex items-center gap-2 text-emerald-400 font-bold">
                  <RotateCcw className="w-5 h-5 text-emerald-400" /> Reativar Venda (Descancelar)
                </h3>
                <button
                  type="button"
                  onClick={onFecharDescancelar}
                  disabled={descancelandoVenda}
                  className="text-slate-400 hover:text-white disabled:opacity-40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="modal-body p-4 space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
                  <p className="text-sm font-bold text-white">
                    Venda #{vendaParaDescancelar.id.slice(-6).toUpperCase()}
                  </p>
                  <p className="text-xs text-slate-400">
                    {vendaParaDescancelar.clienteNome} ·{' '}
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      vendaParaDescancelar.valor
                    )}
                    {' · '}
                    {getVendaDataExibicao(vendaParaDescancelar).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1 text-xs text-emerald-200">
                  <p className="font-bold text-emerald-300">ℹ️ Restauração de Status</p>
                  <p>
                    O status desta venda retornará para <strong className="text-emerald-300">Pago</strong> e
                    ela voltará a contabilizar normalmente no faturamento da loja.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end p-4 border-t border-white/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onFecharDescancelar}
                  disabled={descancelandoVenda}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={onConfirmarDescancelar}
                  disabled={descancelandoVenda}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  {descancelandoVenda ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reativando...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="mr-2 h-4 w-4" /> Reativar Venda
                    </>
                  )}
                </Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

      {/* Modal Prompt de Reenvio de Notinha pós Edição */}
      {showReenviarNotinhaPrompt &&
        vendaEditadaNotinha &&
        createPortal(
          <div className="modal-overlay modal-overlay-fit z-[70]">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
              <div className="modal-header">
                <h3 className="modal-title flex items-center gap-2 text-blue-400 font-bold">
                  <FileText className="w-5 h-5 text-blue-500" /> Venda Alterada com Sucesso!
                </h3>
                <Button variant="ghost" size="icon" onClick={onFecharReenviarNotinha}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="modal-body-scroll p-6 space-y-4 text-center">
                <p className="text-sm font-medium">
                  Os dados da venda{' '}
                  <span className="font-mono text-blue-400 font-bold">
                    #{vendaEditadaNotinha.id ? vendaEditadaNotinha.id.slice(-6).toUpperCase() : ''}
                  </span>{' '}
                  foram atualizados no sistema.
                </p>
                <p className="text-xs text-muted-foreground">
                  Deseja gerar ou reenviar a notinha com as novas informações para o cliente{' '}
                  <strong className="text-white">{vendaEditadaNotinha.clienteNome}</strong>?
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                  <Button
                    type="button"
                    onClick={() => {
                      onGerarCupomTermico(vendaEditadaNotinha);
                      onFecharReenviarNotinha();
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-xs font-bold"
                  >
                    <Printer className="w-4 h-4 mr-1" /> Cupom Térmico
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      onGerarReciboA4(vendaEditadaNotinha);
                      onFecharReenviarNotinha();
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-xs font-bold"
                  >
                    <FileText className="w-4 h-4 mr-1" /> Recibo A4
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      onReenviarRecibo(vendaEditadaNotinha, 'todos');
                      onFecharReenviarNotinha();
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold"
                  >
                    <Mail className="w-4 h-4 mr-1" /> WhatsApp / Email
                  </Button>
                </div>
              </div>

              <div className="flex justify-end p-4 border-t border-white/10">
                <Button variant="outline" size="sm" onClick={onFecharReenviarNotinha}>
                  Concluir sem Reenviar
                </Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

      {/* Modal Novo Cliente */}
      {showNovoCliente &&
        createPortal(
          <div className="modal-overlay modal-overlay-fit z-[60]">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
              <div className="modal-header">
                <h3 className="modal-title">Novo Cliente</h3>
                <Button variant="ghost" size="icon" onClick={onFecharNovoCliente}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="modal-body-scroll">
                <form onSubmit={onSubmitNovoCliente} className="space-y-4">
                  <input
                    type="text"
                    placeholder="Nome *"
                    required
                    className="input-glass"
                    value={novoClienteData.nome}
                    onChange={(e) => setNovoClienteData({ ...novoClienteData, nome: e.target.value })}
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="Telefone *"
                    required
                    className="input-glass"
                    value={novoClienteData.telefone}
                    onChange={(e) =>
                      setNovoClienteData({ ...novoClienteData, telefone: e.target.value })
                    }
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    className="input-glass"
                    value={novoClienteData.email}
                    onChange={(e) =>
                      setNovoClienteData({ ...novoClienteData, email: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="CPF"
                    className="input-glass"
                    value={novoClienteData.cpf}
                    onChange={(e) =>
                      setNovoClienteData({
                        ...novoClienteData,
                        cpf: e.target.value.replace(/\D/g, ''),
                      })
                    }
                  />
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                    Cadastrar Cliente
                  </Button>
                </form>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

      {/* Modal: Apagar todas as vendas */}
      {showDeleteAllModal &&
        createPortal(
          <div className="modal-overlay modal-overlay-fit z-[70]">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
              <div className="modal-header">
                <div>
                  <h3 className="modal-title text-red-600">Apagar todas as vendas</h3>
                  <p className="modal-subtitle">
                    Esta ação remove definitivamente todos os registros de vendas da loja.
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onCancelDeleteAll}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="modal-body-scroll">
                <form onSubmit={onSubmitDeleteAll} className="space-y-4">
                  <input
                    type="email"
                    className="input-glass"
                    placeholder="Email da conta"
                    value={confirmDeleteEmail}
                    onChange={(e) => setConfirmDeleteEmail(e.target.value)}
                    required
                  />
                  <input
                    type="password"
                    className="input-glass"
                    placeholder="Senha"
                    value={confirmDeletePassword}
                    onChange={(e) => setConfirmDeletePassword(e.target.value)}
                    required
                  />

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={onCancelDeleteAll}
                      disabled={deletingAllVendas}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      variant="destructive"
                      className="flex-1"
                      disabled={deletingAllVendas}
                    >
                      {deletingAllVendas ? 'Apagando...' : 'Confirmar e Apagar'}
                    </Button>
                  </div>
                </form>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
    </>
  );
}
