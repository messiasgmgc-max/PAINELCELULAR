'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowUpDown,
  ArrowUpRight,
  Battery,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Edit2,
  FileText,
  Hash,
  PackageCheck,
  RotateCcw,
  Search,
  ShoppingBag,
  Smartphone,
  Tag,
  Truck,
  Undo2,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ModalPortal } from '@/components/ModalPortal';
import { cn } from '@/lib/utils';
import {
  agruparSaidasPorDia,
  calcularResumoSaidas,
  filtrarEOrdenarSaidas,
  formatarDataHoraSaida,
  montarResumoTextoSaida,
  type FiltroTipoSaida,
  type ItemSaidaHistorico,
  type OrdenacaoSaida,
  type PeriodoSaida,
} from '@/lib/estoque/historicoSaidas';

interface HistoricoSaidasModalProps {
  isOpen: boolean;
  onClose: () => void;
  saidas: ItemSaidaHistorico[];
  podeVerFinanceiro: boolean;
  modalSecundarioAberto?: boolean;
  onDevolverSaida: (item: ItemSaidaHistorico) => void;
  onEditarSaida: (item: ItemSaidaHistorico) => void;
}

const ITENS_POR_PAGINA = 60;

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function corBateriaClasse(nivel: ItemSaidaHistorico['nivelBateria']): string {
  if (nivel === 'otima') return 'text-emerald-400';
  if (nivel === 'boa') return 'text-amber-400';
  if (nivel === 'atencao') return 'text-rose-400';
  return 'text-slate-400';
}

function corBarraBateriaClasse(nivel: ItemSaidaHistorico['nivelBateria']): string {
  if (nivel === 'otima') return 'bg-emerald-500';
  if (nivel === 'boa') return 'bg-amber-400';
  if (nivel === 'atencao') return 'bg-rose-500';
  return 'bg-slate-600';
}

function metaTipoSaida(tipo: ItemSaidaHistorico['tipoSaida']) {
  if (tipo === 'varejo') {
    return {
      label: 'Varejo',
      labelLongo: 'Venda no Varejo',
      pillClass: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
      Icon: ShoppingBag,
    };
  }
  if (tipo === 'atacado') {
    return {
      label: 'Atacado',
      labelLongo: 'Venda no Atacado',
      pillClass: 'bg-amber-500/12 text-amber-300 border-amber-500/25',
      iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
      Icon: Truck,
    };
  }
  return {
    label: 'Baixa',
    labelLongo: 'Baixa de Estoque',
    pillClass: 'bg-slate-800 text-slate-300 border-slate-700',
    iconBg: 'bg-slate-800 text-slate-400 border-slate-700',
    Icon: Archive,
  };
}

function labelCondicao(condicao: string): string {
  if (condicao === 'novo') return 'Novo / Lacrado';
  if (condicao === 'seminovo') return 'Seminovo';
  if (condicao === 'usado') return 'Usado';
  if (condicao === 'danificado') return 'Danificado';
  return condicao;
}

function formatarDataCurta(iso?: string | null): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toLocaleDateString('pt-BR');
}

const OPCOES_PERIODO: Array<{ id: PeriodoSaida; label: string }> = [
  { id: 'todos', label: 'Todo período' },
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'mes_atual', label: 'Este mês' },
  { id: 'personalizado', label: 'Personalizado' },
];

export function HistoricoSaidasModal({
  isOpen,
  onClose,
  saidas,
  podeVerFinanceiro,
  modalSecundarioAberto = false,
  onDevolverSaida,
  onEditarSaida,
}: HistoricoSaidasModalProps) {
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipoSaida>('todos');
  const [periodo, setPeriodo] = useState<PeriodoSaida>('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [busca, setBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<OrdenacaoSaida>('saida_recente');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limiteExibicao, setLimiteExibicao] = useState(ITENS_POR_PAGINA);
  const [copiadoChave, setCopiadoChave] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Reseta paginação quando filtros mudam
  useEffect(() => {
    setLimiteExibicao(ITENS_POR_PAGINA);
  }, [filtroTipo, periodo, dataInicio, dataFim, busca, ordenacao]);

  // Atalhos de teclado: ESC fecha detalhe ou modal; "/" foca a busca
  useEffect(() => {
    if (!isOpen || modalSecundarioAberto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedId) {
          setSelectedId(null);
        } else {
          onClose();
        }
        return;
      }
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, modalSecundarioAberto, selectedId, onClose]);

  // Itens filtrados por período + busca (sem filtro de tipo) para mostrar contadores reais nas abas
  const baseSemTipo = useMemo(
    () =>
      filtrarEOrdenarSaidas(saidas, {
        tipo: 'todos',
        periodo,
        dataInicio,
        dataFim,
        busca,
        ordenacao,
      }),
    [saidas, periodo, dataInicio, dataFim, busca, ordenacao]
  );

  const contagensAbas = useMemo(() => calcularResumoSaidas(baseSemTipo), [baseSemTipo]);

  const saidasFiltradas = useMemo(() => {
    if (filtroTipo === 'todos') return baseSemTipo;
    return baseSemTipo.filter((item) => item.tipoSaida === filtroTipo);
  }, [baseSemTipo, filtroTipo]);

  const resumoFiltrado = useMemo(() => calcularResumoSaidas(saidasFiltradas), [saidasFiltradas]);

  const saidasVisiveis = useMemo(
    () => saidasFiltradas.slice(0, limiteExibicao),
    [saidasFiltradas, limiteExibicao]
  );

  const agruparPorDia = ordenacao === 'saida_recente' || ordenacao === 'saida_antiga';

  const gruposPorDia = useMemo(
    () => (agruparPorDia ? agruparSaidasPorDia(saidasVisiveis) : []),
    [agruparPorDia, saidasVisiveis]
  );

  const selectedItem = useMemo(
    () => (selectedId ? saidas.find((s) => s.id === selectedId) || null : null),
    [saidas, selectedId]
  );

  const temFiltrosAtivos =
    filtroTipo !== 'todos' ||
    periodo !== 'todos' ||
    Boolean(busca.trim()) ||
    ordenacao !== 'saida_recente';

  const limparFiltros = () => {
    setFiltroTipo('todos');
    setPeriodo('todos');
    setDataInicio('');
    setDataFim('');
    setBusca('');
    setOrdenacao('saida_recente');
  };

  const copiarValor = (chave: string, valor: string, label: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!valor) return;
    navigator.clipboard.writeText(valor);
    setCopiadoChave(chave);
    toast.success(`${label} copiado!`);
    window.setTimeout(() => {
      setCopiadoChave((atual) => (atual === chave ? null : atual));
    }, 1500);
  };

  if (!isOpen) return null;

  const renderLinhaSaida = (item: ItemSaidaHistorico) => {
    const isSelected = selectedItem?.id === item.id;
    const meta = metaTipoSaida(item.tipoSaida);
    const { data, hora } = formatarDataHoraSaida(item);
    const identificadorPrincipal = item.imei || item.numeroSerie || item.codigo;
    const labelIdentificador = item.imei ? 'IMEI' : item.numeroSerie ? 'Série' : 'ID';
    const chaveCopia = `row-${item.id}`;
    const copiado = copiadoChave === chaveCopia;

    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedId((prev) => (prev === item.id ? null : item.id))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelectedId((prev) => (prev === item.id ? null : item.id));
          }
        }}
        className={cn(
          'w-full text-left px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 group outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50',
          isSelected
            ? 'bg-cyan-500/[0.08] border-cyan-500/40 shadow-sm'
            : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900/90 hover:border-slate-700/90'
        )}
      >
        {/* Coluna de horário / data da saída */}
        <div className="w-12 sm:w-14 shrink-0 text-center border-r border-slate-800/80 pr-2.5">
          {agruparPorDia ? (
            <div className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
              {hora || '—'}
            </div>
          ) : (
            <>
              <div className="font-mono text-[11px] font-semibold text-slate-200 tabular-nums leading-tight">
                {data === 'Sem data' ? '—' : data.slice(0, 5)}
              </div>
              {hora && (
                <div className="font-mono text-[10px] text-slate-500 tabular-nums leading-tight mt-0.5">
                  {hora}
                </div>
              )}
            </>
          )}
        </div>

        {/* Informações principais em 2 linhas limpas */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Linha 1: Modelo, capacidade, cor e bateria */}
          <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
            <span className="font-semibold text-sm text-white truncate max-w-[260px] sm:max-w-none">
              {item.tituloModelo}
            </span>

            {item.capacidade && (
              <span className="text-[11px] font-semibold text-slate-300 bg-slate-800/90 px-1.5 py-0.5 rounded-md leading-none">
                {item.capacidade}
              </span>
            )}

            {item.cor && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                {item.corSwatch && (
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-white/25 shrink-0"
                    style={{ backgroundColor: item.corSwatch }}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate max-w-[140px]">{item.cor}</span>
              </span>
            )}

            {item.bateriaTexto && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
                  corBateriaClasse(item.nivelBateria)
                )}
                title={`Saúde da bateria: ${item.bateriaTexto}`}
              >
                <Battery className="w-3.5 h-3.5" />
                {item.bateriaTexto}
              </span>
            )}
          </div>

          {/* Linha 2: IMEI copiável + destino/motivo */}
          <div className="flex items-center gap-x-2.5 gap-y-0.5 flex-wrap text-xs text-slate-400">
            {identificadorPrincipal && (
              <button
                type="button"
                onClick={(e) => copiarValor(chaveCopia, identificadorPrincipal, labelIdentificador, e)}
                title={`Copiar ${labelIdentificador}`}
                className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                <span className="text-slate-500">{labelIdentificador}:</span>
                <span className="tracking-tight">{identificadorPrincipal}</span>
                {copiado ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 opacity-0 group-hover:opacity-75 transition-opacity" />
                )}
              </button>
            )}

            <span className="text-slate-700 hidden sm:inline">•</span>

            <span className="inline-flex items-center gap-1 truncate max-w-[220px] sm:max-w-[280px]">
              {item.comprador ? (
                <>
                  <User className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="text-slate-300 truncate">{item.comprador}</span>
                </>
              ) : (
                <span className="text-slate-500 truncate">{item.motivoLegivel}</span>
              )}
            </span>

            {item.formaPagamento && (
              <span className="hidden md:inline text-[11px] text-slate-500">
                · {item.formaPagamento}
              </span>
            )}
          </div>
        </div>

        {/* Coluna direita: tipo, valor e seta */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right hidden sm:block">
            {podeVerFinanceiro && item.valorSaida !== null && item.valorSaida > 0 && (
              <div className="text-xs font-bold text-white tabular-nums">
                {formatarBRL(item.valorSaida)}
              </div>
            )}
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border mt-0.5',
                meta.pillClass
              )}
            >
              {meta.label}
            </span>
          </div>

          <span
            className={cn(
              'sm:hidden inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border',
              meta.pillClass
            )}
          >
            {meta.label}
          </span>

          <ChevronRight
            className={cn(
              'w-4 h-4 transition-transform shrink-0',
              isSelected ? 'text-cyan-400 translate-x-0.5' : 'text-slate-600 group-hover:text-slate-400'
            )}
          />
        </div>
      </div>
    );
  };

  const renderPainelDetalhes = (item: ItemSaidaHistorico) => {
    const meta = metaTipoSaida(item.tipoSaida);
    const TipoIcon = meta.Icon;
    const { completo: dataHoraCompleta } = formatarDataHoraSaida(item);
    const margem =
      item.valorSaida && item.valorSaida > 0 && item.lucro !== null
        ? Math.round((item.lucro / item.valorSaida) * 100)
        : null;

    return (
      <div className="flex flex-col h-full bg-slate-950/95 lg:bg-slate-900/40">
        {/* Cabeçalho do detalhe */}
        <div className="px-4 py-3.5 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="lg:hidden mt-0.5 p-1.5 -ml-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
              aria-label="Voltar para a lista"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', meta.iconBg)}>
              <TipoIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-sm text-white leading-snug">
                  {item.tituloModelo}
                  {item.capacidade ? ` ${item.capacidade}` : ''}
                </h4>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border',
                    meta.pillClass
                  )}
                >
                  {meta.labelLongo}
                </span>
                {item.condicaoFisica && (
                  <span className="text-[11px] text-slate-400">
                    {labelCondicao(item.condicaoFisica)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Fechar detalhes"
            aria-label="Fechar detalhes"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo rolável dos detalhes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Bloco 1: Quando foi */}
          <section className="rounded-2xl bg-slate-900/70 border border-slate-800/90 p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              Quando saiu
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold text-white tabular-nums">{dataHoraCompleta}</span>
              {item.diasEmEstoque !== null && (
                <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md font-medium shrink-0">
                  <Clock className="w-3 h-3" />
                  {item.diasEmEstoque === 0 ? 'Saiu no mesmo dia' : `${item.diasEmEstoque}d em estoque`}
                </span>
              )}
            </div>

            {item.dataEntrada && (
              <div className="text-xs text-slate-400 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
                <span>Entrada no estoque</span>
                <span className="font-mono text-slate-300">{formatarDataCurta(item.dataEntrada)}</span>
              </div>
            )}
          </section>

          {/* Bloco 2: Especificações do aparelho */}
          <section className="rounded-2xl bg-slate-900/70 border border-slate-800/90 p-3.5 space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              Detalhes do aparelho
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
              <div>
                <div className="text-[11px] text-slate-500">Modelo</div>
                <div className="font-semibold text-slate-100 mt-0.5">{item.modelo || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Marca</div>
                <div className="font-semibold text-slate-100 mt-0.5">{item.marca || '—'}</div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500">Armazenamento</div>
                <div className="font-semibold text-slate-100 mt-0.5">
                  {item.capacidade || item.detalheCategoria || '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Cor</div>
                <div className="font-semibold text-slate-100 mt-0.5 inline-flex items-center gap-1.5">
                  {item.corSwatch && (
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white/25 shrink-0"
                      style={{ backgroundColor: item.corSwatch }}
                    />
                  )}
                  <span>{item.cor || '—'}</span>
                </div>
              </div>

              {/* Saúde da bateria com barra visual */}
              <div className="col-span-2 pt-1 border-t border-slate-800/70">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                    <Battery className="w-3.5 h-3.5" /> Saúde da bateria
                  </span>
                  <span className={cn('text-xs font-bold tabular-nums', corBateriaClasse(item.nivelBateria))}>
                    {item.bateriaTexto || 'Não informada'}
                  </span>
                </div>
                {item.bateriaPct !== null && (
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden mt-1.5">
                    <div
                      className={cn('h-full rounded-full transition-all', corBarraBateriaClasse(item.nivelBateria))}
                      style={{ width: `${Math.min(100, Math.max(4, item.bateriaPct))}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Identificadores copiáveis */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between gap-2 bg-slate-950/70 border border-slate-800/80 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">IMEI</div>
                  <div className="font-mono text-xs text-white truncate mt-0.5">
                    {item.imei || 'Não informado'}
                  </div>
                </div>
                {item.imei && (
                  <button
                    type="button"
                    onClick={() => copiarValor(`det-imei-${item.id}`, item.imei, 'IMEI')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
                    title="Copiar IMEI"
                  >
                    {copiadoChave === `det-imei-${item.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              {item.numeroSerie && (
                <div className="flex items-center justify-between gap-2 bg-slate-950/70 border border-slate-800/80 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Nº de Série</div>
                    <div className="font-mono text-xs text-slate-200 truncate mt-0.5">
                      {item.numeroSerie}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copiarValor(`det-sn-${item.id}`, item.numeroSerie, 'Nº de Série')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
                    title="Copiar Nº de Série"
                  >
                    {copiadoChave === `det-sn-${item.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}

              {item.codigo && (
                <div className="flex items-center justify-between gap-2 bg-slate-950/70 border border-slate-800/80 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Código / Etiqueta</div>
                    <div className="font-mono text-xs text-slate-200 truncate mt-0.5 inline-flex items-center gap-1">
                      <Hash className="w-3 h-3 text-slate-500" />
                      {item.codigo}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copiarValor(`det-cod-${item.id}`, item.codigo, 'Código')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
                    title="Copiar Código"
                  >
                    {copiadoChave === `det-cod-${item.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {item.acessorios && (
              <div className="pt-2 border-t border-slate-800/80 text-xs">
                <div className="text-[11px] text-slate-500">Acessórios inclusos</div>
                <div className="text-slate-200 mt-0.5">{item.acessorios}</div>
              </div>
            )}
          </section>

          {/* Bloco 3: Destino / Saída */}
          <section className="rounded-2xl bg-slate-900/70 border border-slate-800/90 p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <Tag className="w-3.5 h-3.5 text-cyan-400" />
              Registro da saída
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400 inline-flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-500" /> Destino
              </span>
              <span className="font-semibold text-white text-right">
                {item.comprador || 'Não informado'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400">Motivo</span>
              <span className="font-medium text-slate-200 text-right">{item.motivoLegivel}</span>
            </div>

            {item.formaPagamento && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 inline-flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-500" /> Pagamento
                </span>
                <span className="font-medium text-slate-200 text-right">{item.formaPagamento}</span>
              </div>
            )}

            {item.observacaoLimpa && (
              <div className="pt-2 border-t border-slate-800/80 space-y-1">
                <div className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Observação
                </div>
                <p className="text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                  {item.observacaoLimpa}
                </p>
              </div>
            )}
          </section>

          {/* Bloco 4: Financeiro (somente quem tem permissão) */}
          {podeVerFinanceiro && (item.valorSaida !== null || item.custo > 0) && (
            <section className="rounded-2xl bg-slate-900/70 border border-slate-800/90 p-3.5 space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Resumo financeiro
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-2.5">
                  <div className="text-[10px] text-slate-500">Saída</div>
                  <div className="text-xs font-bold text-white tabular-nums mt-0.5">
                    {item.valorSaida !== null && item.valorSaida > 0 ? formatarBRL(item.valorSaida) : '—'}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-2.5">
                  <div className="text-[10px] text-slate-500">Custo</div>
                  <div className="text-xs font-bold text-slate-300 tabular-nums mt-0.5">
                    {item.custo > 0 ? formatarBRL(item.custo) : '—'}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-2.5">
                  <div className="text-[10px] text-slate-500">
                    Lucro{margem !== null ? ` (${margem}%)` : ''}
                  </div>
                  <div
                    className={cn(
                      'text-xs font-bold tabular-nums mt-0.5',
                      item.lucro === null
                        ? 'text-slate-500'
                        : item.lucro >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    )}
                  >
                    {item.lucro !== null ? formatarBRL(item.lucro) : '—'}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Rodapé de ações do item */}
        <div className="p-3.5 border-t border-white/10 bg-slate-950/80 space-y-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copiarValor(`resumo-${item.id}`, montarResumoTextoSaida(item), 'Resumo')}
            className="w-full h-9 text-xs font-semibold rounded-xl border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 cursor-pointer gap-1.5"
          >
            {copiadoChave === `resumo-${item.id}` ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Resumo copiado
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copiar detalhes da saída
              </>
            )}
          </Button>

          {podeVerFinanceiro && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEditarSaida(item)}
                className="h-9 text-xs font-semibold rounded-xl border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 cursor-pointer gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" /> Editar registro
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onDevolverSaida(item)}
                className="h-9 text-xs font-semibold rounded-xl border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 cursor-pointer gap-1.5"
              >
                <Undo2 className="w-3.5 h-3.5" /> Devolver estoque
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[9998] flex items-center justify-center p-2 sm:p-5 bg-black/80 backdrop-blur-md"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-slate-950 border border-slate-800/90 rounded-2xl sm:rounded-3xl max-w-6xl w-full h-[94dvh] sm:h-[88dvh] shadow-2xl text-white flex flex-col overflow-hidden">
          {/* HEADER FIXO */}
          <div className="px-4 sm:px-6 pt-4 pb-3.5 border-b border-white/10 space-y-3 shrink-0 bg-slate-950">
            {/* Linha superior: Título + Fechar */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="h-4 w-4 text-rose-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                      Histórico de Saídas
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-300 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full tabular-nums">
                      {saidasFiltradas.length === saidas.length
                        ? `${saidas.length} ${saidas.length === 1 ? 'registro' : 'registros'}`
                        : `${saidasFiltradas.length} de ${saidas.length}`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    Clique em qualquer saída para ver data, IMEI, bateria, cor e ações
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-slate-400 hover:text-white hover:bg-white/5 rounded-full shrink-0 cursor-pointer"
                aria-label="Fechar histórico de saídas"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Linha de busca + período + ordenação */}
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Buscar por modelo, IMEI, cor, bateria, comprador ou data (ex: 15pm azul 256)..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full h-9 bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-8 text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/60 transition-colors"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    aria-label="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Filtro de período */}
                <div className="relative flex-1 sm:flex-none">
                  <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    aria-label="Filtrar por período"
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value as PeriodoSaida)}
                    className="w-full sm:w-auto h-9 bg-slate-900/90 border border-slate-800 rounded-xl pl-8 pr-7 text-xs text-slate-200 outline-none focus:border-cyan-500/60 cursor-pointer"
                  >
                    {OPCOES_PERIODO.map((op) => (
                      <option key={op.id} value={op.id} className="bg-slate-900 text-slate-100">
                        {op.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ordenação */}
                <div className="relative flex-1 sm:flex-none">
                  <ArrowUpDown className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    aria-label="Ordenar saídas"
                    value={ordenacao}
                    onChange={(e) => setOrdenacao(e.target.value as OrdenacaoSaida)}
                    className="w-full sm:w-auto h-9 bg-slate-900/90 border border-slate-800 rounded-xl pl-8 pr-7 text-xs text-slate-200 outline-none focus:border-cyan-500/60 cursor-pointer"
                  >
                    <option value="saida_recente" className="bg-slate-900 text-slate-100">
                      Ordem de saída (recentes)
                    </option>
                    <option value="saida_antiga" className="bg-slate-900 text-slate-100">
                      Ordem de saída (antigas)
                    </option>
                    <option value="modelo_az" className="bg-slate-900 text-slate-100">
                      Modelo (A–Z)
                    </option>
                    <option value="maior_bateria" className="bg-slate-900 text-slate-100">
                      Maior bateria
                    </option>
                    {podeVerFinanceiro && (
                      <option value="maior_valor" className="bg-slate-900 text-slate-100">
                        Maior valor
                      </option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Datas personalizadas (aparece apenas quando selecionado) */}
            {periodo === 'personalizado' && (
              <div className="flex items-center gap-2 flex-wrap text-xs bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2">
                <span className="text-slate-400 font-medium">De:</span>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-cyan-500/60"
                />
                <span className="text-slate-400 font-medium">Até:</span>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-cyan-500/60"
                />
              </div>
            )}

            {/* Abas de tipo + resumo discreto */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 overflow-x-auto scroll-row pb-0.5">
                {(
                  [
                    { id: 'todos', label: 'Todas', count: contagensAbas.total, active: 'bg-white text-slate-950', idle: 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800' },
                    { id: 'varejo', label: 'Varejo', count: contagensAbas.varejo, active: 'bg-emerald-500 text-slate-950', idle: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/15' },
                    { id: 'atacado', label: 'Atacado', count: contagensAbas.atacado, active: 'bg-amber-400 text-slate-950', idle: 'bg-amber-500/10 text-amber-300 border-amber-500/25 hover:bg-amber-500/15' },
                    { id: 'outro', label: 'Baixas', count: contagensAbas.outro, active: 'bg-slate-300 text-slate-950', idle: 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200' },
                  ] as const
                ).map((tab) => {
                  const ativo = filtroTipo === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFiltroTipo(tab.id)}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer border inline-flex items-center gap-1.5',
                        ativo ? cn(tab.active, 'border-transparent shadow-sm') : tab.idle
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={cn(
                          'text-[10px] tabular-nums px-1.5 py-0.2 rounded-full',
                          ativo ? 'bg-black/15' : 'bg-white/5'
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 text-xs">
                {podeVerFinanceiro && resumoFiltrado.valorTotalVendas > 0 && (
                  <span className="text-slate-400 hidden sm:inline">
                    Vendas no filtro:{' '}
                    <strong className="text-slate-100 tabular-nums">
                      {formatarBRL(resumoFiltrado.valorTotalVendas)}
                    </strong>
                  </span>
                )}
                {temFiltrosAtivos && (
                  <button
                    type="button"
                    onClick={limparFiltros}
                    className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* CORPO MASTER-DETAIL */}
          <div className="flex-1 min-h-0 flex relative overflow-hidden">
            {/* LISTA PRINCIPAL */}
            <div
              className={cn(
                'flex-1 min-w-0 overflow-y-auto px-3 sm:px-5 py-3.5 space-y-4',
                selectedItem ? 'hidden lg:block' : 'block'
              )}
            >
              {saidasFiltradas.length === 0 ? (
                <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20">
                  <PackageCheck className="w-10 h-10 text-slate-600 mb-3" />
                  <p className="font-semibold text-sm text-slate-200">Nenhuma saída encontrada</p>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Tente buscar pelo modelo, últimos dígitos do IMEI, cor, bateria ou amplie o período selecionado.
                  </p>
                  {temFiltrosAtivos && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={limparFiltros}
                      className="mt-4 h-8 text-xs rounded-lg border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Limpar filtros
                    </Button>
                  )}
                </div>
              ) : agruparPorDia ? (
                <>
                  {gruposPorDia.map((grupo) => (
                    <div key={grupo.chave} className="space-y-1.5">
                      {/* Divisor cronológico limpo */}
                      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/70">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="text-xs font-bold text-slate-200 tracking-tight">
                            {grupo.rotulo}
                          </span>
                          {grupo.subtitulo && (
                            <span className="text-[11px] text-slate-500">{grupo.subtitulo}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 text-[11px] text-slate-400 shrink-0 tabular-nums">
                          <span>
                            {grupo.itens.length}{' '}
                            {grupo.itens.length === 1 ? 'saída' : 'saídas'}
                          </span>
                          {podeVerFinanceiro && grupo.valorTotalVendas > 0 && (
                            <span className="text-slate-300 font-semibold hidden sm:inline">
                              · {formatarBRL(grupo.valorTotalVendas)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-0.5">
                        {grupo.itens.map((item) => renderLinhaSaida(item))}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="space-y-1.5">
                  {saidasVisiveis.map((item) => renderLinhaSaida(item))}
                </div>
              )}

              {/* Paginação progressiva */}
              {saidasFiltradas.length > limiteExibicao && (
                <div className="flex items-center justify-center gap-2 pt-2 pb-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLimiteExibicao((n) => n + ITENS_POR_PAGINA)}
                    className="h-8 text-xs rounded-xl border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200 cursor-pointer"
                  >
                    Carregar mais {Math.min(ITENS_POR_PAGINA, saidasFiltradas.length - limiteExibicao)} (restam{' '}
                    {saidasFiltradas.length - limiteExibicao})
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLimiteExibicao(saidasFiltradas.length)}
                    className="h-8 text-xs rounded-xl text-slate-400 hover:text-white cursor-pointer"
                  >
                    Ver todos
                  </Button>
                </div>
              )}
            </div>

            {/* PAINEL DE DETALHES (Lateral no Desktop / Tela cheia no Mobile) */}
            {selectedItem && (
              <aside className="w-full lg:w-[390px] xl:w-[420px] shrink-0 lg:border-l border-white/10 h-full overflow-hidden">
                {renderPainelDetalhes(selectedItem)}
              </aside>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
