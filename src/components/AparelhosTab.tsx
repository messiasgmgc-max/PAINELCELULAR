"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { ModalPortal } from "@/components/ModalPortal";
import { Badge } from "@/components/ui/badge";
import { Smartphone, X, Plus, Download, Edit2, Search, FileText, History, ArrowUpRight, List, Trash2, ChevronDown, ChevronUp, FileSpreadsheet, MessageCircle, RotateCcw, RefreshCw, ShieldCheck, Package, ShoppingBag, Sparkles, Layers, Headphones, Tag, Settings } from "lucide-react";
import { ConferenciaEstoqueModal } from "@/components/ConferenciaEstoqueModal";
import { EditarValoresAtacadoModal } from "@/components/EditarValoresAtacadoModal";
import { BackupEstoqueModal, salvarSnapshotBackup } from "@/components/BackupEstoqueModal";
import { MarcarVendidoModal } from "@/components/MarcarVendidoModal";
import { EditarVendaRegistroModal, VendaEditavelData } from "@/components/EditarVendaRegistroModal";
import { useAparelhos } from "@/hooks/useAparelhos";
import { useClientes } from "@/hooks/useClientes";
import { useAuth } from "@/hooks/useAuth";
import { Aparelho } from "@/lib/db/types";
import { supabase } from "@/lib/supabaseClient";
import { getAparelhoCodigo, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AparelhosTab() {
  const { usuario } = useAuth();
  const { aparelhos, loading, error, fetchAparelhos, criarAparelho, atualizarAparelho, deletarAparelho } = useAparelhos();
  const { clientes, fetchClientes, criarCliente } = useClientes();
  const [showForm, setShowForm] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState<'todos' | 'aparelho' | 'perfume' | 'acessorio' | 'outro'>('todos');
  const [showConferenciaModal, setShowConferenciaModal] = useState(false);
  const [showAtacadoModal, setShowAtacadoModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [aparelhoParaVenda, setAparelhoParaVenda] = useState<Aparelho | null>(null);
  const [saidaParaEditar, setSaidaParaEditar] = useState<VendaEditavelData | null>(null);
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
    categoria: "aparelho" as "aparelho" | "perfume" | "acessorio" | "outro",
    marca: "",
    modelo: "",
    imei: "",
    numeroSerie: "",
    cor: "",
    capacidade: "64GB" as string,
    tamanho_ml: "100ml",
    tipo_perfume: "Eau de Parfum",
    tipo_acessorio: "Capinha",
    quantidade: "1",
    condicao: "seminovo" as "novo" | "seminovo" | "usado" | "danificado",
    saudeBateria: "",
    preco: "",
    precoAtacado: "",
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
        const obs = String(aparelho.observacoes || '');
        const matchBaixa = obs.match(/BAIXA_ESTOQUE:(\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?):([\s\S]*?)(?:\||$)/i)
          || obs.match(/BAIXA_ESTOQUE:([^:]+(?::\d{2}(?::\d{2})?(?:\.\d+)?(?:Z)?)?):(.*)$/i)
          || obs.match(/BAIXA_ESTOQUE:([^:]+):(.*)$/i);

        let dataSaida = matchBaixa?.[1] || aparelho.dataCadastro || new Date().toISOString();
        if (/^\d{4}-\d{2}-\d{2}T\d{1,2}$/.test(dataSaida)) {
          dataSaida += ':00:00';
        }

        return {
          ...aparelho,
          dataSaida,
          motivoSaida: matchBaixa?.[2] || 'Baixa de estoque',
        };
      })
      .sort((a, b) => new Date(b.dataSaida).getTime() - new Date(a.dataSaida).getTime());

    setSaidas(historicoSaidas);
  }, [aparelhos]);

  // Contagens por categoria de estoque
  const contagens = useMemo(() => {
    const ativos = aparelhos.filter((a: any) => a.ativo !== false && a.condicao !== 'vendido' && (a as any).status !== 'vendido');
    return {
      todos: ativos.length,
      aparelhos: ativos.filter((a: any) => !a.categoria || a.categoria === 'aparelho').length,
      perfumes: ativos.filter((a: any) => a.categoria === 'perfume').length,
      acessorios: ativos.filter((a: any) => a.categoria === 'acessorio').length,
      outros: ativos.filter((a: any) => a.categoria === 'outro').length,
    };
  }, [aparelhos]);

  // Filtrar aparelhos ativos em estoque (excluindo vendidos e baixados)
  const aparelhosAtivos = useMemo(() => {
    return aparelhos.filter((aparelho: any) => {
      if (aparelho.ativo === false) return false;
      if (aparelho.condicao === 'vendido' || (aparelho as any).status === 'vendido') return false;
      if (categoriaFiltro !== 'todos') {
        const cat = aparelho.categoria || 'aparelho';
        if (cat !== categoriaFiltro) return false;
      }
      return true;
    });
  }, [aparelhos, categoriaFiltro]);

  const aparelhosFiltrados = aparelhosAtivos.filter((aparelho) => {
    const cod = (getAparelhoCodigo(aparelho) || '').toLowerCase();
    const term = (searchTerm || '').toLowerCase();
    const modeloStr = String(aparelho?.modelo || '').toLowerCase();
    const marcaStr = String(aparelho?.marca || '').toLowerCase();
    const imeiStr = String(aparelho?.imei || '');
    const numSerieStr = String(aparelho?.numeroSerie || '');
    const clienteStr = String(aparelho?.cliente || '').toLowerCase();

    return (
      modeloStr.includes(term) ||
      marcaStr.includes(term) ||
      cod.includes(term) ||
      imeiStr.includes(searchTerm) ||
      numSerieStr.includes(searchTerm) ||
      clienteStr.includes(term)
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

  const handlePrecoAtacadoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.replace(/\D/g, "");
    setFormData((prev) => ({
      ...prev,
      precoAtacado: valor,
    }));
  };

  const handleCustoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.replace(/\D/g, "");
    const custoNum = valor ? parseInt(valor) / 100 : 0;
    const vendaValor = valor ? String(Math.round((custoNum + 300) * 100)) : "";
    const atacadoValor = valor ? String(Math.round((custoNum + 150) * 100)) : "";

    setFormData((prev) => ({
      ...prev,
      custo: valor,
      preco: valor ? vendaValor : prev.preco,
      precoAtacado: valor ? atacadoValor : prev.precoAtacado,
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
      categoria: (aparelho as any).categoria || "aparelho",
      marca: aparelho.marca || "",
      modelo: aparelho.modelo || "",
      imei: aparelho.imei || "",
      numeroSerie: aparelho.numeroSerie || "",
      cor: aparelho.cor || "",
      capacidade: aparelho.capacidade || "64GB",
      tamanho_ml: (aparelho as any).tamanho_ml || aparelho.capacidade || "100ml",
      tipo_perfume: (aparelho as any).tipo_perfume || "Eau de Parfum",
      tipo_acessorio: (aparelho as any).tipo_acessorio || "Capinha",
      quantidade: String((aparelho as any).quantidade || 1),
      condicao: aparelho.condicao,
      saudeBateria: (aparelho as any).saude_bateria || (aparelho as any).saudeBateria || "",
      preco: String(Math.round(aparelho.preco * 100)),
      precoAtacado: (aparelho as any).precoAtacado ? String(Math.round(((aparelho as any).precoAtacado || 0) * 100)) : "",
      custo: String(Math.round(((aparelho as any).custo || 0) * 100)),
      descricao: aparelho.descricao || "",
      cliente: aparelho.cliente || "",
      clienteId: aparelho.clienteId || null,
      acessorios: aparelho.acessorios || "",
      observacoes: aparelho.observacoes || "",
    });
    setShowForm(true);
  };

  // Extrator universal de marcas, modelos e cores (iPhones, MacBooks, PS5, Xbox, iPads, Android, etc.)
  const extractAparelhoBrandModelAndColor = (str: string) => {
    let cleanStr = str.replace(/[\s\u00A0\u200B\u200E]+/g, ' ').trim();

    // 1. MACBOOKS & NOTEBOOKS (Apple)
    if (/\bmacbook\b/i.test(cleanStr) || /\bmac\s*book\b/i.test(cleanStr)) {
      const matchMac = cleanStr.match(/\b(macbook\s*(?:pro|air)?(?:\s*(?:m1|m2|m3|m4)(?:\s*(?:pro|max))?|\s*\d{2,2}")?)\b/i);
      const modelo = matchMac ? matchMac[0].replace(/\bmacbook\b/i, 'MacBook').trim() : 'MacBook';
      const cor = cleanStr.replace(matchMac ? matchMac[0] : /macbook/gi, '').replace(/\bapple\b/gi, '').trim() || 'Padrão';
      return { marca: 'Apple', modelo, cor };
    }

    // 2. IPADS / TABLETS (Apple / Samsung)
    if (/\bipad\b/i.test(cleanStr)) {
      const matchIpad = cleanStr.match(/\b(ipad\s*(?:pro|air|mini)?(?:\s*\d{1,2})?(?:\s*geração|\s*gen)?)\b/i);
      const modelo = matchIpad ? matchIpad[0].replace(/\bipad\b/i, 'iPad').trim() : 'iPad';
      const cor = cleanStr.replace(matchIpad ? matchIpad[0] : /ipad/gi, '').replace(/\bapple\b/gi, '').trim() || 'Padrão';
      return { marca: 'Apple', modelo, cor };
    }

    // 3. APPLE WATCH (Apple)
    if (/\bwatch\b/i.test(cleanStr) || /\bapple\s*watch\b/i.test(cleanStr)) {
      const matchWatch = cleanStr.match(/\b(apple\s*watch\s*(?:ultra\s*2|ultra|series\s*\d|se)?)\b/i) || cleanStr.match(/\b(watch\s*(?:ultra\s*2|ultra|series\s*\d|se)?)\b/i);
      const modelo = matchWatch ? matchWatch[0].replace(/\bwatch\b/i, 'Watch').trim() : 'Apple Watch';
      const cor = cleanStr.replace(matchWatch ? matchWatch[0] : /watch/gi, '').replace(/\bapple\b/gi, '').trim() || 'Padrão';
      return { marca: 'Apple', modelo: modelo.startsWith('Apple') ? modelo : `Apple ${modelo}`, cor };
    }

    // 4. AIRPODS & FONES (Apple)
    if (/\bairpods\b/i.test(cleanStr) || /\bairpod\b/i.test(cleanStr)) {
      const matchPods = cleanStr.match(/\b(airpods\s*(?:pro\s*2|pro|max|\d)?)\b/i);
      const modelo = matchPods ? matchPods[0] : 'AirPods';
      const cor = cleanStr.replace(matchPods ? matchPods[0] : /airpods/gi, '').replace(/\bapple\b/gi, '').trim() || 'Branco';
      return { marca: 'Apple', modelo: `Apple ${modelo}`, cor };
    }

    // 5. CONSOLES DE VIDEO GAME (Sony PS5/PS4, Microsoft Xbox, Nintendo Switch)
    if (/\b(ps5|ps4|playstation)\b/i.test(cleanStr)) {
      const matchPs = cleanStr.match(/\b(playstation\s*5\s*(?:slim|pro|digital)?|ps5\s*(?:slim|pro|digital)?|playstation\s*4\s*(?:slim|pro)?|ps4\s*(?:slim|pro)?)\b/i);
      const modelo = matchPs ? matchPs[0].toUpperCase().replace('PLAYSTATION', 'PlayStation') : 'PlayStation 5';
      const cor = cleanStr.replace(matchPs ? matchPs[0] : /ps5|ps4|playstation/gi, '').replace(/\bsony\b/gi, '').trim() || 'Branco';
      return { marca: 'Sony', modelo, cor };
    }

    if (/\bxbox\b/i.test(cleanStr)) {
      const matchXbox = cleanStr.match(/\b(xbox\s*(?:series\s*x|series\s*s|one\s*s|one\s*x|one)?)\b/i);
      const modelo = matchXbox ? matchXbox[0].replace(/xbox/i, 'Xbox') : 'Xbox';
      const cor = cleanStr.replace(matchXbox ? matchXbox[0] : /xbox/gi, '').replace(/\bmicrosoft\b/gi, '').trim() || 'Padrão';
      return { marca: 'Microsoft', modelo, cor };
    }

    if (/\b(nintendo|switch)\b/i.test(cleanStr)) {
      const matchSwitch = cleanStr.match(/\b(nintendo\s*switch\s*(?:oled|lite)?|switch\s*(?:oled|lite)?)\b/i);
      const modelo = matchSwitch ? matchSwitch[0].replace(/nintendo/i, 'Nintendo').replace(/switch/i, 'Switch') : 'Nintendo Switch';
      const cor = cleanStr.replace(matchSwitch ? matchSwitch[0] : /nintendo|switch/gi, '').trim() || 'Padrão';
      return { marca: 'Nintendo', modelo, cor };
    }

    // 6. ANDROID (Samsung, Xiaomi/Redmi/Poco, Motorola)
    if (/\b(samsung|galaxy)\b/i.test(cleanStr)) {
      const matchSam = cleanStr.match(/\b(galaxy\s*[a-z0-9\s+]+)\b/i);
      const modelo = matchSam ? matchSam[0] : 'Galaxy';
      const cor = cleanStr.replace(matchSam ? matchSam[0] : /samsung|galaxy/gi, '').trim() || 'Padrão';
      return { marca: 'Samsung', modelo: modelo.startsWith('Galaxy') ? modelo : `Galaxy ${modelo}`, cor };
    }

    if (/\b(xiaomi|redmi|poco)\b/i.test(cleanStr)) {
      const matchXio = cleanStr.match(/\b((?:redmi\s*note|redmi|poco|xiaomi)\s*[a-z0-9\s+]+)\b/i);
      const modelo = matchXio ? matchXio[0] : 'Xiaomi';
      const cor = cleanStr.replace(matchXio ? matchXio[0] : /xiaomi|redmi|poco/gi, '').trim() || 'Padrão';
      return { marca: 'Xiaomi', modelo, cor };
    }

    if (/\b(motorola|moto)\b/i.test(cleanStr)) {
      const matchMoto = cleanStr.match(/\b((?:moto|edge)\s*[a-z0-9\s+]+)\b/i);
      const modelo = matchMoto ? matchMoto[0] : 'Motorola';
      const cor = cleanStr.replace(matchMoto ? matchMoto[0] : /motorola|moto/gi, '').trim() || 'Padrão';
      return { marca: 'Motorola', modelo, cor };
    }

    // 7. IPHONES (Gerações 7 a 17)
    const iphonePatterns = [
      { regex: /\b17\s*pro\s*max\b/i, name: 'iPhone 17 Pro Max' },
      { regex: /\b17\s*pro\b/i, name: 'iPhone 17 Pro' },
      { regex: /\b17\s*plus\b/i, name: 'iPhone 17 Plus' },
      { regex: /\b17\s*e\b/i, name: 'iPhone 17e' },
      { regex: /\b17e\b/i, name: 'iPhone 17e' },
      { regex: /\b17\b/i, name: 'iPhone 17' },

      { regex: /\b16\s*pro\s*max\b/i, name: 'iPhone 16 Pro Max' },
      { regex: /\b16\s*pro\b/i, name: 'iPhone 16 Pro' },
      { regex: /\b16\s*plus\b/i, name: 'iPhone 16 Plus' },
      { regex: /\b16\s*e\b/i, name: 'iPhone 16e' },
      { regex: /\b16e\b/i, name: 'iPhone 16e' },
      { regex: /\b16\b/i, name: 'iPhone 16' },

      { regex: /\b15\s*pro\s*max\b/i, name: 'iPhone 15 Pro Max' },
      { regex: /\b15\s*pro\b/i, name: 'iPhone 15 Pro' },
      { regex: /\b15\s*plus\b/i, name: 'iPhone 15 Plus' },
      { regex: /\b15\s*e\b/i, name: 'iPhone 15e' },
      { regex: /\b15e\b/i, name: 'iPhone 15e' },
      { regex: /\b15\b/i, name: 'iPhone 15' },

      { regex: /\b14\s*pro\s*max\b/i, name: 'iPhone 14 Pro Max' },
      { regex: /\b14\s*pro\b/i, name: 'iPhone 14 Pro' },
      { regex: /\b14\s*plus\b/i, name: 'iPhone 14 Plus' },
      { regex: /\b14\b/i, name: 'iPhone 14' },

      { regex: /\b13\s*pro\s*max\b/i, name: 'iPhone 13 Pro Max' },
      { regex: /\b13\s*pro\b/i, name: 'iPhone 13 Pro' },
      { regex: /\b13\s*mini\b/i, name: 'iPhone 13 Mini' },
      { regex: /\b13\b/i, name: 'iPhone 13' },

      { regex: /\b12\s*pro\s*max\b/i, name: 'iPhone 12 Pro Max' },
      { regex: /\b12\s*pro\b/i, name: 'iPhone 12 Pro' },
      { regex: /\b12\s*mini\b/i, name: 'iPhone 12 Mini' },
      { regex: /\b12\b/i, name: 'iPhone 12' },

      { regex: /\b11\s*pro\s*max\b/i, name: 'iPhone 11 Pro Max' },
      { regex: /\b11\s*pro\b/i, name: 'iPhone 11 Pro' },
      { regex: /\b11\b/i, name: 'iPhone 11' },

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

    for (const p of iphonePatterns) {
      if (p.regex.test(cleanStr)) {
        const rest = cleanStr.replace(p.regex, '').replace(/iphone/gi, '').trim();
        return {
          marca: 'Apple',
          modelo: p.name,
          cor: rest || 'Padrão'
        };
      }
    }

    const parts = cleanStr.split(' ');
    const modelo = parts.slice(0, 2).join(' ') || 'Eletrônico';
    const cor = parts.slice(2).join(' ') || 'Padrão';
    return {
      marca: 'Outros',
      modelo,
      cor
    };
  };

  // Utilitário para interpretar lista exportada do MercadoPhone
  const parseMercadoPhoneList = (rawText: string, margemAdicional: number = 0) => {
    const lines = rawText.split('\n');
    const aparelhosFormatados: any[] = [];
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;

      let idEtiqueta = '';
      const matchId = line.match(/^(\d{6,8})\s*[-•·:]?\s*/);
      if (matchId) {
        idEtiqueta = matchId[1];
        line = line.replace(matchId[0], '').trim();
      } else {
        idEtiqueta = String(Math.floor(10000000 + Math.random() * 90000000));
      }

      let mainPart = line;
      let sufixoSerial = '';
      if (line.includes('-')) {
        const parts = line.split('-');
        mainPart = parts[0].trim();
        sufixoSerial = parts.slice(1).join('-').trim();
      }

      let observacoesPartes: string[] = [];

      // Detecção de quantidade (ex: 2 unidades, 3 un, 2x)
      let quantidade = 1;
      const matchQtd = mainPart.match(/\((\d+)\s*(?:unidades|unidade|unid|un|peças|pecas|x)[^)]*\)/i) ||
                       mainPart.match(/\b(\d+)\s*(?:unidades|unidade|unid|un|peças|pecas)\b/i) ||
                       mainPart.match(/\b(\d+)x\b/i) ||
                       rawLine.match(/\((\d+)\s*(?:unidades|unidade|unid|un|peças|pecas|x)[^)]*\)/i);
      if (matchQtd) {
        quantidade = parseInt(matchQtd[1], 10) || 1;
        mainPart = mainPart.replace(matchQtd[0], '').trim();
      }

      // Extrai qualquer observação entre parênteses (ex: (PIXEL NA TELA), (COM CAIXA))
      const matchParenteses = mainPart.match(/\(([^)]+)\)/g);
      if (matchParenteses) {
        matchParenteses.forEach((p) => {
          if (!/\b(\d+)\s*(?:unidades|unidade|unid|un|peças|pecas|x)\b/i.test(p)) {
            const obsInterna = p.replace(/[()]/g, '').trim();
            if (obsInterna && !observacoesPartes.includes(obsInterna)) {
              observacoesPartes.push(obsInterna);
            }
            mainPart = mainPart.replace(p, '').trim();
          }
        });
      }

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

      let capacidade = '';
      const matchRom = mainPart.match(/\b(\d+gb|\d+tb)\b/i);
      if (matchRom) {
        capacidade = matchRom[1].toUpperCase();
        mainPart = mainPart.replace(matchRom[0], '').trim();
      }

      let custoNumerico = 0;
      const matchCustoExplicit = mainPart.match(/R\$\s*([\d\.,]+)/i);
      if (matchCustoExplicit) {
        custoNumerico = parseFloat(matchCustoExplicit[1].replace(/\./g, '').replace(',', '.'));
        mainPart = mainPart.replace(matchCustoExplicit[0], '').trim();
      }

      const { marca: marcaExtraida, modelo, cor: corExtraida } = extractAparelhoBrandModelAndColor(mainPart);

      // Dispositivos que NÃO possuem IMEI (MacBooks, Consoles, Pencil, AirPods, Tablets Wi-Fi, etc.)
      const isNonCellular = /\b(macbook|mac\s*book|ps5|ps4|playstation|xbox|nintendo|switch|pencil|airpods|airpod|ipad|tablet)\b/i.test(mainPart) ||
                            /\b(macbook|mac\s*book|ps5|ps4|playstation|xbox|nintendo|switch|pencil|airpods|airpod|ipad|tablet)\b/i.test(modelo) ||
                            ['Sony', 'Microsoft', 'Nintendo'].includes(marcaExtraida);

      let imeiLimpo = '';
      if (sufixoSerial && !isNonCellular) {
        const matchSerialWithObs = sufixoSerial.match(/^([A-Za-z0-9]{3,15})\s+(.+)$/);
        if (matchSerialWithObs) {
          imeiLimpo = matchSerialWithObs[1].trim();
          const obsTxt = matchSerialWithObs[2].trim();
          if (obsTxt && !observacoesPartes.includes(obsTxt)) {
            observacoesPartes.push(obsTxt);
          }
        } else {
          imeiLimpo = sufixoSerial.trim();
        }
      } else if (sufixoSerial && isNonCellular) {
        const cleanObs = sufixoSerial.replace(/lacrado/gi, '').trim();
        if (cleanObs && !observacoesPartes.includes(cleanObs)) {
          observacoesPartes.push(cleanObs);
        }
      }

      const finalImei = isNonCellular ? '' : imeiLimpo;

      const regexObsKeywords = /\b(msg\s*degradada|msgdegradada|msg\s*bateria|msgbateria|msg\s*bat|msg\s*tela|msg\s*camera|msg\s*peça|msg\s*peca|traseira\s*[\w\s]*|tampa\s*[\w\s]*|tela\s*trocada|trincad[oa]|detalhe|face\s*id\s*off|pixel\s*na\s*tela|risco\s*na\s*tela|mancha\s*na\s*tela)\b/gi;

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

      let corFinal = corExtraida;
      observacoesPartes.forEach(obs => {
        if (obs) {
          corFinal = corFinal.replace(new RegExp(escapeRegExp(obs), 'gi'), '');
        }
      });
      const cor = corFinal.replace(/lacrado/gi, '').replace(/\b\d+%\b/g, '').replace(/[()]/g, '').trim() || 'Padrão';
      const observacoes = observacoesPartes.join(' | ');

      const precoVenda = custoNumerico > 0 ? custoNumerico + margemAdicional : margemAdicional;

      // Se houver quantidade > 1 (ex: PS5 2 unidades), expande cada unidade com seu próprio ID único de 8 dígitos
      for (let q = 0; q < quantidade; q++) {
        const idUnico = q === 0 ? idEtiqueta : String(Math.floor(10000000 + Math.random() * 90000000));
        aparelhosFormatados.push({
          raw: rawLine,
          idEtiqueta: idUnico,
          marca: marcaExtraida || 'Apple',
          modelo,
          capacidade: capacidade || (marcaExtraida === 'Apple' && modelo.includes('iPhone') ? '128GB' : ''),
          cor,
          condicao,
          bateria,
          sufixoSerial: finalImei,
          observacoes,
          custo: custoNumerico,
          preco: precoVenda,
          isCellular: !isNonCellular,
        });
      }
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
      const targetLojaId = usuario?.lojaId;
      let query = supabase.from('aparelhos').select('*');
      if (targetLojaId) {
        query = query.eq('loja_id', targetLojaId);
      }
      const { data: aparelhosExistentes, error: searchError } = await query;

      if (searchError) console.warn('Erro ao buscar existentes:', searchError);

      const existentes = aparelhosExistentes || aparelhos || [];
      let novosCadastrados = 0;
      let existentesAtualizados = 0;

      for (const item of itens) {
        // Busca equivalente existente no banco por Código, ID de Etiqueta, IMEI ou Número de Série
        const existente = existentes.find(a => {
          const cod = getAparelhoCodigo(a);
          if (item.idEtiqueta && cod && (cod === item.idEtiqueta || cod.endsWith(item.idEtiqueta) || item.idEtiqueta.endsWith(cod))) return true;
          if (item.isCellular && item.sufixoSerial && a.imei && (a.imei === item.sufixoSerial || a.imei.endsWith(item.sufixoSerial))) return true;
          if (item.idEtiqueta && a.numeroSerie && a.numeroSerie === item.idEtiqueta) return true;
          if (item.idEtiqueta && a.observacoes && a.observacoes.includes(item.idEtiqueta)) return true;
          return false;
        });

        const idEtiquetaFinal = existente ? getAparelhoCodigo(existente) : item.idEtiqueta;
        const obsString = [
          item.observacoes ? `Obs: ${item.observacoes}` : '',
          `ID: ${idEtiquetaFinal}`,
          item.bateria ? `Bateria: ${item.bateria}` : '',
          (item.isCellular && item.sufixoSerial) ? `IMEI: ${item.sufixoSerial}` : ''
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
            updatePayload.saude_bateria = item.bateria;
          }

          const { error: updateErr } = await supabase
            .from('aparelhos')
            .update(updatePayload)
            .eq('id', existente.id);

          if (updateErr) {
            delete updatePayload.saude_bateria;
            delete updatePayload.codigo;
            await supabase.from('aparelhos').update(updatePayload).eq('id', existente.id);
          }
          existentesAtualizados++;
        } else {
          await criarAparelho({
            marca: item.marca,
            modelo: item.modelo,
            imei: item.isCellular ? (item.sufixoSerial || '') : '',
            numeroSerie: idEtiquetaFinal,
            cor: item.cor,
            capacidade: item.capacidade,
            condicao: item.condicao,
            saude_bateria: item.bateria || '',
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

  // ── Restaurar Todo o Estoque Desativado / Inativo ──
  const handleRestaurarEstoqueDesativado = async () => {
    if (!confirm("Deseja reativar TODOS os aparelhos desativados do estoque? Isso fará com que todas as etiquetas e códigos de barras voltem a funcionar normalmente no sistema.")) {
      return;
    }

    const toastId = toast.loading("Restaurando todos os aparelhos do estoque...");
    try {
      let query = supabase
        .from('aparelhos')
        .update({ ativo: true, condicao: 'seminovo' });

      if (usuario?.lojaId) {
        query = query.eq('loja_id', usuario.lojaId);
      } else {
        query = query.eq('ativo', false);
      }

      const { error } = await query;
      if (error) throw error;

      toast.success("⚡ Todo o estoque foi restaurado e reativado com sucesso! Os códigos de barra originais das etiquetas estão ativos novamente.", { id: toastId, duration: 6000 });
      await fetchAparelhos();
    } catch (err: any) {
      toast.error(`Erro ao restaurar estoque: ${err?.message || 'Falha no banco'}`, { id: toastId });
    }
  };

  const handleRemontarEstoqueMercadoPhone = async () => {
    const margem = parseFloat(mercadoPhoneMargem) || 0;
    const itensImportados = parseMercadoPhoneList(mercadoPhoneText, margem);

    if (itensImportados.length === 0) {
      toast.error('Nenhum aparelho válido identificado no texto.');
      return;
    }

    // Salva ponto de backup preventivo antes de remontar o estoque
    salvarSnapshotBackup(aparelhos, usuario?.lojaId || null, 'Backup Automático Antes de Remontar Estoque');

    setImportingMercadoPhone(true);
    const toastId = toast.loading(`Remontando estoque (${itensImportados.length} aparelhos)...`);

    try {
      const targetLojaId = usuario?.lojaId;
      let queryBanco = supabase.from('aparelhos').select('*');
      if (targetLojaId) {
        queryBanco = queryBanco.eq('loja_id', targetLojaId);
      }
      const { data: aparelhosDoBanco, error: fetchErr } = await queryBanco;

      if (fetchErr) console.warn('Aviso ao buscar banco:', fetchErr);

      // Considera TODOS os aparelhos no banco (inclusive inativos) para reativar o ID da etiqueta original sem reescrever o código de barras
      const todosAparelhosBanco = aparelhosDoBanco || aparelhos || [];
      const ativosAtuais = todosAparelhosBanco.filter(a => a.ativo !== false && a.condicao !== 'vendido' && (a as any).status !== 'vendido');

      const ativosMantidosIds = new Set<string>();
      let novosInseridos = 0;
      let atualizados = 0;

      for (const item of itensImportados) {
        // Tenta encontrar equivalente no banco (busca em ativos e inativos para reativar etiqueta colada)
        const equivalente = todosAparelhosBanco.find(a => {
          const cod = getAparelhoCodigo(a);
          if (item.idEtiqueta && cod && (cod === item.idEtiqueta || cod.endsWith(item.idEtiqueta) || item.idEtiqueta.endsWith(cod))) return true;
          if (item.isCellular && item.sufixoSerial && a.imei && (a.imei === item.sufixoSerial || a.imei.endsWith(item.sufixoSerial))) return true;
          if (item.idEtiqueta && a.numeroSerie && a.numeroSerie === item.idEtiqueta) return true;
          if (item.idEtiqueta && a.observacoes && a.observacoes.includes(item.idEtiqueta)) return true;
          return false;
        });

        const idEtiquetaFinal = equivalente ? getAparelhoCodigo(equivalente) : item.idEtiqueta;
        const obsString = [
          item.observacoes ? `Obs: ${item.observacoes}` : '',
          `ID: ${idEtiquetaFinal}`,
          item.bateria ? `Bateria: ${item.bateria}` : '',
          (item.isCellular && item.sufixoSerial) ? `IMEI: ${item.sufixoSerial}` : ''
        ].filter(Boolean).join(' | ');

        if (equivalente) {
          ativosMantidosIds.add(equivalente.id);
          const updatePayload: any = {
            modelo: item.modelo,
            capacidade: item.capacidade,
            cor: item.cor,
            condicao: item.condicao || 'seminovo',
            preco: item.preco,
            custo: item.custo > 0 ? item.custo : equivalente.custo,
            observacoes: obsString,
            ativo: true,
          };
          if (item.bateria) {
            updatePayload.saude_bateria = item.bateria;
          }

          const { error: updateErr } = await supabase
            .from('aparelhos')
            .update(updatePayload)
            .eq('id', equivalente.id);

          if (updateErr) {
            delete updatePayload.saude_bateria;
            delete updatePayload.codigo;
            await supabase.from('aparelhos').update(updatePayload).eq('id', equivalente.id);
          }
          atualizados++;
        } else {
          await criarAparelho({
            marca: item.marca,
            modelo: item.modelo,
            imei: item.isCellular ? (item.sufixoSerial || '') : '',
            numeroSerie: idEtiquetaFinal,
            cor: item.cor,
            capacidade: item.capacidade,
            condicao: item.condicao,
            saude_bateria: item.bateria || '',
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

      toast.success(`⚡ Estoque Remontado com Sucesso! ${novosInseridos} novos cadastrados, ${atualizados} reativados/atualizados e ${baixados} marcados como vendidos.`, { id: toastId, duration: 5000 });
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
      alert("Preencha marca e modelo/nome do produto!");
      return;
    }

    const precoNumerico = formData.preco ? parseInt(formData.preco) / 100 : 0;
    const precoAtacadoNumerico = formData.precoAtacado ? parseInt(formData.precoAtacado) / 100 : undefined;
    const custoNumerico = formData.custo ? parseInt(formData.custo) / 100 : 0;
    const qtd = parseInt(formData.quantidade) || 1;

    const payload = {
      ...formData,
      categoria: formData.categoria || 'aparelho',
      quantidade: qtd,
      capacidade: formData.categoria === 'perfume' ? formData.tamanho_ml : (formData.categoria === 'acessorio' ? formData.tipo_acessorio : formData.capacidade),
      cor: formData.categoria === 'perfume' ? (formData.tipo_perfume || 'Perfume') : (formData.cor || 'Padrão'),
      condicao: (formData.categoria === 'perfume' || formData.categoria === 'acessorio') ? 'novo' as const : formData.condicao,
      preco: precoNumerico,
      precoAtacado: precoAtacadoNumerico,
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

    // Download do arquivo CSV
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `estoque_aparelhos_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Exportar Lista WhatsApp ──
  const handleExportWhatsApp = (modoAtacado: boolean = false) => {
    if (aparelhosAtivos.length === 0) {
      toast.error("Nenhum aparelho em estoque para exportar!");
      return;
    }

    const getEmojiItem = (a: typeof aparelhosAtivos[number]) => {
      const mod = String(a.modelo || '').toLowerCase();
      const cor = String(a.cor || '').toLowerCase();

      if (mod.includes('macbook') || mod.includes('mac book')) return '💻';
      if (mod.includes('watch')) return '⌚️';
      if (mod.includes('pencil')) return '✏️';
      if (mod.includes('ps5') || mod.includes('ps4') || mod.includes('xbox') || mod.includes('nintendo') || mod.includes('switch')) return '🎮';
      if (mod.includes('airpods') || mod.includes('airpod')) return '🎧';

      if (cor.includes('desert') || cor.includes('deserto')) return '🏜';
      if (cor.includes('natural') || cor.includes('cinza') || cor.includes('gray') || cor.includes('grey')) return '🔘';
      if (cor.includes('branco') || cor.includes('white') || cor.includes('silver') || cor.includes('prata') || cor.includes('starlight') || cor.includes('estelar')) return '⚪️';
      if (cor.includes('preto') || cor.includes('black') || cor.includes('grafite') || cor.includes('dark') || cor.includes('midnight') || cor.includes('meia-noite') || cor.includes('space')) return '⚫️';
      if (cor.includes('azul') || cor.includes('blue') || cor.includes('sierra') || cor.includes('pacifico')) return '🔵';
      if (cor.includes('roxo') || cor.includes('purple') || cor.includes('lilás') || cor.includes('lilas') || cor.includes('violeta')) return '🟣';
      if (cor.includes('rosa') || cor.includes('pink') || cor.includes('rose')) return '🌸';
      if (cor.includes('dourado') || cor.includes('gold') || cor.includes('amarelo') || cor.includes('yellow')) return '🟡';
      if (cor.includes('verde') || cor.includes('green') || cor.includes('alpino')) return '🟢';
      if (cor.includes('vermelho') || cor.includes('red')) return '🔴';
      if (cor.includes('laranja') || cor.includes('orange')) return '🟧';

      return '📱';
    };

    const ordensPrincipais = [
      'iphone 17 pro max', 'iphone 17 pro', 'iphone 17 plus', 'iphone 17',
      'iphone 16 pro max', 'iphone 16 pro', 'iphone 16 plus', 'iphone 16',
      'iphone 15 pro max', 'iphone 15 pro', 'iphone 15 plus', 'iphone 15',
      'iphone 14 pro max', 'iphone 14 pro', 'iphone 14 plus', 'iphone 14',
      'iphone 13 pro max', 'iphone 13 pro', 'iphone 13 mini', 'iphone 13',
      'iphone 12 pro max', 'iphone 12 pro', 'iphone 12 mini', 'iphone 12',
      'iphone 11 pro max', 'iphone 11 pro', 'iphone 11',
      'iphone xs max', 'iphone xs', 'iphone xr', 'iphone x',
      'iphone 8 plus', 'iphone 8', 'iphone 7 plus', 'iphone 7',
      'iphone se 3', 'iphone se 2', 'iphone se',
      'ipad', 'watch', 'macbook', 'pencil', 'airpods'
    ];

    const sortGrupos = (a: string, b: string) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      const idxA = ordensPrincipais.findIndex((o) => aLower.includes(o));
      const idxB = ordensPrincipais.findIndex((o) => bLower.includes(o));

      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    };

    const dataCurta = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit",
    });

    // Agrupa aparelhos por modelo
    const grupos: Record<string, typeof aparelhosAtivos> = {};
    aparelhosAtivos.forEach((a) => {
      const modeloClean = a.modelo ? a.modelo.replace(/^Apple\s+/i, '').trim() : 'Outros';
      if (!grupos[modeloClean]) grupos[modeloClean] = [];
      grupos[modeloClean].push(a);
    });

    let texto = modoAtacado
      ? `📦 *ESTOQUE ATACADO (${dataCurta})*\n\n`
      : `🔄 *ESTOQUE DISPONÍVEL (${dataCurta})*\n\n`;

    Object.entries(grupos)
      .sort(([a], [b]) => sortGrupos(a, b))
      .forEach(([modeloHeader, itens]) => {
        texto += `*${modeloHeader}*\n`;
        itens.forEach((a) => {
          const emoji = getEmojiItem(a);

          // Extrai o IMEI REAL do aparelho (ou sufixo de IMEI cadastrado)
          let imeiReal = (a.imei || '').trim();
          if (!imeiReal && a.observacoes) {
            const matchImei = a.observacoes.match(/IMEI:\s*([A-Za-z0-9]+)/i);
            if (matchImei) imeiReal = matchImei[1];
          }

          const codigoDisplay = imeiReal ? imeiReal : (getAparelhoCodigo(a) || '');

          const capacidadeStr = a.capacidade ? `${a.capacidade}` : '';
          
          let corLimpa = (a.cor || '')
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
            .trim();
          if (corLimpa.toLowerCase() === 'padrão' || corLimpa.toLowerCase() === 'padrao') {
            corLimpa = '';
          }

          // Extrai % de bateria de observações ou campo de saúde
          let bateriaStr = '';
          if (a.observacoes) {
            const bateriaMatch = a.observacoes.match(/(\d+)%\s*bat/i) || a.observacoes.match(/\b(\d{2,3})%\b/);
            if (bateriaMatch) bateriaStr = `${bateriaMatch[1]}%`;
          }
          if (!bateriaStr && (a as any).saudeBateria) {
            const saude = String((a as any).saudeBateria).replace('%', '').trim();
            if (saude && saude !== '-') bateriaStr = `${saude}%`;
          }

          // Preço para Atacado formatado em destaque
          const valAtacado = (a as any).precoAtacado || a.preco || 0;
          const precoAtacadoStr = valAtacado > 0 
            ? `*R$ ${valAtacado.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}*` 
            : '';

          // Outras observações relevantes
          let obsExtra = '';
          if (a.observacoes) {
            const obsLimpas = a.observacoes
              .replace(/BAIXA_ESTOQUE:[^|]+/g, '')
              .replace(/ID:\s*[A-Za-z0-9]+/gi, '')
              .replace(/IMEI:\s*[A-Za-z0-9]+/gi, '')
              .replace(/\d+%\s*bat[a-z]*/gi, '')
              .replace(/\b\d{2,3}%\b/g, '')
              .split('|')
              .map((o) => o.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim())
              .filter((o) => o.length > 0 && o.length < 35);
            if (obsLimpas.length > 0) {
              obsExtra = ` (${obsLimpas[0]})`;
            }
          }

          const partes = [];
          if (capacidadeStr) partes.push(capacidadeStr);
          if (corLimpa) partes.push(corLimpa);
          if (bateriaStr) partes.push(bateriaStr);

          const detalheItem = partes.length > 0 ? ` ${partes.join(' ')}` : '';
          
          let linhaItem = '';
          if (modoAtacado) {
            const tagCodigo = codigoDisplay ? ` (${codigoDisplay})` : '';
            const precoTag = precoAtacadoStr ? ` ➔ ${precoAtacadoStr}` : '';
            linhaItem = `${emoji}${detalheItem}${precoTag}${tagCodigo}${obsExtra}`;
          } else {
            const tagCodigo = codigoDisplay ? ` - ${codigoDisplay}` : '';
            linhaItem = `${emoji}${detalheItem}${tagCodigo}${obsExtra}`;
          }

          texto += `${linhaItem}\n`;
        });
        texto += '\n';
      });

    // Copia para clipboard
    navigator.clipboard.writeText(texto)
      .then(() => toast.success(modoAtacado ? "Lista de Atacado copiada! 📋" : "Lista de Varejo copiada! 📋", { duration: 4000 }))
      .catch(() => {
        const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `estoque_${modoAtacado ? 'atacado' : 'varejo'}_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.txt`;
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
        // Gera ponto de backup de segurança antes de limpar o estoque
        salvarSnapshotBackup(aparelhos, currentLojaId, 'Backup Automático Antes de Deletar Estoque');

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
      categoria: "aparelho",
      marca: "",
      modelo: "",
      imei: "",
      numeroSerie: "",
      cor: "",
      capacidade: "64GB",
      tamanho_ml: "100ml",
      tipo_perfume: "Eau de Parfum",
      tipo_acessorio: "Capinha",
      quantidade: "1",
      condicao: "seminovo",
      saudeBateria: "",
      preco: "",
      precoAtacado: "",
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
                <h3 className="text-base sm:text-lg font-bold">Estoque Geral & Produtos</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Gerencie celulares, perfumes, acessórios e produtos gerais ({aparelhosAtivos.length} exibidos / {contagens.todos} no estoque total)
                </p>
              </div>
            </div>

            {/* Abas / Filtros de Categoria de Estoque */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar touch-pan-x overscroll-contain">
              <button
                type="button"
                onClick={() => setCategoriaFiltro('todos')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer",
                  categoriaFiltro === 'todos' 
                    ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/40" 
                    : "bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" /> Todos ({contagens.todos})
              </button>

              <button
                type="button"
                onClick={() => setCategoriaFiltro('aparelho')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer",
                  categoriaFiltro === 'aparelho' 
                    ? "bg-blue-500 text-white shadow-md shadow-blue-950/40" 
                    : "bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800"
                )}
              >
                <Smartphone className="w-3.5 h-3.5" /> 📱 Celulares ({contagens.aparelhos})
              </button>

              <button
                type="button"
                onClick={() => setCategoriaFiltro('perfume')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer",
                  categoriaFiltro === 'perfume' 
                    ? "bg-rose-500 text-white shadow-md shadow-rose-950/40" 
                    : "bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800"
                )}
              >
                🧴 Perfumes ({contagens.perfumes})
              </button>

              <button
                type="button"
                onClick={() => setCategoriaFiltro('acessorio')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer",
                  categoriaFiltro === 'acessorio' 
                    ? "bg-purple-500 text-white shadow-md shadow-purple-950/40" 
                    : "bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800"
                )}
              >
                <Headphones className="w-3.5 h-3.5" /> 🎧 Acessórios ({contagens.acessorios})
              </button>

              <button
                type="button"
                onClick={() => setCategoriaFiltro('outro')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer",
                  categoriaFiltro === 'outro' 
                    ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40" 
                    : "bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800"
                )}
              >
                <Package className="w-3.5 h-3.5" /> 📦 Outros ({contagens.outros})
              </button>
            </div>
            <div className="scroll-row no-scrollbar w-full pb-1 flex items-center gap-2 overflow-x-auto touch-pan-x overscroll-contain">
              {/* 1. Novo Aparelho */}
              <Button 
                onClick={() => setShowForm(!showForm)} 
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl px-4 text-xs sm:text-sm shadow-md shadow-cyan-950/30 flex items-center gap-2 border border-cyan-400/30 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap h-10 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Novo Aparelho
              </Button>

              {/* 2. Botão Direto: Valores de Atacado */}
              <Button
                onClick={() => setShowAtacadoModal(true)}
                className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 font-bold rounded-xl px-3.5 text-xs sm:text-sm border border-amber-500/30 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap h-10 shadow-sm cursor-pointer"
                title="Editar valores de atacado em lote para lojistas"
              >
                <Tag className="h-4 w-4 text-amber-400" />
                Valores Atacado
              </Button>

              {/* 2. Menu Importar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 hover:text-white font-semibold rounded-xl px-4 text-xs sm:text-sm border border-slate-700/80 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap h-10 shadow-sm cursor-pointer"
                  >
                    <Download className="h-4 w-4 text-emerald-400" />
                    Importar
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60 bg-slate-900 border border-slate-800 text-slate-100 p-1.5 rounded-2xl shadow-2xl backdrop-blur-xl z-[1000]">
                  <DropdownMenuItem
                    onClick={() => setShowMercadoPhoneModal(true)}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-slate-200"
                  >
                    <RefreshCw className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Lista MercadoPhone (Remontar)</div>
                      <div className="text-[10px] text-slate-400">Importar lista formatada e atualizar</div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-slate-800 my-1" />

                  <DropdownMenuItem
                    onClick={() => setShowSupplierModal(true)}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-slate-200"
                  >
                    <List className="h-4 w-4 text-blue-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Lista Fornecedor</div>
                      <div className="text-[10px] text-slate-400">Importar lote simples de fornecedor</div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 3. Menu Exportar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={aparelhosAtivos.length === 0}
                    className="bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 hover:text-white font-semibold rounded-xl px-4 text-xs sm:text-sm border border-slate-700/80 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap h-10 shadow-sm cursor-pointer"
                  >
                    <ArrowUpRight className="h-4 w-4 text-blue-400" />
                    Exportar
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-slate-900 border border-slate-800 text-slate-100 p-1.5 rounded-2xl shadow-2xl backdrop-blur-xl z-[1000]">
                  <DropdownMenuItem
                    onClick={handleExportCSV}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-slate-200"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Exportar CSV</div>
                      <div className="text-[10px] text-slate-400">Planilha completa do estoque</div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-slate-800 my-1" />

                  <DropdownMenuItem
                    onClick={() => handleExportWhatsApp(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-slate-200"
                  >
                    <MessageCircle className="h-4 w-4 text-green-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Lista WhatsApp (Varejo)</div>
                      <div className="text-[10px] text-slate-400">Lista sem preços / estoque geral</div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => handleExportWhatsApp(true)}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-slate-200"
                  >
                    <Package className="h-4 w-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Lista WhatsApp (Atacado)</div>
                      <div className="text-[10px] text-slate-400">Lista com valores de atacado para lojistas</div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 4. Menu Gerenciar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="bg-slate-800/90 hover:bg-slate-700/90 text-cyan-400 hover:text-cyan-300 font-semibold rounded-xl px-4 text-xs sm:text-sm border border-slate-700/80 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap h-10 shadow-sm cursor-pointer"
                  >
                    <Settings className="h-4 w-4 text-cyan-400" />
                    Gerenciar
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 bg-slate-900 border border-slate-800 text-slate-100 p-1.5 rounded-2xl shadow-2xl backdrop-blur-xl z-[1000]">
                  <DropdownMenuItem
                    onClick={() => setShowConferenciaModal(true)}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-slate-200"
                  >
                    <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Conferir Estoque</div>
                      <div className="text-[10px] text-slate-400">Auditoria por câmera, leitor ou lista</div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setShowSaidas(true)}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-slate-200"
                  >
                    <History className="h-4 w-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Saídas / Histórico</div>
                      <div className="text-[10px] text-slate-400">Aparelhos vendidos ou em manutenção</div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-slate-800 my-1" />

                  <DropdownMenuItem
                    onClick={() => setShowAtacadoModal(true)}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-slate-200"
                  >
                    <Package className="h-4 w-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Editar Valores de Atacado</div>
                      <div className="text-[10px] text-slate-400">Ajuste de preços de revenda em lote</div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setShowBackupModal(true)}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-slate-200"
                  >
                    <RotateCcw className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-white">Restaurar Ponto de Backup</div>
                      <div className="text-[10px] text-slate-400">Prévia e comparação de restauração</div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-slate-800 my-1" />

                  <DropdownMenuItem
                    onClick={handleDeleteEstoque}
                    className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-rose-950/40 focus:bg-rose-950/40 cursor-pointer text-rose-300"
                  >
                    <Trash2 className="h-4 w-4 text-rose-400 shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-rose-300">Deletar Todo Estoque</div>
                      <div className="text-[10px] text-rose-400/80">Com criação automática de backup</div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

          {/* Lista de Aparelhos / Produtos */}
          <div className="space-y-3.5">
            {aparelhosFiltrados.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 rounded-3xl border border-dashed border-white/10 space-y-2">
                <Package className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-sm text-muted-foreground font-medium">
                  {aparelhos.length === 0
                    ? 'Nenhum item cadastrado no estoque geral. Clique em "Novo Aparelho" para começar.'
                    : "Nenhum produto encontrado com os filtros e busca informados."}
                </p>
              </div>
            ) : (
              aparelhosFiltrados.map((aparelho) => {
                const custoNum = (aparelho as any).custo || 0;
                const precoAtacadoNum = (aparelho as any).precoAtacado;
                const saudeBat = (aparelho as any).saude_bateria || (aparelho as any).saudeBateria;
                const qtd = (aparelho as any).quantidade || 1;

                return (
                  <div
                    key={aparelho.id}
                    className="bg-slate-900/90 hover:bg-slate-900 border border-slate-800/90 hover:border-cyan-500/40 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 transition-all shadow-md space-y-3.5"
                  >
                    {/* TOPO: ID + Categoria + Condição + Data */}
                    <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-lg shrink-0">
                          ID: {getAparelhoCodigo(aparelho)}
                        </span>

                        {/* Categoria Badge */}
                        {aparelho.categoria === 'perfume' ? (
                          <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30 text-[10px] gap-1 font-semibold">
                            🧴 Perfume
                          </Badge>
                        ) : aparelho.categoria === 'acessorio' ? (
                          <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/30 text-[10px] gap-1 font-semibold">
                            🎧 Acessório
                          </Badge>
                        ) : aparelho.categoria === 'outro' ? (
                          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] gap-1 font-semibold">
                            📦 Produto
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 text-[10px] gap-1 font-semibold">
                            📱 Celular
                          </Badge>
                        )}

                        {/* Condição */}
                        {aparelho.categoria !== 'perfume' && aparelho.categoria !== 'acessorio' && (
                          <span className="text-[11px] text-slate-300 font-medium px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60">
                            {condicaoEmoji(aparelho.condicao)} {condicaoLabel(aparelho.condicao)}
                          </span>
                        )}

                        {aparelho.clienteId && (
                          <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]">
                            MANUTENÇÃO: {aparelho.cliente}
                          </Badge>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-500 shrink-0 ml-auto font-medium">
                        {new Date(aparelho.dataCadastro).toLocaleDateString("pt-BR")}
                      </span>
                    </div>

                    {/* CORPO: Nome em destaque + Especificações claras */}
                    <div className="space-y-2">
                      <h4 className="text-base sm:text-lg font-bold text-white leading-tight">
                        {aparelho.marca} {aparelho.modelo}
                      </h4>

                      {/* Chips de especificações */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {aparelho.categoria === 'perfume' ? (
                          <>
                            {aparelho.capacidade && (
                              <span className="bg-rose-950/40 text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded-lg font-semibold text-[11px]">
                                💧 {aparelho.capacidade}
                              </span>
                            )}
                            {aparelho.cor && (
                              <span className="bg-slate-800/70 text-slate-300 border border-slate-700/60 px-2 py-0.5 rounded-lg text-[11px]">
                                ✨ {aparelho.cor}
                              </span>
                            )}
                            <span className="bg-emerald-950/40 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-lg font-bold text-[11px]">
                              📦 {qtd} un. em estoque
                            </span>
                          </>
                        ) : aparelho.categoria === 'acessorio' ? (
                          <>
                            {aparelho.cor && (
                              <span className="bg-slate-800/70 text-slate-300 border border-slate-700/60 px-2 py-0.5 rounded-lg text-[11px]">
                                🎨 {aparelho.cor}
                              </span>
                            )}
                            <span className="bg-purple-950/40 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-lg font-bold text-[11px]">
                              📦 {qtd} un. em estoque
                            </span>
                          </>
                        ) : (
                          <>
                            {aparelho.capacidade && (
                              <span className="bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-lg font-bold text-[11px]">
                                💾 {aparelho.capacidade}
                              </span>
                            )}
                            {aparelho.cor && (
                              <span className="bg-slate-800/70 text-slate-300 border border-slate-700/60 px-2 py-0.5 rounded-lg text-[11px]">
                                🎨 {aparelho.cor}
                              </span>
                            )}
                            {saudeBat && (
                              <span className="bg-emerald-950/40 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-lg font-bold text-[11px]">
                                🔋 Bateria: {saudeBat}
                              </span>
                            )}
                            {aparelho.imei && (
                              <span className="bg-slate-800/70 text-slate-400 border border-slate-700/60 px-2 py-0.5 rounded-lg text-[11px] font-mono">
                                IMEI: {aparelho.imei}
                              </span>
                            )}
                            {aparelho.cliente && (
                              <span className="bg-slate-800/70 text-slate-300 border border-slate-700/60 px-2 py-0.5 rounded-lg text-[11px]">
                                👤 {aparelho.cliente}
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {aparelho.descricao && (
                        <p className="text-xs text-slate-400 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60">
                          📝 {aparelho.descricao}
                        </p>
                      )}
                    </div>

                    {/* RODAPÉ DO CARD: Preços destacados + Botões de Ação Touch-Friendly */}
                    <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Preços */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {custoNum > 0 && (
                          <div className="text-xs text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-500 block leading-none">Custo</span>
                            <span className="font-semibold text-slate-300">R$ {custoNum.toFixed(2).replace(".", ",")}</span>
                          </div>
                        )}

                        {precoAtacadoNum ? (
                          <div className="text-xs text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/30">
                            <span className="text-[10px] text-amber-400/80 block leading-none font-bold">Atacado</span>
                            <span className="font-bold">R$ {Number(precoAtacadoNum).toFixed(2).replace(".", ",")}</span>
                          </div>
                        ) : null}

                        <div className="text-xs text-emerald-300 bg-emerald-500/15 px-3 py-1 rounded-xl border border-emerald-500/30 ml-auto sm:ml-0">
                          <span className="text-[10px] text-emerald-400/80 block leading-none font-bold">Venda</span>
                          <span className="font-extrabold text-sm text-emerald-400">R$ {aparelho.preco.toFixed(2).replace(".", ",")}</span>
                        </div>
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex items-center gap-1.5 justify-end flex-wrap pt-1 sm:pt-0">
                        <button
                          onClick={() => setAparelhoParaVenda(aparelho)}
                          className="text-xs text-slate-950 font-extrabold flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-md shadow-amber-950/30 shrink-0"
                          title="Marcar como vendido e registrar comprador (Atacado/Varejo)"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" />
                          Vender
                        </button>
                        <button
                          onClick={() => handleGenerateCertificate(aparelho)}
                          className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 rounded-xl border border-emerald-500/20 transition-all cursor-pointer shrink-0"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          PDF
                        </button>
                        <button
                          onClick={() => handleEdit(aparelho)}
                          className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-2 rounded-xl border border-blue-500/20 transition-all cursor-pointer shrink-0"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(aparelho.id)}
                          className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-2 rounded-xl border border-rose-500/20 transition-all cursor-pointer shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
            <p className="text-sm text-muted-foreground text-center">
              Carregando...
            </p>
          )}
        </div>
      </GlassCard>

      {/* Modal de Novo/Editar Aparelho */}
      {showForm && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto my-auto flex flex-col">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-cyan-400" />
                  {editingId ? "Editar Produto do Estoque" : "Cadastrar Novo Produto"}
                </h3>
                <Button variant="ghost" size="icon" onClick={handleCancel} className="text-slate-400 hover:text-white rounded-full">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* SELETOR DE CATEGORIA DO PRODUTO */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">Categoria do Produto *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, categoria: 'aparelho' }))}
                      className={cn(
                        "p-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                        formData.categoria === 'aparelho' 
                          ? "bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-950/40 scale-[1.02]" 
                          : "bg-slate-950/70 text-slate-400 border-slate-800 hover:text-white"
                      )}
                    >
                      <Smartphone className="w-4 h-4" /> 📱 Celular
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, categoria: 'perfume' }))}
                      className={cn(
                        "p-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                        formData.categoria === 'perfume' 
                          ? "bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-950/40 scale-[1.02]" 
                          : "bg-slate-950/70 text-slate-400 border-slate-800 hover:text-white"
                      )}
                    >
                      🧴 Perfume
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, categoria: 'acessorio' }))}
                      className={cn(
                        "p-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                        formData.categoria === 'acessorio' 
                          ? "bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-950/40 scale-[1.02]" 
                          : "bg-slate-950/70 text-slate-400 border-slate-800 hover:text-white"
                      )}
                    >
                      <Headphones className="w-4 h-4" /> 🎧 Acessório
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, categoria: 'outro' }))}
                      className={cn(
                        "p-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                        formData.categoria === 'outro' 
                          ? "bg-amber-600 text-white border-amber-400 shadow-lg shadow-amber-950/40 scale-[1.02]" 
                          : "bg-slate-950/70 text-slate-400 border-slate-800 hover:text-white"
                      )}
                    >
                      <Package className="w-4 h-4" /> 📦 Outro
                    </button>
                  </div>
                </div>

                {/* FORMULÁRIO ESPECÍFICO: PERFUME */}
                {formData.categoria === 'perfume' && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">Marca da Grife / Fabricante *</label>
                        <input
                          type="text"
                          name="marca"
                          placeholder="Ex: Dior, Chanel, Natura, Paco Rabanne"
                          value={formData.marca}
                          onChange={handleInputChange}
                          required
                          className="input-glass w-full"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">Nome da Fragrância / Perfume *</label>
                        <input
                          type="text"
                          name="modelo"
                          placeholder="Ex: Sauvage, 212 VIP Black, Invictus"
                          value={formData.modelo}
                          onChange={handleInputChange}
                          required
                          className="input-glass w-full"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">Volume / ML</label>
                        <select
                          name="tamanho_ml"
                          value={formData.tamanho_ml}
                          onChange={handleInputChange}
                          className="input-glass w-full"
                        >
                          <option value="100ml">100ml</option>
                          <option value="50ml">50ml</option>
                          <option value="200ml">200ml</option>
                          <option value="30ml">30ml</option>
                          <option value="Decant 10ml">Decant 10ml</option>
                          <option value="Decant 5ml">Decant 5ml</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">Tipo de Perfume</label>
                        <select
                          name="tipo_perfume"
                          value={formData.tipo_perfume}
                          onChange={handleInputChange}
                          className="input-glass w-full"
                        >
                          <option value="Eau de Parfum (EDP)">Eau de Parfum (EDP)</option>
                          <option value="Eau de Toilette (EDT)">Eau de Toilette (EDT)</option>
                          <option value="Parfum">Parfum</option>
                          <option value="Tester">Tester</option>
                          <option value="Decant Fracionado">Decant Fracionado</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-emerald-400 uppercase block mb-1">Qtd em Estoque</label>
                        <input
                          type="number"
                          name="quantidade"
                          min="1"
                          value={formData.quantidade}
                          onChange={handleInputChange}
                          className="input-glass w-full font-bold text-emerald-400"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* FORMULÁRIO ESPECÍFICO: ACESSÓRIO */}
                {formData.categoria === 'acessorio' && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">Tipo de Acessório *</label>
                        <select
                          name="tipo_acessorio"
                          value={formData.tipo_acessorio}
                          onChange={(e) => {
                            handleInputChange(e);
                            if (!formData.marca) setFormData(p => ({ ...p, marca: 'Acessórios' }));
                          }}
                          className="input-glass w-full font-bold text-purple-400"
                        >
                          <option value="Capinha / Case">Capinha / Case</option>
                          <option value="Película de Vidro / 3D">Película de Vidro / 3D</option>
                          <option value="Cabo USB-C / Lightning">Cabo USB-C / Lightning</option>
                          <option value="Fonte / Carregador 20W">Fonte / Carregador 20W</option>
                          <option value="Fone de Ouvido / AirPods">Fone de Ouvido / AirPods</option>
                          <option value="Smartwatch / Pulseira">Smartwatch / Pulseira</option>
                          <option value="Outro Acessório">Outro Acessório</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">Modelo / Compatibilidade *</label>
                        <input
                          type="text"
                          name="modelo"
                          placeholder="Ex: iPhone 13, Tipo-C 20W, Universal"
                          value={formData.modelo}
                          onChange={(e) => {
                            handleInputChange(e);
                            if (!formData.marca) setFormData(p => ({ ...p, marca: 'Acessórios' }));
                          }}
                          required
                          className="input-glass w-full"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">Marca / Linha</label>
                        <input
                          type="text"
                          name="marca"
                          placeholder="Ex: Apple, Baseus, Hrebos, Genérico"
                          value={formData.marca}
                          onChange={handleInputChange}
                          className="input-glass w-full"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">Cor / Acabamento</label>
                        <input
                          type="text"
                          name="cor"
                          placeholder="Ex: Transparente, Preto, Branco"
                          value={formData.cor}
                          onChange={handleInputChange}
                          className="input-glass w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-purple-400 uppercase block mb-1">Qtd em Estoque</label>
                        <input
                          type="number"
                          name="quantidade"
                          min="1"
                          value={formData.quantidade}
                          onChange={handleInputChange}
                          className="input-glass w-full font-bold text-purple-400"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* FORMULÁRIO ESPECÍFICO: CELULARES OU OUTROS */}
                {(formData.categoria === 'aparelho' || formData.categoria === 'outro') && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    {/* Linha 1: Marca e Modelo */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">Marca *</label>
                        <input
                          type="text"
                          name="marca"
                          placeholder="Ex: Apple, Xiaomi, Samsung"
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

                    {/* Linha 3: Condição e Saúde Bateria */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    </div>
                  </div>
                )}

                {/* VALORES: CUSTO, ATACADO E VENDA VAREJO (COMUM A TODOS) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-white/5">
                  <div>
                    <label className="text-[10px] font-bold text-blue-400 uppercase block mb-1">Custo (R$)</label>
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
                    <label className="text-[10px] font-bold text-amber-400 uppercase block mb-1">Preço Atacado (R$)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      name="precoAtacado"
                      placeholder="R$ 0,00"
                      value={formatarPreco(formData.precoAtacado)}
                      onChange={handlePrecoAtacadoChange}
                      className="input-glass w-full font-bold text-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-green-400 uppercase block mb-1">Venda Varejo (R$)</label>
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
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto my-auto flex flex-col">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white">Importar Lista de Fornecedor</h3>
                  <p className="text-xs text-slate-400">Cole a lista abaixo. O sistema adicionará R$ 300,00 de margem automaticamente.</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-white rounded-full">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="space-y-4">
                <textarea
                  className="input-glass w-full h-80 font-mono text-xs p-3 bg-slate-950 border border-slate-800 rounded-xl"
                  placeholder="Cole a lista aqui..."
                  value={supplierListText}
                  onChange={(e) => setSupplierListText(e.target.value)}
                />
                <div className="flex gap-2 justify-end pt-2 border-t border-white/10">
                  <Button variant="outline" onClick={() => setShowSupplierModal(false)}>Cancelar</Button>
                  <Button onClick={processarListaFornecedor} className="bg-blue-600 hover:bg-blue-700" disabled={!supplierListText.trim()}>Processar e Cadastrar</Button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Importar MercadoPhone */}
      {showMercadoPhoneModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto my-auto flex flex-col">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                  <Smartphone className="h-5 w-5" /> Importar Aparelhos (Formato MercadoPhone)
                </h3>
                <Button variant="ghost" size="icon" onClick={() => setShowMercadoPhoneModal(false)} className="text-slate-400 hover:text-white rounded-full">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                      Cole as linhas da lista abaixo:
                    </label>
                    <textarea
                      className="w-full h-64 font-mono text-xs p-3 leading-relaxed bg-slate-950 border border-emerald-500/30 rounded-xl text-white resize-none outline-none focus:border-emerald-500"
                      placeholder="Cole aqui as linhas como:&#10;🔵 17 Pro Max 256gb Azul Lacrado - 2605&#10;🏜️ 16 Pro Max 256gb Desert 97% - 5177 | ID: 9410244&#10;🌸 15 128GB Rosa 90% MSG TELA - 8193 | ID: 9563370..."
                      value={mercadoPhoneText}
                      onChange={(e) => setMercadoPhoneText(e.target.value)}
                    />
                  </div>

                  <div className="space-y-4 bg-emerald-950/20 p-4 rounded-2xl border border-emerald-500/20">
                    <h4 className="font-bold text-sm text-emerald-300">Configuração de Valores</h4>

                    <div>
                      <label className="text-xs font-medium block mb-1 text-slate-300">Margem / Preço Inicial Padrão (R$)</label>
                      <input
                        type="number"
                        value={mercadoPhoneMargem}
                        onChange={(e) => setMercadoPhoneMargem(e.target.value)}
                        placeholder="300"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-500"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Adicionada ao valor do custo de cada aparelho ou usada como valor padrão.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-950/80 rounded-xl border border-emerald-500/20">
                      <p className="text-xs font-medium text-emerald-200">
                        📊 Aparelhos Detectados: <span className="font-bold text-base">{parseMercadoPhoneList(mercadoPhoneText, parseFloat(mercadoPhoneMargem) || 0).length}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Pré-visualização da Lista Interpretada */}
                {mercadoPhoneText.trim() && (
                  <div className="mt-4 border border-white/10 rounded-2xl overflow-hidden bg-slate-950">
                    <div className="p-3 bg-white/5 border-b border-white/10 font-bold text-xs flex justify-between items-center">
                      <span>Pré-visualização dos Aparelhos Interpretados</span>
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/40">
                        {parseMercadoPhoneList(mercadoPhoneText, parseFloat(mercadoPhoneMargem) || 0).length} itens
                      </Badge>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-white/5 text-xs font-mono">
                      {parseMercadoPhoneList(mercadoPhoneText, parseFloat(mercadoPhoneMargem) || 0).map((item, idx) => (
                        <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-white/5 gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-emerald-400">ID: {item.idEtiqueta}</span>
                            <span className="ml-2 font-semibold text-white">{item.modelo}</span>
                            <span className="ml-2 text-slate-400">{item.capacidade}</span>
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
          </div>
        </ModalPortal>
      )}

      {/* Modal de Saídas */}
      {showSaidas && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto my-auto flex flex-col">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><ArrowUpRight className="h-5 w-5 text-red-500" /> Histórico de Saídas</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowSaidas(false)} className="text-slate-400 hover:text-white rounded-full">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="overflow-x-auto">
                <div className="divide-y divide-slate-800 min-w-[650px]">
                  {saidas.length === 0 ? (
                    <p className="p-8 text-center text-slate-500">Nenhuma saída registrada.</p>
                  ) : (
                    saidas.map((item, idx) => (
                      <div key={idx} className="p-4 flex justify-between items-start gap-6 hover:bg-slate-800/40 rounded-xl min-w-full">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-white">{item.marca} {item.modelo}</p>
                          <p className="text-xs text-slate-400">IMEI: {item.imei || 'N/A'}</p>
                          <p className="text-xs text-red-400 font-medium mt-1 break-words">Motivo: {item.motivoSaida}</p>
                          {item.custo !== undefined && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              Custo Cadastrado: <strong className="text-slate-200">R$ {(item.custo || 0).toFixed(2).replace('.', ',')}</strong>
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0 min-w-[180px] space-y-1.5">
                          <p className="text-xs text-slate-400">{new Date(item.dataSaida).toLocaleDateString('pt-BR')} {new Date(item.dataSaida).toLocaleTimeString('pt-BR')}</p>
                          <div className="flex items-center gap-2 justify-end">
                            <Badge variant="outline">{item.condicao}</Badge>
                            <button
                              onClick={() => {
                                setSaidaParaEditar({
                                  aparelhoId: item.id,
                                  data: item.dataSaida || item.dataCadastro,
                                  comprador: item.cliente || '',
                                  modelo: item.modelo,
                                  marca: item.marca,
                                  cor: item.cor,
                                  capacidade: item.capacidade,
                                  imei: item.imei,
                                  codigo: getAparelhoCodigo(item),
                                  valorVenda: item.preco || 0,
                                  custo: item.custo || 0,
                                  observacoes: item.observacoes || '',
                                });
                              }}
                              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded-lg border border-blue-500/20 transition-colors cursor-pointer"
                              title="Editar custo ou dados da saída"
                            >
                              <Edit2 className="w-3 h-3" /> Editar Custo
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* MODAL DE CONFERÊNCIA DE ESTOQUE */}
      <ModalPortal>
        <ConferenciaEstoqueModal
          isOpen={showConferenciaModal}
          onClose={() => setShowConferenciaModal(false)}
          aparelhosEstoque={aparelhosAtivos as any}
          lojaId={usuario?.lojaId || (usuario as any)?.loja_id || null}
          onEstoqueAtualizado={fetchAparelhos}
        />
      </ModalPortal>

      {/* MODAL DE EDIÇÃO DE ATACADO EM LOTE */}
      <ModalPortal>
        <EditarValoresAtacadoModal
          isOpen={showAtacadoModal}
          onClose={() => setShowAtacadoModal(false)}
          aparelhos={aparelhos as any}
          onEstoqueAtualizado={fetchAparelhos}
        />
      </ModalPortal>

      {/* MODAL DE RESTAURAÇÃO DE PONTO DE BACKUP */}
      <ModalPortal>
        <BackupEstoqueModal
          isOpen={showBackupModal}
          onClose={() => setShowBackupModal(false)}
          aparelhosAtuais={aparelhos as any}
          lojaId={usuario?.lojaId || (usuario as any)?.loja_id || null}
          onEstoqueAtualizado={fetchAparelhos}
        />
      </ModalPortal>

      {/* MODAL DE REGISTRAR VENDA / BAIXA COM COMPRADOR */}
      <ModalPortal>
        <MarcarVendidoModal
          isOpen={!!aparelhoParaVenda}
          onClose={() => setAparelhoParaVenda(null)}
          aparelho={aparelhoParaVenda}
          lojaId={usuario?.lojaId || (usuario as any)?.loja_id || null}
          onSuccess={fetchAparelhos}
        />
      </ModalPortal>

      {/* MODAL DE EDIÇÃO RETROATIVA DE CUSTOS E REGISTROS */}
      <ModalPortal>
        <EditarVendaRegistroModal
          isOpen={!!saidaParaEditar}
          onClose={() => setSaidaParaEditar(null)}
          venda={saidaParaEditar}
          lojaId={usuario?.lojaId || (usuario as any)?.loja_id || null}
          onSuccess={fetchAparelhos}
        />
      </ModalPortal>
    </div>
  );
}
