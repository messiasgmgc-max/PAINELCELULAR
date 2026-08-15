"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { ModalPortal } from "@/components/ModalPortal";
import { Badge } from "@/components/ui/badge";
import { Smartphone, X, Plus, Download, Edit2, Search, FileText, History, ArrowUpRight, List, Trash2, ChevronDown, ChevronUp, FileSpreadsheet, MessageCircle, RotateCcw, RefreshCw } from "lucide-react";
import { useAparelhos } from "@/hooks/useAparelhos";
import { useClientes } from "@/hooks/useClientes";
import { Aparelho } from "@/lib/db/types";
import { supabase } from "@/lib/supabaseClient";
import { getAparelhoCodigo } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [showMercadoPhoneModal, setShowMercadoPhoneModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [mercadoPhoneText, setMercadoPhoneText] = useState("");
  const [mercadoPhoneMargem, setMercadoPhoneMargem] = useState("300");
  const [importingMercadoPhone, setImportingMercadoPhone] = useState(false);
  const [showOptionalFields, setShowOptionalFields] = useState(false);
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
    saudeBateria: "",
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

  useEffect(() => {
    const historicoSaidas = aparelhos
      .filter((aparelho: any) => aparelho.ativo === false)
      .map((aparelho: any) => {
        const matchBaixa = String(aparelho.observacoes || '').match(/BAIXA_ESTOQUE:([^:]+):(.*)$/m);
        return {
          ...aparelho,
          dataSaida: matchBaixa?.[1] || aparelho.dataCadastro,
          motivoSaida: matchBaixa?.[2] || 'Baixa de estoque',
        };
      })
      .sort((a, b) => new Date(b.dataSaida).getTime() - new Date(a.dataSaida).getTime());

    setSaidas(historicoSaidas);
  }, [aparelhos]);

  // Filtrar aparelhos por busca
  const aparelhosAtivos = aparelhos.filter((aparelho: any) => aparelho.ativo !== false);
  const aparelhosFiltrados = aparelhosAtivos.filter((aparelho) => {
    const cod = getAparelhoCodigo(aparelho).toLowerCase();
    const term = searchTerm.toLowerCase();
    return (
      aparelho.modelo.toLowerCase().includes(term) ||
      aparelho.marca.toLowerCase().includes(term) ||
      cod.includes(term) ||
      aparelho.imei?.includes(searchTerm) ||
      aparelho.numeroSerie?.includes(searchTerm) ||
      aparelho.cliente?.toLowerCase().includes(term)
    );
  });

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
    setShowOptionalFields(true);
    setFormData({
      marca: aparelho.marca,
      modelo: aparelho.modelo,
      imei: aparelho.imei || "",
      numeroSerie: aparelho.numeroSerie || "",
      cor: aparelho.cor || "",
      capacidade: aparelho.capacidade || "64GB",
      condicao: aparelho.condicao,
      saudeBateria: (aparelho as any).saude_bateria || (aparelho as any).saudeBateria || "",
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

  // Extrai o modelo e a cor exata do iPhone sem separar Pro ou Pro Max
  const extractIphoneModelAndColor = (str: string): { modelo: string; cor: string } => {
    const cleanStr = str.replace(/[\s\u00A0\u200B\u200E]+/g, ' ').trim();

    const modelPatterns = [
      // Geração 17
      { regex: /\b17\s*pro\s*max\b/i, name: 'iPhone 17 Pro Max' },
      { regex: /\b17\s*pro\b/i, name: 'iPhone 17 Pro' },
      { regex: /\b17\s*plus\b/i, name: 'iPhone 17 Plus' },
      { regex: /\b17\s*e\b/i, name: 'iPhone 17e' },
      { regex: /\b17e\b/i, name: 'iPhone 17e' },
      { regex: /\b17\b/i, name: 'iPhone 17' },

      // Geração 16
      { regex: /\b16\s*pro\s*max\b/i, name: 'iPhone 16 Pro Max' },
      { regex: /\b16\s*pro\b/i, name: 'iPhone 16 Pro' },
      { regex: /\b16\s*plus\b/i, name: 'iPhone 16 Plus' },
      { regex: /\b16\s*e\b/i, name: 'iPhone 16e' },
      { regex: /\b16e\b/i, name: 'iPhone 16e' },
      { regex: /\b16\b/i, name: 'iPhone 16' },

      // Geração 15
      { regex: /\b15\s*pro\s*max\b/i, name: 'iPhone 15 Pro Max' },
      { regex: /\b15\s*pro\b/i, name: 'iPhone 15 Pro' },
      { regex: /\b15\s*plus\b/i, name: 'iPhone 15 Plus' },
      { regex: /\b15\s*e\b/i, name: 'iPhone 15e' },
      { regex: /\b15e\b/i, name: 'iPhone 15e' },
      { regex: /\b15\b/i, name: 'iPhone 15' },

      // Geração 14
      { regex: /\b14\s*pro\s*max\b/i, name: 'iPhone 14 Pro Max' },
      { regex: /\b14\s*pro\b/i, name: 'iPhone 14 Pro' },
      { regex: /\b14\s*plus\b/i, name: 'iPhone 14 Plus' },
      { regex: /\b14\b/i, name: 'iPhone 14' },

      // Geração 13
      { regex: /\b13\s*pro\s*max\b/i, name: 'iPhone 13 Pro Max' },
      { regex: /\b13\s*pro\b/i, name: 'iPhone 13 Pro' },
      { regex: /\b13\s*mini\b/i, name: 'iPhone 13 Mini' },
      { regex: /\b13\b/i, name: 'iPhone 13' },

      // Geração 12
      { regex: /\b12\s*pro\s*max\b/i, name: 'iPhone 12 Pro Max' },
      { regex: /\b12\s*pro\b/i, name: 'iPhone 12 Pro' },
      { regex: /\b12\s*mini\b/i, name: 'iPhone 12 Mini' },
      { regex: /\b12\b/i, name: 'iPhone 12' },

      // Geração 11
      { regex: /\b11\s*pro\s*max\b/i, name: 'iPhone 11 Pro Max' },
      { regex: /\b11\s*pro\b/i, name: 'iPhone 11 Pro' },
      { regex: /\b11\b/i, name: 'iPhone 11' },

      // Outros modelos Apple
      { regex: /\bse\s*3\b/i, name: 'iPhone SE 3' },
      { regex: /\bse\s*2\b/i, name: 'iPhone SE 2' },
      { regex: /\bse\b/i, name: 'iPhone SE' },
      { regex: /\bxr\b/i, name: 'iPhone XR' },
      { regex: /\bxs\s*max\b/i, name: 'iPhone XS Max' },
      { regex: /\bxs\b/i, name: 'iPhone XS' },
      { regex: /\bx\b/i, name: 'iPhone X' },
      { regex: /\b8\s*plus\b/i, name: 'iPhone 8 Plus' },
      { regex: /\b8\b/i, name: 'iPhone 8' },
      { regex: /\b7\s*plus\b/i, name: 'iPhone 7 Plus' },
      { regex: /\b7\b/i, name: 'iPhone 7' },
    ];

    for (const p of modelPatterns) {
      if (p.regex.test(cleanStr)) {
        const rest = cleanStr.replace(p.regex, '').replace(/iphone/gi, '').trim();
        return {
          modelo: p.name,
          cor: rest || 'Padrão'
        };
      }
    }

    return {
      modelo: `iPhone ${cleanStr.split(' ')[0] || 'Genérico'}`,
      cor: cleanStr.split(' ').slice(1).join(' ') || 'Padrão'
    };
  };

  // Utilitário para interpretar lista exportada do MercadoPhone
  const parseMercadoPhoneList = (rawText: string, margemAdicional: number) => {
    const lines = rawText.split('\n');
    const aparelhosFormatados: any[] = [];

    for (let rawLine of lines) {
      // Normalização inicial de espaços em branco não-quebráveis (como vindos do WhatsApp/MercadoPhone)
      let line = rawLine.replace(/[\s\u00A0\u200B\u200E]+/g, ' ').trim();
      if (!line) continue;

      // 1. Extrair ID existente (ex: | ID: 9410244)
      let idEtiqueta: string | null = null;
      const matchId = line.match(/\|\s*ID:\s*(\d+)/i) || line.match(/ID:\s*(\d+)/i);
      if (matchId) {
        idEtiqueta = matchId[1];
        line = line.replace(matchId[0], '').trim();
      } else {
        // Gera um ID numérico de 7 dígitos caso não exista na etiqueta
        idEtiqueta = String(Math.floor(1000000 + Math.random() * 9000000));
      }

      // Remover Emojis e símbolos iniciais (NÃO remover dígitos do modelo como 11, 12, 16, 17!)
      line = line.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s=+\-*•∙]+/gu, '').trim();
      if (!line) continue;

      // 2. Extração de Sufixo / Código / Serial após o hífen (-)
      let mainPart = line;
      let sufixoSerial = '';
      if (line.includes('-')) {
        const parts = line.split('-');
        mainPart = parts[0].trim();
        sufixoSerial = parts.slice(1).join('-').trim();
      }

      // 3. Extrair Saúde de Bateria (%) ou indicação de Lacrado
      let bateria = '';
      let condicao: "novo" | "seminovo" = "seminovo";
      if (mainPart.toLowerCase().includes('lacrado') || sufixoSerial.toLowerCase().includes('lacrado') || rawLine.toLowerCase().includes('lacrado')) {
        condicao = "novo";
        bateria = "100% (Lacrado)";
        mainPart = mainPart.replace(/lacrado/gi, '').trim();
      } else {
        const matchBat = mainPart.match(/(\d{2,3})%/);
        if (matchBat) {
          bateria = `${matchBat[1]}%`;
          mainPart = mainPart.replace(matchBat[0], '').trim();
        }
      }

      // 4. Extrair Capacidade (ex: 256gb, 128GB, 512gb, 1TB)
      let capacidade = '128GB';
      const matchRom = mainPart.match(/\b(\d+gb|\d+tb)\b/i);
      if (matchRom) {
        capacidade = matchRom[1].toUpperCase();
        mainPart = mainPart.replace(matchRom[0], '').trim();
      }

      // 5. Extrair Valor de Custo (se houver indicação explícita de valor R$)
      let custoNumerico = 0;
      const matchCustoExplicit = mainPart.match(/R\$\s*([\d\.,]+)/i);
      if (matchCustoExplicit) {
        custoNumerico = parseFloat(matchCustoExplicit[1].replace(/\./g, '').replace(',', '.'));
        mainPart = mainPart.replace(matchCustoExplicit[0], '').trim();
      }

      // 6. Identificar Modelo e Cor usando o extrator dedicado imune a espaços especiais
      const { modelo, cor: corExtraida } = extractIphoneModelAndColor(mainPart);

      // 7. Extrair Observações (ex: "msg bateria", "msgdegradada", "TRASEIRA DIEGO", "detalhe", "tela trocada", etc.)
      let observacoesPartes: string[] = [];

      // A) Se no sufixoSerial houver texto além dos 4 dígitos do IMEI (ex: "5039 TRASEIRA DIEGO" ou "5877 msg bateria")
      if (sufixoSerial) {
        const matchSerialWithObs = sufixoSerial.match(/^([A-Za-z0-9]{3,6})\s+(.+)$/);
        if (matchSerialWithObs) {
          sufixoSerial = matchSerialWithObs[1];
          const obsTxt = matchSerialWithObs[2].trim();
          if (obsTxt) observacoesPartes.push(obsTxt);
        }
      }

      // B) Identificar palavras-chave de observações no modelo/cor/linha
      const regexObsKeywords = /\b(msg\s*degradada|msgdegradada|msg\s*bateria|msgbateria|msg\s*bat|msg\s*tela|msg\s*camera|msg\s*peça|msg\s*peca|traseira\s*[\w\s]*|tampa\s*[\w\s]*|tela\s*trocada|trincad[oa]|detalhe|face\s*id\s*off)\b/gi;

      const matchesObsCor = corExtraida.match(regexObsKeywords);
      if (matchesObsCor) {
        matchesObsCor.forEach(obs => {
          if (!observacoesPartes.includes(obs.trim())) {
            observacoesPartes.push(obs.trim());
          }
        });
      }

      const matchesObsMain = mainPart.match(regexObsKeywords);
      if (matchesObsMain) {
        matchesObsMain.forEach(obs => {
          if (!observacoesPartes.includes(obs.trim())) {
            observacoesPartes.push(obs.trim());
          }
        });
      }

      // Limpar a COR removendo as observações identificadas
      let corFinal = corExtraida;
      observacoesPartes.forEach(obs => {
        corFinal = corFinal.replace(new RegExp(obs, 'gi'), '');
      });
      const cor = corFinal.replace(/lacrado/gi, '').replace(/\b\d+%\b/g, '').trim() || 'Padrão';
      const observacoes = observacoesPartes.join(' | ');

      const precoVenda = custoNumerico > 0 ? custoNumerico + margemAdicional : margemAdicional;

      aparelhosFormatados.push({
        raw: rawLine,
        idEtiqueta,
        marca: 'Apple',
        modelo,
        capacidade,
        cor,
        condicao,
        bateria,
        sufixoSerial,
        observacoes,
        custo: custoNumerico,
        preco: precoVenda,
      });
    }

    return aparelhosFormatados;
  };

  const handleProcessMercadoPhoneList = async () => {
    const margem = parseFloat(mercadoPhoneMargem) || 0;
    const itens = parseMercadoPhoneList(mercadoPhoneText, margem);

    if (itens.length === 0) {
      toast.error('Nenhum aparelho válido identificado. Verifique o texto colado.');
      return;
    }

    setImportingMercadoPhone(true);
    const toastId = toast.loading(`Processando ${itens.length} aparelhos...`);

    try {
      const { data: aparelhosExistentes, error: searchError } = await supabase
        .from('aparelhos')
        .select('*')
        .eq('loja_id', currentLojaId || usuario?.lojaId);

      if (searchError) console.warn('Erro ao buscar existentes:', searchError);

      const existentes = aparelhosExistentes || aparelhos || [];
      let novosCadastrados = 0;
      let existentesAtualizados = 0;

      for (const item of itens) {
        // Busca equivalente existente no banco por Código, ID de Etiqueta, IMEI ou Número de Série
        const existente = existentes.find(a => {
          const cod = getAparelhoCodigo(a);
          if (item.idEtiqueta && cod && (cod === item.idEtiqueta || cod.endsWith(item.idEtiqueta) || item.idEtiqueta.endsWith(cod))) return true;
          if (item.sufixoSerial && a.imei && (a.imei === item.sufixoSerial || a.imei.endsWith(item.sufixoSerial))) return true;
          if (item.idEtiqueta && a.numeroSerie && a.numeroSerie === item.idEtiqueta) return true;
          if (item.idEtiqueta && a.observacoes && a.observacoes.includes(item.idEtiqueta)) return true;
          return false;
        });

        const idEtiquetaFinal = existente ? getAparelhoCodigo(existente) : item.idEtiqueta;
        const obsString = [
          item.observacoes ? `Obs: ${item.observacoes}` : '',
          `ID: ${idEtiquetaFinal}`,
          item.bateria ? `Bateria: ${item.bateria}` : '',
          item.sufixoSerial ? `IMEI: ${item.sufixoSerial}` : ''
        ].filter(Boolean).join(' | ');

        if (existente) {
          const updatePayload: any = {
            modelo: item.modelo,
            capacidade: item.capacidade,
            cor: item.cor,
            condicao: item.condicao,
            preco: item.preco,
            custo: item.custo > 0 ? item.custo : existente.custo,
            observacoes: obsString,
            ativo: true,
          };
          if (item.bateria) {
            updatePayload.saudeBateria = item.bateria;
            updatePayload.saude_bateria = item.bateria;
          }

          const { error: updateErr } = await supabase
            .from('aparelhos')
            .update(updatePayload)
            .eq('id', existente.id);

          if (updateErr) {
            delete updatePayload.saudeBateria;
            delete updatePayload.saude_bateria;
            await supabase.from('aparelhos').update(updatePayload).eq('id', existente.id);
          }
          existentesAtualizados++;
        } else {
          await criarAparelho({
            marca: item.marca,
            modelo: item.modelo,
            imei: item.sufixoSerial || idEtiquetaFinal,
            numeroSerie: idEtiquetaFinal,
            codigo: idEtiquetaFinal,
            cor: item.cor,
            capacidade: item.capacidade,
            condicao: item.condicao,
            saudeBateria: item.bateria || '',
            preco: String(item.preco),
            custo: String(item.custo),
            descricao: item.raw,
            cliente: '',
            clienteId: null,
            acessorios: '',
            observacoes: obsString,
            ativo: true,
          } as any);
          novosCadastrados++;
        }
      }

      toast.success(`🚀 Pronto! ${novosCadastrados} novos cadastrados, ${existentesAtualizados} atualizados.`, { id: toastId });
      await fetchAparelhos();
      setShowMercadoPhoneModal(false);
      setMercadoPhoneText("");
    } catch (error: any) {
      console.error("Erro ao importar MercadoPhone:", error);
      toast.error(`Erro ao importar: ${error.message || 'Falha no processamento'}`, { id: toastId });
    } finally {
      setImportingMercadoPhone(false);
    }
  };

  const handleRemontarEstoqueMercadoPhone = async () => {
    const margem = parseFloat(mercadoPhoneMargem) || 0;
    const itensImportados = parseMercadoPhoneList(mercadoPhoneText, margem);

    if (itensImportados.length === 0) {
      toast.error('Nenhum aparelho válido identificado no texto.');
      return;
    }

    setImportingMercadoPhone(true);
    const toastId = toast.loading(`Remontando estoque (${itensImportados.length} aparelhos)...`);

    try {
      const { data: aparelhosDoBanco, error: fetchErr } = await supabase
        .from('aparelhos')
        .select('*')
        .eq('loja_id', currentLojaId || usuario?.lojaId);

      if (fetchErr) console.warn('Aviso ao buscar banco:', fetchErr);

      const ativosAtuais = (aparelhosDoBanco || aparelhos || []).filter(a => a.ativo !== false && a.condicao !== 'vendido' && (a as any).status !== 'vendido');

      const ativosMantidosIds = new Set<string>();
      let novosInseridos = 0;
      let atualizados = 0;

      for (const item of itensImportados) {
        const equivalente = ativosAtuais.find(a => {
          const cod = getAparelhoCodigo(a);
          if (item.idEtiqueta && cod && (cod === item.idEtiqueta || cod.endsWith(item.idEtiqueta) || item.idEtiqueta.endsWith(cod))) return true;
          if (item.sufixoSerial && a.imei && (a.imei === item.sufixoSerial || a.imei.endsWith(item.sufixoSerial))) return true;
          if (item.idEtiqueta && a.numeroSerie && a.numeroSerie === item.idEtiqueta) return true;
          if (item.idEtiqueta && a.observacoes && a.observacoes.includes(item.idEtiqueta)) return true;
          return false;
        });

        const idEtiquetaFinal = equivalente ? getAparelhoCodigo(equivalente) : item.idEtiqueta;
        const obsString = [
          item.observacoes ? `Obs: ${item.observacoes}` : '',
          `ID: ${idEtiquetaFinal}`,
          item.bateria ? `Bateria: ${item.bateria}` : '',
          item.sufixoSerial ? `IMEI: ${item.sufixoSerial}` : ''
        ].filter(Boolean).join(' | ');

        if (equivalente) {
          ativosMantidosIds.add(equivalente.id);
          const updatePayload: any = {
            modelo: item.modelo,
            capacidade: item.capacidade,
            cor: item.cor,
            condicao: item.condicao,
            preco: item.preco,
            custo: item.custo > 0 ? item.custo : equivalente.custo,
            observacoes: obsString,
            ativo: true,
          };
          if (item.bateria) {
            updatePayload.saudeBateria = item.bateria;
            updatePayload.saude_bateria = item.bateria;
          }

          const { error: updateErr } = await supabase
            .from('aparelhos')
            .update(updatePayload)
            .eq('id', equivalente.id);

          if (updateErr) {
            delete updatePayload.saudeBateria;
            delete updatePayload.saude_bateria;
            await supabase.from('aparelhos').update(updatePayload).eq('id', equivalente.id);
          }
          atualizados++;
        } else {
          await criarAparelho({
            marca: item.marca,
            modelo: item.modelo,
            imei: item.sufixoSerial || idEtiquetaFinal,
            numeroSerie: idEtiquetaFinal,
            codigo: idEtiquetaFinal,
            cor: item.cor,
            capacidade: item.capacidade,
            condicao: item.condicao,
            saudeBateria: item.bateria || '',
            preco: String(item.preco),
            custo: String(item.custo),
            descricao: item.raw,
            cliente: '',
            clienteId: null,
            acessorios: '',
            observacoes: obsString,
            ativo: true,
          } as any);
          novosInseridos++;
        }
      }

      const aparelhosParaDarBaixa = ativosAtuais.filter(a => !ativosMantidosIds.has(a.id));
      let baixados = 0;

      if (aparelhosParaDarBaixa.length > 0) {
        const idsBaixa = aparelhosParaDarBaixa.map(a => a.id);
        const { error: baixaErr } = await supabase
          .from('aparelhos')
          .update({
            ativo: false,
            condicao: 'vendido',
          })
          .in('id', idsBaixa);

        if (!baixaErr) {
          baixados = idsBaixa.length;
        }
      }

      toast.success(`⚡ Estoque Remontado com Sucesso! ${novosInseridos} novos cadastrados, ${atualizados} atualizados e ${baixados} marcados como vendidos.`, { id: toastId });
      await fetchAparelhos();
      setShowMercadoPhoneModal(false);
      setMercadoPhoneText("");
    } catch (error: any) {
      console.error("Erro ao remontar estoque:", error);
      toast.error(`Erro ao remontar estoque: ${error.message || 'Falha no processamento'}`, { id: toastId });
    } finally {
      setImportingMercadoPhone(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.marca || !formData.modelo) {
      alert("Preencha marca e modelo!");
      return;
    }

    const precoNumerico = formData.preco ? parseInt(formData.preco) / 100 : 0;
    const custoNumerico = formData.custo ? parseInt(formData.custo) / 100 : 0;

    const payload = {
      ...formData,
      preco: precoNumerico,
      custo: custoNumerico,
      saude_bateria: formData.saudeBateria,
      saudeBateria: formData.saudeBateria,
      ativo: true,
    };

    if (editingId) {
      await atualizarAparelho(editingId, payload);
    } else {
      await criarAparelho(payload);
    }

    handleCancel();
    await fetchAparelhos();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja deletar este aparelho?")) {
      const sucesso = await deletarAparelho(id);
      if (sucesso) {
        alert("Aparelho removido do estoque com sucesso.");
      }
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

  // ── Exportar Lista WhatsApp ──
  const handleExportWhatsApp = () => {
    if (aparelhosAtivos.length === 0) {
      toast.error("Nenhum aparelho em estoque para exportar!");
      return;
    }

    const condicaoLabel = (c: string) => {
      switch (c) {
        case "novo": return "NOVO";
        case "seminovo": return "SEMI";
        case "usado": return "USADO";
        case "danificado": return "AVARIA";
        default: return c.toUpperCase();
      }
    };

    const formatPreco = (v: number) =>
      v > 0
        ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "";

    // Agrupa por modelo
    const grupos: Record<string, typeof aparelhosAtivos> = {};
    aparelhosAtivos.forEach((a) => {
      const chave = `${a.marca} ${a.modelo}`.trim();
      if (!grupos[chave]) grupos[chave] = [];
      grupos[chave].push(a);
    });

    const hoje = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });

    let texto = `📱 *ESTOQUE — ${hoje}*\n`;
    texto += `_${aparelhosAtivos.length} aparelho(s) disponível(is)_\n`;
    texto += `${"-".repeat(30)}\n\n`;

    Object.entries(grupos).forEach(([modelo, itens]) => {
      texto += `*${modelo}* (${itens.length})\n`;
      itens.forEach((a) => {
        // ID / etiqueta: usa numeroSerie ou IMEI (últimos 4) ou id curto
        const etiqueta = a.numeroSerie
          ? a.numeroSerie.slice(-6).toUpperCase()
          : a.imei
          ? a.imei.slice(-4)
          : a.id.slice(0, 6).toUpperCase();

        const partes: string[] = [];
        partes.push(`🔖 *${etiqueta}*`);
        if (a.capacidade) partes.push(a.capacidade);
        if (a.cor && a.cor.toLowerCase() !== "padrão") partes.push(a.cor);
        partes.push(`[${condicaoLabel(a.condicao)}]`);
        if (a.preco > 0) partes.push(formatPreco(a.preco));

        // Observações relevantes (bateria, acessórios etc.)
        const obs: string[] = [];
        if (a.observacoes) {
          const bateriaMatch = a.observacoes.match(/(\d+)%\s*bat/i);
          if (bateriaMatch) obs.push(`🔋 ${bateriaMatch[1]}%`);
          // outras obs curtas
          const outrasObs = a.observacoes
            .replace(/BAIXA_ESTOQUE:[^|]+/g, "")
            .replace(/\d+%\s*bat[a-z]*/gi, "")
            .split("|")
            .map((o) => o.trim())
            .filter((o) => o.length > 0 && o.length < 40);
          obs.push(...outrasObs.slice(0, 2));
        }

        texto += `  ${partes.join(" · ")}${obs.length ? " — " + obs.join(" | ") : ""}\n`;
      });
      texto += "\n";
    });

    texto += `${"-".repeat(30)}\n`;
    texto += `✅ *Consulte disponibilidade antes de confirmar*`;

    // Copia para clipboard
    navigator.clipboard.writeText(texto)
      .then(() => toast.success("Lista copiada! Cole no WhatsApp 📋", { duration: 4000 }))
      .catch(() => {
        // Fallback: abre em nova aba como texto
        const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `estoque_whatsapp_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Lista baixada como arquivo .txt!");
      });
  };

  const handleDeleteEstoque = async () => {
    if (aparelhosAtivos.length === 0) {
      alert("O estoque já está vazio.");
      return;
    }

    const currentLojaId = (aparelhosAtivos[0] as any).loja_id || aparelhosAtivos[0].lojaId;

    const confirmacao = confirm("⚠️ ATENÇÃO: Isso removerá do estoque todos os aparelhos ativos desta loja. Aparelhos com histórico vinculado serão apenas baixados para preservar as OS.\n\nDeseja continuar?");

    if (confirmacao) {
      try {
        const { error } = await supabase
          .from('aparelhos')
          .delete()
          .eq('loja_id', currentLojaId)
          .neq('ativo', false);

        if (error) {
          const observacaoBaixa = `BAIXA_ESTOQUE:${new Date().toISOString()}:Baixa em massa do estoque para preservar histórico.`;
          const { error: updateError } = await supabase
            .from('aparelhos')
            .update({
              ativo: false,
              observacoes: observacaoBaixa,
            })
            .eq('loja_id', currentLojaId)
            .neq('ativo', false);

          if (updateError) throw updateError;
          alert("Estoque baixado com sucesso. Os aparelhos com histórico foram preservados como saídas.");
        } else {
          alert("Estoque deletado com sucesso!");
        }

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
    const currentLojaId = aparelhos.length > 0 ? ((aparelhos[0] as any).loja_id || aparelhos[0].lojaId) : null;

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
      const assinaturaEmpresaUrl = `${window.location.origin}/assinatura-nota.png`;
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
            .signature-block { margin: 0 auto 16px auto; width: fit-content; text-align: center; }
            .signature-holder { height: 56px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
            .signature-image { max-width: 180px; max-height: 64px; object-fit: contain; display: block; }
            .signature-label { color: #5a67d8; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
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
              <div class="signature-block">
                <div class="signature-holder">
                  <img src="${assinaturaEmpresaUrl}" alt="Assinatura da loja" class="signature-image" onerror="this.style.display='none'" />
                </div>
                <div class="signature-label">Autenticação da Loja</div>
              </div>
              <p>📅 Registrado em: ${new Date(aparelho.dataCadastro).toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" })}</p>
              <p>ID do Sistema: <span style="font-family: 'Courier New', monospace; background: #f8f9fa; padding: 2px 6px; border-radius: 4px;">${aparelho.id}</span></p>
              <p style="color: #5a67d8; margin: 10px 0 0 0; font-size: 11px; font-weight: bold; text-transform: uppercase;">Este é um documento de registro eletrônico autenticado</p>
            </div>
          </div>
          <script>window.onload = function() { document.documentElement.style.colorScheme = 'light'; window.print(); window.onafterprint = function(){ window.close(); } };</script>
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
    setShowOptionalFields(false);
    setFormData({
      marca: "",
      modelo: "",
      imei: "",
      numeroSerie: "",
      cor: "",
      capacidade: "64GB",
      condicao: "seminovo",
      saudeBateria: "",
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
    <div className="panel-shell space-y-4">
      <GlassCard className="rounded-3xl">
        <div className="pb-4 border-b border-white/10 mb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-bold">Aparelhos Cadastrados</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Gerencie seus aparelhos e gere certificados ({aparelhosAtivos.length} em estoque)
                </p>
              </div>
            </div>
            <div className="scroll-row w-full pb-1">
              <Button onClick={() => setShowForm(!showForm)} className="btn-ios shrink-0 whitespace-nowrap flex items-center gap-1.5 h-9 px-4 text-sm">
                <Plus className="h-4 w-4" />
                Novo Aparelho
              </Button>
              <Button variant="destructive" onClick={() => setShowSaidas(true)} className="gap-2 shrink-0 whitespace-nowrap h-9">
                <History className="h-4 w-4" /> Saídas
              </Button>
              {/* Dropdown Exportar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={aparelhosAtivos.length === 0}
                    className="whitespace-nowrap h-9 gap-1.5 shrink-0 border-white/20 hover:bg-white/10"
                  >
                    <Download className="h-4 w-4 text-blue-400" />
                    Exportar
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-slate-900 border border-white/20 text-slate-100 p-1.5 rounded-2xl shadow-2xl backdrop-blur-xl z-[1000]">
                  <DropdownMenuItem
                    onClick={handleExportCSV}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-white/10 focus:bg-white/10 cursor-pointer text-slate-200"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Exportar CSV</div>
                      <div className="text-[10px] text-slate-400">Planilha completa do estoque</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10 my-1" />
                  <DropdownMenuItem
                    onClick={handleExportWhatsApp}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-white/10 focus:bg-white/10 cursor-pointer text-slate-200"
                  >
                    <MessageCircle className="h-4 w-4 text-green-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Lista WhatsApp</div>
                      <div className="text-[10px] text-slate-400">Copia formatada para enviar no grupo</div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" onClick={() => setShowSupplierModal(true)} className="gap-2 border-blue-500 text-blue-600 hover:bg-blue-50 shrink-0 whitespace-nowrap h-9">
                <List className="h-4 w-4" /> Lista Fornecedor
              </Button>
              <Button variant="outline" onClick={() => setShowMercadoPhoneModal(true)} className="gap-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-400 shrink-0 whitespace-nowrap h-9">
                <Download className="h-4 w-4" /> Lista MP
              </Button>
              <Button variant="outline" onClick={handleDeleteEstoque} className="gap-2 border-red-500 text-red-600 hover:bg-red-50 shrink-0 whitespace-nowrap h-9">
                <Trash2 className="h-4 w-4" /> Deletar Estoque
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
            <ModalPortal>
              <div className="modal-overlay modal-overlay-fit">
                <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full">
                  <div className="modal-header">
                    <h3 className="modal-title">Adicionar Novo Cliente</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowNovoClientePopup(false)}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="modal-body">
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
            </ModalPortal>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-md shrink-0">
                        ID: {getAparelhoCodigo(aparelho)}
                      </span>
                      <div className="text-sm font-semibold">
                        {condicaoEmoji(aparelho.condicao)} {aparelho.marca} {aparelho.modelo}
                        {aparelho.clienteId && (
                          <Badge variant="outline" className="ml-2 bg-yellow-50 text-yellow-700 border-yellow-200">
                            MANUTENÇÃO - {aparelho.cliente}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground pt-1">
                      {aparelho.cor && <span>🎨 {aparelho.cor}</span>}
                      {aparelho.capacidade && <span>💾 {aparelho.capacidade}</span>}
                      {((aparelho as any).saude_bateria || (aparelho as any).saudeBateria) && (
                        <span className="text-emerald-400 font-semibold">🔋 Bateria: {(aparelho as any).saude_bateria || (aparelho as any).saudeBateria}</span>
                      )}
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
        <ModalPortal>
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto">
            <div className="bg-slate-900/98 border border-white/20 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative my-auto animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-blue-400" />
                  {editingId ? "Editar Aparelho" : "Cadastrar Novo Aparelho"}
                </h3>
                <Button variant="ghost" size="icon" onClick={handleCancel} className="text-slate-400 hover:text-white rounded-full">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Linha 1: Marca e Modelo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Marca *</label>
                    <input
                      type="text"
                      name="marca"
                      placeholder="Ex: Apple"
                      value={formData.marca}
                      onChange={handleInputChange}
                      required
                      className="input-glass w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Modelo *</label>
                    <input
                      type="text"
                      name="modelo"
                      placeholder="Ex: iPhone 11 Pro Max"
                      value={formData.modelo}
                      onChange={handleInputChange}
                      required
                      className="input-glass w-full"
                    />
                  </div>
                </div>

                {/* Linha 2: IMEI e Série */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">IMEI (opcional)</label>
                    <input
                      type="text"
                      name="imei"
                      placeholder="15 dígitos máx"
                      value={formData.imei}
                      onChange={handleIMEIChange}
                      maxLength={15}
                      inputMode="numeric"
                      className="input-glass w-full"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      {formData.imei.length}/15 dígitos
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Número de Série (opcional)</label>
                    <input
                      type="text"
                      name="numeroSerie"
                      placeholder="Ex: F17C..."
                      value={formData.numeroSerie}
                      onChange={handleInputChange}
                      className="input-glass w-full"
                    />
                  </div>
                </div>

                {/* Linha 3: Condição, Saúde Bateria, Custo e Venda */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">Condição</label>
                    <select
                      name="condicao"
                      value={formData.condicao}
                      onChange={handleInputChange}
                      className="input-glass w-full"
                    >
                      <option value="novo">🆕 Novo</option>
                      <option value="seminovo">⭐ Seminovo</option>
                      <option value="usado">♻️ Usado</option>
                      <option value="danificado">⚠️ Danificado</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-emerald-400 uppercase block mb-1">Bateria (%)</label>
                    <input
                      type="text"
                      name="saudeBateria"
                      placeholder="Ex: 85% ou 100"
                      value={formData.saudeBateria}
                      onChange={handleInputChange}
                      className="input-glass w-full font-bold text-emerald-400 placeholder:font-normal placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-blue-400 uppercase block mb-1">Custo</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      name="custo"
                      placeholder="R$ 0,00"
                      value={formatarPreco(formData.custo)}
                      onChange={handleCustoChange}
                      className="input-glass w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-green-400 uppercase block mb-1">Venda</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      name="preco"
                      placeholder="R$ 0,00"
                      value={formatarPreco(formData.preco)}
                      onChange={handlePrecoChange}
                      className="input-glass w-full font-bold text-green-400"
                    />
                  </div>
                </div>

                {/* Cliente */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Cliente Proprietário (Manutenção/Venda)</label>
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
                      className="rounded-xl border-white/20"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <button
                    type="button"
                    onClick={() => setShowOptionalFields((prev) => !prev)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-slate-300"
                  >
                    <span>Campos Opcionais (Cor, Capacidade, Descrição, Acessórios)</span>
                    {showOptionalFields ? <ChevronUp className="h-4 w-4 text-blue-400" /> : <ChevronDown className="h-4 w-4 text-blue-400" />}
                  </button>

                  {showOptionalFields && (
                    <div className="mt-3 space-y-3 pt-3 border-t border-white/10">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">Cor</label>
                          <input
                            type="text"
                            name="cor"
                            placeholder="Ex: Preto, Azul, Branco"
                            value={formData.cor}
                            onChange={handleInputChange}
                            className="input-glass w-full"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">Capacidade</label>
                          <select
                            name="capacidade"
                            value={formData.capacidade}
                            onChange={handleInputChange}
                            className="input-glass w-full"
                          >
                            {romOptions.map((rom) => (
                              <option key={rom} value={rom}>
                                💾 {rom}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Descrição</label>
                        <textarea
                          name="descricao"
                          placeholder="Descrição do aparelho..."
                          value={formData.descricao}
                          onChange={handleInputChange}
                          rows={2}
                          className="input-glass w-full"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Acessórios Inclusos</label>
                        <textarea
                          name="acessorios"
                          placeholder="Ex: Capinha, Película, Carregador..."
                          value={formData.acessorios}
                          onChange={handleInputChange}
                          rows={2}
                          className="input-glass w-full"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Observações Internas</label>
                        <textarea
                          name="observacoes"
                          placeholder="Observações de garantia ou detalhes..."
                          value={formData.observacoes}
                          onChange={handleInputChange}
                          rows={2}
                          className="input-glass w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
                  <Button type="button" variant="outline" onClick={handleCancel} className="rounded-xl">
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 font-bold rounded-xl shadow-lg shadow-blue-500/20">
                    {loading ? "Processando..." : editingId ? "Atualizar Aparelho" : "Salvar Aparelho"}
                  </Button>
                </div>

                {error && <p className="text-sm text-red-400 text-center font-medium">{error}</p>}
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Lista de Fornecedor */}
      {showSupplierModal && (
        <ModalPortal>
          <div className="modal-overlay modal-overlay-fit">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-lg w-full">
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">Importar Lista de Fornecedor</h3>
                  <p className="modal-subtitle">Cole a lista abaixo. O sistema adicionará R$ 300,00 de margem automaticamente.</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowSupplierModal(false)}><X className="h-5 w-5" /></Button>
              </div>
              <div className="modal-body space-y-4">
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
        </ModalPortal>
      )}

      {/* Modal Importar MercadoPhone */}
      {showMercadoPhoneModal && (
        <ModalPortal>
          <div className="modal-overlay modal-overlay-fit">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-xl w-full my-4">
              <div className="modal-header">
                <h3 className="modal-title text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Smartphone className="h-5 w-5" /> Importar Aparelhos (Formato MercadoPhone)
                </h3>
                <Button variant="ghost" size="icon" onClick={() => setShowMercadoPhoneModal(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="modal-body-scroll">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                        Cole as linhas da lista abaixo:
                      </label>
                      <textarea
                        className="input-glass w-full h-64 font-mono text-xs p-3 leading-relaxed border-emerald-500/30 resize-none"
                        placeholder="Cole aqui as linhas como:&#10;🔵 17 Pro Max 256gb Azul Lacrado - 2605&#10;🏜️ 16 Pro Max 256gb Desert 97% - 5177 | ID: 9410244&#10;🌸 15 128GB Rosa 90% MSG TELA - 8193 | ID: 9563370..."
                        value={mercadoPhoneText}
                        onChange={(e) => setMercadoPhoneText(e.target.value)}
                      />
                    </div>

                    <div className="space-y-4 bg-emerald-50/30 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-500/20">
                      <h4 className="font-bold text-sm text-emerald-700 dark:text-emerald-300">Configuração de Valores</h4>

                      <div>
                        <label className="text-xs font-medium block mb-1">Margem / Preço Inicial Padrão (R$)</label>
                        <input
                          type="number"
                          value={mercadoPhoneMargem}
                          onChange={(e) => setMercadoPhoneMargem(e.target.value)}
                          placeholder="300"
                          className="input-glass text-sm font-bold"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Adicionada ao valor do custo de cada aparelho ou usada como valor padrão.
                        </p>
                      </div>

                      <div className="p-3 bg-white/40 dark:bg-black/30 rounded-xl border border-emerald-500/20">
                        <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                          📊 Aparelhos Detectados: <span className="font-bold text-base">{parseMercadoPhoneList(mercadoPhoneText, parseFloat(mercadoPhoneMargem) || 0).length}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Pré-visualização da Lista Interpretada */}
                  {mercadoPhoneText.trim() && (
                    <div className="mt-4 border border-white/10 rounded-2xl overflow-hidden bg-black/20">
                      <div className="p-3 bg-white/5 border-b border-white/10 font-bold text-xs flex justify-between items-center">
                        <span>Pré-visualização dos Aparelhos Interpretados</span>
                        <Badge variant="outline" className="text-emerald-500 border-emerald-500">
                          {parseMercadoPhoneList(mercadoPhoneText, parseFloat(mercadoPhoneMargem) || 0).length} itens
                        </Badge>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-white/5 text-xs font-mono">
                        {parseMercadoPhoneList(mercadoPhoneText, parseFloat(mercadoPhoneMargem) || 0).map((item, idx) => (
                          <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-white/5 gap-3">
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-emerald-500">ID: {item.idEtiqueta}</span>
                              <span className="ml-2 font-semibold text-white">{item.modelo}</span>
                              <span className="ml-2 text-muted-foreground">{item.capacidade}</span>
                              <span className="ml-2 text-blue-400">{item.cor}</span>
                              {item.bateria && <span className="ml-2 text-amber-400 font-bold">[{item.bateria}]</span>}
                              {item.observacoes && <span className="ml-2 text-purple-400 font-semibold">(Obs: {item.observacoes})</span>}
                              {item.sufixoSerial && <span className="ml-2 text-gray-400">({item.sufixoSerial})</span>}
                            </div>
                            <Badge variant={item.condicao === 'novo' ? 'default' : 'secondary'} className="text-[10px]">
                              {item.condicao === 'novo' ? 'Lacrado' : 'Seminovo'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 justify-end pt-4 border-t border-white/10">
                    <Button variant="outline" onClick={() => setShowMercadoPhoneModal(false)}>Cancelar</Button>
                    <Button
                      onClick={handleRemontarEstoqueMercadoPhone}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 gap-1.5 shadow-lg shadow-blue-500/20"
                      disabled={!mercadoPhoneText.trim() || importingMercadoPhone}
                    >
                      <RotateCcw className="w-4 h-4" />
                      {importingMercadoPhone ? 'Remontando...' : 'Atualizar Estoque por esta Lista'}
                    </Button>
                    <Button
                      onClick={handleProcessMercadoPhoneList}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 shadow-lg shadow-emerald-500/20"
                      disabled={!mercadoPhoneText.trim() || importingMercadoPhone}
                    >
                      {importingMercadoPhone ? 'Processando...' : `Confirmar e Cadastrar no Estoque`}
                    </Button>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        </ModalPortal>
      )}

      {/* Modal de Saídas */}
      {showSaidas && (
        <ModalPortal>
          <div className="modal-overlay modal-overlay-fit">
            <GlassCard className="modal-panel modal-panel-fit modal-panel-xl modal-panel-tall w-full flex flex-col">
              <div className="modal-header">
                <h3 className="modal-title flex items-center gap-2"><ArrowUpRight className="h-5 w-5 text-red-500" /> Histórico de Saídas</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowSaidas(false)}><X className="h-5 w-5" /></Button>
              </div>
              <div className="modal-body-scroll overflow-x-auto">
                <div className="divide-y min-w-[720px]">
                  {saidas.length === 0 ? (
                    <p className="p-8 text-center text-muted-foreground">Nenhuma saída registrada.</p>
                  ) : (
                    saidas.map((item, idx) => (
                      <div key={idx} className="p-4 flex justify-between items-start gap-6 hover:bg-muted/50 min-w-full">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{item.marca} {item.modelo}</p>
                          <p className="text-xs text-muted-foreground">IMEI: {item.imei || 'N/A'}</p>
                          <p className="text-xs text-red-600 font-medium mt-1 break-words">Motivo: {item.motivoSaida}</p>
                        </div>
                        <div className="text-right shrink-0 min-w-[180px]">
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
        </ModalPortal>
      )}
    </div>
  );
}
