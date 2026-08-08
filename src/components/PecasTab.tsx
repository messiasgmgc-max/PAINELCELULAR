"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { ModalPortal } from "@/components/ModalPortal";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Download, Edit2, Search, Package, AlertCircle, Upload } from "lucide-react";
import { usePecas } from "@/hooks/usePecas";
import { useAuth } from "@/hooks/useAuth";
import { Peca } from "@/lib/db/types";
import { supabase } from "@/lib/supabaseClient";
import {
  exportDataset,
  findByAliases,
  parseCurrencyLike,
  parseImportFile,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/importExport";

export function PecasTab() {
  const { usuario } = useAuth();
  const {
    pecas,
    loading,
    error,
    fetchPecas,
    criarPeca,
    deletarPeca,
    atualizarPeca,
  } = usePecas();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState({
    codigoUnico: "",
    nome: "",
    descricao: "",
    fornecedor: "",
    custoPeca: "",
    vendaPeca: "",
    margem: "",
    estoque: "0",
    estoqueMinimo: "5",
    estoqueMaximo: "100",
    localizacao: "",
    codigoBarras: "",
    compatibilidade: "",
  });

  // Carregar peças ao montar
  useEffect(() => {
    fetchPecas();
  }, [fetchPecas]);

  // Filtrar peças por busca
  const pecasFiltradas = pecas.filter((peca) =>
    peca.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    peca.codigoUnico.toLowerCase().includes(searchTerm.toLowerCase()) ||
    peca.fornecedor?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Formatador de preço
  const formatarPreco = (valor: string) => {
    let limpo = valor.replace(/\D/g, "");
    if (limpo === "") return "";
    let numero = parseInt(limpo) / 100;
    return numero.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Handler para preço
  const handlePrecoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name } = e.target;
    const valor = e.target.value.replace(/\D/g, "");
    setFormData((prev) => ({
      ...prev,
      [name]: valor,
    }));
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEdit = (peca: Peca) => {
    setEditingId(peca.id);
    setFormData({
      codigoUnico: peca.codigoUnico,
      nome: peca.nome,
      descricao: peca.descricao || "",
      fornecedor: peca.fornecedor || "",
      custoPeca: String(peca.custoPeca * 100),
      vendaPeca: String(peca.vendaPeca * 100),
      margem: String(peca.margem || 0),
      estoque: String(peca.estoque),
      estoqueMinimo: String(peca.estoqueMinimo),
      estoqueMaximo: String(peca.estoqueMaximo),
      localizacao: peca.localizacao || "",
      codigoBarras: peca.codigoBarras || "",
      compatibilidade: peca.compatibilidade || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.codigoUnico || !formData.nome) {
      alert("Preencha código e nome!");
      return;
    }

    const custoPecaNumerico = formData.custoPeca ? parseInt(formData.custoPeca) / 100 : 0;
    const vendaPecaNumerico = formData.vendaPeca ? parseInt(formData.vendaPeca) / 100 : 0;

    if (editingId) {
      await atualizarPeca(editingId, {
        ...formData,
        custoPeca: custoPecaNumerico,
        vendaPeca: vendaPecaNumerico,
        estoque: parseInt(formData.estoque) || 0,
        estoqueMinimo: parseInt(formData.estoqueMinimo) || 5,
        estoqueMaximo: parseInt(formData.estoqueMaximo) || 100,
        margem: ((vendaPecaNumerico - custoPecaNumerico) / custoPecaNumerico) * 100,
        ativo: true,
      });
    } else {
      await criarPeca({
        ...formData,
        custoPeca: custoPecaNumerico,
        vendaPeca: vendaPecaNumerico,
        estoque: parseInt(formData.estoque) || 0,
        estoqueMinimo: parseInt(formData.estoqueMinimo) || 5,
        estoqueMaximo: parseInt(formData.estoqueMaximo) || 100,
        margem: ((vendaPecaNumerico - custoPecaNumerico) / custoPecaNumerico) * 100,
        ativo: true,
      });
    }

    handleCancel();
    await fetchPecas();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja deletar esta peça?")) {
      await deletarPeca(id);
      await fetchPecas();
    }
  };

  const PECA_COLUMNS: ExportColumn[] = [
    { key: "codigoUnico", label: "Codigo" },
    { key: "nome", label: "Nome" },
    { key: "descricao", label: "Descricao" },
    { key: "fornecedor", label: "Fornecedor" },
    { key: "custoPeca", label: "Custo" },
    { key: "vendaPeca", label: "Venda" },
    { key: "margem", label: "Margem %" },
    { key: "estoque", label: "Estoque" },
    { key: "estoqueMinimo", label: "Min" },
    { key: "estoqueMaximo", label: "Max" },
    { key: "localizacao", label: "Localizacao" },
    { key: "compatibilidade", label: "Compatibilidade" },
    { key: "dataCadastro", label: "Data Cadastro" },
  ];

  const handleExport = async () => {
    if (pecas.length === 0) {
      alert("Nenhuma peça para exportar!");
      return;
    }

    const formatoEscolhido = window
      .prompt("Formato para exportar estoque: csv ou xls", "csv")
      ?.toLowerCase()
      .trim() as ExportFormat | undefined;

    if (!formatoEscolhido || !["csv", "xls"].includes(formatoEscolhido)) {
      alert("Formato invalido. Use csv ou xls.");
      return;
    }

    await exportDataset({
      fileNameBase: `estoque_pecas_${new Date().toISOString().slice(0, 10)}`,
      title: "Exportacao de Estoque - Pecas",
      format: formatoEscolhido,
      columns: PECA_COLUMNS,
      rows: pecas.map((peca) => ({
        codigoUnico: peca.codigoUnico,
        nome: peca.nome,
        descricao: peca.descricao || "",
        fornecedor: peca.fornecedor || "",
        custoPeca: peca.custoPeca.toFixed(2),
        vendaPeca: peca.vendaPeca.toFixed(2),
        margem: (peca.margem || 0).toFixed(2),
        estoque: peca.estoque,
        estoqueMinimo: peca.estoqueMinimo,
        estoqueMaximo: peca.estoqueMaximo,
        localizacao: peca.localizacao || "",
        compatibilidade: peca.compatibilidade || "",
        dataCadastro: new Date(peca.dataCadastro).toLocaleDateString("pt-BR"),
      })),
    });
  };

  const handleOpenImport = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!usuario?.lojaId) {
      alert("Sessao sem loja ativa para importar estoque.");
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedRows = await parseImportFile(file);

      if (importedRows.length === 0) {
        alert("Arquivo sem dados validos para importacao.");
        return;
      }

      const { data: existentes, error: existentesError } = await supabase
        .from("pecas")
        .select("codigoUnico")
        .eq("loja_id", usuario.lojaId);

      if (existentesError) throw existentesError;

      const codigosExistentes = new Set(
        (existentes || []).map((item: any) => String(item.codigoUnico || "").trim().toLowerCase())
      );

      const codigosNoLote = new Set<string>();
      const nowIso = new Date().toISOString();
      const payload = importedRows
        .map((row) => {
          const codigoUnico = findByAliases(row, ["codigo", "codigounico", "sku", "id", "_col2"]);
          const nome = findByAliases(row, ["nome", "produto", "modelo", "_col8", "_col3"]);
          const descricao = findByAliases(row, ["descricao", "descricao", "_col3"]);
          const fornecedor = findByAliases(row, ["fornecedor", "marca", "categoria", "_col1"]);

          const custoPeca = parseCurrencyLike(
            findByAliases(row, ["custo", "custopeca", "valorcusto", "_col5"])
          );

          const vendaPeca = parseCurrencyLike(
            findByAliases(row, ["venda", "vendapeca", "preco", "valor", "_col6"])
          );

          const estoque = Number(findByAliases(row, ["estoque", "quantidade", "qtd", "_col10"]) || 0);
          const estoqueMinimo = Number(findByAliases(row, ["estoqueminimo", "min", "estoque_minimo"]) || 5);
          const estoqueMaximo = Number(findByAliases(row, ["estoquemaximo", "max", "estoque_maximo"]) || 100);

          const margem = custoPeca > 0 ? ((vendaPeca - custoPeca) / custoPeca) * 100 : 0;

          const codigoNormalizado = String(codigoUnico || "").trim().toLowerCase();
          if (!codigoNormalizado || codigosExistentes.has(codigoNormalizado) || codigosNoLote.has(codigoNormalizado)) {
            return null;
          }

          codigosNoLote.add(codigoNormalizado);

          return {
            codigoUnico,
            nome,
            descricao,
            fornecedor,
            custoPeca,
            vendaPeca,
            margem,
            estoque: Number.isFinite(estoque) ? estoque : 0,
            estoqueMinimo: Number.isFinite(estoqueMinimo) ? estoqueMinimo : 5,
            estoqueMaximo: Number.isFinite(estoqueMaximo) ? estoqueMaximo : 100,
            localizacao: findByAliases(row, ["localizacao", "local", "enderecoestoque"]),
            codigoBarras: findByAliases(row, ["codigobarras", "ean", "barra"]),
            compatibilidade: findByAliases(row, ["compatibilidade", "aplicacao", "_col8"]),
            dataCadastro: nowIso,
            ativo: true,
            loja_id: usuario.lojaId,
          };
        })
        .filter((peca): peca is NonNullable<typeof peca> => Boolean(peca && peca.nome));

      if (payload.length === 0) {
        alert("Nenhuma linha nova para importar. Tudo ja estava cadastrado ou sem codigo/nome.");
        return;
      }

      const { error: insertError } = await supabase.from("pecas").insert(payload);
      if (insertError) throw insertError;

      await fetchPecas();
      alert(`Importacao concluida: ${payload.length} pecas inseridas.`);
    } catch (importError: any) {
      console.error("Erro ao importar pecas:", importError);
      alert(`Erro ao importar pecas: ${importError?.message || "Falha desconhecida"}`);
    } finally {
      event.target.value = "";
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      codigoUnico: "",
      nome: "",
      descricao: "",
      fornecedor: "",
      custoPeca: "",
      vendaPeca: "",
      margem: "",
      estoque: "0",
      estoqueMinimo: "5",
      estoqueMaximo: "100",
      localizacao: "",
      codigoBarras: "",
      compatibilidade: "",
    });
  };

  return (
    <div className="panel-shell space-y-4 pt-2 pb-8 transition-all duration-300">
        {/* Cabeçalho Separado */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mb-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white drop-shadow-sm">Peças</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
              Gerencie seu estoque de componentes ({pecas.length} total)
            </p>
          </div>
          <div className="scroll-row w-full pb-1">
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleImportFile}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={pecas.length === 0}
              className="h-9 text-xs sm:text-sm shrink-0 whitespace-nowrap"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
            <Button
              variant="outline"
              onClick={handleOpenImport}
              className="h-9 text-xs sm:text-sm shrink-0 whitespace-nowrap"
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar
            </Button>
            <Button onClick={() => setShowForm(!showForm)} className="h-9 text-xs sm:text-sm shrink-0 whitespace-nowrap">
              <Plus className="mr-2 h-4 w-4" />
              Novo
            </Button>
          </div>
        </div>

        <GlassCard className="rounded-[2.5rem]">
        <div className="space-y-4">
          {/* Barra de Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome, código ou fornecedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-glass pl-10"
            />
          </div>

          {/* Formulário */}
          {showForm && (
            <ModalPortal>
              <div className="modal-overlay modal-overlay-fit">
                <GlassCard className="modal-panel modal-panel-fit modal-panel-xl w-full my-4">
                  <div className="modal-header">
                    <h3 className="modal-title">
                      {editingId ? "Editar Peça" : "Nova Peça"}
                    </h3>
                    <Button variant="ghost" size="icon" onClick={handleCancel}>
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  <div className="modal-body-scroll">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Linha 1: Código e Nome */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                          type="text"
                          name="codigoUnico"
                          placeholder="Código Único *"
                          value={formData.codigoUnico}
                          onChange={handleInputChange}
                          required
                          className="input-glass"
                        />
                        <input
                          type="text"
                          name="nome"
                          placeholder="Nome *"
                          value={formData.nome}
                          onChange={handleInputChange}
                          required
                          className="input-glass"
                        />
                      </div>

                      {/* Linha 2: Custo e Venda */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-muted-foreground">Custo *</label>
                          <input
                            type="text"
                            name="custoPeca"
                            placeholder="R$ 0,00"
                            value={formatarPreco(formData.custoPeca)}
                            onChange={handlePrecoChange}
                            className="input-glass"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Venda *</label>
                          <input
                            type="text"
                            name="vendaPeca"
                            placeholder="R$ 0,00"
                            value={formatarPreco(formData.vendaPeca)}
                            onChange={handlePrecoChange}
                            className="input-glass"
                          />
                        </div>
                      </div>

                      {/* Linha 3: Estoque */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs text-muted-foreground">Estoque Atual</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            name="estoque"
                            value={formData.estoque}
                            onChange={handleInputChange}
                            min="0"
                            className="input-glass"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Estoque Mín</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            name="estoqueMinimo"
                            value={formData.estoqueMinimo}
                            onChange={handleInputChange}
                            min="0"
                            className="input-glass"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Estoque Máx</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            name="estoqueMaximo"
                            value={formData.estoqueMaximo}
                            onChange={handleInputChange}
                            min="0"
                            className="input-glass"
                          />
                        </div>
                      </div>

                      {/* Descrição */}
                      <textarea
                        name="descricao"
                        placeholder="Descrição (opcional)"
                        value={formData.descricao}
                        onChange={handleInputChange}
                        rows={2}
                        className="input-glass"
                      />

                      {/* Fornecedor e Localização */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                          type="text"
                          name="fornecedor"
                          placeholder="Fornecedor (opcional)"
                          value={formData.fornecedor}
                          onChange={handleInputChange}
                          className="input-glass"
                        />
                        <input
                          type="text"
                          name="localizacao"
                          placeholder="Localização Física (opcional)"
                          value={formData.localizacao}
                          onChange={handleInputChange}
                          className="input-glass"
                        />
                      </div>

                      {/* Código de Barras e Compatibilidade */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                          type="text"
                          name="codigoBarras"
                          placeholder="Código de Barras (opcional)"
                          value={formData.codigoBarras}
                          onChange={handleInputChange}
                          className="input-glass"
                        />
                        <input
                          type="text"
                          name="compatibilidade"
                          placeholder="Compatibilidade (ex: iPhone 13) (opcional)"
                          value={formData.compatibilidade}
                          onChange={handleInputChange}
                          className="input-glass"
                        />
                      </div>

                      {error && (
                        <p className="text-sm text-red-500 font-semibold">Erro: {error}</p>
                      )}

                      <div className="flex gap-2 justify-end pt-4 border-t border-white/10">
                        <Button type="button" variant="outline" onClick={handleCancel}>
                          Cancelar
                        </Button>
                        <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 font-bold px-6">
                          {loading ? "Processando..." : editingId ? "Atualizar Peça" : "Salvar Peça"}
                        </Button>
                      </div>
                    </form>
                  </div>
                </GlassCard>
              </div>
            </ModalPortal>
          )}

          {/* Lista de Peças */}
          <div className="space-y-3">
            {pecasFiltradas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {pecas.length === 0
                  ? 'Nenhuma peça cadastrada. Clique em "Nova Peça" para começar.'
                  : "Nenhuma peça encontrada com os critérios de busca."}
              </p>
            ) : (
              pecasFiltradas.map((peca) => {
                const estoqueAlerta = peca.estoque <= peca.estoqueMinimo;
                return (
                  <div
                    key={peca.id}
                    className={`flex items-start justify-between gap-4 border-b pb-4 last:border-0 p-2 rounded transition-colors ${
                      estoqueAlerta ? "bg-red-50 dark:bg-red-950/20" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {estoqueAlerta && <AlertCircle className="inline h-4 w-4 mr-1 text-red-500" />}
                        {peca.nome}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>📦 {peca.codigoUnico}</span>
                        {peca.fornecedor && <span>🏭 {peca.fornecedor}</span>}
                        {peca.compatibilidade && <span>📱 {peca.compatibilidade}</span>}
                      </div>
                      {peca.descricao && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {peca.descricao}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="space-y-1 text-right">
                        <p className="text-xs">
                          <span className="font-semibold">Custo:</span> R$ {peca.custoPeca.toFixed(2)}
                        </p>
                        <p className="text-xs">
                          <span className="font-semibold">Venda:</span> R$ {peca.vendaPeca.toFixed(2)}
                        </p>
                        <Badge variant={peca.margem! > 30 ? "default" : "secondary"}>
                          {peca.margem?.toFixed(1)}% lucro
                        </Badge>
                      </div>

                      <Badge
                        variant={estoqueAlerta ? "destructive" : "outline"}
                        className="whitespace-nowrap"
                      >
                        📦 {peca.estoque} (Min: {peca.estoqueMinimo})
                      </Badge>

                      <div className="flex gap-2 text-xs">
                        <button
                          onClick={() => handleEdit(peca)}
                          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                        >
                          <Edit2 className="h-3 w-3" />
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(peca.id)}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                        >
                          Deletar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {loading && !showForm && (
            <p className="text-sm text-muted-foreground text-center">Carregando...</p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
