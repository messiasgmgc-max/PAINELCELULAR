"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Venda, Cliente, Aparelho } from "@/lib/db/types";
import { Search, X, Smartphone, User, Calendar, Shield, Check, Phone, CreditCard, DollarSign, AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface EnrichedVendaData {
  venda: Venda;
  cliente?: Cliente;
  clienteNome: string;
  clienteTelefone: string;
  clienteCpf: string;
  aparelhoFormatado: string;
  imei?: string;
  modelo?: string;
  dataVendaFormatada: string;
  diasGarantia: number;
  diasRestantes: number;
  jaTemGarantia: boolean;
  valorFormatado: string;
}

interface VendaSearchComboboxProps {
  vendas: Venda[];
  clientes?: Cliente[];
  aparelhos?: Aparelho[];
  vendasComGarantia?: Set<string>;
  selectedVendaId?: string;
  onSelectVenda: (venda: Venda, dadosEnriquecidos: EnrichedVendaData) => void;
  onClearSelection: () => void;
  loading?: boolean;
}

const parseDiasGarantia = (garantiaTexto?: string) => {
  if (!garantiaTexto) return 90;
  const match = garantiaTexto.match(/(\d+)/);
  const dias = match ? parseInt(match[1], 10) : 90;
  return Number.isFinite(dias) && dias > 0 ? dias : 90;
};

export function VendaSearchCombobox({
  vendas,
  clientes = [],
  aparelhos = [],
  vendasComGarantia = new Set(),
  selectedVendaId,
  onSelectVenda,
  onClearSelection,
  loading = false,
}: VendaSearchComboboxProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Enriquecer todas as vendas com dados de clientes, aparelhos e IMEIs
  const vendasEnriquecidas = useMemo(() => {
    return vendas.map((venda): EnrichedVendaData => {
      // 1. Vincula dados do cliente
      const clienteNomeNormalizado = (venda.clienteNome || "").trim().toLowerCase();
      const cliente = clientes.find((c) => {
        if (venda.clienteId && c.id === venda.clienteId) return true;
        if (c.nome && c.nome.trim().toLowerCase() === clienteNomeNormalizado) return true;
        return false;
      });

      const clienteTelefone = cliente?.telefone || "";
      const clienteCpf = cliente?.cpf || "";

      // 2. Extrai dados do aparelho e IMEI
      let imeiExtraido: string | undefined = undefined;
      let modeloExtraido: string | undefined = undefined;

      // Busca nos itens da venda
      if (venda.itens && venda.itens.length > 0) {
        for (const item of venda.itens) {
          if (item.aparelhoId) {
            const ap = aparelhos.find((a) => a.id === item.aparelhoId);
            if (ap) {
              imeiExtraido = ap.imei || ap.numeroSerie;
              modeloExtraido = `${ap.marca} ${ap.modelo} ${ap.capacidade || ""} ${ap.cor || ""}`.trim();
              break;
            }
          }

          const textoDesc = `${item.descricao || ""} ${item.observacao || ""}`;
          const matchImeiExplicit = textoDesc.match(/IMEI(?:\/ID)?:\s*([A-Za-z0-9]+)/i);
          if (matchImeiExplicit?.[1]) {
            imeiExtraido = matchImeiExplicit[1];
            modeloExtraido = item.descricao;
            break;
          }

          const matchImeiDigits = textoDesc.match(/\b(\d{14,15})\b/);
          if (matchImeiDigits?.[1]) {
            imeiExtraido = matchImeiDigits[1];
            modeloExtraido = item.descricao;
            break;
          }
        }
      }

      // Se ainda não achou, busca na descrição geral da venda
      if (!imeiExtraido && (venda.descricao || (venda as any).aparelhoDescricao)) {
        const textoGeral = `${venda.descricao || ""} ${(venda as any).aparelhoDescricao || ""}`;
        const matchImeiExplicit = textoGeral.match(/IMEI(?:\/ID)?:\s*([A-Za-z0-9]+)/i);
        if (matchImeiExplicit?.[1]) {
          imeiExtraido = matchImeiExplicit[1];
        } else {
          const matchImeiDigits = textoGeral.match(/\b(\d{14,15})\b/);
          if (matchImeiDigits?.[1]) {
            imeiExtraido = matchImeiDigits[1];
          }
        }
      }

      // Descrição formatada do aparelho
      let aparelhoFormatado = modeloExtraido;
      if (!aparelhoFormatado) {
        if (venda.itens && venda.itens.length > 0) {
          aparelhoFormatado = venda.itens.map((i) => i.descricao).join(", ");
        } else {
          aparelhoFormatado = (venda as any).aparelhoDescricao || venda.descricao || "Aparelho da Venda";
        }
      }

      if (imeiExtraido && !aparelhoFormatado.includes(imeiExtraido)) {
        aparelhoFormatado = `${aparelhoFormatado} (IMEI: ${imeiExtraido})`;
      }

      // 3. Prazos e datas
      const diasGarantia = parseDiasGarantia(venda.garantia);
      const dataVendaObj = new Date(venda.dataPagamento || Date.now());
      const dataVendaFormatada = !isNaN(dataVendaObj.getTime())
        ? dataVendaObj.toLocaleDateString("pt-BR")
        : "";

      const agora = new Date();
      agora.setHours(0, 0, 0, 0);
      const dataFim = new Date(dataVendaObj);
      dataFim.setHours(0, 0, 0, 0);
      dataFim.setDate(dataFim.getDate() + diasGarantia);
      const diffMs = dataFim.getTime() - agora.getTime();
      const diasRestantes = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      const jaTemGarantia = vendasComGarantia.has(venda.id);
      const valorFormatado = Number(venda.valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      return {
        venda,
        cliente,
        clienteNome: venda.clienteNome || "Cliente Não Informado",
        clienteTelefone,
        clienteCpf,
        aparelhoFormatado,
        imei: imeiExtraido,
        modelo: modeloExtraido || aparelhoFormatado,
        dataVendaFormatada,
        diasGarantia,
        diasRestantes,
        jaTemGarantia,
        valorFormatado,
      };
    });
  }, [vendas, clientes, aparelhos, vendasComGarantia]);

  // Venda atualmente selecionada
  const vendaSelecionadaEnriquecida = useMemo(() => {
    if (!selectedVendaId) return null;
    return vendasEnriquecidas.find((v) => v.venda.id === selectedVendaId) || null;
  }, [selectedVendaId, vendasEnriquecidas]);

  // Filtro inteligente multi-campo (IMEI, Nome, CPF, Telefone, Modelo, Data, etc.)
  const vendasFiltradas = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    const termoDigitos = searchTerm.replace(/\D/g, "");

    if (!termo) {
      return vendasEnriquecidas;
    }

    return vendasEnriquecidas.filter((item) => {
      // 1. Busca por IMEI (muito importante)
      if (item.imei) {
        const imeiLimpo = item.imei.toLowerCase();
        if (imeiLimpo.includes(termo)) return true;
        if (termoDigitos && item.imei.replace(/\D/g, "").includes(termoDigitos)) return true;
      }

      // 2. Busca por Nome do Cliente
      if (item.clienteNome.toLowerCase().includes(termo)) return true;

      // 3. Busca por Telefone / Celular
      if (item.clienteTelefone) {
        if (item.clienteTelefone.toLowerCase().includes(termo)) return true;
        if (termoDigitos && item.clienteTelefone.replace(/\D/g, "").includes(termoDigitos)) return true;
      }

      // 4. Busca por CPF
      if (item.clienteCpf) {
        if (item.clienteCpf.toLowerCase().includes(termo)) return true;
        if (termoDigitos && item.clienteCpf.replace(/\D/g, "").includes(termoDigitos)) return true;
      }

      // 5. Busca por Modelo / Descrição do Aparelho
      if (item.aparelhoFormatado.toLowerCase().includes(termo)) return true;
      if (item.modelo && item.modelo.toLowerCase().includes(termo)) return true;

      // 6. Busca por Data da Venda (ex: 05/09 ou 05/09/2026)
      if (item.dataVendaFormatada.includes(termo)) return true;

      // 7. Busca pelo ID da venda
      if (item.venda.id.toLowerCase().includes(termo)) return true;

      return false;
    });
  }, [searchTerm, vendasEnriquecidas]);

  const handleSelectItem = (item: EnrichedVendaData) => {
    onSelectVenda(item.venda, item);
    setIsDropdownOpen(false);
    setSearchTerm("");
  };

  const handleClear = () => {
    onClearSelection();
    setSearchTerm("");
    setIsDropdownOpen(true);
  };

  return (
    <div ref={containerRef} className="relative w-full space-y-2">
      {/* Se já estiver selecionada, exibe o Card da Venda com visual rico */}
      {vendaSelecionadaEnriquecida ? (
        <div className="bg-slate-950/90 border-2 border-cyan-500/50 rounded-2xl p-3.5 space-y-2 shadow-lg shadow-cyan-950/20">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-cyan-400" />
                  Venda Selecionada
                </span>
                <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300">
                  📅 {vendaSelecionadaEnriquecida.dataVendaFormatada}
                </Badge>
                <Badge variant="outline" className="text-[10px] border-cyan-500/40 text-cyan-300">
                  🛡️ {vendaSelecionadaEnriquecida.diasGarantia} dias
                </Badge>
                <span className="text-xs font-bold text-emerald-400 ml-auto">
                  {vendaSelecionadaEnriquecida.valorFormatado}
                </span>
              </div>

              <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {vendaSelecionadaEnriquecida.clienteNome}
                {vendaSelecionadaEnriquecida.clienteTelefone && (
                  <span className="text-xs text-slate-400 font-normal">
                    • {vendaSelecionadaEnriquecida.clienteTelefone}
                  </span>
                )}
              </p>

              <p className="text-xs text-slate-300 truncate flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                {vendaSelecionadaEnriquecida.aparelhoFormatado}
              </p>

              {vendaSelecionadaEnriquecida.imei && (
                <p className="text-xs font-mono text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-lg inline-block">
                  IMEI: {vendaSelecionadaEnriquecida.imei}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer shrink-0 border border-slate-700 flex items-center gap-1"
              title="Trocar venda selecionada"
            >
              <RefreshCw className="w-3 h-3 text-cyan-400" />
              Trocar Venda
            </button>
          </div>
        </div>
      ) : (
        /* Barra de Pesquisa Completa */
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-cyan-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar venda por IMEI, nome, CPF, telefone, modelo ou data..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Dica visual */}
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
            💡 Digite os <span className="text-slate-400 font-medium">dígitos do IMEI</span>, <span className="text-slate-400 font-medium">nome do cliente</span> ou <span className="text-slate-400 font-medium">modelo do aparelho</span> para encontrar a venda.
          </p>

          {/* Dropdown com resultados da busca */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-h-80 overflow-y-auto overflow-x-hidden backdrop-blur-xl divide-y divide-slate-800/80 animate-in fade-in zoom-in-95 duration-150">
              <div className="p-2.5 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-400 sticky top-0 z-10 border-b border-slate-800">
                <span className="font-semibold text-slate-300">
                  {vendasFiltradas.length} {vendasFiltradas.length === 1 ? "venda disponível" : "vendas disponíveis"}
                </span>
                {searchTerm && (
                  <span className="text-cyan-400">Filtrando por: "{searchTerm}"</span>
                )}
              </div>

              {loading ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Carregando vendas do sistema...
                </div>
              ) : vendasFiltradas.length === 0 ? (
                <div className="p-6 text-center space-y-1.5">
                  <AlertCircle className="w-6 h-6 text-amber-400 mx-auto opacity-80" />
                  <p className="text-xs font-semibold text-white">Nenhuma venda encontrada</p>
                  <p className="text-[11px] text-slate-400">
                    Verifique se o IMEI, nome ou data estão digitados corretamente.
                  </p>
                </div>
              ) : (
                vendasFiltradas.map((item) => (
                  <button
                    key={item.venda.id}
                    type="button"
                    onClick={() => handleSelectItem(item)}
                    className="w-full text-left p-3 hover:bg-cyan-950/30 hover:border-l-4 hover:border-cyan-400 transition-all cursor-pointer group space-y-1.5"
                  >
                    {/* Linha 1: Cliente + Data + Valor */}
                    <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-white group-hover:text-cyan-300 truncate">
                          {item.clienteNome}
                        </span>
                        {item.jaTemGarantia && (
                          <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-300 bg-amber-950/40">
                            Já com garantia
                          </Badge>
                        )}
                        {item.diasRestantes < 0 && (
                          <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-400">
                            +90 dias
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        <span className="text-[11px] text-slate-400 font-medium">
                          📅 {item.dataVendaFormatada}
                        </span>
                        <span className="font-extrabold text-emerald-400 text-xs">
                          {item.valorFormatado}
                        </span>
                      </div>
                    </div>

                    {/* Linha 2: Aparelho + Modelo */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-300">
                      <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate font-semibold">{item.aparelhoFormatado}</span>
                    </div>

                    {/* Linha 3: Identificadores (IMEI, Telefone, CPF) */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      {item.imei ? (
                        <span className="font-mono text-amber-300 bg-amber-950/50 border border-amber-500/30 px-2 py-0.5 rounded-md font-bold">
                          IMEI: {item.imei}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">Sem IMEI direto</span>
                      )}

                      {item.clienteTelefone && (
                        <span className="text-slate-400 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-500" />
                          {item.clienteTelefone}
                        </span>
                      )}

                      {item.clienteCpf && (
                        <span className="text-slate-400 flex items-center gap-1 font-mono">
                          <CreditCard className="w-3 h-3 text-slate-500" />
                          CPF: {item.clienteCpf}
                        </span>
                      )}

                      <span className="text-slate-500 ml-auto text-[10px]">
                        Garantia base: {item.diasGarantia} dias
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
