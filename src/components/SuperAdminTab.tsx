// src/components/SuperAdminTab.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import {
  Store,
  Users,
  Plus,
  Trash2,
  Edit,
  Key,
  Copy,
  Check,
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  BarChart3,
  DollarSign,
  Smartphone,
  Code,
  RefreshCw,
  Power,
  X,
  ExternalLink,
  Settings,
  Building2,
  FileCode2,
  CreditCard,
  Send,
  Upload,
  FileText,
  Loader2,
  History,
  Calendar,
  AlertTriangle,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { LogsTab } from "@/components/LogsTab";

interface Loja {
  id: string;
  nome: string;
  telefone: string | null;
  subtitulo?: string | null;
  logo_url?: string | null;
  assinatura_url?: string | null;
  plano?: string | null;
  plano_status?: "ativo" | "pendente" | "vencido" | "bloqueado" | null;
  valor_mensalidade?: number | null;
  data_vencimento?: string | null;
  chave_pix_cobranca?: string | null;
  comprovante_url?: string | null;
  solicitacao_liberacao_status?: string | null;
  solicitacao_liberacao_at?: string | null;
  observacao_plano?: string | null;
  ativo: boolean;
  created_at: string;
}

interface Perfil {
  id: string;
  email: string;
  nome?: string | null;
  loja_id: string | null;
  role: "super_admin" | "admin" | "gerente" | "tecnico" | "vendedor" | "operador";
  created_at?: string;
}

interface LojaStats {
  lojaId: string;
  totalVendas: number;
  faturamentoTotal: number;
  totalAparelhos: number;
  totalUsuarios: number;
}

export default function SuperAdminTab() {
  const { usuario } = useAuth();
  
  // Estados principais
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, LojaStats>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "lojas" | "usuarios" | "planos" | "logs" | "aprovacoes">("dashboard");
  
  // Chave PIX Global de Cobrança
  const [chavePixGlobal, setChavePixGlobal] = useState("financeiro@phonecenter.com.br");
  const [salvandoChavePixGlobal, setSalvandoChavePixGlobal] = useState(false);

  useEffect(() => {
    if (lojas.length > 0) {
      const lojaComPix = lojas.find(l => l.chave_pix_cobranca && l.chave_pix_cobranca.trim() !== "");
      if (lojaComPix?.chave_pix_cobranca) {
        setChavePixGlobal(lojaComPix.chave_pix_cobranca);
      }
    }
  }, [lojas]);

  const handleAplicarChavePixParaTodasLojas = async () => {
    const chaveLimpa = chavePixGlobal.trim();
    if (!chaveLimpa) {
      toast.error("Informe a nova Chave PIX de cobrança.");
      return;
    }

    if (!confirm(`Tem certeza que deseja atualizar a Chave PIX de cobrança de TODAS as ${lojas.length} lojas para "${chaveLimpa}"?`)) {
      return;
    }

    setSalvandoChavePixGlobal(true);
    try {
      const { error } = await supabase
        .from("lojas")
        .update({ chave_pix_cobranca: chaveLimpa })
        .not("id", "is", null);

      if (error) throw error;

      toast.success(`🚀 Chave PIX atualizada com sucesso para todas as ${lojas.length} lojas!`);
      await fetchDadosGlobais();
    } catch (err: any) {
      console.error("Erro ao atualizar Chave PIX global:", err);
      toast.error(`Erro ao atualizar Chave PIX: ${err?.message || "Falha no servidor"}`);
    } finally {
      setSalvandoChavePixGlobal(false);
    }
  };

  // Modais de Plano
  const [editingPlanoLoja, setEditingPlanoLoja] = useState<Loja | null>(null);
  const [verComprovanteModal, setVerComprovanteModal] = useState<{ lojaNome: string; url: string; observacao?: string } | null>(null);
  const [editPlanoForm, setEditPlanoForm] = useState({
    plano_status: "ativo" as "ativo" | "pendente" | "vencido" | "bloqueado",
    valor_mensalidade: 99.90,
    data_vencimento: "",
    chave_pix_cobranca: "financeiro@phonecenter.com.br",
    observacao_plano: "",
  });

  // Sub-aba e Histórico Global de Planos & Mensalidades
  const [subAbaPlanos, setSubAbaPlanos] = useState<"lojas" | "historico">("lojas");
  const [historicoGlobal, setHistoricoGlobal] = useState<any[]>([]);
  const [loadingHistoricoGlobal, setLoadingHistoricoGlobal] = useState(false);
  const [filtroLojaHistorico, setFiltroLojaHistorico] = useState<string>("todas");
  const [filtroStatusHistorico, setFiltroStatusHistorico] = useState<string>("todos");
  const [buscaHistorico, setBuscaHistorico] = useState<string>("");
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLoja, setFilterLoja] = useState<string>("todas");
  const [filterRole, setFilterRole] = useState<string>("todos");
  
  // Modais de Loja
  const [showNovaLoja, setShowNovaLoja] = useState(false);
  const [editingLoja, setEditingLoja] = useState<Loja | null>(null);
  const [deletingLoja, setDeletingLoja] = useState<Loja | null>(null);
  const [confirmNomeLoja, setConfirmNomeLoja] = useState("");

  // Modais de Perfil/Usuário
  const [showNovoPerfil, setShowNovoPerfil] = useState(false);
  const [editingPerfil, setEditingPerfil] = useState<Perfil | null>(null);

  // Formulários
  const [novaLojaForm, setNovaLojaForm] = useState({
    nome: "",
    telefone: "",
    subtitulo: "Sistema de Gestão",
    plano: "pro",
  });

  const [editLojaForm, setEditLojaForm] = useState({
    nome: "",
    telefone: "",
    subtitulo: "",
    logo_url: "",
    assinatura_url: "",
    plano: "pro",
    ativo: true,
  });

  const [novoPerfilForm, setNovoPerfilForm] = useState({
    email: "",
    senha: "",
    nome: "",
    role: "admin" as Perfil["role"],
    loja_id: "",
  });

  const [editPerfilForm, setEditPerfilForm] = useState({
    nome: "",
    email: "",
    role: "admin" as Perfil["role"],
    loja_id: "",
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchDadosGlobais();
  }, []);

  const fetchDadosGlobais = async () => {
    setLoading(true);
    try {
      // 1. Buscar Lojas
      const { data: lojasData, error: lojasError } = await supabase
        .from("lojas")
        .select("*")
        .order("created_at", { ascending: false });

      if (lojasError) throw lojasError;
      const lojasLista = lojasData || [];
      setLojas(lojasLista);

      // 2. Buscar Perfis / Usuários
      const { data: perfisData, error: perfisError } = await supabase
        .from("perfis")
        .select("*")
        .order("created_at", { ascending: false });

      if (perfisError) console.warn("Erro ao buscar perfis:", perfisError.message);
      const perfisLista = perfisData || [];
      setPerfis(perfisLista);

      // 3. Buscar Métricas e Estatísticas por Loja
      const { data: vendasData } = await supabase.from("vendas").select("id, loja_id, valor, valorTotal");
      const { data: aparelhosData } = await supabase.from("aparelhos").select("id, loja_id, ativo, condicao, status");

      const stats: Record<string, LojaStats> = {};
      const primaryLojaId = lojasLista[0]?.id ? String(lojasLista[0].id) : null;

      lojasLista.forEach((loja, index) => {
        stats[loja.id] = {
          lojaId: loja.id,
          totalVendas: 0,
          faturamentoTotal: 0,
          totalAparelhos: 0,
          totalUsuarios: perfisLista.filter(
            (p) => String(p.loja_id || "") === String(loja.id) || (!p.loja_id && index === 0)
          ).length,
        };
      });

      if (vendasData) {
        vendasData.forEach((v: any) => {
          const val = Number(v.valor !== undefined && v.valor !== null ? v.valor : v.valorTotal) || 0;
          const targetId = v.loja_id ? String(v.loja_id) : primaryLojaId;
          if (targetId && stats[targetId]) {
            stats[targetId].totalVendas += 1;
            stats[targetId].faturamentoTotal += val;
          }
        });
      }

      if (aparelhosData) {
        aparelhosData.forEach((a: any) => {
          const isVendido = a.condicao === 'vendido' || (a as any).status === 'vendido';
          const isAtivo = a.ativo !== false && !isVendido;
          if (isAtivo) {
            const targetId = a.loja_id ? String(a.loja_id) : primaryLojaId;
            if (targetId && stats[targetId]) {
              stats[targetId].totalAparelhos += 1;
            }
          }
        });
      }

      setStatsMap(stats);
      fetchHistoricoGlobal();
    } catch (error: any) {
      console.error("Erro ao carregar dados do SuperAdmin:", error);
      toast.error("Erro ao carregar painel SuperAdmin: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const isVencidoPorData = (dataVencimento?: string | null) => {
    if (!dataVencimento) return false;
    const parts = String(dataVencimento).split('T')[0].split('-');
    if (parts.length !== 3) return false;
    const venc = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999);
    return Date.now() > venc.getTime();
  };

  const getDiasRestantes = (dataVencimento?: string | null) => {
    if (!dataVencimento) return 30;
    const parts = String(dataVencimento).split('T')[0].split('-');
    if (parts.length !== 3) return 30;
    const venc = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999);
    const diff = venc.getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const formatarDataVencimento = (dataVencimento?: string | null) => {
    if (!dataVencimento) return 'Não definido';
    const parts = String(dataVencimento).split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dataVencimento;
  };

  const formatarDataHora = (dataStr?: string | null) => {
    if (!dataStr) return '-';
    try {
      const d = new Date(dataStr);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dataStr;
    }
  };

  const fetchHistoricoGlobal = async () => {
    try {
      setLoadingHistoricoGlobal(true);
      const { data, error } = await supabase
        .from('historico_pagamentos_planos')
        .select('*, lojas(id, nome)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistoricoGlobal(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar histórico global de pagamentos:', err);
    } finally {
      setLoadingHistoricoGlobal(false);
    }
  };

  const handleAprovarPagamentoHistorico = async (pag: any) => {
    try {
      const { error: histError } = await supabase
        .from('historico_pagamentos_planos')
        .update({
          status: 'aprovado',
          observacao: pag.observacao 
            ? `${pag.observacao} (Aprovado manualmente pelo SuperAdmin)` 
            : 'Aprovado manualmente pelo SuperAdmin'
        })
        .eq('id', pag.id);

      if (histError) throw histError;

      const lojaAtual = lojas.find(l => l.id === pag.loja_id);
      const isVencido = isVencidoPorData(lojaAtual?.data_vencimento);
      const baseDate = isVencido 
        ? new Date() 
        : (lojaAtual?.data_vencimento ? new Date(lojaAtual.data_vencimento + 'T12:00:00') : new Date());
      const novoVencimento = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { error: lojaError } = await supabase
        .from('lojas')
        .update({
          plano_status: 'ativo',
          data_vencimento: novoVencimento,
          solicitacao_liberacao_status: 'aprovado',
          ativo: true
        })
        .eq('id', pag.loja_id);

      if (lojaError) throw lojaError;

      toast.success(`🎉 Pagamento aprovado! Plano renovado até ${formatarDataVencimento(novoVencimento)}.`);
      await fetchDadosGlobais();
      await fetchHistoricoGlobal();
    } catch (err: any) {
      console.error('Erro ao aprovar pagamento:', err);
      toast.error('Erro ao aprovar pagamento: ' + err.message);
    }
  };

  const handleRejeitarPagamentoHistorico = async (pag: any) => {
    try {
      const { error } = await supabase
        .from('historico_pagamentos_planos')
        .update({
          status: 'rejeitado',
          observacao: pag.observacao ? `${pag.observacao} (Rejeitado pelo SuperAdmin)` : 'Rejeitado pelo SuperAdmin'
        })
        .eq('id', pag.id);

      if (error) throw error;

      await supabase
        .from('lojas')
        .update({
          solicitacao_liberacao_status: 'rejeitado'
        })
        .eq('id', pag.loja_id);

      toast.success('Pagamento rejeitado.');
      await fetchHistoricoGlobal();
      await fetchDadosGlobais();
    } catch (err: any) {
      toast.error('Erro ao rejeitar pagamento: ' + err.message);
    }
  };

  const handleRenovarPlano30Dias = async (loja: Loja) => {
    try {
      const isVencido = isVencidoPorData(loja.data_vencimento);
      const baseDate = isVencido 
        ? new Date() 
        : (loja.data_vencimento ? new Date(loja.data_vencimento + 'T12:00:00') : new Date());
      const novoVenc = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { error } = await supabase
        .from('lojas')
        .update({
          plano_status: 'ativo',
          data_vencimento: novoVenc,
          solicitacao_liberacao_status: 'aprovado',
          ativo: true
        })
        .eq('id', loja.id);

      if (error) throw error;

      await supabase.from('historico_pagamentos_planos').insert({
        loja_id: loja.id,
        valor: loja.valor_mensalidade || 99.90,
        status: 'aprovado',
        observacao: `Renovação manual (+30 dias) efetuada pelo Super Admin. Novo vencimento: ${novoVenc}`,
        forma_pagamento: 'manual'
      });

      toast.success(`🟢 Loja "${loja.nome}" renovada por +30 dias até ${formatarDataVencimento(novoVenc)}!`);
      await fetchDadosGlobais();
      await fetchHistoricoGlobal();
    } catch (err: any) {
      toast.error('Erro ao renovar plano: ' + err.message);
    }
  };

  // ── AÇÕES DE LOJAS ──

  const handleCriarLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaLojaForm.nome.trim()) return toast.error("O nome da loja é obrigatório.");

    try {
      const { data, error } = await supabase
        .from("lojas")
        .insert([
          {
            nome: novaLojaForm.nome.trim(),
            telefone: novaLojaForm.telefone.trim() || null,
            subtitulo: novaLojaForm.subtitulo.trim() || "Sistema de Gestão",
            plano: novaLojaForm.plano,
            ativo: true,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success(`🏢 Loja "${data.nome}" criada com sucesso!`);
      setShowNovaLoja(false);
      setNovaLojaForm({ nome: "", telefone: "", subtitulo: "Sistema de Gestão", plano: "pro" });

      // Abre automaticamente o modal de criar usuário para a nova loja
      setNovoPerfilForm((prev) => ({ ...prev, loja_id: data.id }));
      setShowNovoPerfil(true);
      fetchDadosGlobais();
    } catch (error: any) {
      toast.error("Erro ao criar loja: " + error.message);
    }
  };

  const handleOpenEditLoja = (loja: Loja) => {
    setEditingLoja(loja);
    setEditLojaForm({
      nome: loja.nome || "",
      telefone: loja.telefone || "",
      subtitulo: loja.subtitulo || "Sistema de Gestão",
      logo_url: loja.logo_url || "",
      assinatura_url: loja.assinatura_url || "",
      plano: loja.plano || "pro",
      ativo: loja.ativo !== false,
    });
  };

  const handleUpdateLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoja) return;

    try {
      const { error } = await supabase
        .from("lojas")
        .update({
          nome: editLojaForm.nome.trim(),
          telefone: editLojaForm.telefone.trim() || null,
          subtitulo: editLojaForm.subtitulo.trim() || null,
          logo_url: editLojaForm.logo_url.trim() || null,
          assinatura_url: editLojaForm.assinatura_url.trim() || null,
          plano: editLojaForm.plano,
          ativo: editLojaForm.ativo,
        })
        .eq("id", editingLoja.id);

      if (error) throw error;

      toast.success("Loja atualizada com sucesso!");
      setEditingLoja(null);
      fetchDadosGlobais();
    } catch (error: any) {
      toast.error("Erro ao atualizar loja: " + error.message);
    }
  };

  const handleToggleLojaAtivo = async (loja: Loja) => {
    const novoStatus = !loja.ativo;
    try {
      const { error } = await supabase
        .from("lojas")
        .update({ ativo: novoStatus })
        .eq("id", loja.id);

      if (error) throw error;

      toast.success(`Loja "${loja.nome}" foi ${novoStatus ? "ativada" : "desativada"}.`);
      setLojas(lojas.map((l) => (l.id === loja.id ? { ...l, ativo: novoStatus } : l)));
    } catch (error: any) {
      toast.error("Erro ao alterar status da loja: " + error.message);
    }
  };

  // ── AÇÕES DE GESTÃO DE PLANOS & MENSALIDADES ──

  const handleAlterarStatusPlano = async (lojaId: string, novoStatus: "ativo" | "pendente" | "vencido" | "bloqueado") => {
    try {
      const { error } = await supabase
        .from("lojas")
        .update({ plano_status: novoStatus })
        .eq("id", lojaId);

      if (error) throw error;

      toast.success(`Status do plano atualizado para "${novoStatus.toUpperCase()}".`);
      setLojas(lojas.map((l) => (l.id === lojaId ? { ...l, plano_status: novoStatus } : l)));
    } catch (error: any) {
      toast.error("Erro ao alterar status do plano: " + error.message);
    }
  };

  const handleAprovarLiberacao = async (loja: Loja) => {
    try {
      // Renova por +30 dias
      const proximaData = new Date();
      proximaData.setDate(proximaData.getDate() + 30);
      const dataVencimentoIso = proximaData.toISOString().split("T")[0];

      const { error } = await supabase
        .from("lojas")
        .update({
          plano_status: "ativo",
          solicitacao_liberacao_status: "aprovado",
          data_vencimento: dataVencimentoIso,
        })
        .eq("id", loja.id);

      if (error) throw error;

      // Adiciona registro no histórico de pagamentos
      await supabase.from("historico_pagamentos_planos").insert({
        loja_id: loja.id,
        valor: loja.valor_mensalidade || 99.90,
        status: "aprovado",
        comprovante_url: loja.comprovante_url || null,
        observacao: "Liberação aprovada manualmente pelo SuperAdmin",
      });

      toast.success(`🟢 Acesso da loja "${loja.nome}" LIBERADO por +30 dias!`);
      fetchDadosGlobais();
    } catch (error: any) {
      toast.error("Erro ao aprovar liberação: " + error.message);
    }
  };

  const handleOpenEditPlano = (loja: Loja) => {
    setEditingPlanoLoja(loja);
    setEditPlanoForm({
      plano_status: (loja.plano_status as any) || "ativo",
      valor_mensalidade: loja.valor_mensalidade || 99.90,
      data_vencimento: loja.data_vencimento || "",
      chave_pix_cobranca: loja.chave_pix_cobranca || "financeiro@phonecenter.com.br",
      observacao_plano: loja.observacao_plano || "",
    });
  };

  const handleSaveEditPlano = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanoLoja) return;

    try {
      let statusParaSalvar = editPlanoForm.plano_status;
      if (isVencidoPorData(editPlanoForm.data_vencimento) && statusParaSalvar === 'ativo') {
        statusParaSalvar = 'vencido';
      }

      const { error } = await supabase
        .from("lojas")
        .update({
          plano_status: statusParaSalvar,
          valor_mensalidade: Number(editPlanoForm.valor_mensalidade),
          data_vencimento: editPlanoForm.data_vencimento || null,
          chave_pix_cobranca: editPlanoForm.chave_pix_cobranca.trim(),
          observacao_plano: editPlanoForm.observacao_plano.trim() || null,
        })
        .eq("id", editingPlanoLoja.id);

      if (error) throw error;

      toast.success("Plano e mensalidade atualizados com sucesso!");
      setEditingPlanoLoja(null);
      await fetchDadosGlobais();
      await fetchHistoricoGlobal();
    } catch (error: any) {
      toast.error("Erro ao atualizar plano: " + error.message);
    }
  };

  const handleDeletarLoja = async () => {
    if (!deletingLoja) return;
    if (confirmNomeLoja.trim().toLowerCase() !== deletingLoja.nome.trim().toLowerCase()) {
      return toast.error("O nome digitado não atende à confirmação exata.");
    }

    try {
      const { error } = await supabase.from("lojas").delete().eq("id", deletingLoja.id);
      if (error) throw error;

      toast.success(`Loja "${deletingLoja.nome}" e seus dados foram excluídos.`);
      setDeletingLoja(null);
      setConfirmNomeLoja("");
      fetchDadosGlobais();
    } catch (error: any) {
      toast.error("Erro ao deletar loja: " + error.message);
    }
  };

  // ── AÇÕES DE PERFIS / USUÁRIOS ──

  const handleCriarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoPerfilForm.email.trim() || !novoPerfilForm.senha.trim()) {
      return toast.error("O e-mail e a senha inicial são obrigatórios para criar a conta.");
    }

    try {
      const res = await fetch("/api/admin/criar-usuario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: novoPerfilForm.email.trim(),
          senha: novoPerfilForm.senha.trim(),
          nome: novoPerfilForm.nome.trim(),
          role: novoPerfilForm.role,
          loja_id: novoPerfilForm.loja_id || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Erro ao criar login de usuário");
      }

      toast.success(`👤 Login "${novoPerfilForm.email}" criado com sucesso! Senha: ${novoPerfilForm.senha}`);
      setShowNovoPerfil(false);
      setNovoPerfilForm({ email: "", senha: "", nome: "", role: "admin", loja_id: "" });
      fetchDadosGlobais();
    } catch (error: any) {
      toast.error("Erro ao criar login: " + error.message);
    }
  };

  const handleOpenEditPerfil = (perfil: Perfil) => {
    setEditingPerfil(perfil);
    setEditPerfilForm({
      nome: perfil.nome || "",
      email: perfil.email || "",
      role: perfil.role || "admin",
      loja_id: perfil.loja_id || "",
    });
  };

  const handleUpdatePerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPerfil) return;

    try {
      const { error } = await supabase
        .from("perfis")
        .update({
          nome: editPerfilForm.nome.trim(),
          email: editPerfilForm.email.trim().toLowerCase(),
          role: editPerfilForm.role,
          loja_id: editPerfilForm.loja_id || null,
        })
        .eq("id", editingPerfil.id);

      if (error) throw error;

      toast.success("Perfil atualizado!");
      setEditingPerfil(null);
      fetchDadosGlobais();
    } catch (error: any) {
      toast.error("Erro ao atualizar perfil: " + error.message);
    }
  };

  const handleDeletePerfil = async (id: string, email: string) => {
    if (!confirm(`Remover acesso de "${email}"?`)) return;
    try {
      const { error } = await supabase.from("perfis").delete().eq("id", id);
      if (error) throw error;
      toast.success("Perfil removido com sucesso!");
      setPerfis(perfis.filter((p) => p.id !== id));
    } catch (error: any) {
      toast.error("Erro ao remover perfil: " + error.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success("ID copiado para a área de transferência!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Métricas Globais Calculadas
  const faturamentoGlobal = useMemo(() => {
    return Object.values(statsMap).reduce((acc, curr) => acc + curr.faturamentoTotal, 0);
  }, [statsMap]);

  const totalVendasGlobal = useMemo(() => {
    return Object.values(statsMap).reduce((acc, curr) => acc + curr.totalVendas, 0);
  }, [statsMap]);

  const totalAparelhosGlobal = useMemo(() => {
    return Object.values(statsMap).reduce((acc, curr) => acc + curr.totalAparelhos, 0);
  }, [statsMap]);

  // Filtros aplicados
  const lojasFiltradas = useMemo(() => {
    return lojas.filter(
      (l) =>
        l.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.telefone && l.telefone.includes(searchTerm)) ||
        l.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [lojas, searchTerm]);

  const lojasPendentes = useMemo(() => {
    return lojas.filter(
      (l) => !l.ativo || l.plano_status === 'pendente' || l.solicitacao_liberacao_status === 'pendente_aprovacao'
    );
  }, [lojas]);

  const perfisFiltrados = useMemo(() => {
    return perfis.filter((p) => {
      const matchSearch =
        p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.nome && p.nome.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchLoja = filterLoja === "todas" || p.loja_id === filterLoja;
      const matchRole = filterRole === "todos" || p.role === filterRole;
      return matchSearch && matchLoja && matchRole;
    });
  }, [perfis, searchTerm, filterLoja, filterRole]);

  const historicoFiltrado = useMemo(() => {
    return historicoGlobal.filter((pag) => {
      if (filtroLojaHistorico !== "todas" && pag.loja_id !== filtroLojaHistorico) {
        return false;
      }
      if (filtroStatusHistorico !== "todos" && pag.status !== filtroStatusHistorico) {
        return false;
      }
      if (buscaHistorico.trim()) {
        const termo = buscaHistorico.toLowerCase();
        const nomeLoja = (pag.lojas?.nome || "").toLowerCase();
        const mpId = String(pag.mp_payment_id || "").toLowerCase();
        const obs = (pag.observacao || "").toLowerCase();
        const forma = (pag.forma_pagamento || "").toLowerCase();
        if (!nomeLoja.includes(termo) && !mpId.includes(termo) && !obs.includes(termo) && !forma.includes(termo)) {
          return false;
        }
      }
      return true;
    });
  }, [historicoGlobal, filtroLojaHistorico, filtroStatusHistorico, buscaHistorico]);

  const totalFaturadoHistorico = useMemo(() => {
    return historicoGlobal
      .filter((p) => p.status === "aprovado")
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
  }, [historicoGlobal]);

  const totalAprovadosHistorico = useMemo(() => {
    return historicoGlobal.filter((p) => p.status === "aprovado").length;
  }, [historicoGlobal]);

  const totalPendentesHistorico = useMemo(() => {
    return historicoGlobal.filter((p) => p.status === "pendente").length;
  }, [historicoGlobal]);

  const totalAnaliseHistorico = useMemo(() => {
    return historicoGlobal.filter((p) => p.status === "pendente_aprovacao").length;
  }, [historicoGlobal]);

  // Script SQL de instrução
  const sqlScript = `-- SCRIPT DE LIBERAÇÃO DE ACESSO TOTAL PARA SUPERADMIN
-- Copie e rode no SQL Editor do Supabase para corrigir permissões

ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin tudo em lojas" ON public.lojas;
CREATE POLICY "SuperAdmin tudo em lojas" ON public.lojas FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "SuperAdmin tudo em perfis" ON public.perfis;
CREATE POLICY "SuperAdmin tudo em perfis" ON public.perfis FOR ALL USING (true) WITH CHECK (true);
`;

  return (
    <div className="panel-shell space-y-6 pb-20">
      {/* Topo / Header */}
      <GlassCard className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-slate-900/90 via-indigo-950/80 to-slate-900/90 border-indigo-500/20">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600/30 border border-indigo-400/30 rounded-2xl text-indigo-400">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">SuperAdmin Global</h1>
                <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-400/30">Phone Center OS</Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-300">
                Painel mestre de controle de lojas, usuários e acessos da plataforma.
              </p>
            </div>
          </div>

          <div className="scroll-row w-full sm:w-auto">
            <Button
              onClick={fetchDadosGlobais}
              variant="outline"
              className="h-10 border-white/20 hover:bg-white/10 shrink-0 gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button
              onClick={() => setShowNovaLoja(true)}
              className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 gap-2 shadow-lg shadow-indigo-500/30"
            >
              <Plus className="w-4 h-4" />
              Nova Loja
            </Button>
            <Button
              onClick={() => setShowNovoPerfil(true)}
              variant="secondary"
              className="h-10 shrink-0 gap-2"
            >
              <Users className="w-4 h-4" />
              Novo Usuário
            </Button>
          </div>
        </div>

        {/* Abas de Navegação Interna */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-white/10 overflow-x-auto scrollbar-soft">
          {[
            { id: "dashboard", label: "Dashboard", icon: <BarChart3 className="w-4 h-4" /> },
            { id: "lojas", label: `Lojas (${lojas.length})`, icon: <Store className="w-4 h-4" /> },
            { id: "usuarios", label: `Usuários (${perfis.length})`, icon: <Users className="w-4 h-4" /> },
            { id: "planos", label: `Planos & Mensalidades`, icon: <CreditCard className="w-4 h-4 text-emerald-400" /> },
            { id: "aprovacoes", label: `Aprovações (${lojasPendentes.length})`, icon: <CheckCircle2 className="w-4 h-4 text-amber-400 animate-pulse" /> },
            { id: "logs", label: `Logs de Auditoria`, icon: <FileText className="w-4 h-4 text-purple-400" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* METRICAS DASHBOARD */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Grid de Cards de Estatísticas Globais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassCard className="rounded-2xl p-5 border-blue-500/20 bg-blue-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">Total de Lojas</span>
                <Store className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-3xl font-extrabold text-white mt-2">{lojas.length}</div>
              <p className="text-xs text-blue-200/70 mt-1">
                {lojas.filter((l) => l.ativo).length} ativas • {lojas.filter((l) => !l.ativo).length} inativas
              </p>
            </GlassCard>

            <GlassCard className="rounded-2xl p-5 border-emerald-500/20 bg-emerald-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Faturamento Global</span>
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-2">
                {faturamentoGlobal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
              <p className="text-xs text-emerald-200/70 mt-1">{totalVendasGlobal} vendas registradas</p>
            </GlassCard>

            <GlassCard className="rounded-2xl p-5 border-purple-500/20 bg-purple-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-300">Total Usuários</span>
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-3xl font-extrabold text-white mt-2">{perfis.length}</div>
              <p className="text-xs text-purple-200/70 mt-1">Acessos cadastrados nas lojas</p>
            </GlassCard>

            <GlassCard className="rounded-2xl p-5 border-amber-500/20 bg-amber-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">Aparelhos Ativos</span>
                <Smartphone className="w-5 h-5 text-amber-400" />
              </div>
              <div className="text-3xl font-extrabold text-white mt-2">{totalAparelhosGlobal}</div>
              <p className="text-xs text-amber-200/70 mt-1">Estoque ativo na rede</p>
            </GlassCard>
          </div>

          {/* Resumo por Loja */}
          <GlassCard className="rounded-3xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              Resumo Desempenho por Loja
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lojas.map((loja) => {
                const st = statsMap[loja.id] || { totalVendas: 0, faturamentoTotal: 0, totalAparelhos: 0, totalUsuarios: 0 };
                return (
                  <div
                    key={loja.id}
                    className="p-4 rounded-2xl border border-white/10 bg-slate-900/60 hover:border-indigo-500/40 transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {loja.logo_url ? (
                          <img src={loja.logo_url} alt={loja.nome} className="w-7 h-7 rounded-lg object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold text-xs">
                            {loja.nome.charAt(0)}
                          </div>
                        )}
                        <span className="font-bold text-white truncate max-w-[160px]">{loja.nome}</span>
                      </div>
                      <Badge className={loja.ativo ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}>
                        {loja.ativo ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-xs">
                      <div>
                        <span className="text-slate-400">Faturamento:</span>
                        <div className="font-semibold text-emerald-400">
                          {st.faturamentoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Vendas:</span>
                        <div className="font-semibold text-white">{st.totalVendas}</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Estoque:</span>
                        <div className="font-semibold text-amber-300">{st.totalAparelhos} aparelhos</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Usuários:</span>
                        <div className="font-semibold text-purple-300">{st.totalUsuarios} perfis</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      )}

      {/* GERENCIAMENTO DE LOJAS */}
      {activeTab === "lojas" && (
        <GlassCard className="rounded-3xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar loja por nome, ID ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-glass pl-9 w-full text-sm"
              />
            </div>
            <Button onClick={() => setShowNovaLoja(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 gap-2">
              <Plus className="w-4 h-4" />
              Cadastrar Nova Loja
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lojasFiltradas.length === 0 ? (
              <div className="col-span-full text-center py-8 text-slate-400 text-sm">
                Nenhuma loja encontrada.
              </div>
            ) : (
              lojasFiltradas.map((loja) => {
                const st = statsMap[loja.id] || { totalVendas: 0, faturamentoTotal: 0, totalAparelhos: 0, totalUsuarios: 0 };
                return (
                  <div
                    key={loja.id}
                    className="p-5 rounded-2xl border border-white/10 bg-slate-900/80 hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          {loja.logo_url ? (
                            <img src={loja.logo_url} alt={loja.nome} className="w-10 h-10 rounded-xl object-cover border border-white/10" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300 font-bold">
                              <Store className="w-5 h-5" />
                            </div>
                          )}
                          <div>
                            <h4 className="font-bold text-white text-base">{loja.nome}</h4>
                            <p className="text-xs text-slate-400">{loja.subtitulo || "Sistema de Gestão"}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleToggleLojaAtivo(loja)}
                          title={loja.ativo ? "Desativar loja" : "Ativar loja"}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            loja.ativo
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                              : "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>

                      {/* ID Copiável */}
                      <div className="flex items-center justify-between text-[11px] bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-white/5 font-mono">
                        <span className="text-slate-400 truncate max-w-[200px]">ID: {loja.id}</span>
                        <button
                          onClick={() => copyToClipboard(loja.id)}
                          className="text-indigo-400 hover:text-indigo-300 transition-colors ml-2"
                        >
                          {copiedId === loja.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Resumo da loja */}
                    <div className="grid grid-cols-3 gap-2 py-2 border-y border-white/5 text-center text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">Usuários</div>
                        <div className="font-bold text-purple-300">{st.totalUsuarios}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">Estoque</div>
                        <div className="font-bold text-amber-300">{st.totalAparelhos}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">Vendas</div>
                        <div className="font-bold text-emerald-400">{st.totalVendas}</div>
                      </div>
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEditLoja(loja)}
                        className="flex-1 h-8 text-xs border-white/15 hover:bg-white/10 gap-1.5"
                      >
                        <Edit className="w-3.5 h-3.5 text-blue-400" />
                        Editar
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNovoPerfilForm((prev) => ({ ...prev, loja_id: loja.id }));
                          setShowNovoPerfil(true);
                        }}
                        className="flex-1 h-8 text-xs border-white/15 hover:bg-white/10 gap-1.5"
                      >
                        <Users className="w-3.5 h-3.5 text-purple-400" />
                        + Usuário
                      </Button>

                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeletingLoja(loja)}
                        className="h-8 px-2.5"
                        title="Deletar loja"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </GlassCard>
      )}

      {/* GERENCIAMENTO DE USUÁRIOS E ACESSOS */}
      {activeTab === "usuarios" && (
        <GlassCard className="rounded-3xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar usuário ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-glass pl-9 w-full text-sm"
                />
              </div>

              <select
                value={filterLoja}
                onChange={(e) => setFilterLoja(e.target.value)}
                className="input-glass text-xs sm:text-sm py-2 px-3"
              >
                <option value="todas">Todas as Lojas</option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>

              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="input-glass text-xs sm:text-sm py-2 px-3"
              >
                <option value="todos">Todos os Papéis</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="gerente">Gerente</option>
                <option value="tecnico">Técnico</option>
                <option value="vendedor">Vendedor</option>
                <option value="operador">Operador</option>
              </select>
            </div>

            <Button onClick={() => setShowNovoPerfil(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 gap-2">
              <Plus className="w-4 h-4" />
              Novo Acesso
            </Button>
          </div>

          <div className="overflow-x-auto scrollbar-soft">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3">Usuário</th>
                  <th className="py-3 px-3">Email</th>
                  <th className="py-3 px-3">Loja Vinculada</th>
                  <th className="py-3 px-3">Papel / Função</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {perfisFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">
                      Nenhum perfil encontrado.
                    </td>
                  </tr>
                ) : (
                  perfisFiltrados.map((perfil) => {
                    const lojaVinculada = lojas.find((l) => l.id === perfil.loja_id);
                    return (
                      <tr key={perfil.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-3 font-semibold text-white">
                          {perfil.nome || perfil.email.split("@")[0]}
                        </td>
                        <td className="py-3 px-3 text-slate-300 font-mono text-xs">{perfil.email}</td>
                        <td className="py-3 px-3">
                          {lojaVinculada ? (
                            <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                              🏢 {lojaVinculada.nome}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 border-slate-700">
                              Sem Loja
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <Badge
                            className={
                              perfil.role === "super_admin"
                                ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                : perfil.role === "admin"
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-slate-700 text-slate-300"
                            }
                          >
                            {perfil.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEditPerfil(perfil)}
                              className="h-8 px-2.5 text-xs border-white/15"
                            >
                              <Edit className="w-3.5 h-3.5 text-blue-400" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeletePerfil(perfil.id, perfil.email)}
                              className="h-8 px-2.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* GESTÃO DE PLANOS & MENSALIDADES */}
      {activeTab === "planos" && (
        <GlassCard className="rounded-3xl p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/10">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" /> Gestão de Planos & Mensalidades dos Lojistas
              </h3>
              <p className="text-xs text-slate-400">
                Controle o status financeiro de cada loja, aprove solicitações de liberação por Pix e aplique bloqueios por falta de pagamento.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs px-3 py-1.5">
                Receita Estimada: R$ {lojas.reduce((acc, l) => acc + (l.valor_mensalidade || 99.90), 0).toFixed(2).replace('.', ',')} / mês
              </Badge>
            </div>
          </div>

          {/* Sub-Abas: Lojas & Mensalidades | Histórico Global de Pagamentos */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <button
              type="button"
              onClick={() => setSubAbaPlanos("lojas")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                subAbaPlanos === "lojas"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                  : "bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Store className="w-4 h-4 text-blue-400" />
              Lojas & Mensalidades ({lojas.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setSubAbaPlanos("historico");
                fetchHistoricoGlobal();
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                subAbaPlanos === "historico"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                  : "bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <History className="w-4 h-4 text-emerald-400" />
              Histórico Global de Pagamentos ({historicoGlobal.length})
            </button>
          </div>

          {subAbaPlanos === "lojas" ? (
            <>
              {/* Painel da Chave PIX Global de Cobrança */}
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">Chave PIX Global de Cobrança dos Planos</h4>
                  </div>
                  <p className="text-xs text-slate-300">
                    Altere a Chave PIX padrão do sistema e aplique a mudança para <b>TODAS AS LOJAS</b> de uma só vez com um clique.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <input
                    type="text"
                    placeholder="ex: financeiro@sualoja.com ou CPF/CNPJ"
                    value={chavePixGlobal}
                    onChange={(e) => setChavePixGlobal(e.target.value)}
                    className="input-glass font-mono text-emerald-400 text-xs px-3 py-2 flex-1 md:w-72"
                  />
                  <Button
                    onClick={handleAplicarChavePixParaTodasLojas}
                    disabled={salvandoChavePixGlobal}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 shrink-0 cursor-pointer"
                  >
                    {salvandoChavePixGlobal ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Atualizando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" /> Aplicar para TODAS as Lojas
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Barra de busca por nome ou ID */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative flex-1 w-full sm:w-80">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome da loja ou ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-glass pl-9 w-full text-sm"
                  />
                </div>
                {searchTerm && (
                  <span className="text-xs text-slate-400">
                    Exibindo {lojasFiltradas.length} de {lojas.length} lojas
                  </span>
                )}
              </div>

              <div className="overflow-x-auto scrollbar-soft border border-white/10 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-900/80 text-slate-300 border-b border-white/10">
                      <th className="py-3 px-4">Loja / Nome</th>
                      <th className="py-3 px-3">Mensalidade</th>
                      <th className="py-3 px-3">Vencimento</th>
                      <th className="py-3 px-3">Status do Plano</th>
                      <th className="py-3 px-3">Solicitação de Liberação</th>
                      <th className="py-3 px-4 text-right">Ações de Controle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {lojasFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Nenhuma loja encontrada.
                        </td>
                      </tr>
                    ) : (
                      lojasFiltradas.map((loja) => {
                        const isVencido = isVencidoPorData(loja.data_vencimento);
                        const diasRestantes = getDiasRestantes(loja.data_vencimento);
                        const rawStatus = (loja.plano_status || 'ativo').toLowerCase();
                        let statusPlano: 'ativo' | 'pendente' | 'vencido' | 'bloqueado' = 'ativo';
                        if (!loja.ativo || rawStatus === 'bloqueado') {
                          statusPlano = 'bloqueado';
                        } else if (rawStatus === 'vencido' || isVencido) {
                          statusPlano = 'vencido';
                        } else if (rawStatus === 'pendente') {
                          statusPlano = 'pendente';
                        } else {
                          statusPlano = 'ativo';
                        }

                        const temSolicitacaoPendente = loja.solicitacao_liberacao_status === 'pendente_aprovacao';

                        return (
                          <tr key={loja.id} className="hover:bg-white/5 transition">
                            <td className="py-3.5 px-4 font-bold text-white">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                                <div>
                                  <p className="text-sm font-bold text-white">{loja.nome}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">ID: {loja.id.slice(0, 8)}...</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-3 font-mono font-bold text-emerald-400">
                              R$ {(loja.valor_mensalidade || 99.90).toFixed(2).replace('.', ',')}
                            </td>
                            <td className="py-3.5 px-3 font-mono">
                              <div>
                                <span className={`text-xs font-semibold ${isVencido ? 'text-red-400 font-bold' : 'text-slate-200'}`}>
                                  {formatarDataVencimento(loja.data_vencimento)}
                                </span>
                                {loja.data_vencimento && (
                                  <p className={`text-[10px] ${isVencido ? 'text-red-400 font-bold' : diasRestantes <= 5 ? 'text-amber-400 font-semibold' : 'text-slate-400'}`}>
                                    {isVencido ? `Vencido há ${Math.abs(diasRestantes)} dia(s)` : `${diasRestantes} dia(s) restante(s)`}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-3">
                              {statusPlano === 'ativo' && (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                  🟢 Ativo
                                </Badge>
                              )}
                              {statusPlano === 'pendente' && (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                  ⏳ Pendente
                                </Badge>
                              )}
                              {statusPlano === 'vencido' && (
                                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                                  ⚠️ Vencido
                                </Badge>
                              )}
                              {statusPlano === 'bloqueado' && (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                  🔴 Bloqueado
                                </Badge>
                              )}
                            </td>
                            <td className="py-3.5 px-3">
                              {temSolicitacaoPendente ? (
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-amber-500/30 text-amber-300 border-amber-500/50 animate-pulse">
                                    📩 Comprovante Enviado
                                  </Badge>
                                  {loja.comprovante_url && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setVerComprovanteModal({ lojaNome: loja.nome, url: loja.comprovante_url!, observacao: loja.observacao_plano || undefined })}
                                      className="h-7 text-[11px] text-blue-400 underline hover:text-blue-300 p-0"
                                    >
                                      Ver Imagem
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-500">Nenhuma</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {/* Botão de Renovação Rápida */}
                                <Button
                                  size="sm"
                                  onClick={() => handleRenovarPlano30Dias(loja)}
                                  className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1 rounded-xl shadow-md shadow-emerald-600/20 cursor-pointer"
                                  title="Renovar por mais 30 dias a partir do vencimento"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Renovar (+30d)
                                </Button>

                                {statusPlano === 'ativo' ? (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleAlterarStatusPlano(loja.id, 'bloqueado')}
                                    className="h-8 px-2.5 text-xs gap-1 rounded-xl cursor-pointer"
                                  >
                                    <XCircle className="w-3.5 h-3.5" /> Bloquear
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAlterarStatusPlano(loja.id, 'ativo')}
                                    className="h-8 px-2.5 text-xs gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20 rounded-xl cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Ativar
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenEditPlano(loja)}
                                  className="h-8 px-2.5 text-xs border-white/20 hover:bg-white/10 rounded-xl cursor-pointer"
                                  title="Editar valores e datas da loja"
                                >
                                  <Edit className="w-3.5 h-3.5 text-blue-400" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* SUB-ABA: HISTÓRICO GLOBAL DE PAGAMENTOS */
            <div className="space-y-6">
              {/* Cards de Métricas do Histórico */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-300">Total Faturado</span>
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white font-mono">
                    R$ {totalFaturadoHistorico.toFixed(2).replace('.', ',')}
                  </div>
                  <p className="text-[11px] text-emerald-300/70">Pagamentos confirmados</p>
                </div>

                <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-950/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-300">Pagamentos Aprovados</span>
                    <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {totalAprovadosHistorico}
                  </div>
                  <p className="text-[11px] text-blue-300/70">Mensalidades quitadas</p>
                </div>

                <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-950/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-300">Cobranças Pendentes</span>
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {totalPendentesHistorico}
                  </div>
                  <p className="text-[11px] text-amber-300/70">Aguardando confirmação bancária</p>
                </div>

                <div className="p-4 rounded-2xl border border-purple-500/20 bg-purple-950/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-purple-300">Comprovantes em Análise</span>
                    <Upload className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {totalAnaliseHistorico}
                  </div>
                  <p className="text-[11px] text-purple-300/70">Aguardando conferência manual</p>
                </div>
              </div>

              {/* Barra de Filtros do Histórico */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-2xl border border-white/5">
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <select
                    value={filtroLojaHistorico}
                    onChange={(e) => setFiltroLojaHistorico(e.target.value)}
                    className="input-glass text-xs py-2 px-3 rounded-xl bg-slate-900 border-white/10 text-slate-200"
                  >
                    <option value="todas">Todas as Lojas</option>
                    {lojas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filtroStatusHistorico}
                    onChange={(e) => setFiltroStatusHistorico(e.target.value)}
                    className="input-glass text-xs py-2 px-3 rounded-xl bg-slate-900 border-white/10 text-slate-200"
                  >
                    <option value="todos">Todos os Status</option>
                    <option value="aprovado">Aprovados</option>
                    <option value="pendente">Pendentes</option>
                    <option value="pendente_aprovacao">Em Análise (Comprovante)</option>
                    <option value="rejeitado">Rejeitados</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por loja, ID MP ou obs..."
                      value={buscaHistorico}
                      onChange={(e) => setBuscaHistorico(e.target.value)}
                      className="input-glass pl-8 py-1.5 w-full text-xs"
                    />
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchHistoricoGlobal}
                    disabled={loadingHistoricoGlobal}
                    className="h-8 gap-1.5 text-xs border-white/10 hover:bg-white/10 cursor-pointer shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingHistoricoGlobal ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                </div>
              </div>

              {/* Tabela do Histórico Global */}
              <div className="overflow-x-auto scrollbar-soft border border-white/10 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-900/80 text-slate-300 border-b border-white/10">
                      <th className="py-3 px-4">Data & Horário</th>
                      <th className="py-3 px-3">Loja</th>
                      <th className="py-3 px-3">Valor</th>
                      <th className="py-3 px-3">Método / Origem</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Observação</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {loadingHistoricoGlobal ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                          Carregando histórico de pagamentos...
                        </td>
                      </tr>
                    ) : historicoFiltrado.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          Nenhum registro de pagamento encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      historicoFiltrado.map((pag) => {
                        const isMercadoPago = !!pag.mp_payment_id;
                        const temComprovante = !!pag.comprovante_url;
                        const isManual = pag.forma_pagamento === 'manual' || (pag.observacao && pag.observacao.includes('SuperAdmin'));
                        const nomeLoja = pag.lojas?.nome || lojas.find(l => l.id === pag.loja_id)?.nome || 'Loja Desconhecida';

                        return (
                          <tr key={pag.id} className="hover:bg-white/5 transition">
                            <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                              {formatarDataHora(pag.data_pagamento || pag.created_at)}
                            </td>
                            <td className="py-3.5 px-3 font-bold text-white">
                              <div>
                                <p className="text-xs font-bold text-white">{nomeLoja}</p>
                                <p className="text-[10px] text-slate-400 font-mono">ID: {String(pag.loja_id).slice(0, 8)}...</p>
                              </div>
                            </td>
                            <td className="py-3.5 px-3 font-mono font-bold text-emerald-400 whitespace-nowrap">
                              R$ {Number(pag.valor || 0).toFixed(2).replace('.', ',')}
                            </td>
                            <td className="py-3.5 px-3">
                              {isMercadoPago ? (
                                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-mono text-[10px]">
                                  ⚡ PIX MP #{pag.mp_payment_id}
                                </Badge>
                              ) : isManual ? (
                                <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-[10px]">
                                  👤 Super Admin
                                </Badge>
                              ) : temComprovante ? (
                                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]">
                                  📎 Comprovante Manual
                                </Badge>
                              ) : (
                                <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                                  Chave PIX
                                </Badge>
                              )}
                            </td>
                            <td className="py-3.5 px-3">
                              {pag.status === 'aprovado' && (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                  🟢 Aprovado
                                </Badge>
                              )}
                              {pag.status === 'pendente' && (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                  ⏳ Pendente
                                </Badge>
                              )}
                              {pag.status === 'pendente_aprovacao' && (
                                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse">
                                  📩 Em Análise
                                </Badge>
                              )}
                              {pag.status === 'rejeitado' && (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                  🔴 Rejeitado
                                </Badge>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-xs text-slate-400 max-w-xs truncate" title={pag.observacao || ''}>
                              {pag.observacao || '-'}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {temComprovante && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setVerComprovanteModal({ lojaNome, url: pag.comprovante_url, observacao: pag.observacao })}
                                    className="h-7 text-xs text-blue-400 hover:text-blue-300 p-1"
                                    title="Visualizar imagem do comprovante"
                                  >
                                    Ver Print
                                  </Button>
                                )}

                                {pag.status !== 'aprovado' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleAprovarPagamentoHistorico(pag)}
                                    className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold gap-1 rounded-lg shadow-sm cursor-pointer"
                                    title="Aprovar pagamento e renovar loja por +30 dias"
                                  >
                                    <CheckCircle2 className="w-3 h-3" /> Aprovar (+30d)
                                  </Button>
                                )}

                                {pag.status === 'pendente_aprovacao' && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleRejeitarPagamentoHistorico(pag)}
                                    className="h-7 px-2 text-[11px] rounded-lg cursor-pointer"
                                  >
                                    Rejeitar
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* LOGS DE AUDITORIA */}
      {activeTab === "logs" && <LogsTab />}

      {/* APROVAÇÕES DE NOVAS LOJAS */}
      {activeTab === "aprovacoes" && (
        <GlassCard className="rounded-3xl p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/10">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-400" /> Aprovação de Novas Lojas & Contato Comercial
              </h3>
              <p className="text-xs text-slate-400">
                Analise os pedidos de cadastro de novas lojas, entre em contato direto pelo WhatsApp e aprove o acesso à plataforma.
              </p>
            </div>
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs px-3 py-1.5">
              {lojasPendentes.length} {lojasPendentes.length === 1 ? 'Solicitação Pendente' : 'Solicitações Pendentes'}
            </Badge>
          </div>

          <div className="overflow-x-auto scrollbar-soft border border-white/10 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-900/80 text-slate-300 border-b border-white/10">
                  <th className="py-3 px-4">Loja / Nome</th>
                  <th className="py-3 px-3">Telefone / WhatsApp</th>
                  <th className="py-3 px-3">Data Vencimento</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Ações de Aprovação & Contato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {lojasPendentes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Nenhuma loja pendente de aprovação no momento.
                    </td>
                  </tr>
                ) : (
                  lojasPendentes.map((loja) => {
                    const cleanPhone = (loja.telefone || '').replace(/\D/g, '');
                    const whatsappUrl = cleanPhone
                      ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá, tudo bem? Vi que você cadastrou a loja "${loja.nome}" no Phone Center OS! Gostaria de confirmar seu cadastro para liberar seu acesso.`)}`
                      : null;

                    return (
                      <tr key={loja.id} className="hover:bg-white/5 transition">
                        <td className="py-3.5 px-4 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                            <div>
                              <p className="text-sm font-bold text-white">{loja.nome}</p>
                              <p className="text-[10px] text-slate-400 font-mono">ID: {loja.id.slice(0, 8)}...</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-slate-300 font-mono">
                          {loja.telefone || 'Não informado'}
                        </td>
                        <td className="py-3.5 px-3 text-slate-300 font-mono">
                          {loja.data_vencimento ? new Date(loja.data_vencimento).toLocaleDateString('pt-BR') : 'Aguardando'}
                        </td>
                        <td className="py-3.5 px-3">
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse">
                            ⏳ Aguardando Aprovação
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {whatsappUrl && (
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-8 px-3 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
                              >
                                💬 WhatsApp
                              </a>
                            )}

                            <Button
                              size="sm"
                              onClick={() => handleAprovarLiberacao(loja)}
                              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1 rounded-xl shadow-md shadow-emerald-600/30"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar & Liberar
                            </Button>

                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeletingLoja(loja)}
                              className="h-8 px-2.5 rounded-xl"
                              title="Rejeitar solicitação"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}



      {/* MODAL: NOVA LOJA */}
      {showNovaLoja && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-md">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-400" /> Cadastrar Nova Loja
              </h3>
              <button onClick={() => setShowNovaLoja(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCriarLoja} className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Nome da Loja *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Lucas Imports Celulares"
                  value={novaLojaForm.nome}
                  onChange={(e) => setNovaLojaForm({ ...novaLojaForm, nome: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Telefone / WhatsApp</label>
                <input
                  type="text"
                  placeholder="(31) 99999-9999"
                  value={novaLojaForm.telefone}
                  onChange={(e) => setNovaLojaForm({ ...novaLojaForm, telefone: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Subtítulo do Header</label>
                <input
                  type="text"
                  placeholder="Ex: Sistema de Gestão & Assistência"
                  value={novaLojaForm.subtitulo}
                  onChange={(e) => setNovaLojaForm({ ...novaLojaForm, subtitulo: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <Button type="button" variant="ghost" onClick={() => setShowNovaLoja(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  Criar Loja
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR LOJA */}
      {editingLoja && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-lg">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-400" /> Editar Loja: {editingLoja.nome}
              </h3>
              <button onClick={() => setEditingLoja(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateLoja} className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Nome da Loja</label>
                <input
                  type="text"
                  required
                  value={editLojaForm.nome}
                  onChange={(e) => setEditLojaForm({ ...editLojaForm, nome: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Telefone</label>
                <input
                  type="text"
                  value={editLojaForm.telefone}
                  onChange={(e) => setEditLojaForm({ ...editLojaForm, telefone: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">URL do Logo</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={editLojaForm.logo_url}
                  onChange={(e) => setEditLojaForm({ ...editLojaForm, logo_url: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <label className="text-xs text-slate-300 font-semibold flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editLojaForm.ativo}
                    onChange={(e) => setEditLojaForm({ ...editLojaForm, ativo: e.target.checked })}
                    className="rounded border-slate-700"
                  />
                  Loja Ativa no Sistema
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <Button type="button" variant="ghost" onClick={() => setEditingLoja(null)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  Salvar Alterações
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO PERFIL/USUÁRIO */}
      {showNovoPerfil && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-md">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" /> Vincular Novo Acesso / Perfil
              </h3>
              <button onClick={() => setShowNovoPerfil(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCriarPerfil} className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Email do Usuário *</label>
                <input
                  type="email"
                  required
                  placeholder="usuario@email.com"
                  value={novoPerfilForm.email}
                  onChange={(e) => setNovoPerfilForm({ ...novoPerfilForm, email: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300 font-semibold">Senha Inicial de Acesso *</label>
                  <button
                    type="button"
                    onClick={() => {
                      const randomPass = Math.random().toString(36).slice(-8) + 'A1!';
                      setNovoPerfilForm({ ...novoPerfilForm, senha: randomPass });
                    }}
                    className="text-[11px] text-blue-400 hover:text-blue-300 underline font-semibold"
                  >
                    Gerar Senha
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Mínimo 6 caracteres"
                  value={novoPerfilForm.senha}
                  onChange={(e) => setNovoPerfilForm({ ...novoPerfilForm, senha: e.target.value })}
                  className="input-glass w-full text-sm font-mono text-emerald-400"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Nome Completo</label>
                <input
                  type="text"
                  placeholder="Nome do lojista/operador"
                  value={novoPerfilForm.nome}
                  onChange={(e) => setNovoPerfilForm({ ...novoPerfilForm, nome: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Loja Destino</label>
                <select
                  value={novoPerfilForm.loja_id}
                  onChange={(e) => setNovoPerfilForm({ ...novoPerfilForm, loja_id: e.target.value })}
                  className="input-glass w-full text-sm py-2 px-3"
                >
                  <option value="">Nenhuma (Global / Pendente)</option>
                  {lojas.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Papel / Função</label>
                <select
                  value={novoPerfilForm.role}
                  onChange={(e) => setNovoPerfilForm({ ...novoPerfilForm, role: e.target.value as any })}
                  className="input-glass w-full text-sm py-2 px-3"
                >
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="gerente">Gerente</option>
                  <option value="tecnico">Técnico</option>
                  <option value="vendedor">Vendedor</option>
                  <option value="operador">Operador</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <Button type="button" variant="ghost" onClick={() => setShowNovoPerfil(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  Criar Acesso
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR PERFIL */}
      {editingPerfil && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-md">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-400" /> Editar Perfil
              </h3>
              <button onClick={() => setEditingPerfil(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdatePerfil} className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Nome</label>
                <input
                  type="text"
                  value={editPerfilForm.nome}
                  onChange={(e) => setEditPerfilForm({ ...editPerfilForm, nome: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Email</label>
                <input
                  type="email"
                  required
                  value={editPerfilForm.email}
                  onChange={(e) => setEditPerfilForm({ ...editPerfilForm, email: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Loja Vinculada</label>
                <select
                  value={editPerfilForm.loja_id}
                  onChange={(e) => setEditPerfilForm({ ...editPerfilForm, loja_id: e.target.value })}
                  className="input-glass w-full text-sm py-2 px-3"
                >
                  <option value="">Sem Loja Vinculada</option>
                  {lojas.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Papel / Função</label>
                <select
                  value={editPerfilForm.role}
                  onChange={(e) => setEditPerfilForm({ ...editPerfilForm, role: e.target.value as any })}
                  className="input-glass w-full text-sm py-2 px-3"
                >
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="gerente">Gerente</option>
                  <option value="tecnico">Técnico</option>
                  <option value="vendedor">Vendedor</option>
                  <option value="operador">Operador</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <Button type="button" variant="ghost" onClick={() => setEditingPerfil(null)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  Salvar Perfil
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DELETAR LOJA COM SEGURANÇA */}
      {deletingLoja && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-md border-red-500/30">
            <div className="modal-header bg-red-950/40 border-red-500/20">
              <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" /> Excluir Loja Definitivamente
              </h3>
              <button onClick={() => setDeletingLoja(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-300">
                Esta ação é <strong className="text-red-400">IRREVERSÍVEL</strong>. Para confirmar a exclusão da loja{" "}
                <strong className="text-white">"{deletingLoja.nome}"</strong>, digite o nome exato da loja abaixo:
              </p>

              <input
                type="text"
                placeholder={deletingLoja.nome}
                value={confirmNomeLoja}
                onChange={(e) => setConfirmNomeLoja(e.target.value)}
                className="input-glass w-full text-sm border-red-500/40 focus:border-red-500"
              />

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <Button type="button" variant="ghost" onClick={() => setDeletingLoja(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={confirmNomeLoja.trim().toLowerCase() !== deletingLoja.nome.trim().toLowerCase()}
                  onClick={handleDeletarLoja}
                >
                  Confirmar Exclusão
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR PLANO & MENSALIDADE DA LOJA */}
      {editingPlanoLoja && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-lg">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" /> Configurar Plano: {editingPlanoLoja.nome}
              </h3>
              <button onClick={() => setEditingPlanoLoja(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditPlano} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-300 font-semibold mb-1 block">Status do Plano</label>
                  <select
                    value={editPlanoForm.plano_status}
                    onChange={(e) => setEditPlanoForm({ ...editPlanoForm, plano_status: e.target.value as any })}
                    className="input-glass w-full text-sm py-2 px-3"
                  >
                    <option value="ativo">🟢 Ativo</option>
                    <option value="pendente">⏳ Pendente</option>
                    <option value="vencido">⚠️ Vencido</option>
                    <option value="bloqueado">🔴 Bloqueado</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold mb-1 block">Valor Mensalidade (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editPlanoForm.valor_mensalidade}
                    onChange={(e) => setEditPlanoForm({ ...editPlanoForm, valor_mensalidade: parseFloat(e.target.value) || 0 })}
                    className="input-glass w-full text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Data de Vencimento</label>
                <input
                  type="date"
                  value={editPlanoForm.data_vencimento}
                  onChange={(e) => setEditPlanoForm({ ...editPlanoForm, data_vencimento: e.target.value })}
                  className="input-glass w-full text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Chave Pix de Cobrança da Loja</label>
                <input
                  type="text"
                  value={editPlanoForm.chave_pix_cobranca}
                  onChange={(e) => setEditPlanoForm({ ...editPlanoForm, chave_pix_cobranca: e.target.value })}
                  className="input-glass w-full text-sm font-mono text-emerald-400"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Observações / Anotações do Plano</label>
                <textarea
                  value={editPlanoForm.observacao_plano}
                  onChange={(e) => setEditPlanoForm({ ...editPlanoForm, observacao_plano: e.target.value })}
                  placeholder="Ex: Desconto acordado de 10%, vencimento personalizado..."
                  className="input-glass w-full text-sm h-20 resize-none p-2.5"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <Button type="button" variant="ghost" onClick={() => setEditingPlanoLoja(null)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
                  Salvar Configurações
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VER COMPROVANTE ENVIADO PELO LOJISTA */}
      {verComprovanteModal && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-xl">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Comprovante de Pagamento: {verComprovanteModal.lojaNome}
              </h3>
              <button onClick={() => setVerComprovanteModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-center">
              {verComprovanteModal.observacao && (
                <div className="p-3 bg-slate-950 rounded-xl border border-white/10 text-xs text-slate-300 text-left">
                  <p className="font-semibold text-slate-400 mb-1">Mensagem do Lojista:</p>
                  <p>{verComprovanteModal.observacao}</p>
                </div>
              )}
              <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-white/10 p-2 bg-slate-950 flex items-center justify-center">
                <img src={verComprovanteModal.url} alt="Comprovante Pix" className="max-w-full h-auto object-contain rounded" />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
                <Button type="button" variant="secondary" onClick={() => setVerComprovanteModal(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
