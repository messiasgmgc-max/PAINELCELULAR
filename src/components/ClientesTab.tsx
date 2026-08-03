"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { ModalPortal } from "@/components/ModalPortal";
import { Badge } from "@/components/ui/badge";
import { Users, X, Plus, Download, Edit2, Search, Upload } from "lucide-react";
import { useClientes } from "@/hooks/useClientes";
import { useAuth } from "@/hooks/useAuth";
import { Cliente } from "@/lib/db/types";
import { supabase } from "@/lib/supabaseClient";
import {
  exportDataset,
  findByAliases,
  parseImportFile,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/importExport";

export function ClientesTab() {
  const { usuario } = useAuth();
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
  const importInputRef = useRef<HTMLInputElement | null>(null);
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

  const CLIENTE_COLUMNS: ExportColumn[] = [
    { key: "id", label: "ID" },
    { key: "nome", label: "Nome" },
    { key: "email", label: "Email" },
    { key: "telefone", label: "Telefone" },
    { key: "cpf", label: "CPF" },
    { key: "endereco", label: "Endereco" },
    { key: "cidade", label: "Cidade" },
    { key: "estado", label: "Estado" },
    { key: "cep", label: "CEP" },
    { key: "dataCadastro", label: "Data Cadastro" },
    { key: "status", label: "Status" },
  ];

  const handleExport = async () => {
    if (clientes.length === 0) {
      alert("Nenhum cliente para exportar!");
      return;
    }

    const formatoEscolhido = window
      .prompt("Formato para exportar clientes: csv ou xls", "csv")
      ?.toLowerCase()
      .trim() as ExportFormat | undefined;

    if (!formatoEscolhido || !["csv", "xls"].includes(formatoEscolhido)) {
      alert("Formato inválido. Use csv ou xls.");
      return;
    }

    await exportDataset({
      fileNameBase: `clientes_${new Date().toISOString().slice(0, 10)}`,
      title: "Exportacao de Clientes",
      format: formatoEscolhido,
      columns: CLIENTE_COLUMNS,
      rows: clientes.map((cliente) => ({
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email,
        telefone: cliente.telefone,
        cpf: cliente.cpf || "",
        endereco: cliente.endereco || "",
        cidade: cliente.cidade || "",
        estado: cliente.estado || "",
        cep: cliente.cep || "",
        dataCadastro: new Date(cliente.dataCadastro).toLocaleDateString("pt-BR"),
        status: cliente.ativo ? "Ativo" : "Inativo",
      })),
    });
  };

  const handleOpenImport = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!usuario?.lojaId) {
      alert("Sessao sem loja ativa para importar dados.");
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
        .from("clientes")
        .select("nome, telefone, cpf")
        .eq("loja_id", usuario.lojaId);

      if (existentesError) throw existentesError;

      const chaveExistente = new Set(
        (existentes || []).map((item: any) => {
          const nome = String(item.nome || "").trim().toLowerCase();
          const telefone = String(item.telefone || "").replace(/\D/g, "");
          const cpf = String(item.cpf || "").replace(/\D/g, "");
          return `${nome}|${telefone}|${cpf}`;
        })
      );

      const chaveLote = new Set<string>();
      const nowIso = new Date().toISOString();
      const payload = importedRows
        .map((row, index) => {
          const nome = findByAliases(row, ["nome", "cliente", "razaosocial", "name", "_col2"]);
          const email = findByAliases(row, ["email", "e-mail"]);
          const telefoneFonte = findByAliases(row, ["telefone", "celular", "fone", "whatsapp", "_col3"]);
          const telefone = telefoneFonte.replace(/\D/g, "") || `000000000${(index % 10)}`;
          const cpf = findByAliases(row, ["cpf", "documento", "cnpj"]);

          const chave = `${nome.trim().toLowerCase()}|${telefone}|${cpf.replace(/\D/g, "")}`;
          if (!nome || chaveExistente.has(chave) || chaveLote.has(chave)) {
            return null;
          }

          chaveLote.add(chave);

          return {
            nome,
            email: email || `${nome.toLowerCase().replace(/[^a-z0-9]/g, "") || "cliente"}@sem-email.local`,
            telefone,
            cpf,
            endereco: findByAliases(row, ["endereco", "logradouro", "rua"]),
            cidade: findByAliases(row, ["cidade"]),
            estado: findByAliases(row, ["estado", "uf"]),
            cep: findByAliases(row, ["cep"]),
            ativo: true,
            loja_id: usuario.lojaId,
            dataCadastro: nowIso,
          };
        })
        .filter((cliente): cliente is NonNullable<typeof cliente> => Boolean(cliente));

      if (payload.length === 0) {
        alert("Nenhuma linha nova para importar. Tudo ja estava cadastrado ou sem nome.");
        return;
      }

      const { error: insertError } = await supabase.from("clientes").insert(payload);
      if (insertError) throw insertError;

      await fetchClientes();
      alert(`Importacao concluida: ${payload.length} clientes inseridos.`);
    } catch (importError: any) {
      console.error("Erro ao importar clientes:", importError);
      alert(`Erro ao importar clientes: ${importError?.message || "Falha desconhecida"}`);
    } finally {
      event.target.value = "";
    }
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
    <div className="panel-shell space-y-4 pt-2 pb-8 transition-all duration-300">
        {/* Cabeçalho Separado */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mb-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white drop-shadow-sm">Clientes</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
              Gerencie seus clientes e dados pessoais ({clientes.length} total)
            </p>
          </div>
          <div className="scroll-row w-full sm:w-auto sm:pb-0">
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
              disabled={clientes.length === 0}
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
              placeholder="Buscar por nome, email ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-glass pl-10"
            />
          </div>

          {/* Formulário de Novo/Editar Cliente */}
          {showForm && (
            <ModalPortal>
            <div className="modal-overlay z-[60]">
            <GlassCard className="modal-panel modal-panel-lg w-[min(860px,calc(100vw-2rem))] max-h-[calc(100dvh-2.5rem)] overflow-y-auto p-4 sm:p-6">
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
            </div>
            </ModalPortal>
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
  );
}
