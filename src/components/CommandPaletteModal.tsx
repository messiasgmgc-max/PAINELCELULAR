'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  Smartphone, 
  ShoppingCart, 
  FileText, 
  Wrench, 
  Users, 
  Calendar, 
  ShieldCheck, 
  Tag, 
  CreditCard, 
  Settings, 
  Plus, 
  Camera, 
  Download, 
  List, 
  History, 
  ArrowRight, 
  Command, 
  X, 
  Sparkles, 
  Moon, 
  Sun, 
  DollarSign, 
  MessageCircle,
  FileSpreadsheet,
  QrCode,
  Shield,
  SmartphoneNfc,
  Layers,
  Key
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTheme } from 'next-themes';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category: 'Navegação' | 'Aparelhos' | 'Vendas' | 'Ordens de Serviço' | 'Técnicos & Peças' | 'Clientes' | 'Agendamentos' | 'Garantias' | 'Etiquetas' | 'Maquininha' | 'Sistema';
  icon: React.ElementType;
  tabId: string;
  action?: () => void;
  keywords?: string[];
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tabId: string, actionId?: string) => void;
}

export function CommandPaletteModal({
  isOpen,
  onClose,
  onSelectTab,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { theme, setTheme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Lista com TODAS AS FUNÇÕES E AÇÕES DO SITE (Estilo Railway)
  const commands: CommandItem[] = useMemo(() => [
    // --- NAVEGAÇÃO RÁPIDA ---
    { id: 'tab-vendas', label: 'Vendas / PDV', description: 'Abrir painel de vendas e PDV da loja', category: 'Navegação', icon: ShoppingCart, tabId: 'vendas', keywords: ['pdv', 'caixa', 'loja', 'faturamento'] },
    { id: 'tab-aparelhos', label: 'Aparelhos & Estoque', description: 'Ver todos os aparelhos cadastrados no estoque', category: 'Navegação', icon: Smartphone, tabId: 'aparelhos', keywords: ['estoque', 'celulares', 'produtos', 'iphones'] },
    { id: 'tab-ordens', label: 'Ordens de Serviço (OS)', description: 'Gerenciar consertos e ordens de serviço', category: 'Navegação', icon: FileText, tabId: 'ordens', keywords: ['os', 'consertos', 'manutencao', 'assistencia'] },
    { id: 'tab-tecnicos', label: 'Técnicos', description: 'Lista e cadastro de técnicos da assistência', category: 'Navegação', icon: Wrench, tabId: 'tecnicos', keywords: ['equipe', 'assistencia', 'bancada'] },
    { id: 'tab-pecas', label: 'Peças & Componentes', description: 'Controle de estoque de peças de reposição', category: 'Navegação', icon: Layers, tabId: 'pecas', keywords: ['telas', 'baterias', 'componentes'] },
    { id: 'tab-clientes', label: 'Clientes', description: 'Lista e cadastro de clientes da loja', category: 'Navegação', icon: Users, tabId: 'clientes', keywords: ['contatos', 'compradores'] },
    { id: 'tab-agendamentos', label: 'Agendamentos', description: 'Agenda de atendimentos e compromissos', category: 'Navegação', icon: Calendar, tabId: 'agendamentos', keywords: ['agenda', 'horarios', 'visitas'] },
    { id: 'tab-garantias', label: 'Garantias', description: 'Consulta e cadastro de garantias de produtos', category: 'Navegação', icon: ShieldCheck, tabId: 'garantias', keywords: ['termo', 'cobertura', 'pos-venda'] },
    { id: 'tab-etiquetas', label: 'Impressão de Etiquetas', description: 'Gerador e modelos de etiquetas de estoque', category: 'Navegação', icon: Tag, tabId: 'etiquetas', keywords: ['codigo de barras', 'impressao', 'qrcode', 'adesivo'] },
    { id: 'tab-maquininha', label: 'Taxas de Maquininha', description: 'Calculadora de taxas e simulador de parcelas', category: 'Navegação', icon: CreditCard, tabId: 'taxas_maquininha', keywords: ['cartao', 'debito', 'credito', 'infinitepay', 'ton'] },
    { id: 'tab-configuracoes', label: 'Configurações da Loja', description: 'Nome da loja, logotipo e dados gerais', category: 'Navegação', icon: Settings, tabId: 'configuracoes', keywords: ['loja', 'logo', 'dados', 'perfil'] },
    { id: 'tab-superadmin', label: 'Painel SuperAdmin', description: 'Gerenciamento global de lojas e chave PIX', category: 'Navegação', icon: Shield, tabId: 'superadmin', keywords: ['admin', 'pix', 'chaves', 'multilojas'] },

    // --- APARELHOS & ESTOQUE ---
    { id: 'act-novo-aparelho', label: 'Novo Aparelho Avulso', description: 'Cadastrar manualmente um novo aparelho no estoque', category: 'Aparelhos', icon: Plus, tabId: 'aparelhos', actionId: 'novo-aparelho', keywords: ['adicionar', 'cadastrar', 'celular'] },
    { id: 'act-conferir-estoque', label: 'Conferir Estoque (Auditoria por Câmera / USB)', description: 'Auditar estoque físico escaneando códigos de barras', category: 'Aparelhos', icon: ShieldCheck, tabId: 'aparelhos', actionId: 'conferir-estoque', keywords: ['scanner', 'auditoria', 'contagem', 'inventario'] },
    { id: 'act-exportar-csv', label: 'Exportar Estoque (CSV)', description: 'Baixar planilha completa do estoque atual', category: 'Aparelhos', icon: FileSpreadsheet, tabId: 'aparelhos', actionId: 'exportar-csv', keywords: ['download', 'excel', 'planilha'] },
    { id: 'act-exportar-wpp', label: 'Gerar Lista para WhatsApp', description: 'Copiar lista formatada do estoque para enviar em grupos', category: 'Aparelhos', icon: MessageCircle, tabId: 'aparelhos', actionId: 'exportar-wpp', keywords: ['mensagem', 'grupo', 'tabela'] },
    { id: 'act-saidas-estoque', label: 'Histórico de Saídas', description: 'Ver aparelhos baixados, vendidos ou removidos', category: 'Aparelhos', icon: History, tabId: 'aparelhos', actionId: 'ver-saidas', keywords: ['baixados', 'vendidos', 'removidos'] },
    { id: 'act-mercadophone', label: 'Importar MercadoPhone', description: 'Importar lista de produtos formatada do MercadoPhone', category: 'Aparelhos', icon: Download, tabId: 'aparelhos', actionId: 'mercadophone', keywords: ['importar', 'txt', 'mkt'] },
    { id: 'act-fornecedor', label: 'Importar Lista Fornecedor', description: 'Conversor automático de listas de fornecedores', category: 'Aparelhos', icon: List, tabId: 'aparelhos', actionId: 'fornecedor', keywords: ['lista', 'fornecedor', 'txt'] },

    // --- VENDAS & PDV ---
    { id: 'act-pdv-novo', label: 'Nova Venda PDV', description: 'Abrir caixa para registrar uma nova venda', category: 'Vendas', icon: ShoppingCart, tabId: 'vendas', actionId: 'nova-venda', keywords: ['caixa', 'abrir', 'faturamento'] },
    { id: 'act-pdv-scanner', label: 'Escanear Código no PDV', description: 'Usar câmera ou leitor USB para selecionar produto', category: 'Vendas', icon: Camera, tabId: 'vendas', actionId: 'escanear-pdv', keywords: ['barras', 'bipar', 'camera'] },
    { id: 'act-pdv-relatorio', label: 'Relatórios de Vendas', description: 'Gráficos de vendas, lucros e faturamento', category: 'Vendas', icon: DollarSign, tabId: 'vendas', actionId: 'relatorio', keywords: ['graficos', 'lucro', 'faturamento'] },

    // --- ORDENS DE SERVIÇO ---
    { id: 'act-nova-os', label: 'Nova Ordem de Serviço', description: 'Criar ordem de serviço para conserto de aparelho', category: 'Ordens de Serviço', icon: Plus, tabId: 'ordens', actionId: 'nova-os', keywords: ['conserto', 'assistencia', 'reparo'] },

    // --- TÉCNICOS & PEÇAS ---
    { id: 'act-novo-tecnico', label: 'Cadastrar Técnico', description: 'Adicionar novo técnico à equipe de bancada', category: 'Técnicos & Peças', icon: Plus, tabId: 'tecnicos', actionId: 'novo-tecnico', keywords: ['tecnico', 'bancada'] },
    { id: 'act-nova-peca', label: 'Cadastrar Peça', description: 'Adicionar tela, bateria ou componente ao estoque', category: 'Técnicos & Peças', icon: Plus, tabId: 'pecas', actionId: 'nova-peca', keywords: ['tela', 'bateria', 'conector'] },

    // --- CLIENTES ---
    { id: 'act-novo-cliente', label: 'Cadastrar Cliente', description: 'Adicionar novo comprador ou proprietário', category: 'Clientes', icon: Plus, tabId: 'clientes', actionId: 'novo-cliente', keywords: ['contato', 'comprador'] },

    // --- AGENDAMENTOS ---
    { id: 'act-novo-agendamento', label: 'Novo Agendamento', description: 'Marcar horário de atendimento na loja', category: 'Agendamentos', icon: Plus, tabId: 'agendamentos', actionId: 'novo-agendamento', keywords: ['horario', 'marcar'] },

    // --- GARANTIAS ---
    { id: 'act-nova-garantia', label: 'Cadastrar Termo de Garantia', description: 'Emitir certificado de garantia para cliente', category: 'Garantias', icon: Plus, tabId: 'garantias', actionId: 'nova-garantia', keywords: ['termo', 'certificado'] },

    // --- ETIQUETAS ---
    { id: 'act-imprimir-etiquetas', label: 'Imprimir Etiquetas de Estoque', description: 'Gerar códigos de barras e etiquetas em PDF/Impressora', category: 'Etiquetas', icon: QrCode, tabId: 'etiquetas', actionId: 'imprimir-etiquetas', keywords: ['barras', 'sticker', 'pdf'] },

    // --- TAXAS DE MAQUININHA ---
    { id: 'act-simular-taxas', label: 'Simular Taxas e Parcelas (Até 24x)', description: 'Calcular parcelamento no Débito ou Crédito 1x..24x', category: 'Maquininha', icon: Calculator, tabId: 'taxas_maquininha', actionId: 'simular', keywords: ['calculadora', 'debito', 'credito'] },
    { id: 'act-novo-perfil-taxas', label: 'Cadastrar / Editar Perfil de Taxas', description: 'Criar ou alterar taxas da maquininha de cartão', category: 'Maquininha', icon: Plus, tabId: 'taxas_maquininha', actionId: 'novo-perfil', keywords: ['stone', 'ton', 'infinitepay'] },

    // --- SISTEMA ---
    { 
      id: 'act-toggle-theme', 
      label: `Alternar Tema (${theme === 'dark' ? 'Mudar para Claro' : 'Mudar para Escuro'})`, 
      description: 'Trocar entre modo escuro (Dark) e claro (Light)', 
      category: 'Sistema', 
      icon: theme === 'dark' ? Sun : Moon, 
      tabId: '', 
      action: () => setTheme(theme === 'dark' ? 'light' : 'dark'), 
      keywords: ['modo', 'escuro', 'claro', 'dark', 'light'] 
    },
  ], [theme, setTheme]);

  // Filtragem dos comandos com busca inteligente por fuzzy/keywords
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const term = query.toLowerCase().trim();

    return commands.filter((cmd) => {
      const matchLabel = cmd.label.toLowerCase().includes(term);
      const matchDesc = (cmd.description || '').toLowerCase().includes(term);
      const matchCat = cmd.category.toLowerCase().includes(term);
      const matchKey = (cmd.keywords || []).some((k) => k.toLowerCase().includes(term));
      return matchLabel || matchDesc || matchCat || matchKey;
    });
  }, [query, commands]);

  // Foco no input ao abrir
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Resetar índice quando a busca muda
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Listener global de Teclado (ArrowUp, ArrowDown, Enter, Esc)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 < filteredCommands.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredCommands.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          const item = filteredCommands[selectedIndex];
          executeCommand(item);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands]);

  const executeCommand = (item: CommandItem) => {
    onClose();
    if (item.action) {
      item.action();
    } else if (item.tabId) {
      onSelectTab(item.tabId, (item as any).actionId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center p-3 sm:p-6 pt-12 sm:pt-20 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] text-white">
        
        {/* BARRA DE PESQUISA SUPERIOR (Estilo Railway / Spotlight) */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <Command className="w-5 h-5 text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Pesquisar todas as funções, abas ou ações (ex: estoque, pdv, os, taxas)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-sm sm:text-base text-white placeholder:text-slate-500 font-medium"
          />
          {query ? (
            <button onClick={() => setQuery('')} className="text-slate-500 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-800 text-slate-400 rounded border border-slate-700">
              ESC
            </kbd>
          )}
        </div>

        {/* LISTA DE RESULTADOS */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center space-y-2 text-slate-500">
              <Sparkles className="w-8 h-8 mx-auto opacity-50 text-cyan-400" />
              <p className="text-sm font-semibold">Nenhuma função encontrada para "{query}".</p>
              <p className="text-xs text-slate-600">Tente buscar por termos gerais como "venda", "aparelho", "cliente" ou "os".</p>
            </div>
          ) : (
            filteredCommands.map((item, idx) => {
              const IconComp = item.icon;
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={item.id}
                  onClick={() => executeCommand(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-3 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition-all duration-150 ${
                    isSelected 
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-white shadow-lg shadow-cyan-950/40' 
                      : 'hover:bg-slate-800/60 border border-transparent text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      isSelected ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold' : 'bg-slate-800 text-cyan-400 border-slate-700'
                    }`}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs sm:text-sm text-white truncate">{item.label}</span>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-700 text-slate-400 bg-slate-950/60">
                          {item.category}
                        </Badge>
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5 text-slate-500">
                    {isSelected && <ArrowRight className="w-4 h-4 text-cyan-400 animate-pulse" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RODAPÉ DO COMANDO */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <div className="flex items-center gap-3">
            <span><kbd className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">↑</kbd> <kbd className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">↓</kbd> navegar</span>
            <span><kbd className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">↵</kbd> selecionar</span>
          </div>
          <span className="text-cyan-400 font-mono text-[10px]">Pressione Ctrl+K a qualquer momento</span>
        </div>

      </div>
    </div>
  );
}
