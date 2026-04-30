"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Smartphone, X, Plus, Download, Edit2, Search, FileText, History, ArrowUpRight, List, Trash2 } from "lucide-react";
import { useAparelhos } from "@/hooks/useAparelhos";
import { useClientes } from "@/hooks/useClientes";
import { Aparelho } from "@/lib/db/types";
import { supabase } from "@/lib/supabaseClient";

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
  const [isMounted, setIsMounted] = useState(false);
  const [showNovoClientePopup, setShowNovoClientePopup] = useState(false);
  const [showSaidas, setShowSaidas] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierListText, setSupplierListText] = useState("");
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
    custo: "",
    descricao: "",
    cliente: "",
    clienteId: null as string | null,
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
    setIsMounted(true);
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

  const handleCustoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.replace(/\D/g, "");
    const custoNum = valor ? parseInt(valor) / 100 : 0;
    const vendaValor = valor ? String(Math.round((custoNum + 300) * 100)) : "";
    
    setFormData((prev) => ({
      ...prev,
      custo: valor,
      preco: valor ? vendaValor : prev.preco,
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
      preco: String(Math.round(aparelho.preco * 100)),
      custo: String(Math.round(((aparelho as any).custo || 0) * 100)),
      descricao: aparelho.descricao || "",
      cliente: aparelho.cliente || "",
      clienteId: aparelho.clienteId || null,
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
    const custoNumerico = formData.custo ? parseInt(formData.custo) / 100 : 0;

    if (editingId) {
      await atualizarAparelho(editingId, {
        ...formData,
        preco: precoNumerico,
        custo: custoNumerico,
        ativo: true,
      });
    } else {
      await criarAparelho({
        ...formData,
        preco: precoNumerico,
        custo: custoNumerico,
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

  const handleDeleteEstoque = async () => {
    if (aparelhos.length === 0) {
      alert("O estoque já está vazio.");
      return;
    }

    const currentLojaId = aparelhos[0].loja_id;

    const confirmacao = confirm("⚠️ ATENÇÃO: Isso apagará TODOS os aparelhos desta loja permanentemente. Esta ação não pode ser desfeita.\n\nDeseja continuar?");
    
    if (confirmacao) {
      try {
        const { error } = await supabase
          .from('aparelhos')
          .delete()
          .eq('loja_id', currentLojaId);

        if (error) throw error;

        alert("Estoque deletado com sucesso!");
        await fetchAparelhos();
      } catch (err: any) {
        console.error("Erro ao deletar estoque:", err);
        alert(`Erro ao deletar estoque: ${err.message}`);
      }
    }
  };

  const processarListaFornecedor = async () => {
    if (!supplierListText.trim()) return;

    // Captura o ID da loja atual a partir de um aparelho existente
    const currentLojaId = aparelhos.length > 0 ? aparelhos[0].loja_id : null;

    if (!currentLojaId) {
      alert("Erro: Não foi possível identificar o ID da loja. Cadastre ao menos um aparelho manualmente primeiro.");
      return;
    }

    const lines = supplierListText.split('\n');
    let currentBrand = "Apple";
    let currentModel = "";
    let currentCapacity = "";
    let currentCondition: "novo" | "seminovo" | "usado" | "danificado" = "seminovo";
    let pendingColors: string[] = [];
    
    // Objeto para agrupar preços: { "Marca|Modelo|Capacidade|Condicao|Cor": [preços] }
    const groupedData: Record<string, number[]> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Detectar seção
      if (line.toUpperCase().includes("NOVOS LACRADOS")) {
        currentCondition = "novo";
        continue;
      }
      if (line.toUpperCase().includes("SEMI NOVOS")) {
        currentCondition = "seminovo";
        continue;
      }

      // Detectar modelo e capacidade
      const modelMatch = line.match(/^[📲📱]\s*\*?([^*🇺🇸%]+)\*?/iu);
      if (modelMatch) {
        let fullModel = modelMatch[1].replace(/\*/g, '').trim();
        // Remove emojis remanescentes do nome do modelo para garantir que o cadastro fique limpo e compatível com o script
        fullModel = fullModel.replace(/\p{Extended_Pictographic}/gu, '').trim();
        const capMatch = fullModel.match(/(\d+\s*(?:GB|TB))/i);
        if (capMatch) {
          currentCapacity = capMatch[1].toUpperCase().replace(/\s/g, "");
          currentModel = fullModel.replace(capMatch[0], "").trim();
        } else {
          currentModel = fullModel;
          currentCapacity = "N/A";
        }
        pendingColors = []; // Reset colors for new model
        continue;
      }

      // Detectar cor em linha separada (ex: 🔵BLUE)
      const colorOnlyMatch = line.match(/^[\u26aa\u26ab\ud83d\udd35\ud83d\udfe0\ud83c\udf38\ud83d\udfe2\ud83d\udfe1\ud83d\udfe3\ud83d\udc2a\ud83d\udc2d\ud83d\udd18\ud83d\udfe4\ud83d\udfe5\ud83d\udfe6\ud83d\udfe7\ud83d\udfe8\ud83d\udfe9\ud83d\udfea\ud83d\udfeb]\s*([A-Z\s/]+)$/i);
      if (colorOnlyMatch && !line.match(/\d/)) {
        pendingColors.push(colorOnlyMatch[1].trim());
        continue;
      }

      // Detectar preço
      const priceMatch = line.match(/(?:💰|💵|R\$|[\u26aa\u26ab\ud83d\udd35\ud83d\udfe0\ud83c\udf38\ud83d\udfe2\ud83d\udfe1\ud83d\udfe3\ud83d\udc2a\ud83d\udc2d\ud83d\udd18])\s*(?:R\$)?\s*(?:\d+%\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d{3,})/i);
      
      if (priceMatch && currentModel) {
        let rawPrice = priceMatch[1].replace(/\./g, '').replace(',', '.');
        let costPrice = parseFloat(rawPrice);
        
        if (!isNaN(costPrice)) {
          // Clona as cores pendentes ou detecta a cor da linha
          const colorsToProcess = [...pendingColors];
          if (colorsToProcess.length === 0) {
            let detectedColor = "N/A";
            if (line.includes("⚫")) detectedColor = "Preto";
            else if (line.includes("⚪")) detectedColor = "Branco/Prata";
            else if (line.includes("🔵")) detectedColor = "Azul";
            else if (line.includes("🟡")) detectedColor = "Dourado/Amarelo";
            else if (line.includes("🔴")) detectedColor = "Vermelho";
            else if (line.includes("🟣")) detectedColor = "Roxo";
            else if (line.includes("🟢")) detectedColor = "Verde";
            else if (line.includes("🩷")) detectedColor = "Rosa";
            else if (line.includes("🩶")) detectedColor = "Cinza";
            else if (line.includes("🔘")) detectedColor = "Space Gray/Titanium";
            else if (line.includes("🐪")) detectedColor = "Desert/Natural";
            else if (line.includes("🏜️")) detectedColor = "Desert";
            colorsToProcess.push(detectedColor);
          }

          // Agrupa os preços por chave única
          for (const cor of colorsToProcess) {
            const key = `${currentBrand}|${currentModel}|${currentCapacity}|${currentCondition}|${cor}`;
            if (!groupedData[key]) groupedData[key] = [];
            groupedData[key].push(costPrice);
          }
          
          pendingColors = [];
        }
      }
    }

    // Função para calcular o preço representativo (Lógica do WhatsApp Engine)
    const getRepresentativePrice = (prices: number[]) => {
      if (prices.length === 0) return 0;
      const sortedPrices = [...prices].sort((a, b) => b - a);
      const counts: Record<number, number> = {};
      prices.forEach(p => counts[p] = (counts[p] || 0) + 1);
      const maxFreq = Math.max(...Object.values(counts));
      const modes = Object.keys(counts)
        .filter(p => counts[Number(p)] === maxFreq)
        .map(Number)
        .sort((a, b) => b - a);
      const bestMode = modes[0];

      if (maxFreq > 1) return bestMode;
      if (prices.length >= 3) {
        const topHalf = sortedPrices.slice(0, Math.ceil(prices.length / 2));
        return topHalf.reduce((a, b) => a + b, 0) / topHalf.length;
      }
      return sortedPrices[0];
    };

    const aparelhosParaCriar: any[] = [];
    for (const [key, prices] of Object.entries(groupedData)) {
      const [marca, modelo, capacidade, condicao, cor] = key.split('|');
      const representativePrice = getRepresentativePrice(prices);
      const finalPrice = representativePrice + 300;

      aparelhosParaCriar.push({
        loja_id: currentLojaId,
        marca,
        modelo,
        imei: "",
        numeroSerie: "",
        cor,
        capacidade,
        condicao,
        preco: finalPrice,
        custo: representativePrice,
        descricao: "",
        cliente: "",
        clienteId: null,
        acessorios: "",
        observacoes: `Importado via Lista em ${new Date().toLocaleDateString()} (Baseado em ${prices.length} itens)`,
        ativo: true
      });
    }

    if (aparelhosParaCriar.length === 0) {
      alert("Nenhum aparelho identificado na lista. Verifique o formato.");
      return;
    }

    if (confirm(`Identificados ${aparelhosParaCriar.length} modelos únicos por cor. Deseja cadastrar todos com margem de R$ 300,00?`)) {
      console.log("🚀 Iniciando cadastro em massa...", aparelhosParaCriar);

      try {
        // Realiza o insert de todos os aparelhos em uma única chamada ao banco
        const { error: bulkError } = await supabase
          .from('aparelhos')
          .insert(aparelhosParaCriar);

        if (bulkError) throw bulkError;

        alert(`Sucesso! ${aparelhosParaCriar.length} aparelhos foram cadastrados de uma vez.`);
      } catch (err: any) {
        console.error("❌ Erro no cadastro em massa:", err);
        alert(`Erro ao cadastrar: ${err.message || 'Erro desconhecido'}`);
      }

      setShowSupplierModal(false);
      setSupplierListText("");
      await fetchAparelhos();
    }
  };

  if (!isMounted) return null;

  const handleGenerateCertificate = async (aparelho: Aparelho) => {
    try {
      const certificadoHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Certificado - ${aparelho.marca} ${aparelho.modelo}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #fff; color: #333; }
            .container { padding: 40px; max-width: 800px; margin: 0 auto; border: 1px solid #eee; border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #5a67d8; padding-bottom: 20px; }
            .header h1 { color: #5a67d8; margin: 0; font-size: 32px; font-weight: bold; }
            .header p { color: #666; margin: 10px 0 0 0; font-size: 14px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .card { background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0; }
            .card-title { color: #5a67d8; font-weight: bold; margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; }
            .card-value { margin: 0; font-size: 18px; font-weight: bold; }
            .card-mono { font-family: 'Courier New', monospace; font-size: 16px; }
            .section { background: #f0f4ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #5a67d8; }
            .section-warning { background: #fef3c7; border-left-color: #f59e0b; }
            .section-warning .section-title { color: #d97706; }
            .section-title { color: #5a67d8; font-weight: bold; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; }
            .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; }
            .footer p { color: #999; margin: 5px 0; font-size: 12px; }
            @media print {
              body { background: white; padding: 0; }
              .container { padding: 20px; width: 100%; max-width: 100%; border: none; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📱 CERTIFICADO DO APARELHO</h1>
              <p>Documento de Registro e Autenticação</p>
            </div>

            <div class="grid">
              <div class="card">
                <p class="card-title">Marca</p>
                <p class="card-value">${aparelho.marca}</p>
              </div>
              <div class="card">
                <p class="card-title">Modelo</p>
                <p class="card-value">${aparelho.modelo}</p>
              </div>
              <div class="card">
                <p class="card-title">IMEI</p>
                <p class="card-value card-mono">${aparelho.imei || "Não informado"}</p>
              </div>
              <div class="card">
                <p class="card-title">Série</p>
                <p class="card-value card-mono">${aparelho.numeroSerie || "Não informado"}</p>
              </div>
              <div class="card">
                <p class="card-title">Cor</p>
                <p class="card-value">${aparelho.cor || "Não informado"}</p>
              </div>
              <div class="card">
                <p class="card-title">Capacidade</p>
                <p class="card-value">${aparelho.capacidade || "Não informado"}</p>
              </div>
              <div class="card">
                <p class="card-title">Condição</p>
                <p class="card-value">
                  ${aparelho.condicao === "novo" ? "🆕 Novo" : aparelho.condicao === "seminovo" ? "⭐ Seminovo" : aparelho.condicao === "usado" ? "♻️ Usado" : "⚠️ Danificado"}
                </p>
              </div>
              <div class="card">
                <p class="card-title">Valor</p>
                <p class="card-value">R$ ${aparelho.preco.toFixed(2).replace(".", ",")}</p>
              </div>
            </div>

            ${aparelho.descricao ? `
            <div class="section">
              <p class="section-title">Descrição</p>
              <p style="margin: 0; line-height: 1.6;">${aparelho.descricao}</p>
            </div>
            ` : ""}

            ${aparelho.cliente ? `
            <div class="section">
              <p class="section-title">Cliente Proprietário</p>
              <p style="margin: 0; font-size: 16px;">${aparelho.cliente}</p>
            </div>
            ` : ""}

            ${aparelho.acessorios ? `
            <div class="section">
              <p class="section-title">Acessórios Inclusos</p>
              <p style="margin: 0; line-height: 1.6;">${aparelho.acessorios}</p>
            </div>
            ` : ""}

            ${aparelho.observacoes ? `
            <div class="section section-warning">
              <p class="section-title">📝 Observações</p>
              <p style="margin: 0; line-height: 1.6;">${aparelho.observacoes}</p>
            </div>
            ` : ""}

            <div class="footer">
              <p>📅 Registrado em: ${new Date(aparelho.dataCadastro).toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" })}</p>
              <p>ID do Sistema: <span style="font-family: 'Courier New', monospace; background: #f8f9fa; padding: 2px 6px; border-radius: 4px;">${aparelho.id}</span></p>
              <p style="color: #5a67d8; margin: 10px 0 0 0; font-size: 11px; font-weight: bold; text-transform: uppercase;">Este é um documento de registro eletrônico autenticado</p>
            </div>
          </div>
          <script>window.onload = function() { window.print(); window.onafterprint = function(){ window.close(); } };</script>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(certificadoHtml);
        printWindow.document.close();
      } else {
        alert("Por favor, permita pop-ups para gerar o certificado.");
      }
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert("Erro ao gerar o documento.");
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
      custo: "",
      descricao: "",
      cliente: "",
      clienteId: null,
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
      <GlassCard className="rounded-3xl">
        <div className="pb-4 border-b border-white/10 mb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div>
                <h3 className="text-base sm:text-lg font-bold">Aparelhos Cadastrados</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Gerencie seus aparelhos e gere certificados ({aparelhos.length} total)
                </p>
              </div>
              <Button size="sm" onClick={() => setShowForm(!showForm)} className="sm:hidden flex items-center gap-1 shrink-0 ml-4">
                <Plus className="h-4 w-4" />
                Novo
              </Button>
            </div>
            <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <Button variant="destructive" onClick={() => setShowSaidas(true)} className="gap-2 shrink-0 whitespace-nowrap">
                <History className="h-4 w-4" /> Saídas
              </Button>
              <Button
                variant="outline"
                onClick={handleExportCSV}
                disabled={aparelhos.length === 0}
                className="shrink-0 whitespace-nowrap"
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
              <Button variant="outline" onClick={() => setShowSupplierModal(true)} className="gap-2 border-blue-500 text-blue-600 hover:bg-blue-50 shrink-0 whitespace-nowrap">
                <List className="h-4 w-4" /> Lista de Fornecedor
              </Button>
              <Button variant="outline" onClick={handleDeleteEstoque} className="gap-2 border-red-500 text-red-600 hover:bg-red-50 shrink-0 whitespace-nowrap">
                <Trash2 className="h-4 w-4" /> Deletar Estoque
              </Button>
              <Button onClick={() => setShowForm(!showForm)} className="hidden sm:flex shrink-0 whitespace-nowrap">
                <Plus className="mr-2 h-4 w-4" />
                Novo Aparelho
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
              placeholder="Buscar por marca, modelo, IMEI ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-glass pl-10"
            />
          </div>

          {/* Popup de Novo Cliente */}
          {showNovoClientePopup && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <GlassCard className="w-full max-w-md bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border-white/20 shadow-2xl overflow-hidden !p-0">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/10">
                  <h3 className="text-lg font-bold">Adicionar Novo Cliente</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowNovoClientePopup(false)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <div className="p-6">
                  <form onSubmit={handleNovoClienteSubmit} className="space-y-4">
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
                      className="input-glass"
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
                      className="input-glass"
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
                      className="input-glass"
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
                      className="input-glass"
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
                      className="input-glass"
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
                      className="input-glass"
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
                      className="input-glass"
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
                      className="input-glass"
                    />

                    <div className="flex gap-2 justify-end pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowNovoClientePopup(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Adicionar Cliente</Button>
                    </div>
                  </form>
                </div>
              </GlassCard>
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
                    <div className="text-sm font-semibold">
                      {condicaoEmoji(aparelho.condicao)} {aparelho.marca} {aparelho.modelo}
                      {aparelho.clienteId && (
                        <Badge variant="outline" className="ml-2 bg-yellow-50 text-yellow-700 border-yellow-200">
                          MANUTENÇÃO - {aparelho.cliente}
                        </Badge>
                      )}
                    </div>
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
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Custo: R$ {((aparelho as any).custo || 0).toFixed(2).replace(".", ",")}</p>
                      <Badge variant="default">
                        R$ {aparelho.preco.toFixed(2).replace(".", ",")}
                      </Badge>
                    </div>
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
        </div>
      </GlassCard>

      {/* Modal de Novo/Editar Aparelho */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-3xl bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border-white/20 shadow-2xl overflow-hidden !p-0 flex flex-col max-h-[95vh]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/10">
              <h3 className="text-lg font-bold">
                {editingId ? "Editar Aparelho" : "Cadastrar Novo Aparelho"}
              </h3>
              <Button variant="ghost" size="icon" onClick={handleCancel}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="p-6 overflow-y-auto">
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
                    className="input-glass"
                  />
                  <input
                    type="text"
                    name="modelo"
                    placeholder="Modelo *"
                    value={formData.modelo}
                    onChange={handleInputChange}
                    required
                    className="input-glass"
                  />
                </div>

                {/* Linha 2: IMEI e Série */}
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
                      className="input-glass"
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
                    className="input-glass"
                  />
                </div>

                {/* Linha 3: Cor e Capacidade */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    name="cor"
                    placeholder="Cor (ex: Preto, Branco) (opcional)"
                    value={formData.cor}
                    onChange={handleInputChange}
                    className="input-glass"
                  />
                  <select
                    name="capacidade"
                    value={formData.capacidade}
                    onChange={handleInputChange}
                    className="input-glass"
                  >
                    {romOptions.map((rom) => (
                      <option key={rom} value={rom}>
                        💾 {rom}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Linha 4: Condição e Preço */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground ml-1 uppercase">Condição</label>
                    <select
                      name="condicao"
                      value={formData.condicao}
                      onChange={handleInputChange}
                      className="input-glass"
                    >
                      <option value="novo">🆕 Novo</option>
                      <option value="seminovo">⭐ Seminovo</option>
                      <option value="usado">♻️ Usado</option>
                      <option value="danificado">⚠️ Danificado</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-blue-500 ml-1 uppercase">Preço de Custo</label>
                    <input
                      type="text"
                      name="custo"
                      placeholder="R$ 0,00"
                      value={formatarPreco(formData.custo)}
                      onChange={handleCustoChange}
                      className="input-glass"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-green-500 ml-1 uppercase">Preço de Venda</label>
                    <input
                      type="text"
                      name="preco"
                      placeholder="R$ 0,00"
                      value={formatarPreco(formData.preco)}
                      onChange={handlePrecoChange}
                      className="input-glass"
                    />
                  </div>
                </div>

                {/* Cliente */}
                <div className="flex gap-2">
                  <select
                    name="cliente"
                    value={formData.clienteId || ""}
                    onChange={(e) => {
                      const clienteSelecionado = clientes.find((c) => c.id === e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        clienteId: e.target.value,
                        cliente: clienteSelecionado?.nome || "",
                      }));
                    }}
                    className="input-glass flex-1"
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
                    size="icon"
                    onClick={() => setShowNovoClientePopup(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <textarea
                  name="descricao"
                  placeholder="Descrição do aparelho (opcional)"
                  value={formData.descricao}
                  onChange={handleInputChange}
                  rows={2}
                  className="input-glass"
                />

                <textarea
                  name="acessorios"
                  placeholder="Acessórios inclusos (opcional)"
                  value={formData.acessorios}
                  onChange={handleInputChange}
                  rows={2}
                  className="input-glass"
                />

                <textarea
                  name="observacoes"
                  placeholder="Observações adicionais (opcional)"
                  value={formData.observacoes}
                  onChange={handleInputChange}
                  rows={2}
                  className="input-glass"
                />

                <div className="flex gap-2 justify-end pt-4 border-t border-white/10">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                    {loading ? "Processando..." : editingId ? "Atualizar Aparelho" : "Salvar Aparelho"}
                  </Button>
                </div>

                {error && <p className="text-sm text-red-500 text-center">{error}</p>}
              </form>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Modal Lista de Fornecedor */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-2xl bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border-white/20 shadow-2xl overflow-hidden !p-0">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/10">
              <div>
                <h3 className="text-lg font-bold">Importar Lista de Fornecedor</h3>
                <p className="text-xs text-muted-foreground">Cole a lista abaixo. O sistema adicionará R$ 300,00 de margem automaticamente.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowSupplierModal(false)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                className="input-glass w-full h-96 font-mono text-xs"
                placeholder="Cole a lista aqui..."
                value={supplierListText}
                onChange={(e) => setSupplierListText(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowSupplierModal(false)}>Cancelar</Button>
                <Button onClick={processarListaFornecedor} className="bg-blue-600 hover:bg-blue-700" disabled={!supplierListText.trim()}>Processar e Cadastrar</Button>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Modal de Saídas */}
      {showSaidas && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-4xl max-h-[90vh] flex flex-col !p-0 rounded-[2.5rem] overflow-hidden">
            <div className="p-6 border-b border-white/10 flex flex-row items-center justify-between bg-white/10">
              <h3 className="text-lg font-bold flex items-center gap-2"><ArrowUpRight className="h-5 w-5 text-red-500" /> Histórico de Saídas</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowSaidas(false)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="overflow-y-auto p-6">
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
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
