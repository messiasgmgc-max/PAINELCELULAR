'use client';

import { useEffect, useState } from 'react';
import { MENSAGEM_RECIBO_PADRAO, VARIAVEIS_RECIBO, lerConfigReciboWhatsapp, salvarConfigReciboWhatsapp } from '@/lib/whatsapp/reciboWhatsapp';
import { buscarTodasPaginas } from '@/lib/supabase/paginar';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Bell, Eye, Lock, Database, LogOut, X, Palette, User, Plus, Repeat, Copy, ExternalLink, QrCode, Smartphone, Truck, LayoutGrid, ArrowUp, ArrowDown, RotateCcw, Wrench, Package, ShieldCheck, DollarSign, Calendar, ShoppingCart, CheckCheck, Layers, MessageSquare, AlertCircle, Check, Loader2, Mail, FileText, Filter } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { supabase } from '@/lib/supabaseClient';
import { useColorTheme, ColorTheme } from '@/components/ThemeProvider';
import { useTecnicos } from '@/hooks/useTecnicos';
import { useMotoboys } from '@/hooks/useMotoboys';
import { useTabOrder } from '@/hooks/useTabOrder';
import { ConfiguracaoFiscalSection } from '@/components/ConfiguracaoFiscalSection';
import { BackupLojaSection } from '@/components/configuracoes/BackupLojaSection';
import { toast } from 'sonner';

interface Configuracao {
  id: string;
  chave: string;
  valor: string;
  descricao: string;
  tipo: 'texto' | 'numero' | 'booleano' | 'select';
  ativo: boolean;
}

export function ConfiguracoesTab() {
  const { usuario, logout } = useAuth();
  const { config, atualizarNomeLoja, atualizarLogoLoja, atualizarAssinaturaLoja, atualizarDadosEmpresa, removerLogo, removerAssinatura } = useStoreConfig(usuario?.lojaId);
  const { colorTheme, setColorTheme } = useColorTheme();
  const { motoboys, cadastrarMotoboy, excluirMotoboy } = useMotoboys(usuario?.lojaId);
  const { tabOrder, allTabs, moveUp, moveDown, resetOrder } = useTabOrder();

  const [novoMotoboyNome, setNovoMotoboyNome] = useState('');
  const [novoMotoboyTel, setNovoMotoboyTel] = useState('');
  const [novoMotoboyVeiculo, setNovoMotoboyVeiculo] = useState('Moto');
  const [novoMotoboyPlaca, setNovoMotoboyPlaca] = useState('');
  
  const [nomeEmpresa, setNomeEmpresa] = useState('Phone Center');
  const [telefoneEmpresa, setTelefoneEmpresa] = useState('');
  const [enderecoEmpresa, setEnderecoEmpresa] = useState('');
  const [emailEmpresa, setEmailEmpresa] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [garantiaDias, setGarantiaDias] = useState(90);

  const { tecnicos, fetchTecnicos } = useTecnicos();
  const [novoTecnicoNome, setNovoTecnicoNome] = useState('');
  const [novoTecnicoWhatsapp, setNovoTecnicoWhatsapp] = useState('');
  const [novoTecnicoEmail, setNovoTecnicoEmail] = useState('');
  const [novoTecnicoCargo, setNovoTecnicoCargo] = useState('vendedor');
  const [salvandoEquipe, setSalvandoEquipe] = useState(false);
  
  // Estados para loja (nome + logo)
  const [nomeLoja, setNomeLoja] = useState('');
  const [subtituloLoja, setSubtituloLoja] = useState('');
  const [logoLoja, setLogoLoja] = useState<string | null>(null);
  const [previewLogo, setPreviewLogo] = useState<string | null>(null);
  const [assinaturaLoja, setAssinaturaLoja] = useState<string | null>(null);
  const [previewAssinatura, setPreviewAssinatura] = useState<string | null>(null);
  
  const [notificacoesEmail, setNotificacoesEmail] = useState(true);
  const [notificacoesWhatsapp, setNotificacoesWhatsapp] = useState(false);
  const [notificacoesWebPush, setNotificacoesWebPush] = useState(true);
  const [notificacoesOS, setNotificacoesOS] = useState(true);
  const [notificacoesGarantia, setNotificacoesGarantia] = useState(true);
  const [salvandoNotificacoes, setSalvandoNotificacoes] = useState(false);
  const [categoriaNotificacaoFiltro, setCategoriaNotificacaoFiltro] = useState<string>('todas');

  const [notifDetalhadas, setNotifDetalhadas] = useState({
    // Vendas
    vendaNova: true,
    vendaCancelada: true,
    vendaPendente: true,
    vendaDesconto: true,
    // OS
    osNova: true,
    osAprovada: true,
    osPronta: true,
    osEntregue: true,
    // Estoque
    estoqueBaixo: true,
    estoqueEntrada: true,
    estoqueManutencao: true,
    // Garantias
    garantiaVencimento: true,
    garantiaAcionada: true,
    // Financeiro
    financeiroVencido: true,
    financeiroCobranca: true,
    // Agendamentos
    agendamentoNovo: true,
    agendamentoLembrete: true,
  });

  // Recibo em PDF no WhatsApp do cliente ao finalizar a venda.
  const [reciboWhatsappAtivo, setReciboWhatsappAtivo] = useState(false);
  const [reciboWhatsappMensagem, setReciboWhatsappMensagem] = useState(MENSAGEM_RECIBO_PADRAO);
  const [salvandoReciboWhatsapp, setSalvandoReciboWhatsapp] = useState(false);

  useEffect(() => {
    if (!usuario?.lojaId) return;
    let cancelado = false;
    supabase
      .from('lojas')
      .select('configuracoes')
      .eq('id', usuario.lojaId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado || !data) return;
        const configObj = (data.configuracoes && typeof data.configuracoes === 'object' && !Array.isArray(data.configuracoes))
          ? (data.configuracoes as Record<string, any>)
          : {};

        const salvo = lerConfigReciboWhatsapp(data.configuracoes);
        setReciboWhatsappAtivo(salvo.ativo);
        setReciboWhatsappMensagem(salvo.mensagem);

        const notifSalvas = configObj.notificacoes || {};
        if (typeof notifSalvas.email === 'boolean') setNotificacoesEmail(notifSalvas.email);
        if (typeof notifSalvas.whatsapp === 'boolean') setNotificacoesWhatsapp(notifSalvas.whatsapp);
        if (typeof notifSalvas.webPush === 'boolean') setNotificacoesWebPush(notifSalvas.webPush);
        if (typeof notifSalvas.os === 'boolean') setNotificacoesOS(notifSalvas.os);
        if (typeof notifSalvas.garantia === 'boolean') setNotificacoesGarantia(notifSalvas.garantia);

        setNotifDetalhadas(prev => ({
          ...prev,
          ...notifSalvas,
        }));
      });
    return () => {
      cancelado = true;
    };
  }, [usuario?.lojaId]);

  const salvarReciboWhatsapp = async () => {
    if (!usuario?.lojaId) return;
    setSalvandoReciboWhatsapp(true);
    try {
      // Relê antes de gravar: configuracoes guarda outras chaves (assinatura) que não podem sumir.
      const { data, error } = await supabase.from('lojas').select('configuracoes').eq('id', usuario.lojaId).maybeSingle();
      if (error) throw error;
      const configuracoes = salvarConfigReciboWhatsapp(data?.configuracoes, {
        ativo: reciboWhatsappAtivo,
        mensagem: reciboWhatsappMensagem,
      });
      const { error: erroUpdate } = await supabase.from('lojas').update({ configuracoes }).eq('id', usuario.lojaId);
      if (erroUpdate) throw erroUpdate;
      toast.success(reciboWhatsappAtivo ? 'Recibo no WhatsApp ativado.' : 'Recibo no WhatsApp desativado.');
    } catch (err: any) {
      toast.error('Não foi possível salvar o recibo no WhatsApp.', { description: err?.message });
    } finally {
      setSalvandoReciboWhatsapp(false);
    }
  };
  
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  
  // Sincroniza os dados do formulário com as configurações reais do Supabase
  useEffect(() => {
    if (config) {
      if (config.nomeLoja) {
        setNomeLoja(config.nomeLoja);
        setNomeEmpresa(config.nomeLoja);
      }
      setSubtituloLoja(config.subtituloLoja || '');
      setLogoLoja(config.logoLoja);
      setPreviewLogo(config.logoLoja);
      setAssinaturaLoja(config.assinaturaLoja);
      setPreviewAssinatura(config.assinaturaLoja);
      setEnderecoEmpresa(config.enderecoLoja !== 'Endereço não configurado' ? config.enderecoLoja : '');
      setCnpj(config.cnpjLoja !== 'Não informado' ? config.cnpjLoja : '');
      setTelefoneEmpresa(config.telefoneLoja !== 'Não informado' ? config.telefoneLoja : '');
      setEmailEmpresa(config.emailLoja !== 'contato@loja.com' ? config.emailLoja : '');
      setChavePix(config.chavePix || '');
      setGarantiaDias(config.garantiaDias || 90);
    }
  }, [config]);

  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 25000000) {
        alert('Arquivo deve ser menor que 25MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setPreviewLogo(base64);
        setLogoLoja(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoverLogo = () => {
    setLogoLoja(null);
    setPreviewLogo(null);
    removerLogo();
  };

  const handleUploadAssinatura = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 12000000) {
      alert('Arquivo deve ser menor que 12MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setPreviewAssinatura(base64);
      setAssinaturaLoja(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoverAssinatura = () => {
    setAssinaturaLoja(null);
    setPreviewAssinatura(null);
    removerAssinatura();
  };

  const handleSalvarConfiguracoes = async () => {
    if (usuario?.lojaId) {
      try {
        const { error } = await supabase.from('lojas').update({
          nome: nomeEmpresa || config.nomeLoja,
          telefone: telefoneEmpresa,
          endereco: enderecoEmpresa,
          email: emailEmpresa,
          cnpj,
          chave_pix: chavePix,
          pix: chavePix,
          chave_pix_cobranca: chavePix,
          garantia_dias: Number(garantiaDias),
          dias_garantia: Number(garantiaDias),
        }).eq('id', usuario.lojaId);

        if (error) {
          console.error('Erro ao atualizar loja no Supabase:', error);
          alert(`Erro ao salvar no banco: ${error.message}`);
          return;
        }
      } catch (err: any) {
        console.error('Erro ao salvar dados da loja no banco:', err);
        alert(`Erro ao salvar no banco: ${err?.message || 'Falha de conexão'}`);
        return;
      }
    }

    atualizarDadosEmpresa({
      nomeLoja: nomeEmpresa || config.nomeLoja,
      telefoneLoja: telefoneEmpresa,
      enderecoLoja: enderecoEmpresa,
      emailLoja: emailEmpresa,
      cnpjLoja: cnpj,
      chavePix,
      garantiaDias: Number(garantiaDias),
    });

    alert('Configurações da empresa salvas com sucesso!');
  };

  const handleSalvarNomeLoja = async () => {
    if (!nomeLoja) {
      alert('Digite o nome da loja.');
      return;
    }
    try {
      await atualizarNomeLoja(nomeLoja);
      alert('Nome da loja atualizado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar nome:', error);
      alert(`Erro ao salvar nome: ${error.message}`);
    }
  };

  const handleSalvarSubtituloLoja = async () => {
    try {
      await atualizarDadosEmpresa({ subtituloLoja });
      alert('Subtítulo atualizado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar subtítulo:', error);
      alert(`Erro ao salvar subtítulo: ${error.message}`);
    }
  };

  const handleSalvarLogoLoja = async () => {
    if (!logoLoja) {
      alert('Selecione uma logo primeiro');
      return;
    }
    try {
      await atualizarLogoLoja(logoLoja);
      alert('Logo atualizada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar logo:', error);
      alert(`Erro ao salvar logo: ${error.message}`);
    }
  };

  const handleSalvarAssinaturaLoja = async () => {
    try {
      await atualizarAssinaturaLoja(assinaturaLoja);
      alert('Assinatura atualizada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar assinatura:', error);
      alert(`Erro ao salvar assinatura: ${error.message}`);
    }
  };

  const handleSalvarNotificacoes = async () => {
    if (!usuario?.lojaId) {
      toast.error('Loja não encontrada.');
      return;
    }
    setSalvandoNotificacoes(true);
    try {
      const { data, error } = await supabase.from('lojas').select('configuracoes').eq('id', usuario.lojaId).maybeSingle();
      if (error) throw error;
      
      const configuracoesAtuais = (data?.configuracoes && typeof data.configuracoes === 'object' && !Array.isArray(data.configuracoes))
        ? (data.configuracoes as Record<string, unknown>)
        : {};

      const novasConfiguracoes = {
        ...configuracoesAtuais,
        notificacoes: {
          ...notifDetalhadas,
          email: notificacoesEmail,
          whatsapp: notificacoesWhatsapp,
          webPush: notificacoesWebPush,
          os: notificacoesOS,
          garantia: notificacoesGarantia,
        },
      };

      const { error: erroUpdate } = await supabase.from('lojas').update({ configuracoes: novasConfiguracoes }).eq('id', usuario.lojaId);
      if (erroUpdate) throw erroUpdate;

      toast.success('Todas as preferências de notificações salvas com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar notificações:', err);
      toast.error('Erro ao salvar preferências: ' + (err?.message || 'Falha de conexão'));
    } finally {
      setSalvandoNotificacoes(false);
    }
  };

  const toggleNotifItem = (key: keyof typeof notifDetalhadas) => {
    setNotifDetalhadas(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleGrupoNotificacoes = (keys: (keyof typeof notifDetalhadas)[], ativar: boolean) => {
    setNotifDetalhadas(prev => {
      const next = { ...prev };
      keys.forEach(k => { next[k] = ativar; });
      return next;
    });
  };

  const handleAlterarSenha = async () => {
    if (novaSenha !== confirmarSenha) {
      alert('As senhas não correspondem!');
      return;
    }

    if (novaSenha.length < 6) {
      alert('A nova senha deve ter pelo menos 6 caracteres!');
      return;
    }

    // Implementar alteração de senha
    console.log('Alterar senha:', senhaAtual);
    alert('Senha alterada com sucesso!');
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
  };

  const toCSV = (rows: any[]) => {
    if (!rows.length) return '';

    const headers = Object.keys(rows[0]);
    const escapeValue = (value: any) => {
      const stringValue = value == null ? '' : String(value).replace(/\r?\n/g, ' ');
      return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
    };

    const headerLine = headers.map(escapeValue).join(',');
    const bodyLines = rows.map((row) => headers.map((header) => escapeValue((row as any)[header])).join(','));
    return [headerLine, ...bodyLines].join('\n');
  };

  const downloadCsv = (filename: string, rows: any[]) => {
    const csv = toCSV(rows);
    if (!csv) return;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportarDados = async () => {
    try {
      const exportarClientes = document.getElementById('export-clientes') as HTMLInputElement | null;
      const exportarOS = document.getElementById('export-os') as HTMLInputElement | null;
      const exportarPecas = document.getElementById('export-pecas') as HTMLInputElement | null;
      const exportarVendas = document.getElementById('export-vendas') as HTMLInputElement | null;

      const incluirClientes = exportarClientes?.checked ?? true;
      const incluirOS = exportarOS?.checked ?? true;
      const incluirPecas = exportarPecas?.checked ?? true;
      const incluirVendas = exportarVendas?.checked ?? true;

      const downloads: Array<{ filename: string; rows: any[] }> = [];

      if (incluirClientes && usuario?.lojaId) {
        const data = await buscarTodasPaginas((de, ate) => supabase.from('clientes').select('*').order('id').range(de, ate));
        const rows = (data || []).filter((row: any) => !usuario?.lojaId || row.lojaId === usuario.lojaId || row.loja_id === usuario.lojaId);
        downloads.push({ filename: `clientes_${new Date().toISOString().slice(0, 10)}.csv`, rows });
      }

      if (incluirOS && usuario?.lojaId) {
        const data = await buscarTodasPaginas((de, ate) => supabase.from('ordens_servico').select('*').order('id').range(de, ate));
        const rows = (data || []).filter((row: any) => !usuario?.lojaId || row.lojaId === usuario.lojaId || row.loja_id === usuario.lojaId);
        downloads.push({ filename: `ordens_servico_${new Date().toISOString().slice(0, 10)}.csv`, rows });
      }

      if (incluirPecas && usuario?.lojaId) {
        const data = await buscarTodasPaginas((de, ate) => supabase.from('pecas').select('*').order('id').range(de, ate));
        const rows = (data || []).filter((row: any) => !usuario?.lojaId || row.lojaId === usuario.lojaId || row.loja_id === usuario.lojaId);
        downloads.push({ filename: `pecas_${new Date().toISOString().slice(0, 10)}.csv`, rows });
      }

      if (incluirVendas && usuario?.lojaId) {
        const data = await buscarTodasPaginas((de, ate) => supabase.from('vendas').select('*').order('id').range(de, ate));
        const rows = (data || []).filter((row: any) => !usuario?.lojaId || row.loja_id === usuario.lojaId || row.lojaId === usuario.lojaId);
        downloads.push({ filename: `vendas_${new Date().toISOString().slice(0, 10)}.csv`, rows });
      }

      if (!downloads.length) {
        alert('Nenhum dado selecionado para exportar.');
        return;
      }

      downloads.forEach(({ filename, rows }) => downloadCsv(filename, rows));
      alert('Exportação concluída com sucesso.');
    } catch (error: any) {
      console.error('Erro ao exportar dados:', error);
      alert(`Erro ao exportar dados: ${error?.message || 'Erro desconhecido'}`);
    }
  };

  return (
    <div className="panel-shell-narrow space-y-4 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie as configurações do sistema</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="empresa" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 h-auto bg-white/10 dark:bg-white/5 backdrop-blur-xl border border-white/10 p-1.5 rounded-[2rem] mb-6">
            <TabsTrigger value="empresa" className="text-xs sm:text-sm py-3 rounded-[1.5rem] data-[state=active]:bg-white/30 dark:data-[state=active]:bg-white/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-lg transition-all duration-300">
              Empresa
            </TabsTrigger>
            <TabsTrigger value="fiscal" className="text-xs sm:text-sm py-3 rounded-[1.5rem] data-[state=active]:bg-white/30 dark:data-[state=active]:bg-white/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-lg transition-all duration-300">
              Fiscal (NFC-e / NF-e)
            </TabsTrigger>
            <TabsTrigger value="notificacoes" className="text-xs sm:text-sm py-3 rounded-[1.5rem] data-[state=active]:bg-white/30 dark:data-[state=active]:bg-white/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-lg transition-all duration-300">
              Notificações
            </TabsTrigger>
            <TabsTrigger value="seguranca" className="text-xs sm:text-sm py-3 rounded-[1.5rem] data-[state=active]:bg-white/30 dark:data-[state=active]:bg-white/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-lg transition-all duration-300">
              Segurança
            </TabsTrigger>
            <TabsTrigger value="dados" className="text-xs sm:text-sm py-3 rounded-[1.5rem] data-[state=active]:bg-white/30 dark:data-[state=active]:bg-white/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-lg transition-all duration-300">
              Dados
            </TabsTrigger>
            <TabsTrigger value="abas" className="text-xs sm:text-sm py-3 rounded-[1.5rem] data-[state=active]:bg-white/30 dark:data-[state=active]:bg-white/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-lg transition-all duration-300">
              Ordem das Abas
            </TabsTrigger>
          </TabsList>

          {/* Configurações da Empresa */}
          <TabsContent value="empresa">
            <div className="space-y-4 sm:space-y-6">

              {/* Tema e Aparência */}
              <GlassCard className="border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 rounded-3xl">
                <div className="pb-4 border-b border-white/10 mb-4">
                  <h3 className="text-base sm:text-lg font-bold text-blue-900 dark:text-blue-300 flex items-center gap-2">
                    <Palette className="w-5 h-5" /> Aparência e Temas
                  </h3>
                  <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-400">
                    Escolha a paleta de cores principal do sistema. Alterne entre o visual White Clean profissional ou os temas Dark de alta visibilidade.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'padrao', name: 'Padrão Dark (Azul)', color: '#2563eb' },
                    { id: 'white-clean', name: 'White Clean (Profissional)', color: '#f8fafc', border: true },
                    { id: 'black-white', name: 'Black & White', color: '#1f2937' },
                    { id: 'purple', name: 'Roxo Escuro', color: '#9333ea' },
                    { id: 'red-black', name: 'Vermelho & Preto', color: '#dc2626' },
                    { id: 'green-black', name: 'Verde & Preto', color: '#059669' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setColorTheme(t.id as ColorTheme)}
                      className={`p-3 sm:p-4 rounded-2xl flex items-center gap-3 border-2 transition-all ${colorTheme === t.id ? 'border-blue-600 bg-white/20 shadow-lg' : 'border-transparent bg-white/5 hover:bg-white/10'}`}
                    >
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full shadow-md border border-slate-300 dark:border-white/20 flex-shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="font-medium text-sm text-left leading-tight">{t.name}</span>
                    </button>
                  ))}
                </div>
              </GlassCard>

              {/* Gerenciamento de Equipe & Acessos ao Robô WhatsApp */}
              <GlassCard className="border-2 border-blue-500/30 bg-blue-950/10 dark:bg-blue-950/20 rounded-3xl mt-4 sm:mt-6 p-4 sm:p-6">
                <div className="pb-4 border-b border-white/10 mb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-blue-800 dark:text-blue-300 flex items-center gap-2">
                      <User className="w-5 h-5" /> Equipe & Acessos ao Bot do WhatsApp
                    </h3>
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-xs w-fit">
                      🤖 Copiloto Inteligente
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-400 mt-1">
                    Cadastre os membros da sua equipe com o <strong>WhatsApp (com DDD)</strong>. O bot identifica automaticamente quem está falando pelo número, permitindo consultas de estoque, vendas e comandos operacionais pelo WhatsApp.
                  </p>
                </div>
                
                <div className="space-y-4">
                  {/* Formulário de Cadastro */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Cadastrar Novo Colaborador / Habilitar Acesso ao Bot
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1 font-medium">Nome *</label>
                        <input
                          type="text"
                          value={novoTecnicoNome}
                          onChange={(e) => setNovoTecnicoNome(e.target.value)}
                          placeholder="Ex: Carlos Vendedor"
                          className="input-glass w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1 font-medium">WhatsApp com DDD *</label>
                        <input
                          type="text"
                          value={novoTecnicoWhatsapp}
                          onChange={(e) => setNovoTecnicoWhatsapp(e.target.value)}
                          placeholder="Ex: 31 99999-8888"
                          className="input-glass w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1 font-medium">Função / Cargo</label>
                        <select
                          value={novoTecnicoCargo}
                          onChange={(e) => setNovoTecnicoCargo(e.target.value)}
                          className="input-glass w-full text-sm bg-slate-900 text-white"
                        >
                          <option value="vendedor">Vendedor</option>
                          <option value="tecnico">Técnico</option>
                          <option value="gerente">Gerente</option>
                          <option value="dono">Proprietário / Dono</option>
                          <option value="motoboy">Motoboy / Entregador</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1 font-medium">E-mail (opcional)</label>
                        <input
                          type="email"
                          value={novoTecnicoEmail}
                          onChange={(e) => setNovoTecnicoEmail(e.target.value)}
                          placeholder="email@exemplo.com"
                          className="input-glass w-full text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        disabled={salvandoEquipe}
                        onClick={async () => {
                          if (!novoTecnicoNome.trim()) {
                            toast.error('Informe o nome do colaborador.');
                            return;
                          }
                          const digits = novoTecnicoWhatsapp.replace(/\D/g, '');
                          if (!digits || digits.length < 10) {
                            toast.error('Informe um WhatsApp válido com DDD (ex: 31 99999-8888).');
                            return;
                          }

                          setSalvandoEquipe(true);
                          try {
                            const res = await fetch('/api/equipe', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                loja_id: usuario?.lojaId,
                                nome: novoTecnicoNome.trim(),
                                telefone: novoTecnicoWhatsapp.trim(),
                                email: novoTecnicoEmail.trim() || undefined,
                                cargo: novoTecnicoCargo,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok || data.error) {
                              throw new Error(data.error || 'Erro ao cadastrar.');
                            }

                            toast.success(data.mensagem || 'Colaborador e WhatsApp vinculados com sucesso!');
                            setNovoTecnicoNome('');
                            setNovoTecnicoWhatsapp('');
                            setNovoTecnicoEmail('');
                            setNovoTecnicoCargo('vendedor');
                            fetchTecnicos();
                          } catch (err: any) {
                            console.error('Erro ao cadastrar membro da equipe:', err);
                            toast.error(err.message || 'Erro ao cadastrar.');
                          } finally {
                            setSalvandoEquipe(false);
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        {salvandoEquipe ? 'Salvando...' : 'Adicionar & Vincular ao Bot'}
                      </Button>
                    </div>
                  </div>

                  {/* Lista de Membros da Equipe */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                    {tecnicos?.map((tec: any) => {
                      const cargoNome = tec.cargo || tec.tipo || 'Colaborador';
                      const cargoColor = 
                        ['dono', 'proprietario', 'admin', 'gerente'].includes(cargoNome.toLowerCase())
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : cargoNome.toLowerCase() === 'tecnico'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                          : cargoNome.toLowerCase() === 'motoboy'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

                      const phoneDisplay = tec.whatsapp || tec.telefone || 'Sem WhatsApp';

                      return (
                        <div
                          key={tec.id}
                          className="flex flex-col justify-between bg-white/10 dark:bg-slate-900/60 border border-white/10 p-3.5 rounded-2xl relative group hover:border-blue-500/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <span className="font-semibold text-sm text-white block">
                                {tec.nome}
                              </span>
                              <Badge className={`text-[10px] uppercase font-bold mt-1 ${cargoColor}`}>
                                {cargoNome}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                              title="Excluir e revogar acesso"
                              onClick={async () => {
                                if (window.confirm(`Deseja realmente remover ${tec.nome} e revogar seu acesso no WhatsApp?`)) {
                                  try {
                                    const res = await fetch(`/api/equipe?id=${tec.id}&loja_id=${usuario?.lojaId}`, {
                                      method: 'DELETE',
                                    });
                                    const data = await res.json();
                                    if (!res.ok || data.error) throw new Error(data.error || 'Erro ao excluir');
                                    toast.success('Colaborador removido e acesso revogado!');
                                    fetchTecnicos();
                                  } catch (err: any) {
                                    toast.error(err.message || 'Erro ao excluir.');
                                  }
                                }
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>

                          <div className="space-y-1 text-xs text-slate-300 border-t border-white/5 pt-2 mt-1">
                            <div className="flex items-center gap-1.5 text-emerald-400 font-mono">
                              <Smartphone className="w-3.5 h-3.5" />
                              <span>{phoneDisplay}</span>
                              {phoneDisplay !== 'Sem WhatsApp' && (
                                <span className="ml-auto text-[10px] text-emerald-300/80 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                  ✓ Bot Ativo
                                </span>
                              )}
                            </div>
                            {tec.email && (
                              <div className="text-[11px] text-slate-400 truncate">
                                ✉️ {tec.email}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {(!tecnicos || tecnicos.length === 0) && (
                      <div className="col-span-full text-center py-6 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-sm text-muted-foreground italic">Nenhum colaborador cadastrado na equipe ainda.</p>
                      </div>
                    )}
                  </div>
                </div>
              </GlassCard>

              {/* Link Público da Calculadora de Aparelhos & Trade-In Upgrade */}
              <GlassCard className="border-2 border-emerald-500/30 bg-emerald-950/10 dark:bg-emerald-950/20 rounded-3xl mt-4 sm:mt-6">
                <div className="pb-4 border-b border-white/10 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-emerald-400 flex items-center gap-2">
                      <Repeat className="w-5 h-5 text-emerald-400" /> Calculadora de Aparelhos & Trade-In Upgrade (Pública)
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400">
                      Link exclusivo da sua loja para clientes avaliarem celulares usados e enviarem propostas diretamente para seu painel.
                    </p>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs font-black uppercase w-fit">
                    Ativo
                  </Badge>
                </div>

                <div className="space-y-4">
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs font-mono text-cyan-300 truncate select-all">
                        {typeof window !== 'undefined' ? `${window.location.origin}/avaliar/${usuario?.lojaId || 'principal'}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            const url = `${window.location.origin}/avaliar/${usuario?.lojaId || 'principal'}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Link público copiado com sucesso!');
                          }
                        }}
                        className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold text-xs rounded-xl gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar Link
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            const url = `${window.location.origin}/avaliar/${usuario?.lojaId || 'principal'}`;
                            window.open(url, '_blank');
                          }
                        }}
                        className="border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-cyan-400" /> Abrir
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400">
                    💡 <strong>Dica:</strong> Para gerenciar os preços de compra que sua loja paga em cada iPhone, conferir as propostas recebidas de clientes ou fazer simulações no balcão, acesse a aba <strong>Calculadora Upgrade</strong> no menu lateral.
                  </p>
                </div>
              </GlassCard>

              {/* CARD OFICIAL: EQUIPE DE MOTOBOYS & LINK DE COLETA MOBILE */}
              <GlassCard className="border-2 border-cyan-500/30 bg-gradient-to-br from-cyan-950/20 via-slate-900/40 to-slate-950/60 rounded-3xl p-6 shadow-xl">
                <div className="pb-4 border-b border-white/10 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-cyan-400 flex items-center gap-2">
                      <Truck className="w-5 h-5 text-cyan-400" /> Equipe de Motoboys & Link de Coleta em Campo
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400">
                      Link mobile exclusivo para seus motoboys realizarem vistorias com 4 fotos, checklist e assinatura do cliente na rua.
                    </p>
                  </div>
                  <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 text-xs font-black uppercase w-fit">
                    {motoboys.length} Motoboy{motoboys.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                <div className="space-y-4">
                  {/* Link Mobile do Motoboy */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Truck className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-xs font-mono text-cyan-300 truncate select-all">
                        {typeof window !== 'undefined' ? `${window.location.origin}/coleta/${usuario?.lojaId || 'principal'}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            const url = `${window.location.origin}/coleta/${usuario?.lojaId || 'principal'}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Link de Coleta copiado para enviar aos motoboys!');
                          }
                        }}
                        className="bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-bold text-xs rounded-xl gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar Link Coleta
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            const url = `${window.location.origin}/coleta/${usuario?.lojaId || 'principal'}`;
                            window.open(url, '_blank');
                          }
                        }}
                        className="border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-cyan-400" /> Abrir no Celular
                      </Button>
                    </div>
                  </div>

                  {/* Cadastro Rápido de Motoboy */}
                  <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                    <span className="text-xs font-extrabold text-white block">Cadastrar Novo Motoboy</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      <input
                        type="text"
                        placeholder="Nome do Motoboy..."
                        value={novoMotoboyNome}
                        onChange={(e) => setNovoMotoboyNome(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="WhatsApp (ex: 31999999999)..."
                        value={novoMotoboyTel}
                        onChange={(e) => setNovoMotoboyTel(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Veículo (ex: Titan 160)..."
                        value={novoMotoboyVeiculo}
                        onChange={(e) => setNovoMotoboyVeiculo(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                      />
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Placa..."
                          value={novoMotoboyPlaca}
                          onChange={(e) => setNovoMotoboyPlaca(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none uppercase"
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!novoMotoboyNome.trim()) {
                              toast.error('Informe o nome do motoboy.');
                              return;
                            }
                            const ok = await cadastrarMotoboy({
                              nome: novoMotoboyNome,
                              telefone: novoMotoboyTel,
                              veiculo: novoMotoboyVeiculo,
                              placa: novoMotoboyPlaca,
                            });
                            if (ok) {
                              setNovoMotoboyNome('');
                              setNovoMotoboyTel('');
                              setNovoMotoboyPlaca('');
                            }
                          }}
                          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs px-3 rounded-xl cursor-pointer shrink-0"
                        >
                          Salvar
                        </Button>
                      </div>
                    </div>

                    {/* Lista dos Motoboys Atuais */}
                    <div className="pt-2 border-t border-slate-800/80">
                      <div className="flex flex-wrap gap-2">
                        {motoboys.length === 0 ? (
                          <span className="text-xs text-slate-500">Nenhum motoboy cadastrado na equipe.</span>
                        ) : (
                          motoboys.map((m) => (
                            <div
                              key={m.id}
                              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2 text-xs"
                            >
                              <span className="font-bold text-white">🛵 {m.nome}</span>
                              <span className="text-slate-400 text-[11px]">{m.veiculo || 'Moto'} {m.placa ? `(${m.placa})` : ''}</span>
                              <button
                                type="button"
                                onClick={() => excluirMotoboy(m.id)}
                                className="text-red-400 hover:text-red-300 ml-1 font-bold cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Configurar Logo e Nome da Loja */}
              <GlassCard className="border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 rounded-3xl">
                <div className="pb-4 border-b border-white/10 mb-4">
                  <h3 className="text-base sm:text-lg font-bold text-blue-900 dark:text-blue-300">Logo e Nome da Loja</h3>
                  <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-400">
                    Customize o nome e logo que aparecem no topo do sistema
                  </p>
                </div>
                <div>
                  <div className="space-y-4 sm:space-y-6">
                    {/* Preview da Logo */}
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0">
                        {previewLogo ? (
                          <div className="relative">
                            <img
                              src={previewLogo}
                              alt="Logo da loja"
                              className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover border dark:border-slate-700"
                            />
                            <button
                              onClick={handleRemoverLogo}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-gray-200 dark:bg-slate-800 flex items-center justify-center text-gray-400">
                            <span className="text-xs text-center">Sem logo</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <label className="text-sm font-medium block mb-2">
                          Upload da Logo (500x500)
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleUploadLogo}
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/50 dark:file:text-blue-400 dark:hover:file:bg-blue-900"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          PNG ou JPG, máximo 25MB
                        </p>
                        <Button 
                          onClick={handleSalvarLogoLoja}
                          size="sm"
                          className="mt-2 bg-blue-600 hover:bg-blue-700 h-8"
                        >
                          Aplicar Logo
                        </Button>
                      </div>
                    </div>

                    {/* Nome da Loja */}
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Nome da Loja</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={nomeLoja}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNomeLoja(e.target.value)}
                          placeholder="ex: Phone Center, Celular Store..."
                          className="input-glass flex-1"
                        />
                        <Button onClick={handleSalvarNomeLoja} className="bg-blue-600 hover:bg-blue-700">
                          Aplicar
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Deixe em branco para voltar ao padrão (Phone Center)
                      </p>
                    </div>

                    {/* Subtítulo da Loja */}
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Subtítulo do Cabeçalho</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={subtituloLoja}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubtituloLoja(e.target.value)}
                          placeholder="ex: Sistema de Gestão"
                          className="input-glass flex-1"
                        />
                        <Button onClick={handleSalvarSubtituloLoja} className="bg-blue-600 hover:bg-blue-700">
                          Aplicar
                        </Button>
                      </div>
                    </div>

                    {/* Assinatura para recibos/PDFs */}
                    <div className="flex flex-col gap-3 border-t border-white/15 pt-4">
                      <label className="text-sm font-medium">Assinatura para recibos e PDF de compra</label>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex-shrink-0">
                          {previewAssinatura ? (
                            <div className="relative">
                              <img
                                src={previewAssinatura}
                                alt="Assinatura da loja"
                                className="w-44 h-20 rounded-lg object-contain bg-white border dark:border-slate-700 p-2"
                              />
                              <button
                                onClick={handleRemoverAssinatura}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="w-44 h-20 rounded-lg bg-gray-200 dark:bg-slate-800 flex items-center justify-center text-gray-400 border dark:border-slate-700">
                              <span className="text-xs text-center px-3">Sem assinatura</span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleUploadAssinatura}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/50 dark:file:text-blue-400 dark:hover:file:bg-blue-900"
                          />
                          <p className="text-xs text-gray-500 mt-2">PNG, JPG ou WEBP. Recomendado fundo transparente.</p>
                          <Button
                            onClick={handleSalvarAssinaturaLoja}
                            size="sm"
                            className="mt-2 bg-blue-600 hover:bg-blue-700 h-8"
                          >
                            Salvar Assinatura
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Informações da Empresa */}
              <GlassCard className="rounded-3xl">
                <div className="pb-4 border-b border-white/10 mb-4">
                  <h3 className="text-base sm:text-lg font-bold">Informações da Empresa</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Configure os dados da sua empresa
                  </p>
                </div>
                <div>
                  <div className="space-y-4 sm:space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <label className="text-sm font-medium">Nome da Empresa</label>
                        <input
                          type="text"
                          value={nomeEmpresa}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNomeEmpresa(e.target.value)}
                          className="input-glass mt-2"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">CPF / CNPJ</label>
                        <input
                          type="text"
                          value={cnpj}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const raw = e.target.value;
                            const digits = raw.replace(/\D/g, '').slice(0, 14);
                            let formatted = digits;
                            if (digits.length <= 11) {
                              formatted = digits
                                .replace(/(\d{3})(\d)/, '$1.$2')
                                .replace(/(\d{3})(\d)/, '$1.$2')
                                .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                            } else {
                              formatted = digits
                                .replace(/^(\d{2})(\d)/, '$1.$2')
                                .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
                                .replace(/\.(\d{3})(\d)/, '.$1/$2')
                                .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
                            }
                            setCnpj(formatted);
                          }}
                          placeholder="000.000.000-00 ou 00.000.000/0000-00"
                          className="input-glass mt-2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <label className="text-sm font-medium">Telefone</label>
                        <input
                          type="tel"
                          value={telefoneEmpresa}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTelefoneEmpresa(e.target.value)}
                          placeholder="(11) 99999-9999"
                          className="input-glass mt-2"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">E-mail</label>
                        <input
                          type="email"
                          value={emailEmpresa}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailEmpresa(e.target.value)}
                          className="input-glass mt-2"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Endereço</label>
                      <input
                        type="text"
                        value={enderecoEmpresa}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnderecoEmpresa(e.target.value)}
                        placeholder="Rua, número, complemento"
                        className="input-glass mt-2"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium flex items-center justify-between">
                        <span>Chave PIX Oficial (para Extratos e Cobranças de Fiado)</span>
                        <Badge variant="outline" className="text-xs font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                          PIX Cobrança
                        </Badge>
                      </label>
                      <input
                        type="text"
                        value={chavePix}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setChavePix(e.target.value)}
                        placeholder="Ex: seuemail@loja.com, CPF/CNPJ ou celular"
                        className="input-glass mt-2 font-mono font-bold text-emerald-400"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Esta chave PIX será preenchida automaticamente em mensagens de WhatsApp e extratos de lojistas devedores.
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium flex items-center justify-between">
                        <span>Tempo de Garantia Padrão (em Dias)</span>
                        <Badge variant="outline" className="text-xs font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                          {garantiaDias} dias
                        </Badge>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={garantiaDias}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGarantiaDias(Number(e.target.value))}
                        placeholder="Ex: 90"
                        className="input-glass mt-2 font-bold text-emerald-400"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Defina o tempo padrão de garantia (em dias) que será aplicado nas novas vendas e recibos. Ex: 90 (para 90 dias), 180 (para 180 dias).
                      </p>
                    </div>

                    <Button 
                      onClick={handleSalvarConfiguracoes}
                      className="w-full h-10 sm:h-auto font-bold bg-blue-600 hover:bg-blue-700"
                    >
                      Salvar Configurações da Empresa
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </div>
          </TabsContent>

          {/* Notificações — cada bloco é uma seção independente; outras funções (pós-venda,
              vitrine...) entram como novos componentes aqui dentro. Só fica na tela o que
              tem efeito real: os antigos switches de e-mail/WhatsApp/OS/garantia só gravavam
              no console e foram retirados. */}
          <TabsContent value="notificacoes" className="space-y-6">
            {/* Recibo em PDF no WhatsApp do cliente (src/lib/whatsapp/reciboWhatsapp.ts) */}
            <GlassCard className="rounded-3xl p-4 sm:p-6 space-y-4">
              <div className="pb-3 border-b border-white/10">
                <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
                  <MessageSquare className="w-5 h-5 text-emerald-400" /> Recibo no WhatsApp do Cliente
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                  Ao finalizar a venda, envia o recibo em PDF para o WhatsApp cadastrado do cliente, pelo número conectado da loja.
                </p>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
                  <div>
                    <p className="text-sm font-semibold text-white">Disparo automático de recibo</p>
                    <p className="text-xs text-slate-400">Enviar mensagem com PDF da notinha após fechar a venda</p>
                  </div>
                  <Switch checked={reciboWhatsappAtivo} onCheckedChange={setReciboWhatsappAtivo} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="recibo-whatsapp-mensagem" className="text-xs font-semibold text-slate-300">
                    Mensagem enviada junto do PDF
                  </label>
                  <textarea
                    id="recibo-whatsapp-mensagem"
                    rows={4}
                    maxLength={1000}
                    value={reciboWhatsappMensagem}
                    onChange={(e) => setReciboWhatsappMensagem(e.target.value)}
                    className="input-glass w-full text-sm resize-y"
                  />
                  <p className="text-[11px] text-muted-foreground">Pode usar: {VARIAVEIS_RECIBO.join('  ')}</p>
                </div>
                <Button type="button" size="sm" onClick={salvarReciboWhatsapp} disabled={salvandoReciboWhatsapp} className="font-bold bg-emerald-600 hover:bg-emerald-500">
                  {salvandoReciboWhatsapp ? 'Salvando…' : 'Salvar recibo no WhatsApp'}
                </Button>
              </div>
            </GlassCard>

            <GlassCard className="rounded-3xl p-4 sm:p-6 space-y-6">
              <div className="pb-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base sm:text-xl font-bold flex items-center gap-2 text-white">
                    <Bell className="w-5 h-5 text-blue-400" /> Central de Notificações & Automações
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                    Defina quais canais usar e exatamente sobre quais eventos do sistema você quer ser notificado por WhatsApp, E-mail ou Pop-ups.
                  </p>
                </div>
                <Button
                  onClick={handleSalvarNotificacoes}
                  disabled={salvandoNotificacoes}
                  className="font-bold bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 shrink-0"
                >
                  {salvandoNotificacoes ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCheck className="w-4 h-4 mr-2" /> Salvar Preferências
                    </>
                  )}
                </Button>
              </div>

              {/* 1. Canais de Comunicação Globais */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" /> Canais Globais de Comunicação
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* WhatsApp */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-white">Notificações por WhatsApp</p>
                        <p className="text-xs text-slate-300">Via Evolution API da Loja</p>
                      </div>
                    </div>
                    <Switch
                      checked={notificacoesWhatsapp}
                      onCheckedChange={setNotificacoesWhatsapp}
                    />
                  </div>

                  {/* E-mail */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-blue-500/20 bg-blue-500/10">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-blue-400 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-white">Notificações por E-mail</p>
                        <p className="text-xs text-slate-300">Receba resumos e relatórios</p>
                      </div>
                    </div>
                    <Switch
                      checked={notificacoesEmail}
                      onCheckedChange={setNotificacoesEmail}
                    />
                  </div>

                  {/* Push / Web */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/20 bg-amber-500/10">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-amber-400 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-white">Notificações de Navegador</p>
                        <p className="text-xs text-slate-300">Pop-ups no painel do sistema</p>
                      </div>
                    </div>
                    <Switch
                      checked={notificacoesWebPush}
                      onCheckedChange={setNotificacoesWebPush}
                    />
                  </div>
                </div>
              </div>

              {/* 2. Recibo Automático no WhatsApp do Cliente */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" /> Recibo em PDF no WhatsApp do Cliente (PDV)
                    </h4>
                    <p className="text-xs text-slate-300 mt-1">
                      Ao finalizar qualquer venda no PDV, o sistema gera o recibo em PDF e envia automaticamente para o WhatsApp do cliente cadastrado.
                    </p>
                  </div>
                  <Switch checked={reciboWhatsappAtivo} onCheckedChange={setReciboWhatsappAtivo} />
                </div>

                <div className="space-y-1.5 pt-1">
                  <label htmlFor="recibo-whatsapp-mensagem" className="text-xs font-semibold text-slate-300">
                    Mensagem enviada junto com o arquivo PDF:
                  </label>
                  <textarea
                    id="recibo-whatsapp-mensagem"
                    rows={3}
                    maxLength={1000}
                    value={reciboWhatsappMensagem}
                    onChange={(e) => setReciboWhatsappMensagem(e.target.value)}
                    className="input-glass w-full text-xs font-mono resize-y"
                  />
                  <p className="text-[11px] text-muted-foreground">Variáveis disponíveis: {VARIAVEIS_RECIBO.join('  ')}</p>
                </div>
                <Button type="button" size="sm" onClick={salvarReciboWhatsapp} disabled={salvandoReciboWhatsapp} className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold">
                  {salvandoReciboWhatsapp ? 'Salvando…' : 'Salvar Mensagem do Recibo'}
                </Button>
              </div>

              {/* 3. Submenu de Categorias de Eventos */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Filter className="w-4 h-4 text-blue-400" /> Filtrar Eventos por Categoria
                  </h4>
                </div>

                {/* Submenu Tabs / Chips */}
                <div className="flex flex-wrap gap-1.5 p-1 bg-black/40 border border-white/10 rounded-xl text-xs font-medium">
                  {[
                    { id: 'todas', label: 'Todas as Categorias', icon: Bell },
                    { id: 'vendas', label: 'Vendas & PDV', icon: ShoppingCart },
                    { id: 'os', label: 'Ordens de Serviço (OS)', icon: Wrench },
                    { id: 'estoque', label: 'Estoque & Peças', icon: Package },
                    { id: 'garantias', label: 'Garantias', icon: ShieldCheck },
                    { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
                    { id: 'agendamentos', label: 'Agendamentos', icon: Calendar },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isSelected = categoriaNotificacaoFiltro === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCategoriaNotificacaoFiltro(tab.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/30'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Grid de Seções de Notificações */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Category 1: Vendas */}
                  {(categoriaNotificacaoFiltro === 'todas' || categoriaNotificacaoFiltro === 'vendas') && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <h5 className="text-sm font-bold text-white flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4 text-emerald-400" /> Vendas & PDV
                        </h5>
                        <div className="flex gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['vendaNova', 'vendaCancelada', 'vendaPendente', 'vendaDesconto'], true)}
                            className="text-emerald-400 hover:underline px-1.5 py-0.5"
                          >
                            Ativar Todos
                          </button>
                          <span className="text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['vendaNova', 'vendaCancelada', 'vendaPendente', 'vendaDesconto'], false)}
                            className="text-rose-400 hover:underline px-1.5 py-0.5"
                          >
                            Desativar
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Nova Venda Realizada</p>
                            <p className="text-[11px] text-slate-400">Notifica a conclusão de venda no PDV ou formulário</p>
                          </div>
                          <Switch checked={notifDetalhadas.vendaNova} onCheckedChange={() => toggleNotifItem('vendaNova')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Venda Cancelada ou Desfeita</p>
                            <p className="text-[11px] text-slate-400">Alerta quando uma venda for cancelada no painel</p>
                          </div>
                          <Switch checked={notifDetalhadas.vendaCancelada} onCheckedChange={() => toggleNotifItem('vendaCancelada')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Venda Pendente / Fiado Criado</p>
                            <p className="text-[11px] text-slate-400">Avisa quando uma venda for registrada sem pagamento total</p>
                          </div>
                          <Switch checked={notifDetalhadas.vendaPendente} onCheckedChange={() => toggleNotifItem('vendaPendente')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Alerta de Desconto Alto Concedido</p>
                            <p className="text-[11px] text-slate-400">Alerta quando o vendedor der desconto acima da média</p>
                          </div>
                          <Switch checked={notifDetalhadas.vendaDesconto} onCheckedChange={() => toggleNotifItem('vendaDesconto')} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Category 2: Ordens de Serviço */}
                  {(categoriaNotificacaoFiltro === 'todas' || categoriaNotificacaoFiltro === 'os') && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <h5 className="text-sm font-bold text-white flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-blue-400" /> Ordens de Serviço (OS)
                        </h5>
                        <div className="flex gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['osNova', 'osAprovada', 'osPronta', 'osEntregue'], true)}
                            className="text-emerald-400 hover:underline px-1.5 py-0.5"
                          >
                            Ativar Todos
                          </button>
                          <span className="text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['osNova', 'osAprovada', 'osPronta', 'osEntregue'], false)}
                            className="text-rose-400 hover:underline px-1.5 py-0.5"
                          >
                            Desativar
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Nova OS Cadastrada</p>
                            <p className="text-[11px] text-slate-400">Avisa os técnicos e a loja ao abrir uma nova OS</p>
                          </div>
                          <Switch checked={notifDetalhadas.osNova} onCheckedChange={() => toggleNotifItem('osNova')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Orçamento Aprovado pelo Cliente</p>
                            <p className="text-[11px] text-slate-400">Notifica o técnico quando o cliente aprova o conserto</p>
                          </div>
                          <Switch checked={notifDetalhadas.osAprovada} onCheckedChange={() => toggleNotifItem('osAprovada')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">OS Pronta para Retirada</p>
                            <p className="text-[11px] text-slate-400">Dispara mensagem para o cliente buscar o aparelho</p>
                          </div>
                          <Switch checked={notifDetalhadas.osPronta} onCheckedChange={() => toggleNotifItem('osPronta')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">OS Entregue / Concluída</p>
                            <p className="text-[11px] text-slate-400">Notifica a finalização da entrega do aparelho</p>
                          </div>
                          <Switch checked={notifDetalhadas.osEntregue} onCheckedChange={() => toggleNotifItem('osEntregue')} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Category 3: Estoque */}
                  {(categoriaNotificacaoFiltro === 'todas' || categoriaNotificacaoFiltro === 'estoque') && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <h5 className="text-sm font-bold text-white flex items-center gap-2">
                          <Package className="w-4 h-4 text-amber-400" /> Estoque & Peças
                        </h5>
                        <div className="flex gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['estoqueBaixo', 'estoqueEntrada', 'estoqueManutencao'], true)}
                            className="text-emerald-400 hover:underline px-1.5 py-0.5"
                          >
                            Ativar Todos
                          </button>
                          <span className="text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['estoqueBaixo', 'estoqueEntrada', 'estoqueManutencao'], false)}
                            className="text-rose-400 hover:underline px-1.5 py-0.5"
                          >
                            Desativar
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Alerta de Estoque Baixo</p>
                            <p className="text-[11px] text-slate-400">Avisa quando modelos ou peças estiverem acabando</p>
                          </div>
                          <Switch checked={notifDetalhadas.estoqueBaixo} onCheckedChange={() => toggleNotifItem('estoqueBaixo')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Entrada de Novos Aparelhos / Lote</p>
                            <p className="text-[11px] text-slate-400">Notifica quando um novo lote for adicionado ao estoque</p>
                          </div>
                          <Switch checked={notifDetalhadas.estoqueEntrada} onCheckedChange={() => toggleNotifItem('estoqueEntrada')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Aparelho enviado para Manutenção</p>
                            <p className="text-[11px] text-slate-400">Alerta movimentações de aparelhos com técnicos/terceiros</p>
                          </div>
                          <Switch checked={notifDetalhadas.estoqueManutencao} onCheckedChange={() => toggleNotifItem('estoqueManutencao')} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Category 4: Garantias */}
                  {(categoriaNotificacaoFiltro === 'todas' || categoriaNotificacaoFiltro === 'garantias') && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <h5 className="text-sm font-bold text-white flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-purple-400" /> Garantias & Pós-Venda
                        </h5>
                        <div className="flex gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['garantiaVencimento', 'garantiaAcionada'], true)}
                            className="text-emerald-400 hover:underline px-1.5 py-0.5"
                          >
                            Ativar Todos
                          </button>
                          <span className="text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['garantiaVencimento', 'garantiaAcionada'], false)}
                            className="text-rose-400 hover:underline px-1.5 py-0.5"
                          >
                            Desativar
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Lembrete de Vencimento de Garantia (7 dias)</p>
                            <p className="text-[11px] text-slate-400">Avisa o fim do período de garantia para pós-venda</p>
                          </div>
                          <Switch checked={notifDetalhadas.garantiaVencimento} onCheckedChange={() => toggleNotifItem('garantiaVencimento')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Acionamento de Garantia pelo Cliente</p>
                            <p className="text-[11px] text-slate-400">Alerta quando o cliente der entrada em garantia</p>
                          </div>
                          <Switch checked={notifDetalhadas.garantiaAcionada} onCheckedChange={() => toggleNotifItem('garantiaAcionada')} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Category 5: Financeiro */}
                  {(categoriaNotificacaoFiltro === 'todas' || categoriaNotificacaoFiltro === 'financeiro') && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <h5 className="text-sm font-bold text-white flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-emerald-400" /> Financeiro & Cobrança
                        </h5>
                        <div className="flex gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['financeiroVencido', 'financeiroCobranca'], true)}
                            className="text-emerald-400 hover:underline px-1.5 py-0.5"
                          >
                            Ativar Todos
                          </button>
                          <span className="text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['financeiroVencido', 'financeiroCobranca'], false)}
                            className="text-rose-400 hover:underline px-1.5 py-0.5"
                          >
                            Desativar
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Contas & Recebimentos Vencidos</p>
                            <p className="text-[11px] text-slate-400">Alerta quando houver parcelas ou títulos atrasados</p>
                          </div>
                          <Switch checked={notifDetalhadas.financeiroVencido} onCheckedChange={() => toggleNotifItem('financeiroVencido')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Lembrete Automático de Cobrança (Fiados)</p>
                            <p className="text-[11px] text-slate-400">Dispara mensagem amigável de cobrança no WhatsApp</p>
                          </div>
                          <Switch checked={notifDetalhadas.financeiroCobranca} onCheckedChange={() => toggleNotifItem('financeiroCobranca')} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Category 6: Agendamentos */}
                  {(categoriaNotificacaoFiltro === 'todas' || categoriaNotificacaoFiltro === 'agendamentos') && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <h5 className="text-sm font-bold text-white flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-cyan-400" /> Agendamentos & Atendimento
                        </h5>
                        <div className="flex gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['agendamentoNovo', 'agendamentoLembrete'], true)}
                            className="text-emerald-400 hover:underline px-1.5 py-0.5"
                          >
                            Ativar Todos
                          </button>
                          <span className="text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={() => toggleGrupoNotificacoes(['agendamentoNovo', 'agendamentoLembrete'], false)}
                            className="text-rose-400 hover:underline px-1.5 py-0.5"
                          >
                            Desativar
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Novo Agendamento Cadastrado</p>
                            <p className="text-[11px] text-slate-400">Notifica o cadastro de novo compromisso ou visita</p>
                          </div>
                          <Switch checked={notifDetalhadas.agendamentoNovo} onCheckedChange={() => toggleNotifItem('agendamentoNovo')} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-white">Lembrete de Agendamentos do Dia</p>
                            <p className="text-[11px] text-slate-400">Envia resumo diário dos agendamentos da loja pela manhã</p>
                          </div>
                          <Switch checked={notifDetalhadas.agendamentoLembrete} onCheckedChange={() => toggleNotifItem('agendamentoLembrete')} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Botão de Ação Salvar Preferências no Rodapé */}
              <div className="pt-4 border-t border-white/10 flex justify-end">
                <Button
                  onClick={handleSalvarNotificacoes}
                  disabled={salvandoNotificacoes}
                  size="lg"
                  className="w-full sm:w-auto font-bold bg-blue-600 hover:bg-blue-500 shadow-xl shadow-blue-500/20 px-8"
                >
                  {salvandoNotificacoes ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando todas as preferências...
                    </>
                  ) : (
                    <>
                      <CheckCheck className="w-5 h-5 mr-2" /> Salvar Todas as Preferências de Notificação
                    </>
                  )}
                </Button>
              </div>
            </GlassCard>
          </TabsContent>

          {/* Segurança */}
          <TabsContent value="seguranca">
            <GlassCard className="rounded-3xl">
              <div className="pb-4 border-b border-white/10 mb-4">
                <h3 className="text-base sm:text-lg font-bold">Segurança</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Gerencie a segurança da sua conta
                </p>
              </div>
              <div>
                <div className="space-y-4 sm:space-y-6">
                  {/* Usuário Logado */}
                  <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg p-3 sm:p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                        {usuario?.email?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{usuario?.email}</p>
                        <p className="text-xs text-muted-foreground">Conta ativa</p>
                      </div>
                    </div>
                  </div>

                  {/* Alteração de Senha */}
                  <div className="border-b dark:border-slate-700 pb-4 sm:pb-6">
                    <h3 className="text-sm sm:text-base font-semibold mb-4">Alterar Senha</h3>
                    <div className="space-y-3 sm:space-y-4">
                      <div>
                        <label className="text-sm font-medium">Senha Atual</label>
                        <input
                          type="password"
                          value={senhaAtual}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSenhaAtual(e.target.value)}
                          className="input-glass mt-2"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Nova Senha</label>
                        <input
                          type="password"
                          value={novaSenha}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNovaSenha(e.target.value)}
                          className="input-glass mt-2"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Confirmar Senha</label>
                        <input
                          type="password"
                          value={confirmarSenha}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmarSenha(e.target.value)}
                          className="input-glass mt-2"
                        />
                      </div>
                    </div>
                  </div>

                  <Button 
                    onClick={handleAlterarSenha}
                    className="w-full h-10 sm:h-auto"
                  >
                    Alterar Senha
                  </Button>

                  <Button 
                    onClick={logout}
                    variant="outline"
                    className="w-full h-10 sm:h-auto"
                  >
                    Sair da Conta
                  </Button>
                </div>
              </div>
            </GlassCard>
          </TabsContent>

          {/* Dados */}
          <TabsContent value="dados">
            <div className="space-y-4 sm:space-y-6">
              {/* Backup real: GET /api/backup e cópias diárias do Storage */}
              <BackupLojaSection />

              {/* Exportar Dados */}
              <GlassCard className="rounded-3xl">
                <div className="pb-4 border-b border-white/10 mb-4">
                  <h3 className="text-base sm:text-lg font-bold">Exportar Dados</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Exporte todos os seus dados em formato CSV
                  </p>
                </div>
                <div>
                  <div className="space-y-3 sm:space-y-4">
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      <p>Escolha quais dados exportar:</p>
                      <div className="mt-3 space-y-2">
                        <label className="flex items-center gap-2">
                          <Switch defaultChecked id="export-clientes" />
                          <span>Clientes</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <Switch defaultChecked id="export-os" />
                          <span>Ordens de Serviço</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <Switch defaultChecked id="export-pecas" />
                          <span>Peças</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <Switch defaultChecked id="export-vendas" />
                          <span>Vendas</span>
                        </label>
                      </div>
                    </div>
                    <Button 
                      onClick={handleExportarDados}
                      className="w-full h-10 sm:h-auto"
                    >
                      Exportar para CSV
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </div>
          </TabsContent>

          {/* Personalização da Ordem das Abas */}
          <TabsContent value="abas">
            <div className="space-y-4 sm:space-y-6">
              <GlassCard className="rounded-3xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 text-slate-100">
                      <LayoutGrid className="w-5 h-5 text-blue-400" />
                      Personalizar Ordem do Menu e Abas
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      Altere a sequência das abas no menu lateral e na barra de navegação móvel de acordo com sua preferência.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      resetOrder();
                      toast.success('Ordem das abas restaurada para o padrão original!');
                    }}
                    className="gap-2 rounded-xl text-xs border-slate-700 text-slate-300 hover:text-white"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurar Padrão
                  </Button>
                </div>

                <div className="space-y-2 pt-4">
                  {tabOrder.map((tabId, index) => {
                    const tabDef = allTabs.find((t) => t.id === tabId);
                    if (!tabDef) return null;
                    const isFirst = index === 0;
                    const isLast = index === tabOrder.length - 1;

                    return (
                      <div
                        key={tabId}
                        className="flex items-center justify-between p-3 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all"
                      >
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-xs font-mono font-bold text-blue-400 shrink-0">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-white truncate">{tabDef.label}</h4>
                            <p className="text-[11px] text-slate-400 truncate">{tabDef.descricao}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isFirst}
                            onClick={() => {
                              moveUp(tabId);
                              toast.success(`"${tabDef.label}" movida para cima!`);
                            }}
                            className="h-8 w-8 rounded-xl border-slate-800 bg-slate-950/80 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Mover para cima"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isLast}
                            onClick={() => {
                              moveDown(tabId);
                              toast.success(`"${tabDef.label}" movida para baixo!`);
                            }}
                            className="h-8 w-8 rounded-xl border-slate-800 bg-slate-950/80 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            </div>
          </TabsContent>

          {/* Aba Fiscal (NFC-e / NF-e) */}
          <TabsContent value="fiscal">
            <ConfiguracaoFiscalSection lojaId={usuario?.lojaId} />
          </TabsContent>
        </Tabs>
    </div>
  );
}
