"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Users, X, Plus, Download, Edit2, Search } from "lucide-react";
import { useClientes } from "@/hooks/useClientes";
import { Cliente } from "@/lib/db/types";

export function ClientesTab() {
  const {
    clientes,
    loading,
    error,
    fetchClientes,
    criarCliente,
    deletarCliente,
    atualizarCliente,
  } = useClientes();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    cpf: "",
    endereco: "",
    cidade: "",
    estado: "",
    cep: "",
  });

  // Carregar clientes ao montar
  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  // Filtrar clientes por busca
  const clientesFiltrados = clientes.filter((cliente) =>
    cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.telefone.includes(searchTerm)
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEdit = (cliente: Cliente) => {
    setEditingId(cliente.id);
    setFormData({
      nome: cliente.nome,
      email: cliente.email,
      telefone: cliente.telefone,
      cpf: cliente.cpf || "",
      endereco: cliente.endereco || "",
      cidade: cliente.cidade || "",
      estado: cliente.estado || "",
      cep: cliente.cep || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome || !formData.email || !formData.telefone) {
      alert("Preencha nome, email e telefone!");
      return;
    }

    if (editingId) {
      // Atualizar cliente existente
      await atualizarCliente(editingId, {
        ...formData,
        ativo: true,
      });
    } else {
      // Criar novo cliente
      await criarCliente({
        ...formData,
        ativo: true,
      });
    }

    // Limpar formulário
    setFormData({
      nome: "",
      email: "",
      telefone: "",
      cpf: "",
      endereco: "",
      cidade: "",
      estado: "",
      cep: "",
    });

    setShowForm(false);
    setEditingId(null);
    await fetchClientes();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja deletar este cliente?")) {
      await deletarCliente(id);
      await fetchClientes();
    }
  };

  const handleExportCSV = () => {
    if (clientes.length === 0) {
      alert("Nenhum cliente para exportar!");
      return;
    }

    // Headers do CSV
    const headers = [
      "ID",
      "Nome",
      "Email",
      "Telefone",
      "CPF",
      "Endereço",
      "Cidade",
      "Estado",
      "CEP",
      "Data Cadastro",
      "Status",
    ];

    // Dados do CSV
    const rows = clientes.map((cliente) => [
      cliente.id,
      cliente.nome,
      cliente.email,
      cliente.telefone,
      cliente.cpf || "",
      cliente.endereco || "",
      cliente.cidade || "",
      cliente.estado || "",
      cliente.cep || "",
      new Date(cliente.dataCadastro).toLocaleDateString("pt-BR"),
      cliente.ativo ? "Ativo" : "Inativo",
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
      `clientes_${new Date().toLocaleDateString("pt-BR")}.csv`
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      nome: "",
      email: "",
      telefone: "",
      cpf: "",
      endereco: "",
      cidade: "",
      estado: "",
      cep: "",
    });
  };

  return (
    <div className="flex-1 flex justify-center pt-2 pb-8 transition-all duration-300">
      <div className="space-y-4 w-full max-w-6xl px-4 sm:px-8">
        {/* Cabeçalho Separado */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mb-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white drop-shadow-sm">Clientes</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
              Gerencie seus clientes e dados pessoais ({clientes.length} total)
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={clientes.length === 0}
              className="h-9 text-xs sm:text-sm shrink-0 whitespace-nowrap"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar
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
              placeholder="Buscar por nome, email ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-glass pl-10"
            />
          </div>

          {/* Formulário de Novo/Editar Cliente */}
          {showForm && (
            <GlassCard className="bg-white/40 dark:bg-white/5 rounded-[2rem] border-white/10 p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold">
                  {editingId ? "Editar Cliente" : "Adicionar Novo Cliente"}
                </h3>
                <button
                  onClick={handleCancel}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Linha 1: Nome e Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    name="nome"
                    placeholder="Nome completo *"
                    value={formData.nome}
                    onChange={handleInputChange}
                    required
                    className="input-glass"
                  />
                  <input
                    type="email"
                    name="email"
                    placeholder="Email *"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="input-glass"
                  />
                </div>

                {/* Linha 2: Telefone e CPF */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="tel"
                    name="telefone"
                    placeholder="Telefone *"
                    value={formData.telefone}
                    onChange={handleInputChange}
                    required
                    className="input-glass"
                  />
                  <input
                    type="text"
                    name="cpf"
                    placeholder="CPF (opcional)"
                    value={formData.cpf}
                    onChange={handleInputChange}
                    className="input-glass"
                  />
                </div>

                {/* Linha 3: Endereço */}
                <input
                  type="text"
                  name="endereco"
                  placeholder="Endereço (opcional)"
                  value={formData.endereco}
                  onChange={handleInputChange}
                  className="input-glass"
                />

                {/* Linha 4: Cidade, Estado e CEP */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    name="cidade"
                    placeholder="Cidade (opcional)"
                    value={formData.cidade}
                    onChange={handleInputChange}
                    className="input-glass"
                  />
                  <input
                    type="text"
                    name="estado"
                    placeholder="Estado (opcional)"
                    value={formData.estado}
                    onChange={handleInputChange}
                    maxLength={2}
                    className="input-glass"
                  />
                  <input
                    type="text"
                    name="cep"
                    placeholder="CEP (opcional)"
                    value={formData.cep}
                    onChange={handleInputChange}
                    className="input-glass"
                  />
                </div>

                {/* Botões */}
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                    {loading
                      ? editingId
                        ? "Atualizando..."
                        : "Salvando..."
                      : editingId
                      ? "Atualizar Cliente"
                      : "Salvar Cliente"}
                  </Button>
                </div>

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Erro: {error}
                  </p>
                )}
              </form>
            </GlassCard>
          )}

          {/* Lista de Clientes */}
          <div className="space-y-3">
            {clientesFiltrados.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {clientes.length === 0
                  ? 'Nenhum cliente cadastrado. Clique em "Novo Cliente" para começar.'
                  : "Nenhum cliente encontrado com os critérios de busca."}
              </p>
            ) : (
              clientesFiltrados.map((cliente) => (
                <div
                  key={cliente.id}
                  className="flex items-start justify-between gap-4 border-b pb-4 last:border-0 hover:bg-muted/30 p-2 rounded transition-colors"
                >
                  <div className="flex-1 space-y-1 min-w-0">
                    <p className="text-sm font-semibold">{cliente.nome}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>📧 {cliente.email}</span>
                      <span>📱 {cliente.telefone}</span>
                      {cliente.cpf && <span>📋 {cliente.cpf}</span>}
                    </div>
                    {cliente.endereco && (
                      <p className="text-xs text-muted-foreground">
                        📍 {cliente.endereco}
                        {cliente.cidade && `, ${cliente.cidade}`}
                        {cliente.estado && ` - ${cliente.estado}`}
                        {cliente.cep && ` - ${cliente.cep}`}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={cliente.ativo ? "default" : "secondary"}>
                      {cliente.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(cliente.dataCadastro).toLocaleDateString(
                        "pt-BR"
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(cliente)}
                        className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                      >
                        <Edit2 className="h-3 w-3" />
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(cliente.id)}
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
        </div>
      </GlassCard>
      </div>
    </div>
  );
}
