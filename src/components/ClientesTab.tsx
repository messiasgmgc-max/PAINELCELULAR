"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { buscarTodasPaginas } from "@/lib/supabase/paginar";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { ModalPortal } from "@/components/ModalPortal";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  X,
  Plus,
  Download,
  Edit2,
  Search,
  Upload,
  UserPlus,
  Cake,
  ShoppingBag,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Calendar,
  MessageCircle,
  Trash2,
  History,
  ArrowUpDown,
  Smartphone,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useClientes } from "@/hooks/useClientes";
import { useAuth } from "@/hooks/useAuth";
import { Cliente } from "@/lib/db/types";
import { supabase } from "@/lib/supabaseClient";
import { FILTRO_VENDA_VALIDA } from "@/lib/vendas/situacao";
import {
  calcularInfoAniversario,
  dataNascimentoParaInput,
  emailEhPlaceholder,
  formatarDataNascimento,
  mapearComprasPorCliente,
  montarLinkWhatsappCliente,
  normalizarTextoComparacao,
  obterIniciaisCliente,
  type InfoAniversario,
  type ResumoComprasCliente,
  type VendaParaResumoCliente,
} from "@/lib/clientes/resumoCliente";
import {
  exportDataset,
  findByAliases,
  parseImportFile,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/importExport";

type FiltroClientes = "todos" | "com_compras" | "aniversariantes" | "sem_nascimento";
type OrdenacaoClientes = "cadastro" | "ultima_compra" | "nome" | "proximo_aniversario";

const COLUNAS_VENDAS_RESUMO =
  "id, clienteId, clienteNome, itens, aparelhoDescricao, descricao, valor, dataPagamento, created_at, metodo, status, ativo";

const FORM_INICIAL = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  data_nascimento: "",
  endereco: "",
  cidade: "",
  estado: "",
  cep: "",
};

function formatarMoedaBRL(valor: number): string {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataCurtaBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("pt-BR");
}

function formatarMetodoPagamento(metodo: string): string {
  const mapa: Record<string, string> = {
    pix: "Pix",
    dinheiro: "Dinheiro",
    cartao_credito: "Crédito",
    cartao_debito: "Débito",
    boleto: "Boleto",
    fiado: "Fiado",
    trade_in: "Troca",
    troca: "Troca",
  };
  return mapa[metodo] || metodo || "Pagamento";
}

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

  const [vendas, setVendas] = useState<VendaParaResumoCliente[]>([]);
  const [loadingVendas, setLoadingVendas] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTinhaNascimento, setEditingTinhaNascimento] = useState(false);
  const [focarNascimento, setFocarNascimento] = useState(false);
  const [clienteHistorico, setClienteHistorico] = useState<Cliente | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroClientes>("todos");
  const [ordenacao, setOrdenacao] = useState<OrdenacaoClientes>("cadastro");

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const nascimentoInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState(FORM_INICIAL);

  const carregarVendasClientes = useCallback(async () => {
    const lojaId = usuario?.lojaId || (usuario as { loja_id?: string } | null)?.loja_id;
    if (!lojaId) return;

    setLoadingVendas(true);
    try {
      const consulta = (comFiltroLoja: boolean, colunas: string) => (de: number, ate: number) => {
        let query = supabase
          .from("vendas")
          .select(colunas)
          .order("dataPagamento", { ascending: false })
          .order("id");

        if (comFiltroLoja) {
          query = query.or(`loja_id.eq.${lojaId},loja_id.is.null`);
        } else {
          query = query.or(FILTRO_VENDA_VALIDA);
        }

        return query.range(de, ate).returns<VendaParaResumoCliente[]>();
      };

      try {
        const dados = await buscarTodasPaginas<VendaParaResumoCliente>(
          consulta(true, COLUNAS_VENDAS_RESUMO)
        );
        setVendas(dados);
      } catch {
        try {
          const dadosFallback = await buscarTodasPaginas<VendaParaResumoCliente>(
            consulta(true, "*")
          );
          setVendas(dadosFallback);
        } catch {
          const dadosSemLoja = await buscarTodasPaginas<VendaParaResumoCliente>(
            consulta(false, "*")
          ).catch(() => []);
          setVendas(dadosSemLoja);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar histórico de compras dos clientes:", err);
      setVendas([]);
    } finally {
      setLoadingVendas(false);
    }
  }, [usuario]);

  useEffect(() => {
    fetchClientes();
    carregarVendasClientes();
  }, [fetchClientes, carregarVendasClientes]);

  useEffect(() => {
    if (showForm && focarNascimento) {
      const timer = window.setTimeout(() => {
        nascimentoInputRef.current?.focus();
        setFocarNascimento(false);
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [showForm, focarNascimento]);

  const comprasPorCliente = useMemo(
    () => mapearComprasPorCliente(clientes, vendas),
    [clientes, vendas]
  );

  const clientesEnriquecidos = useMemo(() => {
    const hoje = new Date();
    return clientes.map((cliente) => {
      const rawNascimento = cliente.data_nascimento || cliente.dataNascimento || "";
      const aniversario: InfoAniversario | null = calcularInfoAniversario(rawNascimento, hoje);
      const compras: ResumoComprasCliente | null = comprasPorCliente.get(cliente.id) || null;
      return {
        cliente,
        aniversario,
        compras,
      };
    });
  }, [clientes, comprasPorCliente]);

  const estatisticas = useMemo(() => {
    let ativos = 0;
    let comCompras = 0;
    let aniversariantesMes = 0;
    let aniversariantesHoje = 0;
    let comNascimento = 0;

    for (const item of clientesEnriquecidos) {
      if (item.cliente.ativo) ativos += 1;
      if (item.compras && item.compras.totalCompras > 0) comCompras += 1;
      if (item.aniversario) {
        comNascimento += 1;
        if (item.aniversario.aniversarioNoMes) aniversariantesMes += 1;
        if (item.aniversario.aniversarioHoje) aniversariantesHoje += 1;
      }
    }

    return {
      total: clientesEnriquecidos.length,
      ativos,
      comCompras,
      aniversariantesMes,
      aniversariantesHoje,
      comNascimento,
      semNascimento: clientesEnriquecidos.length - comNascimento,
    };
  }, [clientesEnriquecidos]);

  const clientesFiltrados = useMemo(() => {
    const termoNorm = normalizarTextoComparacao(searchTerm);
    const termoDigitos = searchTerm.replace(/\D/g, "");

    const filtrados = clientesEnriquecidos.filter(({ cliente, aniversario, compras }) => {
      if (filtroAtivo === "com_compras" && (!compras || compras.totalCompras === 0)) {
        return false;
      }
      if (filtroAtivo === "aniversariantes" && !aniversario?.aniversarioNoMes) {
        return false;
      }
      if (filtroAtivo === "sem_nascimento" && Boolean(aniversario)) {
        return false;
      }

      if (!termoNorm) return true;

      const matchNome = normalizarTextoComparacao(cliente.nome).includes(termoNorm);
      const matchEmail =
        !emailEhPlaceholder(cliente.email) &&
        normalizarTextoComparacao(cliente.email).includes(termoNorm);
      const matchTelefone =
        String(cliente.telefone || "").toLowerCase().includes(termoNorm) ||
        (termoDigitos.length >= 3 &&
          String(cliente.telefone || "").replace(/\D/g, "").includes(termoDigitos));
      const matchCpf =
        Boolean(cliente.cpf) &&
        (String(cliente.cpf).toLowerCase().includes(termoNorm) ||
          (termoDigitos.length >= 3 &&
            String(cliente.cpf).replace(/\D/g, "").includes(termoDigitos)));
      const matchCidade = normalizarTextoComparacao(cliente.cidade).includes(termoNorm);
      const matchNascimento = Boolean(
        aniversario?.dataFormatada &&
          aniversario.dataFormatada.toLowerCase().includes(termoNorm)
      );
      const matchProduto = Boolean(
        compras &&
          (normalizarTextoComparacao(compras.ultimoProduto).includes(termoNorm) ||
            compras.historico.some((h) =>
              normalizarTextoComparacao(h.produto).includes(termoNorm)
            ))
      );

      return (
        matchNome ||
        matchEmail ||
        matchTelefone ||
        matchCpf ||
        matchCidade ||
        matchNascimento ||
        matchProduto
      );
    });

    return filtrados.slice().sort((a, b) => {
      if (ordenacao === "nome") {
        return a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR");
      }
      if (ordenacao === "ultima_compra") {
        const tsA = a.compras?.dataUltimaCompra ? Date.parse(a.compras.dataUltimaCompra) : 0;
        const tsB = b.compras?.dataUltimaCompra ? Date.parse(b.compras.dataUltimaCompra) : 0;
        if (tsB !== tsA) return tsB - tsA;
        return a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR");
      }
      if (ordenacao === "proximo_aniversario") {
        const diasA = a.aniversario?.diasParaAniversario ?? Number.POSITIVE_INFINITY;
        const diasB = b.aniversario?.diasParaAniversario ?? Number.POSITIVE_INFINITY;
        if (diasA !== diasB) return diasA - diasB;
        return a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR");
      }
      // cadastro (mais recentes primeiro)
      const cadA = Date.parse(a.cliente.dataCadastro || "") || 0;
      const cadB = Date.parse(b.cliente.dataCadastro || "") || 0;
      return cadB - cadA;
    });
  }, [clientesEnriquecidos, filtroAtivo, ordenacao, searchTerm]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const abrirEdicaoCliente = (cliente: Cliente, focarDataNascimento = false) => {
    const rawNasc = cliente.data_nascimento || cliente.dataNascimento || "";
    setEditingId(cliente.id);
    setEditingTinhaNascimento(Boolean(rawNasc.trim()));
    setFocarNascimento(focarDataNascimento);
    setFormData({
      nome: cliente.nome,
      email: emailEhPlaceholder(cliente.email) ? "" : cliente.email,
      telefone: cliente.telefone,
      cpf: cliente.cpf || "",
      data_nascimento: dataNascimentoParaInput(rawNasc),
      endereco: cliente.endereco || "",
      cidade: cliente.cidade || "",
      estado: cliente.estado || "",
      cep: cliente.cep || "",
    });
    setShowForm(true);
  };

  const abrirNovoCliente = () => {
    setEditingId(null);
    setEditingTinhaNascimento(false);
    setFocarNascimento(false);
    setFormData(FORM_INICIAL);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setEditingTinhaNascimento(false);
    setFocarNascimento(false);
    setFormData(FORM_INICIAL);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome.trim() || !formData.telefone.trim()) {
      toast.error("Preencha pelo menos o nome e o telefone do cliente.");
      return;
    }

    const emailFinal = formData.email.trim() || "sem@email.com";
    const dataNascFinal = formData.data_nascimento.trim();

    const payloadSalvar: Record<string, unknown> = {
      nome: formData.nome.trim(),
      email: emailFinal,
      telefone: formData.telefone.trim(),
      cpf: formData.cpf.trim(),
      endereco: formData.endereco.trim(),
      cidade: formData.cidade.trim(),
      estado: formData.estado.trim().toUpperCase(),
      cep: formData.cep.trim(),
      ativo: true,
    };

    if (dataNascFinal) {
      payloadSalvar.data_nascimento = dataNascFinal;
    } else if (editingId && editingTinhaNascimento) {
      payloadSalvar.data_nascimento = null;
    }

    const resultado = editingId
      ? await atualizarCliente(editingId, payloadSalvar as Partial<Cliente>)
      : await criarCliente(
          payloadSalvar as unknown as Omit<Cliente, "id" | "dataCadastro" | "lojaId">
        );

    if (!resultado) {
      toast.error("Não foi possível salvar os dados do cliente.");
      return;
    }

    toast.success(
      editingId ? "Cliente atualizado com sucesso!" : "Cliente cadastrado com sucesso!"
    );

    handleCancel();
    await fetchClientes();
  };

  const handleDelete = async (cliente: Cliente) => {
    if (confirm(`Tem certeza que deseja deletar o cliente "${cliente.nome}"?`)) {
      const ok = await deletarCliente(cliente.id);
      if (ok) {
        toast.success("Cliente removido.");
        await fetchClientes();
      } else {
        toast.error("Não foi possível deletar o cliente.");
      }
    }
  };

  const CLIENTE_COLUMNS: ExportColumn[] = [
    { key: "id", label: "ID" },
    { key: "nome", label: "Nome" },
    { key: "email", label: "Email" },
    { key: "telefone", label: "Telefone" },
    { key: "cpf", label: "CPF" },
    { key: "data_nascimento", label: "Data de Nascimento" },
    { key: "ultimo_produto", label: "Ultimo Produto Comprado" },
    { key: "data_ultima_compra", label: "Data Ultima Compra" },
    { key: "total_compras", label: "Total de Compras" },
    { key: "endereco", label: "Endereco" },
    { key: "cidade", label: "Cidade" },
    { key: "estado", label: "Estado" },
    { key: "cep", label: "CEP" },
    { key: "dataCadastro", label: "Data Cadastro" },
    { key: "status", label: "Status" },
  ];

  const handleExport = async () => {
    if (clientes.length === 0) {
      toast.error("Nenhum cliente para exportar.");
      return;
    }

    const formatoEscolhido = window
      .prompt("Formato para exportar clientes: csv ou xls", "csv")
      ?.toLowerCase()
      .trim() as ExportFormat | undefined;

    if (!formatoEscolhido || !["csv", "xls"].includes(formatoEscolhido)) {
      if (formatoEscolhido !== undefined) {
        toast.error("Formato inválido. Use csv ou xls.");
      }
      return;
    }

    await exportDataset({
      fileNameBase: `clientes_${new Date().toISOString().slice(0, 10)}`,
      title: "Exportacao de Clientes",
      format: formatoEscolhido,
      columns: CLIENTE_COLUMNS,
      rows: clientesEnriquecidos.map(({ cliente, aniversario, compras }) => ({
        id: cliente.id,
        nome: cliente.nome,
        email: emailEhPlaceholder(cliente.email) ? "" : cliente.email,
        telefone: cliente.telefone,
        cpf: cliente.cpf || "",
        data_nascimento:
          aniversario?.dataFormatada ||
          formatarDataNascimento(cliente.data_nascimento || cliente.dataNascimento) ||
          "",
        ultimo_produto: compras?.ultimoProduto || "",
        data_ultima_compra: formatarDataCurtaBR(compras?.dataUltimaCompra),
        total_compras: compras?.totalCompras || 0,
        endereco: cliente.endereco || "",
        cidade: cliente.cidade || "",
        estado: cliente.estado || "",
        cep: cliente.cep || "",
        dataCadastro: formatarDataCurtaBR(cliente.dataCadastro),
        status: cliente.ativo ? "Ativo" : "Inativo",
      })),
    });

    toast.success("Exportação de clientes gerada!");
  };

  const handleOpenImport = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!usuario?.lojaId) {
      toast.error("Sessão sem loja ativa para importar dados.");
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedRows = await parseImportFile(file);

      if (importedRows.length === 0) {
        toast.error("Arquivo sem dados válidos para importação.");
        return;
      }

      // Paginado: acima de 1000 clientes, a importação não via os antigos e duplicava.
      const lojaDaImportacao = usuario.lojaId;
      const existentes = await buscarTodasPaginas((de, ate) =>
        supabase
          .from("clientes")
          .select("nome, telefone, cpf")
          .eq("loja_id", lojaDaImportacao)
          .order("id")
          .range(de, ate)
      );

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
          const telefoneFonte = findByAliases(row, [
            "telefone",
            "celular",
            "fone",
            "whatsapp",
            "_col3",
          ]);
          const telefone = telefoneFonte.replace(/\D/g, "") || `000000000${index % 10}`;
          const cpf = findByAliases(row, ["cpf", "documento", "cnpj"]);
          const dataNascBruta = findByAliases(row, [
            "data_nascimento",
            "nascimento",
            "nasc",
            "datanascimento",
            "dt_nasc",
            "dtnasc",
          ]);
          const dataNascNormalizada =
            dataNascimentoParaInput(dataNascBruta) || dataNascBruta.trim();

          const chave = `${nome.trim().toLowerCase()}|${telefone}|${cpf.replace(/\D/g, "")}`;
          if (!nome || chaveExistente.has(chave) || chaveLote.has(chave)) {
            return null;
          }

          chaveLote.add(chave);

          return {
            nome,
            email:
              email ||
              `${nome.toLowerCase().replace(/[^a-z0-9]/g, "") || "cliente"}@sem-email.local`,
            telefone,
            cpf,
            data_nascimento: dataNascNormalizada || undefined,
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
        toast.info("Nenhuma linha nova para importar. Tudo já estava cadastrado ou sem nome.");
        return;
      }

      const { error: insertError } = await supabase.from("clientes").insert(payload);
      if (insertError) throw insertError;

      await fetchClientes();
      toast.success(`Importação concluída: ${payload.length} clientes inseridos.`);
    } catch (importError: any) {
      console.error("Erro ao importar clientes:", importError);
      toast.error(
        `Erro ao importar clientes: ${importError?.message || "Falha desconhecida"}`
      );
    } finally {
      event.target.value = "";
    }
  };

  const comprasClienteHistorico = clienteHistorico
    ? comprasPorCliente.get(clienteHistorico.id) || null
    : null;
  const aniversarioClienteHistorico = clienteHistorico
    ? calcularInfoAniversario(
        clienteHistorico.data_nascimento || clienteHistorico.dataNascimento
      )
    : null;

  const temFiltroAplicado =
    Boolean(searchTerm.trim()) || filtroAtivo !== "todos" || ordenacao !== "cadastro";

  return (
    <div className="panel-shell space-y-4 pt-2 pb-8 transition-all duration-300">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-1">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white tracking-tight drop-shadow-sm">
            Clientes
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
            Base de clientes, último produto comprado e datas de nascimento ({estatisticas.total}{" "}
            {estatisticas.total === 1 ? "cadastrado" : "cadastrados"})
          </p>
        </div>

        <div className="scroll-row w-full sm:w-auto pb-1">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={handleImportFile}
            className="hidden"
          />
          <Button
            onClick={handleExport}
            disabled={clientes.length === 0}
            className="bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 hover:text-white font-semibold rounded-xl px-4 text-xs sm:text-sm border border-slate-700/80 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap h-10 shadow-sm"
          >
            <Download className="h-4 w-4 text-blue-400" />
            Exportar
          </Button>
          <Button
            onClick={handleOpenImport}
            className="bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 hover:text-white font-semibold rounded-xl px-4 text-xs sm:text-sm border border-slate-700/80 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap h-10 shadow-sm"
          >
            <Upload className="h-4 w-4 text-cyan-400" />
            Importar
          </Button>
          <Button
            onClick={abrirNovoCliente}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl px-4 text-xs sm:text-sm shadow-md shadow-cyan-950/30 flex items-center gap-2 border border-cyan-400/30 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap h-10"
          >
            <Plus className="h-4 w-4" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* Cards de resumo interativos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setFiltroAtivo("todos")}
          className={`text-left rounded-2xl p-4 border transition-all duration-200 backdrop-blur-md ${
            filtroAtivo === "todos"
              ? "bg-slate-900 border-cyan-500/50 shadow-md shadow-cyan-950/20"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Total de Clientes
            </span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{estatisticas.total}</p>
          <p className="text-xs text-slate-400 mt-0.5">{estatisticas.ativos} ativos na base</p>
        </button>

        <button
          type="button"
          onClick={() =>
            setFiltroAtivo((prev) => (prev === "com_compras" ? "todos" : "com_compras"))
          }
          className={`text-left rounded-2xl p-4 border transition-all duration-200 backdrop-blur-md ${
            filtroAtivo === "com_compras"
              ? "bg-slate-900 border-emerald-500/50 shadow-md shadow-emerald-950/20"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Com Compras
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {loadingVendas && estatisticas.comCompras === 0 ? "—" : estatisticas.comCompras}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {estatisticas.total > 0
              ? `${Math.round((estatisticas.comCompras / estatisticas.total) * 100)}% com histórico`
              : "Sem registros"}
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            setFiltroAtivo((prev) =>
              prev === "aniversariantes" ? "todos" : "aniversariantes"
            )
          }
          className={`text-left rounded-2xl p-4 border transition-all duration-200 backdrop-blur-md ${
            filtroAtivo === "aniversariantes"
              ? "bg-slate-900 border-amber-500/50 shadow-md shadow-amber-950/20"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Aniversariantes
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Cake className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-white tabular-nums">
              {estatisticas.aniversariantesMes}
            </p>
            {estatisticas.aniversariantesHoje > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 dark:text-amber-300 border border-amber-500/30">
                {estatisticas.aniversariantesHoje} hoje
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Neste mês</p>
        </button>

        <button
          type="button"
          onClick={() =>
            setFiltroAtivo((prev) =>
              prev === "sem_nascimento" ? "todos" : "sem_nascimento"
            )
          }
          className={`text-left rounded-2xl p-4 border transition-all duration-200 backdrop-blur-md ${
            filtroAtivo === "sem_nascimento"
              ? "bg-slate-900 border-sky-500/50 shadow-md shadow-sky-950/20"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Data de Nasc.
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {estatisticas.comNascimento}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {estatisticas.semNascimento > 0
              ? `${estatisticas.semNascimento} sem data`
              : "100% preenchidos"}
          </p>
        </button>
      </div>

      {/* Área Principal */}
      <GlassCard className="rounded-[2rem] p-4 sm:p-6">
        <div className="space-y-4">
          {/* Busca + Filtros + Ordenação */}
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, telefone, CPF, nascimento ou produto comprado..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-glass pl-10 pr-9 w-full"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Limpar busca"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex items-center">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                <select
                  value={ordenacao}
                  onChange={(e) => setOrdenacao(e.target.value as OrdenacaoClientes)}
                  aria-label="Ordenar clientes"
                  className="bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-2.5 text-xs sm:text-sm text-slate-200 focus:border-cyan-500 outline-none cursor-pointer h-10"
                >
                  <option value="cadastro">Cadastro recente</option>
                  <option value="ultima_compra">Última compra</option>
                  <option value="nome">Nome (A–Z)</option>
                  <option value="proximo_aniversario">Próximo aniversário</option>
                </select>
              </div>
            </div>
          </div>

          {/* Pílulas de filtro rápido */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: "todos", label: "Todos", count: estatisticas.total },
                  { id: "com_compras", label: "Com compras", count: estatisticas.comCompras },
                  {
                    id: "aniversariantes",
                    label: "Aniversariantes do mês",
                    count: estatisticas.aniversariantesMes,
                  },
                  {
                    id: "sem_nascimento",
                    label: "Sem data de nasc.",
                    count: estatisticas.semNascimento,
                  },
                ] as const
              ).map((pill) => {
                const ativo = filtroAtivo === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setFiltroAtivo(pill.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                      ativo
                        ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border-cyan-500/40"
                        : "bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <span>{pill.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                        ativo
                          ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-200"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>
                Mostrando <strong className="text-slate-200">{clientesFiltrados.length}</strong> de{" "}
                {estatisticas.total}
              </span>
              {temFiltroAplicado && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setFiltroAtivo("todos");
                    setOrdenacao("cadastro");
                  }}
                  className="text-cyan-500 dark:text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-2"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Lista de Clientes */}
          <div className="space-y-2.5">
            {clientesFiltrados.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 space-y-2">
                <Users className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-medium text-slate-300">
                  {clientes.length === 0
                    ? 'Nenhum cliente cadastrado ainda. Clique em "Novo Cliente" para começar.'
                    : "Nenhum cliente encontrado com os filtros atuais."}
                </p>
                {temFiltroAplicado && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      setFiltroAtivo("todos");
                      setOrdenacao("cadastro");
                    }}
                    className="text-xs text-cyan-500 dark:text-cyan-400 hover:text-cyan-300 font-semibold"
                  >
                    Limpar filtros e ver todos os clientes
                  </button>
                )}
              </div>
            ) : (
              clientesFiltrados.map(({ cliente, aniversario, compras }) => {
                const linkWhatsapp = montarLinkWhatsappCliente(
                  cliente.telefone,
                  cliente.nome,
                  Boolean(aniversario?.aniversarioHoje)
                );
                const temEmailReal = !emailEhPlaceholder(cliente.email);
                const enderecoCompleto = [
                  cliente.endereco,
                  cliente.cidade,
                  cliente.estado,
                  cliente.cep,
                ]
                  .filter(Boolean)
                  .join(" • ");

                return (
                  <div
                    key={cliente.id}
                    className={`rounded-2xl border p-3.5 sm:p-4 transition-all duration-200 ${
                      aniversario?.aniversarioHoje
                        ? "bg-amber-500/10 border-amber-500/40 hover:border-amber-400/60"
                        : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1.3fr)_minmax(0,0.85fr)_auto] gap-3.5 items-center">
                      {/* Coluna 1: Identidade e Contato */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${
                            aniversario?.aniversarioHoje
                              ? "bg-amber-500/20 text-amber-500 dark:text-amber-300 border-amber-500/40"
                              : "bg-slate-800 text-cyan-500 dark:text-cyan-300 border-slate-800"
                          }`}
                        >
                          {obterIniciaisCliente(cliente.nome)}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm sm:text-[15px] font-semibold text-white truncate">
                              {cliente.nome}
                            </h3>
                            <Badge
                              variant={cliente.ativo ? "default" : "secondary"}
                              className={
                                cliente.ativo
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0"
                                  : "bg-slate-800 text-slate-400 border border-slate-800 text-[10px] px-2 py-0"
                              }
                            >
                              {cliente.ativo ? "Ativo" : "Inativo"}
                            </Badge>
                            {aniversario?.aniversarioHoje && (
                              <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40 text-[10px] px-2 py-0 gap-1">
                                <Sparkles className="w-3 h-3" />
                                Aniversariante hoje!
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            {cliente.telefone && (
                              <span className="inline-flex items-center gap-1 text-slate-300">
                                <Phone className="w-3 h-3 text-cyan-500 dark:text-cyan-400 shrink-0" />
                                {cliente.telefone}
                              </span>
                            )}
                            {temEmailReal && (
                              <span className="inline-flex items-center gap-1 truncate max-w-[220px]">
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{cliente.email}</span>
                              </span>
                            )}
                            {cliente.cpf && (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                                <CreditCard className="w-3 h-3 text-slate-400 shrink-0" />
                                {cliente.cpf}
                              </span>
                            )}
                          </div>

                          {enderecoCompleto && (
                            <p className="text-[11px] text-slate-400 inline-flex items-center gap-1 max-w-full">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{enderecoCompleto}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Coluna 2: Último Produto Comprado */}
                      <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-2.5 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1">
                            <Smartphone className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />
                            Último produto comprado
                          </span>
                          {compras && compras.totalCompras > 0 && (
                            <button
                              type="button"
                              onClick={() => setClienteHistorico(cliente)}
                              className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-1.5 py-0.5 rounded-md transition-colors shrink-0"
                              title="Ver histórico completo de compras"
                            >
                              {compras.totalCompras}{" "}
                              {compras.totalCompras === 1 ? "compra" : "compras"}
                            </button>
                          )}
                        </div>

                        {loadingVendas && !compras ? (
                          <div className="space-y-1.5 py-0.5 animate-pulse">
                            <div className="h-3.5 bg-slate-800 rounded w-3/4" />
                            <div className="h-3 bg-slate-800/80 rounded w-1/2" />
                          </div>
                        ) : compras ? (
                          <div className="space-y-1">
                            <p
                              className="text-xs sm:text-sm font-semibold text-slate-100 truncate"
                              title={
                                compras.itensUltimaCompra.length > 0
                                  ? compras.itensUltimaCompra.join(" • ")
                                  : compras.ultimoProduto
                              }
                            >
                              {compras.ultimoProduto}
                            </p>
                            <div className="flex items-center gap-2.5 text-[11px] text-slate-400 flex-wrap">
                              {compras.dataUltimaCompra && (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  {formatarDataCurtaBR(compras.dataUltimaCompra)}
                                </span>
                              )}
                              {compras.valorUltimaCompra > 0 && (
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                  {formatarMoedaBRL(compras.valorUltimaCompra)}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic py-1">
                            Nenhuma compra registrada
                          </p>
                        )}
                      </div>

                      {/* Coluna 3: Data de Nascimento */}
                      <div
                        className={`rounded-xl border px-3 py-2.5 min-w-0 ${
                          aniversario?.aniversarioHoje
                            ? "bg-amber-500/10 border-amber-500/35"
                            : aniversario?.aniversarioNoMes
                              ? "bg-slate-900/80 border-amber-500/25"
                              : "bg-slate-900/80 border-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1">
                            <Cake
                              className={`w-3 h-3 ${
                                aniversario?.aniversarioNoMes
                                  ? "text-amber-500 dark:text-amber-400"
                                  : "text-slate-400"
                              }`}
                            />
                            Nascimento
                          </span>
                          {aniversario?.aniversarioNoMes && !aniversario.aniversarioHoje && (
                            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded-md">
                              Este mês
                            </span>
                          )}
                        </div>

                        {aniversario ? (
                          <div className="space-y-0.5">
                            <p className="text-xs sm:text-sm font-semibold text-slate-100 tabular-nums">
                              {aniversario.dataFormatada}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {aniversario.idade !== null ? `${aniversario.idade} anos` : "Data salva"}
                              {aniversario.aniversarioHoje
                                ? " • Faz aniversário hoje!"
                                : aniversario.diasParaAniversario !== null &&
                                    aniversario.diasParaAniversario <= 30
                                  ? ` • Em ${aniversario.diasParaAniversario} ${
                                      aniversario.diasParaAniversario === 1 ? "dia" : "dias"
                                    }`
                                  : ""}
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 py-0.5">
                            <span className="text-xs text-slate-400 italic">Não informada</span>
                            <button
                              type="button"
                              onClick={() => abrirEdicaoCliente(cliente, true)}
                              className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-300 transition-colors shrink-0"
                            >
                              + Informar
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Coluna 4: Ações rápidas */}
                      <div className="flex items-center justify-end gap-1.5 pt-1 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                        {linkWhatsapp && (
                          <a
                            href={linkWhatsapp}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={
                              aniversario?.aniversarioHoje
                                ? "Enviar parabéns no WhatsApp"
                                : "Conversar no WhatsApp"
                            }
                            className={`p-2 rounded-xl border transition-colors ${
                              aniversario?.aniversarioHoje
                                ? "bg-amber-500/15 border-amber-500/35 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25"
                                : "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                            }`}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}

                        {compras && compras.totalCompras > 0 && (
                          <button
                            type="button"
                            onClick={() => setClienteHistorico(cliente)}
                            title="Histórico de compras"
                            className="p-2 rounded-xl bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
                          >
                            <History className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => abrirEdicaoCliente(cliente)}
                          title="Editar cliente"
                          className="p-2 rounded-xl bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-blue-400 hover:border-blue-500/40 transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(cliente)}
                          title="Deletar cliente"
                          className="p-2 rounded-xl bg-slate-800/80 border border-slate-800 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:border-red-500/40 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {loading && !showForm && (
            <p className="text-xs text-slate-400 text-center py-2">Carregando clientes...</p>
          )}
        </div>
      </GlassCard>

      {/* Modal de Novo/Editar Cliente */}
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
                      Preencha os dados de contato, data de nascimento e endereço do cliente
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCancel}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Linha 1: Nome e Telefone */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Nome completo *
                    </label>
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
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Telefone / WhatsApp *
                    </label>
                    <input
                      type="tel"
                      name="telefone"
                      placeholder="(11) 99999-8888"
                      value={formData.telefone}
                      onChange={handleInputChange}
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Linha 2: Data de Nascimento, CPF e Email */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                      <Cake className="w-3.5 h-3.5 text-amber-400" />
                      Data de Nascimento
                    </label>
                    <input
                      ref={nascimentoInputRef}
                      type="date"
                      name="data_nascimento"
                      value={formData.data_nascimento}
                      onChange={handleInputChange}
                      max={new Date().toISOString().slice(0, 10)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-cyan-500 outline-none transition-all [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      CPF (opcional)
                    </label>
                    <input
                      type="text"
                      name="cpf"
                      placeholder="000.000.000-00"
                      value={formData.cpf}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Email (opcional)
                    </label>
                    <input
                      type="email"
                      name="email"
                      placeholder="joao@email.com"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Linha 3: Endereço */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Endereço (opcional)
                  </label>
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
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Cidade
                    </label>
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
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Estado
                    </label>
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
                    className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl text-xs sm:text-sm px-6 py-2.5 shadow-lg shadow-cyan-950/40 flex items-center gap-2 transition-all disabled:opacity-60"
                  >
                    {loading
                      ? "Salvando..."
                      : editingId
                        ? "Atualizar Cliente"
                        : "Salvar Cliente"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal de Histórico de Compras do Cliente */}
      {clienteHistorico && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-start p-2 sm:p-4 pt-4 sm:pt-10 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
            onClick={() => setClienteHistorico(null)}
          >
            <div
              className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 text-white relative shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-sm border border-cyan-500/30 shrink-0">
                    {obterIniciaisCliente(clienteHistorico.nome)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base sm:text-lg text-white truncate">
                      {clienteHistorico.nome}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                      {clienteHistorico.telefone && <span>{clienteHistorico.telefone}</span>}
                      {aniversarioClienteHistorico && (
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Cake className="w-3 h-3" />
                          {aniversarioClienteHistorico.dataFormatada}
                          {aniversarioClienteHistorico.idade !== null &&
                            ` (${aniversarioClienteHistorico.idade} anos)`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setClienteHistorico(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {comprasClienteHistorico && comprasClienteHistorico.historico.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3">
                      <span className="text-[11px] text-slate-400 block">Total de compras</span>
                      <span className="text-lg font-bold text-white tabular-nums">
                        {comprasClienteHistorico.totalCompras}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3">
                      <span className="text-[11px] text-slate-400 block">Total acumulado</span>
                      <span className="text-lg font-bold text-emerald-500 dark:text-emerald-400 tabular-nums">
                        {formatarMoedaBRL(comprasClienteHistorico.totalGasto)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                    {comprasClienteHistorico.historico.map((compra, index) => (
                      <div
                        key={compra.id}
                        className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {index === 0 && (
                                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                  Mais recente
                                </span>
                              )}
                              <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatarDataCurtaBR(compra.data) || "Data não informada"}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-white">
                              {compra.itens.length > 0 ? compra.itens.join(" • ") : compra.produto}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-emerald-400 tabular-nums">
                              {formatarMoedaBRL(compra.valor)}
                            </p>
                            <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              {formatarMetodoPagamento(compra.metodo)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6">
                  Este cliente ainda não possui compras registradas.
                </p>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setClienteHistorico(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs sm:text-sm transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
