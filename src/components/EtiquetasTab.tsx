'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/GlassCard';
import { Plus, Pencil, Square, CheckSquare, Tag, Printer, Settings, Check, RefreshCw, Search, Smartphone, Trash2, X } from 'lucide-react';
import { useAparelhos } from '@/hooks/useAparelhos';
import { generateCode128SvgString } from '@/lib/barcodeGenerator';
import { supabase } from '@/lib/supabaseClient';

type CampoEtiqueta = 'marcaModelo' | 'codigo' | 'codigoBarras' | 'capacidade' | 'condicao' | 'imei' | 'cor' | 'saudeBateria' | 'preco';

interface ModeloEtiquetaGlobal {
  id: string;
  nome: string;
  colunas: 1 | 2 | 3;
  larguraPaginaMm: number;
  alturaPaginaMm: number;
  margemMm: number;
  espacamentoMm: number;
  alturaMinimaEtiquetaMm: number;
  fonteTituloPx: number;
  fonteTextoPx: number;
  fontePrecoPx: number;
  mostrarCapacidade: boolean;
  mostrarCondicao: boolean;
  mostrarImei: boolean;
  ativo: boolean;
}

const DEFAULT_MODELOS: ModeloEtiquetaGlobal[] = [
  {
    id: 'default-3col',
    nome: 'MercadoPhone 3 colunas',
    colunas: 3,
    larguraPaginaMm: 104,
    alturaPaginaMm: 22,
    margemMm: 0,
    espacamentoMm: 2,
    alturaMinimaEtiquetaMm: 20,
    fonteTituloPx: 9,
    fonteTextoPx: 10,
    fontePrecoPx: 10,
    mostrarCapacidade: true,
    mostrarCondicao: true,
    mostrarImei: true,
    ativo: true,
  },
  {
    id: 'default-2col',
    nome: 'A4 2 colunas',
    colunas: 2,
    larguraPaginaMm: 210,
    alturaPaginaMm: 297,
    margemMm: 8,
    espacamentoMm: 4,
    alturaMinimaEtiquetaMm: 38,
    fonteTituloPx: 13,
    fonteTextoPx: 11,
    fontePrecoPx: 14,
    mostrarCapacidade: true,
    mostrarCondicao: true,
    mostrarImei: true,
    ativo: true,
  },
  {
    id: 'default-1col',
    nome: 'A4 1 coluna',
    colunas: 1,
    larguraPaginaMm: 210,
    alturaPaginaMm: 297,
    margemMm: 8,
    espacamentoMm: 5,
    alturaMinimaEtiquetaMm: 46,
    fonteTituloPx: 15,
    fonteTextoPx: 12,
    fontePrecoPx: 16,
    mostrarCapacidade: true,
    mostrarCondicao: true,
    mostrarImei: true,
    ativo: true,
  },
];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function EtiquetasTab() {
  const { aparelhos, loading, fetchAparelhos } = useAparelhos();
  const [modelosEtiqueta, setModelosEtiqueta] = useState<ModeloEtiquetaGlobal[]>(DEFAULT_MODELOS);
  const [modeloEtiquetaId, setModeloEtiquetaId] = useState<string>(DEFAULT_MODELOS[0].id);
  const [quantidadePorItem, setQuantidadePorItem] = useState(1);
  const [aparelhosSelecionadosIds, setAparelhosSelecionadosIds] = useState<string[]>([]);
  const [buscaAparelho, setBuscaAparelho] = useState('');
  const [filtroApenasSemEtiqueta, setFiltroApenasSemEtiqueta] = useState(false);
  const [camposEtiqueta, setCamposEtiqueta] = useState<CampoEtiqueta[]>(['marcaModelo', 'codigo', 'imei', 'capacidade', 'saudeBateria']);
  const [loadingModelosEtiqueta, setLoadingModelosEtiqueta] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [erroModelosEtiqueta, setErroModelosEtiqueta] = useState<string | null>(null);
  const [modelosGlobaisDisponiveis, setModelosGlobaisDisponiveis] = useState(true);
  const [modeloEmEdicao, setModeloEmEdicao] = useState<ModeloEtiquetaGlobal>(DEFAULT_MODELOS[0]);

  const modeloEtiquetaAtivo = useMemo(
    () => modelosEtiqueta.find((item) => item.id === modeloEtiquetaId) || DEFAULT_MODELOS[0],
    [modelosEtiqueta, modeloEtiquetaId]
  );

  const aparelhosAtivos = useMemo(() => aparelhos.filter((aparelho) => aparelho.ativo), [aparelhos]);

  const getAparelhoIdentificador = (aparelho: typeof aparelhosAtivos[number]) => {
    const candidatos = [
      aparelho.imei,
      aparelho.numeroSerie,
      (aparelho as any).serialNumber,
      (aparelho as any).serial_number,
      (aparelho as any).codigo,
      (aparelho as any).codigoUnico,
    ];

    const encontrado = candidatos.find((valor) => typeof valor === 'string' && valor.trim().length > 0);
    return String(encontrado || '').trim();
  };

  const getAparelhoCodigo = (aparelho: typeof aparelhosAtivos[number]) => {
    const candidatos = [
      (aparelho as any).codigo,
      (aparelho as any).codigoUnico,
      (aparelho as any).codigo_unico,
      aparelho.imei,
      aparelho.numeroSerie,
      aparelho.id,
    ];

    const encontrado = candidatos.find((valor) => typeof valor === 'string' && valor.trim().length > 0);
    return String(encontrado || aparelho.id || '').trim();
  };

  const getAparelhoSaudeBateria = (aparelho: typeof aparelhosAtivos[number]) => {
    const candidatos = [
      (aparelho as any).saudeBateria,
      (aparelho as any).saude_bateria,
      (aparelho as any).batteryHealth,
      (aparelho as any).battery_health,
      (aparelho as any).bateriaSaude,
      (aparelho as any).healthBattery,
    ];

    const encontrado = candidatos.find((valor) => valor !== undefined && valor !== null && String(valor).trim() !== '');
    if (encontrado === undefined || encontrado === null) return '-';

    const texto = String(encontrado).trim();
    return texto.toLowerCase().includes('%') ? texto : `${texto}%`;
  };

  const toggleCampoEtiqueta = (campo: CampoEtiqueta) => {
    setCamposEtiqueta((prev) => (prev.includes(campo) ? prev.filter((item) => item !== campo) : [...prev, campo]));
  };

  const aparelhosVisiveis = useMemo(() => {
    let lista = aparelhosAtivos;

    if (filtroApenasSemEtiqueta) {
      lista = lista.filter((aparelho) => {
        const count = Number((aparelho as any).etiquetas_impressas || (aparelho as any).etiquetasImpressas || 0);
        return count === 0;
      });
    }

    const termo = buscaAparelho.trim().toLowerCase();
    if (!termo) return lista;

    return lista.filter((aparelho) => {
      const marcador = `${aparelho.marca} ${aparelho.modelo}`.toLowerCase();
      const imei = getAparelhoIdentificador(aparelho).toLowerCase();
      const codigo = getAparelhoCodigo(aparelho).toLowerCase();
      return marcador.includes(termo) || imei.includes(termo) || codigo.includes(termo);
    });
  }, [aparelhosAtivos, buscaAparelho, filtroApenasSemEtiqueta]);

  const aparelhosSelecionados = useMemo(
    () => aparelhosAtivos.filter((aparelho) => aparelhosSelecionadosIds.includes(aparelho.id)),
    [aparelhosAtivos, aparelhosSelecionadosIds]
  );

  const todosAparelhosSelecionados = aparelhosVisiveis.length > 0 && aparelhosVisiveis.every((aparelho) => aparelhosSelecionadosIds.includes(aparelho.id));

  useEffect(() => {
    if (aparelhosAtivos.length === 0) {
      setAparelhosSelecionadosIds([]);
      return;
    }

    setAparelhosSelecionadosIds((prev) => {
      if (prev.length > 0) {
        const validos = prev.filter((id) => aparelhosAtivos.some((aparelho) => aparelho.id === id));
        if (validos.length > 0) return validos;
      }
      return aparelhosAtivos.map((aparelho) => aparelho.id);
    });
  }, [aparelhosAtivos]);

  useEffect(() => {
    const carregarModelosGlobais = async () => {
      setLoadingModelosEtiqueta(true);
      setErroModelosEtiqueta(null);
      setModelosGlobaisDisponiveis(true);
      try {
        const { data, error } = await supabase
          .from('etiqueta_modelos_globais')
          .select('*')
          .eq('ativo', true)
          .order('nome', { ascending: true });

        if (error) throw error;

        const modelos = (data || []).map((row: any): ModeloEtiquetaGlobal => ({
          id: String(row.id),
          nome: String(row.nome || 'Modelo sem nome'),
          colunas: Math.min(3, Math.max(1, Number(row.colunas || 3))) as 1 | 2 | 3,
          larguraPaginaMm: Number(row.largura_pagina_mm || 210),
          alturaPaginaMm: Number(row.altura_pagina_mm || 297),
          margemMm: Number(row.margem_mm || 8),
          espacamentoMm: Number(row.espacamento_mm || 4),
          alturaMinimaEtiquetaMm: Number(row.altura_minima_etiqueta_mm || 32),
          fonteTituloPx: Number(row.fonte_titulo_px || 12),
          fonteTextoPx: Number(row.fonte_texto_px || 10),
          fontePrecoPx: Number(row.fonte_preco_px || 13),
          mostrarCapacidade: Boolean(row.mostrar_capacidade ?? true),
          mostrarCondicao: Boolean(row.mostrar_condicao ?? true),
          mostrarImei: Boolean(row.mostrar_imei ?? true),
          ativo: Boolean(row.ativo ?? true),
        }));

        if (modelos.length > 0) {
          setModelosEtiqueta(modelos);
          setModeloEtiquetaId(modelos[0].id);
        } else {
          setModelosEtiqueta(DEFAULT_MODELOS);
          setModeloEtiquetaId(DEFAULT_MODELOS[0].id);
        }
      } catch (error) {
        const errorText = String((error as any)?.message || error || '').toLowerCase();
        const tabelaInexistente = errorText.includes('etiqueta_modelos_globais') && errorText.includes('does not exist');
        if (tabelaInexistente) {
          setModelosGlobaisDisponiveis(false);
          setErroModelosEtiqueta('A tabela global de modelos ainda não existe no banco. Rode a migration 20260731124500_create_etiqueta_modelos_globais.sql para habilitar criar/editar modelos para todas as lojas.');
        } else {
          setErroModelosEtiqueta('Não foi possível carregar modelos globais. Usando modelos padrão locais.');
        }
        setModelosEtiqueta(DEFAULT_MODELOS);
        setModeloEtiquetaId(DEFAULT_MODELOS[0].id);
      } finally {
        setLoadingModelosEtiqueta(false);
      }
    };

    carregarModelosGlobais();
  }, []);

  const toggleAparelhoSelecionado = (id: string) => {
    setAparelhosSelecionadosIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  const toggleSelecionarTodos = () => {
    if (todosAparelhosSelecionados) {
      setAparelhosSelecionadosIds((prev) => prev.filter((id) => !aparelhosVisiveis.some((aparelho) => aparelho.id === id)));
    } else {
      setAparelhosSelecionadosIds((prev) => Array.from(new Set([...prev, ...aparelhosVisiveis.map((aparelho) => aparelho.id)])));
    }
  };

  const abrirNovoModelo = () => {
    setModeloEmEdicao({
      id: 'novo',
      nome: 'Novo Modelo',
      colunas: 3,
      larguraPaginaMm: 104,
      alturaPaginaMm: 22,
      margemMm: 0,
      espacamentoMm: 2,
      alturaMinimaEtiquetaMm: 20,
      fonteTituloPx: 9,
      fonteTextoPx: 10,
      fontePrecoPx: 10,
      mostrarCapacidade: true,
      mostrarCondicao: true,
      mostrarImei: true,
      ativo: true,
    });
    setShowEditor(true);
  };

  const abrirEdicaoModelo = (modelo: ModeloEtiquetaGlobal) => {
    setModeloEmEdicao({ ...modelo });
    setShowEditor(true);
  };

  const salvarModelo = async () => {
    try {
      if (!modeloEmEdicao.nome.trim()) {
        alert('Informe o nome do modelo.');
        return;
      }

      const payload = {
        nome: modeloEmEdicao.nome.trim(),
        colunas: modeloEmEdicao.colunas,
        largura_pagina_mm: modeloEmEdicao.larguraPaginaMm,
        altura_pagina_mm: modeloEmEdicao.alturaPaginaMm,
        margem_mm: modeloEmEdicao.margemMm,
        espacamento_mm: modeloEmEdicao.espacamentoMm,
        altura_minima_etiqueta_mm: modeloEmEdicao.alturaMinimaEtiquetaMm,
        fonte_titulo_px: modeloEmEdicao.fonteTituloPx,
        fonte_texto_px: modeloEmEdicao.fonteTextoPx,
        fonte_preco_px: modeloEmEdicao.fontePrecoPx,
        mostrar_capacidade: modeloEmEdicao.mostrarCapacidade,
        mostrar_condicao: modeloEmEdicao.mostrarCondicao,
        mostrar_imei: modeloEmEdicao.mostrarImei,
        ativo: true,
      };

      if (!modelosGlobaisDisponiveis) {
        const idFinal = modeloEmEdicao.id === 'novo' ? `local-${Date.now()}` : modeloEmEdicao.id;
        const modeloAtualizado = { ...modeloEmEdicao, id: idFinal };
        setModelosEtiqueta((prev) => {
          const index = prev.findIndex((m) => m.id === idFinal);
          if (index >= 0) {
            const temp = [...prev];
            temp[index] = modeloAtualizado;
            return temp;
          }
          return [...prev, modeloAtualizado];
        });
        setModeloEtiquetaId(idFinal);
        setShowEditor(false);
        return;
      }

      if (modeloEmEdicao.id === 'novo') {
        const { data, error } = await supabase
          .from('etiqueta_modelos_globais')
          .insert([payload])
          .select('*')
          .single();

        if (error) throw error;

        const novoModelo: ModeloEtiquetaGlobal = {
          id: String(data.id),
          nome: String(data.nome),
          colunas: Number(data.colunas) as 1 | 2 | 3,
          larguraPaginaMm: Number(data.largura_pagina_mm),
          alturaPaginaMm: Number(data.altura_pagina_mm),
          margemMm: Number(data.margem_mm),
          espacamentoMm: Number(data.espacamento_mm),
          alturaMinimaEtiquetaMm: Number(data.altura_minima_etiqueta_mm),
          fonteTituloPx: Number(data.fonte_titulo_px),
          fonteTextoPx: Number(data.fonte_texto_px),
          fontePrecoPx: Number(data.fonte_preco_px),
          mostrarCapacidade: Boolean(data.mostrar_capacidade),
          mostrarCondicao: Boolean(data.mostrar_condicao),
          mostrarImei: Boolean(data.mostrar_imei),
          ativo: Boolean(data.ativo),
        };

        const atualizados = [...modelosEtiqueta, novoModelo];
        setModelosEtiqueta(atualizados);
        setModeloEtiquetaId(novoModelo.id);
      } else {
        const { error } = await supabase
          .from('etiqueta_modelos_globais')
          .update(payload)
          .eq('id', modeloEmEdicao.id);

        if (error) throw error;

        setModelosEtiqueta((prev) => prev.map((item) => (item.id === modeloEmEdicao.id ? modeloEmEdicao : item)));
      }

      setShowEditor(false);
    } catch (error: any) {
      alert(`Erro ao salvar modelo: ${error?.message || 'erro desconhecido'}`);
    }
  };

  const gerarHtmlEtiquetas = () => {
    const selecionados = aparelhosSelecionados;
    const template = modeloEtiquetaAtivo;

    if (selecionados.length === 0) {
      alert('Selecione ao menos um modelo do estoque para gerar etiquetas.');
      return '';
    }

    const etiquetas: string[] = [];
    for (const aparelho of selecionados) {
      for (let i = 0; i < Math.max(1, quantidadePorItem); i += 1) {
        const imeiTexto = getAparelhoIdentificador(aparelho);
        const codigo = getAparelhoCodigo(aparelho);
        const linhasEtiqueta = [
          camposEtiqueta.includes('marcaModelo') ? String(aparelho.modelo || `${aparelho.marca} ${aparelho.modelo}`.trim()).toUpperCase() : '',
          camposEtiqueta.includes('codigo') ? `Código: ${codigo}` : '',
          camposEtiqueta.includes('imei') ? `IMEI: ${imeiTexto || 'Não informado'}` : '',
          camposEtiqueta.includes('capacidade') ? `GB: ${aparelho.capacidade || '-'}` : '',
          camposEtiqueta.includes('saudeBateria') ? `Saúde bateria: ${getAparelhoSaudeBateria(aparelho)}` : '',
          camposEtiqueta.includes('condicao') ? `Condição: ${String(aparelho.condicao || '-')}` : '',
          camposEtiqueta.includes('cor') ? `Cor: ${aparelho.cor || '-'}` : '',
          camposEtiqueta.includes('preco') ? `Preço: R$ ${Number(aparelho.preco || 0).toFixed(2).replace('.', ',')}` : '',
        ].filter(Boolean);

        const barcodeVal = codigo || imeiTexto || aparelho.id;
        const deveMostrarBarcode = camposEtiqueta.includes('codigoBarras') && Boolean(barcodeVal);
        const barcodeHtml = deveMostrarBarcode
          ? `<div class="etiqueta-barcode">${generateCode128SvgString(barcodeVal, { height: 14, width: 1.0, showText: false })}</div>`
          : '';

        etiquetas.push(`
          <div class="etiqueta">
            ${linhasEtiqueta.map((linha, index) => `<div class="${index === 0 ? 'etiqueta-titulo' : 'etiqueta-linha'}">${escapeHtml(linha)}</div>`).join('')}
            ${barcodeHtml}
          </div>
        `);
      }
    }

    const is3ColRolo = template.colunas === 3;
    const etiquetasPorPagina = is3ColRolo ? 3 : template.colunas;

    const paginasHtml: string[] = [];
    for (let index = 0; index < etiquetas.length; index += etiquetasPorPagina) {
      const grupo = etiquetas.slice(index, index + etiquetasPorPagina);
      while (grupo.length < etiquetasPorPagina) {
        grupo.push('<div class="etiqueta etiqueta-vazia"></div>');
      }
      paginasHtml.push(`<section class="pagina-etiquetas">${grupo.join('')}</section>`);
    }

    const pageWidth = is3ColRolo ? 104 : template.larguraPaginaMm;
    const pageHeight = is3ColRolo ? 22 : template.alturaPaginaMm;
    const labelWidth = is3ColRolo
      ? 33
      : Math.max(20, (template.larguraPaginaMm - (template.margemMm * 2) - (template.espacamentoMm * (template.colunas - 1))) / template.colunas);
    const labelHeight = is3ColRolo ? 20 : template.alturaMinimaEtiquetaMm;
    const gapMm = is3ColRolo ? 2 : template.espacamentoMm;
    const marginMm = is3ColRolo ? 0 : template.margemMm;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Etiquetas de Estoque</title>
        <style>
          @page { size: ${pageWidth}mm ${pageHeight}mm; margin: ${marginMm}mm; }
          * { box-sizing: border-box; }
          html, body {
            width: ${pageWidth}mm;
            margin: 0;
            padding: 0;
            background: #fff !important;
            color-scheme: light;
          }
          body {
            font-family: Arial, sans-serif;
            color: #000;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
          }
          .pagina-etiquetas {
            width: ${pageWidth}mm;
            height: ${pageHeight}mm;
            display: grid;
            grid-template-columns: repeat(${template.colunas}, 1fr);
            gap: ${gapMm}mm;
            box-sizing: border-box;
            padding: 0;
            overflow: hidden;
            align-items: stretch;
          }
          .pagina-etiquetas:not(:first-child) {
            break-before: page;
            page-break-before: always;
          }
          .etiqueta {
            border: 1.5px solid #111;
            border-radius: 2.5mm;
            padding: 1.2mm 1.5mm;
            width: ${labelWidth}mm;
            height: ${labelHeight}mm;
            min-height: ${labelHeight}mm;
            break-inside: avoid;
            overflow: hidden;
            text-align: left;
            line-height: 1.05;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
          }
          .etiqueta-vazia { border: none; }
          .etiqueta-titulo {
            font-size: ${template.fonteTituloPx}px;
            font-weight: 700;
            text-transform: uppercase;
            line-height: 1;
            margin-bottom: 0.6mm;
          }
          .etiqueta-linha {
            font-size: ${Math.max(7, template.fonteTextoPx - 1)}px;
            line-height: 1.1;
            margin-top: 0.45mm;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .etiqueta-barcode {
            margin-top: 0.4mm;
            padding-top: 0.1mm;
            text-align: center;
            overflow: hidden;
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .etiqueta-barcode svg {
            max-width: 90%;
            max-height: 5mm;
            width: auto;
            height: auto;
            display: block;
            margin: 0 auto;
          }
        </style>
      </head>
      <body>
        ${paginasHtml.join('')}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 120);
          };
        </script>
      </body>
      </html>
    `;
  };

  const imprimirEtiquetas = async () => {
    const html = gerarHtmlEtiquetas();
    if (!html) return;

    // Atualizar contagem de etiquetas impressas no Supabase para todos os aparelhos selecionados
    try {
      for (const aparelho of aparelhosSelecionados) {
        const atual = Number((aparelho as any).etiquetas_impressas || (aparelho as any).etiquetasImpressas || 0);
        const novoValor = atual + Math.max(1, quantidadePorItem);
        await supabase
          .from('aparelhos')
          .update({ etiquetas_impressas: novoValor })
          .eq('id', aparelho.id);
      }
      await fetchAparelhos();
    } catch (err) {
      console.error('Erro ao atualizar contagem de etiquetas no Supabase:', err);
    }

    const win = window.open('', '_blank');
    if (!win) {
      alert('Permita pop-up para imprimir as etiquetas.');
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="space-y-4">
      <GlassCard className="rounded-3xl space-y-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-600" />
            Etiquetas de Estoque
          </h2>
          <p className="text-sm text-muted-foreground">Modelos globais de etiqueta, seleção individual dos aparelhos e impressão ajustada para rolo e A4.</p>
        </div>

        {erroModelosEtiqueta && (
          <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-xl p-3">
            {erroModelosEtiqueta}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-4 md:mb-6">
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Modelo de Etiqueta</label>
            <select
              className="input-glass mt-1 h-11 rounded-2xl"
              value={modeloEtiquetaId}
              onChange={(event) => setModeloEtiquetaId(event.target.value)}
              disabled={loadingModelosEtiqueta}
            >
              {modelosEtiqueta.map((modelo) => (
                <option key={modelo.id} value={modelo.id}>{modelo.nome}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <Button type="button" variant="outline" className="w-full h-11 rounded-2xl gap-2 bg-white/10 border-white/15 text-foreground hover:bg-white/20 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 shadow-md" onClick={abrirNovoModelo} disabled={!modelosGlobaisDisponiveis}>
              <Plus className="w-4 h-4" />
              Novo Modelo
            </Button>
          </div>

          <div className="flex items-end">
            <Button type="button" variant="outline" className="w-full h-11 rounded-2xl gap-2 bg-white/10 border-white/15 text-foreground hover:bg-white/20 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 shadow-md" onClick={() => abrirEdicaoModelo(modeloEtiquetaAtivo)} disabled={!modelosGlobaisDisponiveis}>
              <Pencil className="w-4 h-4" />
              Editar Modelo
            </Button>
          </div>

          <div className="md:col-span-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Qtd. por item</label>
            <input
              type="number"
              min={1}
              className="input-glass mt-1 h-11 rounded-2xl"
              value={quantidadePorItem}
              onChange={(event) => setQuantidadePorItem(Math.max(1, Number(event.target.value) || 1))}
            />
          </div>

          <div className="flex items-end">
            <Button onClick={imprimirEtiquetas} className="w-full h-11 rounded-2xl gap-2 bg-slate-100 text-slate-900 hover:bg-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-md border border-white/20">
              <Printer className="w-4 h-4" />
              Gerar Etiquetas
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4 mt-1 md:mt-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase text-muted-foreground">Aparelhos no estoque da loja atual</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFiltroApenasSemEtiqueta(!filtroApenasSemEtiqueta)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${filtroApenasSemEtiqueta
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-md'
                  : 'bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10'
                  }`}
              >
                {filtroApenasSemEtiqueta ? '⚡ Ver todos os modelos' : '⚠️ Apenas sem etiqueta'}
              </button>
              <button
                type="button"
                onClick={toggleSelecionarTodos}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1"
              >
                {todosAparelhosSelecionados ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {todosAparelhosSelecionados ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-11 rounded-2xl bg-background/70"
              placeholder="Buscar por IMEI, modelo ou código"
              value={buscaAparelho}
              onChange={(event) => setBuscaAparelho(event.target.value)}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-background/40 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase text-muted-foreground">O que aparece na etiqueta</p>
              <button
                type="button"
                onClick={() => setCamposEtiqueta(['marcaModelo', 'codigo', 'imei', 'capacidade', 'saudeBateria'])}
                className="text-xs font-medium text-blue-600 dark:text-blue-400"
              >
                Marcar tudo
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 text-sm">
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={camposEtiqueta.includes('marcaModelo')} onChange={() => toggleCampoEtiqueta('marcaModelo')} />
                Modelo
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={camposEtiqueta.includes('codigo')} onChange={() => toggleCampoEtiqueta('codigo')} />
                Código
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={camposEtiqueta.includes('codigoBarras')} onChange={() => toggleCampoEtiqueta('codigoBarras')} />
                Código de barras
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={camposEtiqueta.includes('capacidade')} onChange={() => toggleCampoEtiqueta('capacidade')} />
                Capacidade
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={camposEtiqueta.includes('condicao')} onChange={() => toggleCampoEtiqueta('condicao')} />
                Condição
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={camposEtiqueta.includes('imei')} onChange={() => toggleCampoEtiqueta('imei')} />
                IMEI
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={camposEtiqueta.includes('saudeBateria')} onChange={() => toggleCampoEtiqueta('saudeBateria')} />
                Saúde bateria
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={camposEtiqueta.includes('cor')} onChange={() => toggleCampoEtiqueta('cor')} />
                Cor
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={camposEtiqueta.includes('preco')} onChange={() => toggleCampoEtiqueta('preco')} />
                Preço
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[28rem] overflow-auto pr-1">
            {aparelhosVisiveis.map((aparelho) => {
              const checked = aparelhosSelecionadosIds.includes(aparelho.id);
              const imeiTexto = getAparelhoIdentificador(aparelho);
              const imeiLimpo = imeiTexto.replace(/\D/g, '');
              const imeiFinal = imeiLimpo ? imeiLimpo.slice(-4) : '-';
              const codigo = getAparelhoCodigo(aparelho);
              const countEtiqueta = Number((aparelho as any).etiquetas_impressas || (aparelho as any).etiquetasImpressas || 0);

              return (
                <label key={aparelho.id} className={`rounded-2xl border p-3 cursor-pointer transition-all ${checked ? 'border-blue-500 bg-blue-500/10 shadow-lg' : 'border-white/10 bg-white/10 hover:bg-white/15'}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAparelhoSelecionado(aparelho.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm truncate">{aparelho.marca} {aparelho.modelo}</div>
                        <div className="text-[10px] text-muted-foreground whitespace-nowrap">{codigo}</div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Cor: {aparelho.cor || '-'}</div>
                      <div className="text-xs text-muted-foreground">Cap.: {aparelho.capacidade || '-'}</div>
                      <div className="text-xs text-muted-foreground">IMEI final: {imeiFinal}</div>
                      <div className="text-xs text-muted-foreground">IMEI: {imeiTexto || 'Não informado'}</div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                        {countEtiqueta === 0 ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            ⚠️ Sem etiqueta (0)
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            🏷️ Emitida {countEtiqueta}x
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
              );
            })}
            {!loading && aparelhosVisiveis.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {filtroApenasSemEtiqueta ? 'Nenhum aparelho sem etiqueta pendente.' : 'Nenhum modelo ativo no estoque.'}
              </div>
            )}
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          {loading
            ? 'Carregando estoque...'
            : `${aparelhosSelecionadosIds.length} aparelho(s) marcado(s) | ${aparelhosSelecionados.length} aparelho(s) para impressão.`}
        </div>
      </GlassCard>

      {showEditor && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto">
          <div className="bg-slate-900/95 border border-white/20 rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl relative my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Tag className="w-5 h-5 text-blue-400" />
                  {modeloEmEdicao.id === 'novo' ? 'Novo Modelo Global' : 'Editar Modelo Global'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">Esses modelos ficam disponíveis para todas as lojas.</p>
              </div>
              <button
                onClick={() => setShowEditor(false)}
                className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-300 block mb-1">Nome do Modelo</label>
                <input
                  className="input-glass w-full"
                  value={modeloEmEdicao.nome}
                  onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, nome: event.target.value }))}
                  placeholder="Ex: MercadoPhone 3 Colunas"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Colunas</label>
                <select
                  className="input-glass w-full"
                  value={modeloEmEdicao.colunas}
                  onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, colunas: Number(event.target.value) as 1 | 2 | 3 }))}
                >
                  <option value={1}>1 coluna</option>
                  <option value={2}>2 colunas</option>
                  <option value={3}>3 colunas</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Largura Página (mm)</label>
                <input type="number" className="input-glass w-full font-bold text-emerald-400" value={modeloEmEdicao.larguraPaginaMm} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, larguraPaginaMm: Math.max(40, Number(event.target.value) || 210) }))} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Altura Página (mm)</label>
                <input type="number" className="input-glass w-full font-bold text-emerald-400" value={modeloEmEdicao.alturaPaginaMm} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, alturaPaginaMm: Math.max(40, Number(event.target.value) || 297) }))} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Margem (mm)</label>
                <input type="number" className="input-glass w-full font-bold" value={modeloEmEdicao.margemMm} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, margemMm: Math.max(0, Number(event.target.value) || 8) }))} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Espaçamento (mm)</label>
                <input type="number" className="input-glass w-full font-bold" value={modeloEmEdicao.espacamentoMm} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, espacamentoMm: Math.max(0, Number(event.target.value) || 4) }))} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Alt. Mín. Etiqueta (mm)</label>
                <input type="number" className="input-glass w-full font-bold" value={modeloEmEdicao.alturaMinimaEtiquetaMm} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, alturaMinimaEtiquetaMm: Math.max(10, Number(event.target.value) || 32) }))} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Fonte Título (px)</label>
                <input type="number" className="input-glass w-full font-bold" value={modeloEmEdicao.fonteTituloPx} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, fonteTituloPx: Math.max(8, Number(event.target.value) || 12) }))} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Fonte Texto (px)</label>
                <input type="number" className="input-glass w-full font-bold" value={modeloEmEdicao.fonteTextoPx} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, fonteTextoPx: Math.max(7, Number(event.target.value) || 10) }))} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Fonte Preço (px)</label>
                <input type="number" className="input-glass w-full font-bold" value={modeloEmEdicao.fontePrecoPx} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, fontePrecoPx: Math.max(8, Number(event.target.value) || 13) }))} />
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm font-medium">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300"><input type="checkbox" className="rounded bg-slate-800 border-white/20" checked={modeloEmEdicao.mostrarCapacidade} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, mostrarCapacidade: event.target.checked }))} /> Mostrar capacidade</label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-300"><input type="checkbox" className="rounded bg-slate-800 border-white/20" checked={modeloEmEdicao.mostrarCondicao} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, mostrarCondicao: event.target.checked }))} /> Mostrar condição</label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-300"><input type="checkbox" className="rounded bg-slate-800 border-white/20" checked={modeloEmEdicao.mostrarImei} onChange={(event) => setModeloEmEdicao((prev) => ({ ...prev, mostrarImei: event.target.checked }))} /> Mostrar IMEI</label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <Button variant="outline" onClick={() => setShowEditor(false)} className="rounded-xl">Cancelar</Button>
              <Button onClick={salvarModelo} className="bg-blue-600 hover:bg-blue-700 font-bold rounded-xl shadow-lg shadow-blue-500/20">Salvar Modelo</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
