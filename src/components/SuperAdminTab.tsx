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
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Loja {
  id: string;
  nome: string;
  telefone: string | null;
  subtitulo?: string | null;
  logo_url?: string | null;
  assinatura_url?: string | null;
  plano?: string | null;
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "lojas" | "usuarios" | "sql">("dashboard");
  
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
      const { data: vendasData } = await supabase.from("vendas").select("loja_id, valorTotal");
      const { data: aparelhosData } = await supabase.from("aparelhos").select("loja_id").eq("ativo", true);

      const stats: Record<string, LojaStats> = {};

      lojasLista.forEach((loja) => {
        stats[loja.id] = {
          lojaId: loja.id,
          totalVendas: 0,
          faturamentoTotal: 0,
          totalAparelhos: 0,
          totalUsuarios: perfisLista.filter((p) => p.loja_id === loja.id).length,
        };
      });

      if (vendasData) {
        vendasData.forEach((v: any) => {
          if (v.loja_id && stats[v.loja_id]) {
            stats[v.loja_id].totalVendas += 1;
            stats[v.loja_id].faturamentoTotal += Number(v.valorTotal) || 0;
          }
        });
      }

      if (aparelhosData) {
        aparelhosData.forEach((a: any) => {
          if (a.loja_id && stats[a.loja_id]) {
            stats[a.loja_id].totalAparelhos += 1;
          }
        });
      }

      setStatsMap(stats);
    } catch (error: any) {
      console.error("Erro ao carregar dados do SuperAdmin:", error);
      toast.error("Erro ao carregar painel SuperAdmin: " + error.message);
    } finally {
      setLoading(false);
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
    if (!novoPerfilForm.email.trim()) return toast.error("O email é obrigatório.");

    const generateUUID = () => {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
    };

    try {
      const { data, error } = await supabase
        .from("perfis")
        .insert([
          {
            id: generateUUID(),
            email: novoPerfilForm.email.trim().toLowerCase(),
            nome: novoPerfilForm.nome.trim() || novoPerfilForm.email.split("@")[0],
            role: novoPerfilForm.role,
            loja_id: novoPerfilForm.loja_id || null,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success(`👤 Perfil "${data.email}" vinculado com sucesso!`);
      setShowNovoPerfil(false);
      setNovoPerfilForm({ email: "", nome: "", role: "admin", loja_id: "" });
      fetchDadosGlobais();
    } catch (error: any) {
      toast.error("Erro ao criar perfil: " + error.message);
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
            { id: "sql", label: "SQL & Permissões", icon: <FileCode2 className="w-4 h-4" /> },
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

      {/* SQL & INSTRUÇÕES DE BANCO */}
      {activeTab === "sql" && (
        <GlassCard className="rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileCode2 className="w-5 h-5 text-indigo-400" />
                Script SQL de Liberação do SuperAdmin
              </h3>
              <p className="text-xs text-slate-400">
                Execute este script no Editor SQL do Supabase caso alguma política de segurança (RLS) esteja bloqueando acessos.
              </p>
            </div>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(sqlScript);
                toast.success("Script SQL copiado com sucesso!");
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
            >
              <Copy className="w-4 h-4" />
              Copiar SQL
            </Button>
          </div>

          <pre className="p-4 rounded-2xl bg-slate-950 border border-white/10 text-xs font-mono text-indigo-300 overflow-x-auto scrollbar-soft">
            {sqlScript}
          </pre>
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
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Nome do Usuário</label>
                <input
                  type="text"
                  placeholder="Nome do operador/vendedor"
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
    </div>
  );
}
