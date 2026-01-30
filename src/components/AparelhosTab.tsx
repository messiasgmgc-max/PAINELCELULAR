"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone, X, Plus, Download, Edit2, Search, FileText, History, ArrowUpRight } from "lucide-react";
import { useAparelhos } from "@/hooks/useAparelhos";
import { useClientes } from "@/hooks/useClientes";
import { Aparelho } from "@/lib/db/types";

export function AparelhosTab() {
  const {
    aparelhos,
    loading,
    error,
    fetchAparelhos,
    criarAparelho,
    deletarAparelho,
    atualizarAparelho,
  } = useAparelhos();

  const { clientes, fetchClientes, criarCliente } = useClientes();

  const [showForm, setShowForm] = useState(false);
  const [showNovoClientePopup, setShowNovoClientePopup] = useState(false);
  const [showSaidas, setShowSaidas] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    marca: "",
    modelo: "",
    imei: "",
    numeroSerie: "",
    cor: "",
    capacidade: "64GB" as string,
    condicao: "seminovo" as "novo" | "seminovo" | "usado" | "danificado",
    preco: "",
    descricao: "",
    cliente: "",
    clienteId: "",
    acessorios: "",
    observacoes: "",
  });

  const [novoClienteData, setNovoClienteData] = useState({
    nome: "",
    email: "",
    telefone: "",
    cpf: "",
    endereco: "",
    cidade: "",
    estado: "",
    cep: "",
  });

  const [saidas, setSaidas] = useState<any[]>([]);

  // Carregar dados ao montar
  useEffect(() => {
    fetchAparelhos();
    fetchClientes();
  }, [fetchAparelhos, fetchClientes]);

  // Filtrar aparelhos por busca
  const aparelhosFiltrados = aparelhos.filter((aparelho) =>
    aparelho.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    aparelho.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
    aparelho.imei?.includes(searchTerm) ||
    aparelho.numeroSerie?.includes(searchTerm) ||
    aparelho.cliente?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const romOptions = ["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"];

  // Formatador de preço
  const formatarPreco = (valor: string) => {
    let limpo = valor.replace(/\D/g, "");
    if (limpo === "") return "";
    let numero = parseInt(limpo) / 100;
    return "R$ " + numero.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Handler para IMEI com validação
  const handleIMEIChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let valor = e.target.value.replace(/\D/g, "").slice(0, 15);
    setFormData((prev) => ({
      ...prev,
      imei: valor,
    }));
  };

  // Handler para preço
  const handlePrecoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.replace(/\D/g, "");
    setFormData((prev) => ({
      ...prev,
      preco: valor,
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

  const handleEdit = (aparelho: Aparelho) => {
    setEditingId(aparelho.id);
    setFormData({
      marca: aparelho.marca,
      modelo: aparelho.modelo,
      imei: aparelho.imei || "",
      numeroSerie: aparelho.numeroSerie || "",
      cor: aparelho.cor || "",
      capacidade: aparelho.capacidade || "64GB",
      condicao: aparelho.condicao,
      preco: String(aparelho.preco * 100), // Converter para centavos
      descricao: aparelho.descricao || "",
      cliente: aparelho.cliente || "",
      clienteId: aparelho.clienteId || "",
      acessorios: aparelho.acessorios || "",
      observacoes: aparelho.observacoes || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.marca || !formData.modelo) {
      alert("Preencha marca e modelo!");
      return;
    }

    const precoNumerico = formData.preco ? parseInt(formData.preco) / 100 : 0;

    if (editingId) {
      await atualizarAparelho(editingId, {
        ...formData,
        preco: precoNumerico,
        ativo: true,
      });
    } else {
      await criarAparelho({
        ...formData,
        preco: precoNumerico,
        ativo: true,
      });
    }

    handleCancel();
    await fetchAparelhos();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja deletar este aparelho?")) {
      await deletarAparelho(id);
      await fetchAparelhos();
    }
  };

  const handleExportCSV = () => {
    if (aparelhos.length === 0) {
      alert("Nenhum aparelho para exportar!");
      return;
    }

    // Headers do CSV
    const headers = [
      "ID",
      "Marca",
      "Modelo",
      "IMEI",
      "Número de Série",
      "Cor",
      "Capacidade",
      "Condição",
      "Preço",
      "Descrição",
      "Cliente",
      "Acessórios",
      "Observações",
      "Data Cadastro",
    ];

    // Dados do CSV
    const rows = aparelhos.map((aparelho) => [
      aparelho.id,
      aparelho.marca,
      aparelho.modelo,
      aparelho.imei || "",
      aparelho.numeroSerie || "",
      aparelho.cor || "",
      aparelho.capacidade || "",
      aparelho.condicao,
      aparelho.preco,
      aparelho.descricao || "",
      aparelho.cliente || "",
      aparelho.acessorios || "",
      aparelho.observacoes || "",
      new Date(aparelho.dataCadastro).toLocaleDateString("pt-BR"),
    ]);

    // Montar CSV
    let csv = headers.join(",") + "\n";
    rows.forEach((row) => {
      csv += row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",") + "\n";
    });

    // Download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `aparelhos_${new Date().toLocaleDateString("pt-BR")}.csv`
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateCertificate = async (aparelho: Aparelho) => {
    try {
      const html2pdf = (await import("html2pdf.js")).default;

      const element = document.createElement("div");
      element.innerHTML = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; width: 100%; background: linear-gradient(135deg, #5a67d8 0%, #667eea 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center;">
          <div style="background: white; padding: 50px; border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); max-width: 800px; width: 100%;">
            <div style="text-align: center; margin-bottom: 40px; border-bottom: 3px solid #5a67d8; padding-bottom: 20px;">
              <h1 style="color: #5a67d8; margin: 0; font-size: 36px; font-weight: bold;">📱 CERTIFICADO DO APARELHO</h1>
              <p style="color: #666; margin: 10px 0 0 0; font-size: 14px;">Documento de Registro e Autenticação</p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0;">
                <p style="color: #5a67d8; font-weight: bold; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase;">Marca</p>
                <p style="color: #333; margin: 0; font-size: 20px; font-weight: bold;">${aparelho.marca}</p>
              </div>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0;">
                <p style="color: #5a67d8; font-weight: bold; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase;">Modelo</p>
                <p style="color: #333; margin: 0; font-size: 20px; font-weight: bold;">${aparelho.modelo}</p>
              </div>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0;">
                <p style="color: #5a67d8; font-weight: bold; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase;">IMEI</p>
                <p style="color: #333; margin: 0; font-size: 16px; font-family: 'Courier New', monospace;">${aparelho.imei || "Não informado"}</p>
              </div>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0;">
                <p style="color: #5a67d8; font-weight: bold; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase;">Série</p>
                <p style="color: #333; margin: 0; font-size: 16px; font-family: 'Courier New', monospace;">${aparelho.numeroSerie || "Não informado"}</p>
              </div>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0;">
                <p style="color: #5a67d8; font-weight: bold; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase;">Cor</p>
                <p style="color: #333; margin: 0; font-size: 16px;">${aparelho.cor || "Não informado"}</p>
              </div>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0;">
                <p style="color: #5a67d8; font-weight: bold; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase;">Capacidade</p>
                <p style="color: #333; margin: 0; font-size: 16px;">${aparelho.capacidade || "Não informado"}</p>
              </div>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0;">
                <p style="color: #5a67d8; font-weight: bold; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase;">Condição</p>
                <p style="color: #333; margin: 0; font-size: 16px;">
                  ${aparelho.condicao === "novo" ? "🆕 Novo" : aparelho.condicao === "seminovo" ? "⭐ Seminovo" : aparelho.condicao === "usado" ? "♻️ Usado" : "⚠️ Danificado"}
                </p>
              </div>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0;">
                <p style="color: #5a67d8; font-weight: bold; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase;">Valor</p>
                <p style="color: #333; margin: 0; font-size: 18px; font-weight: bold;">R$ ${aparelho.preco.toFixed(2).replace(".", ",")}</p>
              </div>
            </div>

            ${aparelho.descricao ? `
            <div style="background: #f0f4ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #5a67d8;">
              <p style="color: #5a67d8; font-weight: bold; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Descrição</p>
              <p style="color: #333; margin: 0; line-height: 1.6;">${aparelho.descricao}</p>
            </div>
            ` : ""}

            ${aparelho.cliente ? `
            <div style="background: #f0f4ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #5a67d8;">
              <p style="color: #5a67d8; font-weight: bold; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase;">Cliente Proprietário</p>
              <p style="color: #333; margin: 0; font-size: 16px;">${aparelho.cliente}</p>
            </div>
            ` : ""}

            ${aparelho.acessorios ? `
            <div style="background: #f0f4ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #5a67d8;">
              <p style="color: #5a67d8; font-weight: bold; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Acessórios Inclusos</p>
              <p style="color: #333; margin: 0; line-height: 1.6;">${aparelho.acessorios}</p>
            </div>
            ` : ""}

            ${aparelho.observacoes ? `
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
              <p style="color: #d97706; font-weight: bold; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">📝 Observações</p>
              <p style="color: #333; margin: 0; line-height: 1.6;">${aparelho.observacoes}</p>
            </div>
            ` : ""}

            <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee;">
              <p style="color: #999; margin: 5px 0; font-size: 12px;">
                📅 Registrado em: ${new Date(aparelho.dataCadastro).toLocaleDateString("pt-BR", { 
                  year: "numeric", 
                  month: "long", 
                  day: "numeric" 
                })}
              </p>
              <p style="color: #999; margin: 5px 0; font-size: 12px;">
                ID do Sistema: <span style="font-family: 'Courier New', monospace; background: #f8f9fa; padding: 2px 6px; border-radius: 4px;">${aparelho.id}</span>
              </p>
              <p style="color: #5a67d8; margin: 10px 0 0 0; font-size: 11px; font-weight: bold; text-transform: uppercase;">Este é um documento de registro eletrônico autenticado</p>
            </div>
          </div>
        </div>
      `;

      const options = {
        margin: [0, 0, 0, 0] as [number, number, number, number],
        filename: `certificado_${aparelho.marca}_${aparelho.modelo}_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`,
        image: { type: "png" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" },
        jsPDF: { orientation: "portrait" as const, unit: "mm" as const, format: "a4" as const },
      };

      html2pdf().set(options).from(element).save();
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert("Erro ao gerar PDF. Verifique o console para mais detalhes.");
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      marca: "",
      modelo: "",
      imei: "",
      numeroSerie: "",
      cor: "",
      capacidade: "64GB",
      condicao: "seminovo",
      preco: "",
      descricao: "",
      cliente: "",
      clienteId: "",
      acessorios: "",
      observacoes: "",
    });
  };

  const handleNovoClienteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!novoClienteData.nome || !novoClienteData.email || !novoClienteData.telefone) {
      alert("Preencha Nome, Email e Telefone!");
      return;
    }

    const novoCliente = await criarCliente({
      nome: novoClienteData.nome,
      email: novoClienteData.email,
      telefone: novoClienteData.telefone,
      cpf: novoClienteData.cpf || "",
      endereco: novoClienteData.endereco || "",
      cidade: novoClienteData.cidade || "",
      estado: novoClienteData.estado || "",
      cep: novoClienteData.cep || "",
      ativo: true,
    });

    if (novoCliente) {
      setFormData((prev) => ({
        ...prev,
        cliente: novoClienteData.nome,
        clienteId: novoCliente.id,
      }));
    }

    setNovoClienteData({
      nome: "",
      email: "",
      telefone: "",
      cpf: "",
      endereco: "",
      cidade: "",
      estado: "",
      cep: "",
    });

    setShowNovoClientePopup(false);
    await fetchClientes();
  };

  const condicaoEmoji = (condicao: string) => {
    switch (condicao) {
      case "novo":
        return "🆕";
      case "seminovo":
        return "⭐";
      case "usado":
        return "♻️";
      case "danificado":
        return "⚠️";
      default:
        return "📱";
    }
  };

  const condicaoLabel = (condicao: string) => {
    switch (condicao) {
      case "novo":
        return "Novo";
      case "seminovo":
        return "Seminovo";
      case "usado":
        return "Usado";
      case "danificado":
        return "Danificado";
      default:
        return condicao;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle>Aparelhos Cadastrados</CardTitle>
              <p className="text-sm text-muted-foreground">
                Gerencie seus aparelhos e gere certificados ({aparelhos.length} total)
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={() => setShowSaidas(true)} className="gap-2">
                <History className="h-4 w-4" /> Saídas
              </Button>
              <Button
                variant="outline"
                onClick={handleExportCSV}
                disabled={aparelhos.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
              <Button onClick={() => setShowForm(!showForm)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Aparelho
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Barra de Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por marca, modelo, IMEI ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
            />
          </div>

          {/* Formulário de Novo/Editar Aparelho */}
          {showForm && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">
                  {editingId ? "Editar Aparelho" : "Cadastrar Novo Aparelho"}
                </h3>
                <button
                  onClick={handleCancel}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Linha 1: Marca e Modelo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    name="marca"
                    placeholder="Marca *"
                    value={formData.marca}
                    onChange={handleInputChange}
                    required
                    className="px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                  />
                  <input
                    type="text"
                    name="modelo"
                    placeholder="Modelo *"
                    value={formData.modelo}
                    onChange={handleInputChange}
                    required
                    className="px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                  />
                </div>

                {/* Linha 2: IMEI (limitado a 15 números) e Série */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      name="imei"
                      placeholder="IMEI (15 dígitos máximo)"
                      value={formData.imei}
                      onChange={handleIMEIChange}
                      maxLength={15}
                      inputMode="numeric"
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.imei.length}/15 dígitos
                    </p>
                  </div>
                  <input
                    type="text"
                    name="numeroSerie"
                    placeholder="Número de Série (opcional)"
                    value={formData.numeroSerie}
                    onChange={handleInputChange}
                    className="px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                  />
                </div>

                {/* Linha 3: Cor e Capacidade (Selecionável) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    name="cor"
                    placeholder="Cor (ex: Preto, Branco) (opcional)"
                    value={formData.cor}
                    onChange={handleInputChange}
                    className="px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                  />
                  <select
                    name="capacidade"
                    value={formData.capacidade}
                    onChange={handleInputChange}
                    className="px-3 py-2 border rounded-md bg-background text-foreground"
                  >
                    {romOptions.map((rom) => (
                      <option key={rom} value={rom}>
                        💾 {rom}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Linha 4: Condição e Preço (Formatado) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select
                    name="condicao"
                    value={formData.condicao}
                    onChange={handleInputChange}
                    className="px-3 py-2 border rounded-md bg-background text-foreground"
                  >
                    <option value="novo">🆕 Novo</option>
                    <option value="seminovo">⭐ Seminovo</option>
                    <option value="usado">♻️ Usado</option>
                    <option value="danificado">⚠️ Danificado</option>
                  </select>
                  <div>
                    <input
                      type="text"
                      name="preco"
                      placeholder="Preço em R$"
                      value={formatarPreco(formData.preco)}
                      onChange={handlePrecoChange}
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                    />
                  </div>
                </div>

                {/* Cliente com opção de adicionar novo */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <select
                      name="cliente"
                      value={formData.clienteId}
                      onChange={(e) => {
                        const clienteSelecionado = clientes.find(
                          (c) => c.id === e.target.value
                        );
                        setFormData((prev) => ({
                          ...prev,
                          clienteId: e.target.value,
                          cliente: clienteSelecionado?.nome || "",
                        }));
                      }}
                      className="flex-1 px-3 py-2 border rounded-md bg-background text-foreground"
                    >
                      <option value="">Selecione um cliente (opcional)</option>
                      {clientes.map((cliente) => (
                        <option key={cliente.id} value={cliente.id}>
                          {cliente.nome} ({cliente.telefone})
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNovoClientePopup(true)}
                      title="Adicionar novo cliente"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Descrição */}
                <textarea
                  name="descricao"
                  placeholder="Descrição do aparelho (opcional)"
                  value={formData.descricao}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                />

                {/* Acessórios */}
                <textarea
                  name="acessorios"
                  placeholder="Acessórios inclusos (opcional) - ex: Carregador, Fone, Capa"
                  value={formData.acessorios}
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                />

                {/* Observações */}
                <textarea
                  name="observacoes"
                  placeholder="Observações adicionais (opcional)"
                  value={formData.observacoes}
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                />

                {/* Botões */}
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading
                      ? editingId
                        ? "Atualizando..."
                        : "Salvando..."
                      : editingId
                      ? "Atualizar Aparelho"
                      : "Salvar Aparelho"}
                  </Button>
                </div>

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Erro: {error}
                  </p>
                )}
              </form>
            </div>
          )}

          {/* Popup de Novo Cliente */}
          {showNovoClientePopup && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Adicionar Novo Cliente</CardTitle>
                    <button
                      onClick={() => setShowNovoClientePopup(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleNovoClienteSubmit} className="space-y-3">
                    <input
                      type="text"
                      placeholder="Nome *"
                      value={novoClienteData.nome}
                      onChange={(e) =>
                        setNovoClienteData((prev) => ({
                          ...prev,
                          nome: e.target.value,
                        }))
                      }
                      required
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                    />
                    <input
                      type="email"
                      placeholder="Email *"
                      value={novoClienteData.email}
                      onChange={(e) =>
                        setNovoClienteData((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      required
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                    />
                    <input
                      type="tel"
                      placeholder="Telefone *"
                      value={novoClienteData.telefone}
                      onChange={(e) =>
                        setNovoClienteData((prev) => ({
                          ...prev,
                          telefone: e.target.value,
                        }))
                      }
                      required
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                    />
                    <input
                      type="text"
                      placeholder="CPF (opcional)"
                      value={novoClienteData.cpf}
                      onChange={(e) =>
                        setNovoClienteData((prev) => ({
                          ...prev,
                          cpf: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                    />
                    <input
                      type="text"
                      placeholder="Endereço (opcional)"
                      value={novoClienteData.endereco}
                      onChange={(e) =>
                        setNovoClienteData((prev) => ({
                          ...prev,
                          endereco: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                    />
                    <input
                      type="text"
                      placeholder="Cidade (opcional)"
                      value={novoClienteData.cidade}
                      onChange={(e) =>
                        setNovoClienteData((prev) => ({
                          ...prev,
                          cidade: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                    />
                    <input
                      type="text"
                      placeholder="Estado (opcional)"
                      value={novoClienteData.estado}
                      onChange={(e) =>
                        setNovoClienteData((prev) => ({
                          ...prev,
                          estado: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                    />
                    <input
                      type="text"
                      placeholder="CEP (opcional)"
                      value={novoClienteData.cep}
                      onChange={(e) =>
                        setNovoClienteData((prev) => ({
                          ...prev,
                          cep: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                    />

                    <div className="flex gap-2 justify-end pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowNovoClientePopup(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit">Adicionar Cliente</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Lista de Aparelhos */}
          <div className="space-y-3">
            {aparelhosFiltrados.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {aparelhos.length === 0
                  ? 'Nenhum aparelho cadastrado. Clique em "Novo Aparelho" para começar.'
                  : "Nenhum aparelho encontrado com os critérios de busca."}
              </p>
            ) : (
              aparelhosFiltrados.map((aparelho) => (
                <div
                  key={aparelho.id}
                  className="flex items-start justify-between gap-4 border-b pb-4 last:border-0 hover:bg-muted/30 p-2 rounded transition-colors"
                >
                  <div className="flex-1 space-y-1 min-w-0">
                    <p className="text-sm font-semibold">
                      {condicaoEmoji(aparelho.condicao)} {aparelho.marca} {aparelho.modelo}
                      {aparelho.clienteId && (
                        <Badge variant="outline" className="ml-2 bg-yellow-50 text-yellow-700 border-yellow-200">
                          MANUTENÇÃO - {aparelho.cliente}
                        </Badge>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {aparelho.cor && <span>🎨 {aparelho.cor}</span>}
                      {aparelho.capacidade && <span>💾 {aparelho.capacidade}</span>}
                      {aparelho.imei && <span>📱 IMEI: {aparelho.imei}</span>}
                      {aparelho.cliente && <span>👤 {aparelho.cliente}</span>}
                    </div>
                    {aparelho.descricao && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        📝 {aparelho.descricao}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="default">
                      R$ {aparelho.preco.toFixed(2).replace(".", ",")}
                    </Badge>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(aparelho.dataCadastro).toLocaleDateString(
                        "pt-BR"
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGenerateCertificate(aparelho)}
                        className="text-xs text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 font-medium flex items-center gap-1"
                      >
                        <FileText className="h-3 w-3" />
                        PDF
                      </button>
                      <button
                        onClick={() => handleEdit(aparelho)}
                        className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                      >
                        <Edit2 className="h-3 w-3" />
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(aparelho.id)}
                        className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                      >
                        Deletar
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {loading && !showForm && (
            <p className="text-sm text-muted-foreground text-center">
              Carregando...
            </p>
          )}
        </CardContent>
      </Card>

      {/* Modal de Saídas */}
      {showSaidas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle className="flex items-center gap-2"><ArrowUpRight className="h-5 w-5 text-red-500" /> Histórico de Saídas</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowSaidas(false)}><X className="h-5 w-5" /></Button>
            </CardHeader>
            <CardContent className="overflow-y-auto p-0">
              <div className="divide-y">
                {saidas.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">Nenhuma saída registrada.</p>
                ) : (
                  saidas.map((item, idx) => (
                    <div key={idx} className="p-4 flex justify-between items-center hover:bg-muted/50">
                      <div>
                        <p className="font-medium">{item.marca} {item.modelo}</p>
                        <p className="text-xs text-muted-foreground">IMEI: {item.imei || 'N/A'}</p>
                        <p className="text-xs text-red-600 font-medium mt-1">Motivo: {item.motivoSaida}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{new Date(item.dataSaida).toLocaleDateString('pt-BR')} {new Date(item.dataSaida).toLocaleTimeString('pt-BR')}</p>
                        <Badge variant="outline">{item.condicao}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
