'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, ChevronDown, ChevronRight, Loader2, MinusSquare, Pencil, Search, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ModalPortal } from '@/components/ModalPortal';
import { cn } from '@/lib/utils';
import { capacidadesDoModelo } from '@/lib/pdv/cadastroRapido';
import {
  agruparPorModelo,
  coresUsadas,
  montarAlteracao,
  observacaoAtual,
  type AparelhoEditavel,
  type GrupoModelo,
  type MudancasEmMassa,
} from '@/lib/estoque/edicaoMassa';

interface Props {
  aberto: boolean;
  aparelhos: AparelhoEditavel[];
  /** Mesmo caminho da edição individual (não mexe em ativo/status). Retorna null em caso de erro. */
  atualizarAparelho: (id: string, dados: Record<string, unknown>) => Promise<unknown>;
  onFechar: () => void;
  onConcluido: () => void | Promise<void>;
}

const NAO_ALTERAR = '';
const OUTRA_COR = '__outra__';

function descricaoCurta(aparelho: AparelhoEditavel): string {
  const final = String(aparelho.imei || '').slice(-4);
  return [aparelho.modelo, aparelho.capacidade, final ? `final ${final}` : ''].filter(Boolean).join(' ');
}

export function EdicaoMassaModal({ aberto, aparelhos, atualizarAparelho, onFechar, onConcluido }: Props) {
  const [busca, setBusca] = useState('');
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [cor, setCor] = useState(NAO_ALTERAR);
  const [corDigitada, setCorDigitada] = useState('');
  const [capacidade, setCapacidade] = useState(NAO_ALTERAR);
  const [alterarObservacao, setAlterarObservacao] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setBusca('');
    setExpandidos(new Set());
    setSelecionados(new Set());
    setCor(NAO_ALTERAR);
    setCorDigitada('');
    setCapacidade(NAO_ALTERAR);
    setAlterarObservacao(false);
    setObservacao('');
  }, [aberto]);

  const grupos = useMemo(() => agruparPorModelo(aparelhos), [aparelhos]);

  const gruposVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return grupos;
    return grupos.filter(
      (g) =>
        g.modelo.toLowerCase().includes(termo) ||
        g.aparelhos.some((a) => String(a.imei || '').includes(termo) || String(a.cor || '').toLowerCase().includes(termo))
    );
  }, [grupos, busca]);

  const aparelhosSelecionados = useMemo(
    () => grupos.flatMap((g) => g.aparelhos).filter((a) => selecionados.has(a.id)),
    [grupos, selecionados]
  );

  const modelosSelecionados = useMemo(
    () => Array.from(new Set(aparelhosSelecionados.map((a) => String(a.modelo || '')))),
    [aparelhosSelecionados]
  );

  const opcoesCor = useMemo(
    () => Array.from(new Set(modelosSelecionados.flatMap((m) => coresUsadas(m, aparelhos)))),
    [modelosSelecionados, aparelhos]
  );

  const opcoesCapacidade = useMemo(
    () => Array.from(new Set(modelosSelecionados.flatMap((m) => capacidadesDoModelo(m)))),
    [modelosSelecionados]
  );

  const mudancas: MudancasEmMassa = {
    cor: cor === OUTRA_COR ? corDigitada.trim() || null : cor || null,
    capacidade: capacidade || null,
    observacao: alterarObservacao ? observacao : null,
  };

  const alteracoes = aparelhosSelecionados
    .map((aparelho) => ({ aparelho, dados: montarAlteracao(aparelho, mudancas) }))
    .filter((x): x is { aparelho: AparelhoEditavel; dados: Record<string, string> } => x.dados !== null);

  if (!aberto) return null;

  const alternarExpandido = (modelo: string) => {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(modelo)) novo.delete(modelo);
      else novo.add(modelo);
      return novo;
    });
  };

  const alternarAparelho = (id: string) => {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const alternarGrupo = (grupo: GrupoModelo) => {
    const todos = grupo.aparelhos.every((a) => selecionados.has(a.id));
    setSelecionados((atual) => {
      const novo = new Set(atual);
      for (const a of grupo.aparelhos) {
        if (todos) novo.delete(a.id);
        else novo.add(a.id);
      }
      return novo;
    });
  };

  const salvar = async () => {
    if (alteracoes.length === 0 || salvando) return;
    setSalvando(true);
    let atualizados = 0;
    const falhas: string[] = [];

    for (const { aparelho, dados } of alteracoes) {
      try {
        const resultado = await atualizarAparelho(aparelho.id, dados);
        if (resultado) atualizados += 1;
        else falhas.push(descricaoCurta(aparelho));
      } catch {
        falhas.push(descricaoCurta(aparelho));
      }
    }

    setSalvando(false);
    await onConcluido();

    if (falhas.length === 0) {
      toast.success(`${atualizados} aparelho(s) atualizado(s).`);
      onFechar();
    } else {
      toast.error(
        `${atualizados} atualizado(s) e ${falhas.length} com erro: ${falhas.slice(0, 3).join(', ')}${falhas.length > 3 ? '…' : ''}`,
        { duration: 10000 }
      );
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[10050] flex items-center justify-center p-2 sm:p-6 bg-black/85 backdrop-blur-md">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edicao-massa-titulo"
          className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full max-h-[94dvh] flex flex-col shadow-2xl text-white overflow-hidden"
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
            <div className="min-w-0">
              <h3 id="edicao-massa-titulo" className="text-base sm:text-lg font-bold flex items-center gap-2">
                <Pencil className="h-5 w-5 text-violet-300" />
                Editar em massa
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Marque os aparelhos e escolha o que muda. Só os campos escolhidos são alterados.
              </p>
            </div>
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="text-slate-400 hover:text-white disabled:opacity-40"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_320px]">
            {/* Lista por modelo */}
            <div className="min-h-0 flex flex-col border-b md:border-b-0 md:border-r border-white/10">
              <div className="p-3 border-b border-white/10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar modelo, cor ou final do IMEI"
                    className="input-glass w-full pl-9 text-sm h-10"
                  />
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto max-h-[45dvh] md:max-h-none p-2 space-y-1.5">
                {gruposVisiveis.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8">Nenhum aparelho no estoque com essa busca.</p>
                )}

                {gruposVisiveis.map((grupo) => {
                  const marcados = grupo.aparelhos.filter((a) => selecionados.has(a.id)).length;
                  const IconeGrupo =
                    marcados === 0 ? Square : marcados === grupo.aparelhos.length ? CheckSquare : MinusSquare;
                  const aberto = expandidos.has(grupo.modelo);

                  return (
                    <div key={grupo.modelo} className="rounded-2xl border border-white/10 bg-slate-950/50">
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => alternarGrupo(grupo)}
                          disabled={salvando}
                          className={cn('shrink-0', marcados > 0 ? 'text-violet-300' : 'text-slate-500 hover:text-slate-300')}
                          aria-label={`Marcar todos de ${grupo.modelo}`}
                        >
                          <IconeGrupo className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => alternarExpandido(grupo.modelo)}
                          className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left"
                        >
                          <span className="font-semibold text-sm truncate">{grupo.modelo}</span>
                          <span className="flex items-center gap-2 shrink-0 text-xs text-slate-400">
                            {marcados > 0 ? `${marcados} de ${grupo.aparelhos.length}` : `${grupo.aparelhos.length} no estoque`}
                            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </span>
                        </button>
                      </div>

                      {aberto && (
                        <ul className="border-t border-white/5 divide-y divide-white/5">
                          {grupo.aparelhos.map((aparelho) => {
                            const final = String(aparelho.imei || '').slice(-4);
                            const obs = observacaoAtual(aparelho.observacoes);
                            return (
                              <li key={aparelho.id}>
                                <label className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-white/5">
                                  <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={selecionados.has(aparelho.id)}
                                    disabled={salvando}
                                    onChange={() => alternarAparelho(aparelho.id)}
                                  />
                                  <span className="min-w-0 text-xs">
                                    <span className="text-slate-100 font-medium">
                                      {aparelho.capacidade || 'Sem GB'} · {aparelho.cor || 'Sem cor'}
                                    </span>
                                    {final && <span className="font-mono text-slate-500"> · final {final}</span>}
                                    {obs && <span className="block text-amber-200/80 truncate">{obs}</span>}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* O que muda */}
            <div className="min-h-0 overflow-y-auto p-4 space-y-4">
              <p className="text-sm">
                <strong className="text-violet-200">{aparelhosSelecionados.length}</strong> aparelho(s) marcado(s)
                {modelosSelecionados.length > 1 && (
                  <span className="text-slate-400"> em {modelosSelecionados.length} modelos</span>
                )}
              </p>

              <div className="space-y-1.5">
                <label htmlFor="edicao-massa-cor" className="text-xs font-semibold text-slate-300">
                  Cor
                </label>
                <select
                  id="edicao-massa-cor"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  disabled={salvando || aparelhosSelecionados.length === 0}
                  className="input-glass w-full text-sm"
                >
                  <option value={NAO_ALTERAR}>Não alterar</option>
                  {opcoesCor.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                  <option value={OUTRA_COR}>Outra cor…</option>
                </select>
                {cor === OUTRA_COR && (
                  <input
                    type="text"
                    value={corDigitada}
                    onChange={(e) => setCorDigitada(e.target.value)}
                    placeholder="Ex: 🔘  Natural"
                    className="input-glass w-full text-sm"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edicao-massa-gb" className="text-xs font-semibold text-slate-300">
                  Capacidade
                </label>
                <select
                  id="edicao-massa-gb"
                  value={capacidade}
                  onChange={(e) => setCapacidade(e.target.value)}
                  disabled={salvando || aparelhosSelecionados.length === 0}
                  className="input-glass w-full text-sm"
                >
                  <option value={NAO_ALTERAR}>Não alterar</option>
                  {opcoesCapacidade.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alterarObservacao}
                    disabled={salvando || aparelhosSelecionados.length === 0}
                    onChange={(e) => setAlterarObservacao(e.target.checked)}
                  />
                  Alterar observação
                </label>
                {alterarObservacao && (
                  <>
                    <input
                      type="text"
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      placeholder="Ex: PIXEL NA TELA (vazio apaga)"
                      className="input-glass w-full text-sm"
                    />
                    <p className="text-[11px] text-slate-500">
                      Substitui a observação atual. ID, bateria e IMEI continuam como estão.
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
                {aparelhosSelecionados.length === 0
                  ? 'Marque aparelhos na lista.'
                  : alteracoes.length === 0
                    ? 'Nada vai mudar com as escolhas atuais.'
                    : `${alteracoes.length} aparelho(s) vão mudar.`}
              </div>

              <Button
                type="button"
                onClick={salvar}
                disabled={alteracoes.length === 0 || salvando}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold"
              >
                {salvando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
                  </>
                ) : (
                  `Salvar ${alteracoes.length} alteração(ões)`
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
