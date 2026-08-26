"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { ModalPortal } from "@/components/ModalPortal";
import { Badge } from "@/components/ui/badge";
import { Users, X, Plus, Download, Edit2, Search, Upload, UserPlus } from "lucide-react";
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
              <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-start p-2 sm:p-4 pt-3 sm:pt-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
                <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 text-white relative my-0 shrink-0">
                  {/* Cabeçalho */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold border border-cyan-500/30">
                        <UserPlus className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base sm:text-lg text-white">
                          {editingId ? "Editar Cliente" : "Cadastrar Novo Cliente"}
                        </h3>
                        <p className="text-xs text-slate-400">
                          Preencha os dados de contato e endereço para salvar na base da loja
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={handleCancel} 
                      className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Linha 1: Nome e Email */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">Nome completo *</label>
                        <input
                          type="text"
                          name="nome"
                          placeholder="Ex: João da Silva"
                          value={formData.nome}
                          onChange={handleInputChange}
                          required
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">Email *</label>
                        <input
                          type="email"
                          name="email"
                          placeholder="joao@email.com"
                          value={formData.email}
                          onChange={handleInputChange}
                          required
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Linha 2: Telefone e CPF */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">Telefone / WhatsApp *</label>
                        <input
                          type="tel"
                          name="telefone"
                          placeholder="(11) 99999-8888 *"
                          value={formData.telefone}
                          onChange={handleInputChange}
                          required
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">CPF (opcional)</label>
                        <input
                          type="text"
                          name="cpf"
                          placeholder="000.000.000-00"
                          value={formData.cpf}
                          onChange={handleInputChange}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all font-mono"
                        />
                      </div>
                    </div>

                    {/* Linha 3: Endereço */}
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Endereço (opcional)</label>
                      <input
                        type="text"
                        name="endereco"
                        placeholder="Rua, Número, Bairro"
                        value={formData.endereco}
                        onChange={handleInputChange}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                      />
                    </div>

                    {/* Linha 4: Cidade, Estado e CEP */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">Cidade</label>
                        <input
                          type="text"
                          name="cidade"
                          placeholder="Cidade"
                          value={formData.cidade}
                          onChange={handleInputChange}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">Estado</label>
                        <input
                          type="text"
                          name="estado"
                          placeholder="UF (Ex: SP)"
                          value={formData.estado}
                          onChange={handleInputChange}
                          maxLength={2}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all uppercase"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300 block mb-1">CEP</label>
                        <input
                          type="text"
                          name="cep"
                          placeholder="00000-000"
                          value={formData.cep}
                          onChange={handleInputChange}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all font-mono"
                        />
                      </div>
                    </div>

                    {error && (
                      <p className="text-xs text-red-400 font-semibold p-2.5 bg-red-950/40 border border-red-800/50 rounded-xl">
                        Erro: {error}
                      </p>
                    )}

                    <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs sm:text-sm transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl text-xs sm:text-sm px-6 py-2.5 shadow-lg shadow-cyan-950/40 flex items-center gap-2 transition-all"
                      >
                        {loading ? "Salvando..." : editingId ? "Atualizar Cliente" : "Salvar Cliente"}
                      </button>
                    </div>
                  </form>
                </div>
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
