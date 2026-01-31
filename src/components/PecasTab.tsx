"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Download, Edit2, Search, Package, AlertCircle } from "lucide-react";
import { usePecas } from "@/hooks/usePecas";
import { Peca } from "@/lib/db/types";

export function PecasTab() {
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

  const handleExportCSV = () => {
    if (pecas.length === 0) {
      alert("Nenhuma peça para exportar!");
      return;
    }

    const headers = [
      "Código",
      "Nome",
      "Descrição",
      "Fornecedor",
      "Custo",
      "Venda",
      "Margem %",
      "Estoque",
      "Mín",
      "Máx",
      "Localização",
      "Compatibilidade",
      "Data Cadastro",
    ];

    const rows = pecas.map((peca) => [
      peca.codigoUnico,
      peca.nome,
      peca.descricao || "",
      peca.fornecedor || "",
      `R$ ${peca.custoPeca.toFixed(2)}`,
      `R$ ${peca.vendaPeca.toFixed(2)}`,
      `${peca.margem?.toFixed(2) || 0}%`,
      peca.estoque,
      peca.estoqueMinimo,
      peca.estoqueMaximo,
      peca.localizacao || "",
      peca.compatibilidade || "",
      new Date(peca.dataCadastro).toLocaleDateString("pt-BR"),
    ]);

    let csv = headers.join(",") + "\n";
    rows.forEach((row) => {
      csv += row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `pecas_${new Date().toLocaleDateString("pt-BR")}.csv`);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    <div className="space-y-4">
      <GlassCard className="rounded-3xl">
        <div className="pb-4 border-b border-white/10 mb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-base sm:text-lg font-bold">Peças em Estoque</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Gerencie peças e componentes ({pecas.length} total)
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleExportCSV}
                disabled={pecas.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
              <Button onClick={() => setShowForm(!showForm)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Peça
              </Button>
            </div>
          </div>
        </div>
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
            <GlassCard className="bg-white/40 dark:bg-white/5 rounded-[2rem] border-white/10 p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold">
                  {editingId ? "Editar Peça" : "Nova Peça"}
                </h3>
                <button
                  onClick={handleCancel}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

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
                      type="number"
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
                      type="number"
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
                      type="number"
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

                {/* Botões */}
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                    {loading
                      ? editingId
                        ? "Atualizando..."
                        : "Salvando..."
                      : editingId
                      ? "Atualizar Peça"
                      : "Salvar Peça"}
                  </Button>
                </div>

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">Erro: {error}</p>
                )}
              </form>
            </GlassCard>
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
