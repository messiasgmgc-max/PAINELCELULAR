'use client';

import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Bell, Eye, Lock, Database, LogOut, X, Palette } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { supabase } from '@/lib/supabaseClient';
import { useColorTheme, ColorTheme } from '@/components/ThemeProvider';

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
  const { config, atualizarNomeLoja, atualizarLogoLoja, removerLogo } = useStoreConfig();
  const { colorTheme, setColorTheme } = useColorTheme();
  
  const [nomeEmpresa, setNomeEmpresa] = useState('Phone Center');
  const [telefoneEmpresa, setTelefoneEmpresa] = useState('');
  const [enderecoEmpresa, setEnderecoEmpresa] = useState('');
  const [emailEmpresa, setEmailEmpresa] = useState('');
  const [cnpj, setCnpj] = useState('');
  
  // Estados para loja (nome + logo)
  const [nomeLoja, setNomeLoja] = useState('');
  const [subtituloLoja, setSubtituloLoja] = useState('');
  const [logoLoja, setLogoLoja] = useState<string | null>(null);
  const [previewLogo, setPreviewLogo] = useState<string | null>(null);
  
  const [notificacoesEmail, setNotificacoesEmail] = useState(true);
  const [notificacoesWhatsapp, setNotificacoesWhatsapp] = useState(false);
  const [notificacoesOS, setNotificacoesOS] = useState(true);
  const [notificacoesGarantia, setNotificacoesGarantia] = useState(true);
  
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  
  const [backup, setBackup] = useState(false);
  const [ultimoBackup, setUltimoBackup] = useState<Date | null>(null);

  // Carregar config ao montar
  useEffect(() => {
    const carregarDadosLoja = async () => {
      if (!usuario?.lojaId) return;

      try {
        const { data, error } = await supabase
          .from('lojas')
          .select('*')
          .eq('id', usuario.lojaId)
          .single();

        if (data) {
          setNomeLoja(data.nome || '');
          setSubtituloLoja(data.subtitulo || '');
          setLogoLoja(data.logo_url || null);
          setPreviewLogo(data.logo_url || null);
        }
      } catch (err) {
        console.error("Erro ao carregar dados da loja", err);
      }
    }
    carregarDadosLoja();
  }, [usuario?.lojaId]);

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

  const handleSalvarConfiguracoes = () => {
    // Salvar configurações da empresa
    console.log('Configurações salvas:', {
      nomeEmpresa,
      telefoneEmpresa,
      enderecoEmpresa,
      emailEmpresa,
      cnpj,
    });
    alert('Configurações da empresa salvas com sucesso!');
  };

  const handleSalvarNomeLoja = async () => {
    if (!usuario?.lojaId || !nomeLoja) return;
    try {
      const { error } = await supabase
        .from('lojas')
        .update({ nome: nomeLoja })
        .eq('id', usuario.lojaId);
      if (error) throw error;
      atualizarNomeLoja(nomeLoja);
      alert('Nome da loja atualizado com sucesso!');
      window.location.reload();
    } catch (error: any) {
      console.error('Erro ao salvar nome:', error);
      alert(`Erro ao salvar nome: ${error.message}`);
    }
  };

  const handleSalvarSubtituloLoja = async () => {
    if (!usuario?.lojaId) return;
    try {
      const { error } = await supabase
        .from('lojas')
        .update({ subtitulo: subtituloLoja })
        .eq('id', usuario.lojaId);
      if (error) throw error;
      alert('Subtítulo atualizado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar subtítulo:', error);
      alert(`Erro ao salvar subtítulo: ${error.message}`);
    }
  };

  const handleSalvarLogoLoja = async () => {
    if (!usuario?.lojaId || !logoLoja) {
      alert('Selecione uma logo primeiro');
      return;
    }
    try {
      // Nota: Idealmente você usaria Supabase Storage. 
      // Aqui estamos salvando a string base64 no campo logo_url
      const { error } = await supabase
        .from('lojas')
        .update({ logo_url: logoLoja })
        .eq('id', usuario.lojaId);

      if (error) throw error;

      atualizarLogoLoja(logoLoja);
      alert('Logo atualizada com sucesso!');
      window.location.reload();
    } catch (error: any) {
      console.error('Erro ao salvar logo:', error);
      alert(`Erro ao salvar logo: ${error.message}`);
    }
  };

  const handleSalvarNotificacoes = () => {
    // Salvar configurações de notificações
    console.log('Notificações salvas:', {
      notificacoesEmail,
      notificacoesWhatsapp,
      notificacoesOS,
      notificacoesGarantia,
    });
    alert('Preferências de notificações salvas com sucesso!');
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

  const handleFazerBackup = async () => {
    try {
      setBackup(true);
      console.log('Iniciando backup...');
      
      // Simular backup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setUltimoBackup(new Date());
      alert('Backup realizado com sucesso!');
    } catch (error) {
      alert('Erro ao fazer backup!');
    } finally {
      setBackup(false);
    }
  };

  const handleExportarDados = () => {
    alert('Dados exportados com sucesso!');
  };

  return (
    <div className="w-full flex justify-center">
      <div className="space-y-4 sm:space-y-6 w-full max-w-4xl px-4 sm:px-0">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie as configurações do sistema</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="empresa" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-2 h-auto bg-white/10 dark:bg-white/5 backdrop-blur-xl border border-white/10 p-1.5 rounded-[2rem] mb-6">
            <TabsTrigger value="empresa" className="text-xs sm:text-sm py-3 rounded-[1.5rem] data-[state=active]:bg-white/30 dark:data-[state=active]:bg-white/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-lg transition-all duration-300">
              Empresa
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
                    Escolha a paleta de cores principal do sistema. Temas customizados ativam o modo escuro automaticamente.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'padrao', name: 'Padrão (Azul)', color: '#2563eb' },
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
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full shadow-md border border-white/20 flex-shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="font-medium text-sm text-left leading-tight">{t.name}</span>
                    </button>
                  ))}
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
                        <label className="text-sm font-medium">CNPJ</label>
                        <input
                          type="text"
                          value={cnpj}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCnpj(e.target.value)}
                          placeholder="00.000.000/0000-00"
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

                    <Button 
                      onClick={handleSalvarConfiguracoes}
                      className="w-full h-10 sm:h-auto"
                    >
                      Salvar Configurações
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </div>
          </TabsContent>

          {/* Notificações */}
          <TabsContent value="notificacoes">
            <GlassCard className="rounded-3xl">
              <div className="pb-4 border-b border-white/10 mb-4">
                <h3 className="text-base sm:text-lg font-bold">Preferências de Notificações</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Configure como você quer ser notificado
                </p>
              </div>
              <div>
                <div className="space-y-4 sm:space-y-6">
                  {/* Canais de Notificação */}
                  <div className="border-b dark:border-slate-700 pb-4 sm:pb-6">
                    <h3 className="text-sm sm:text-base font-semibold mb-4">Canais de Comunicação</h3>
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Bell className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Notificações por E-mail</p>
                            <p className="text-xs text-muted-foreground">Receba alertas por e-mail</p>
                          </div>
                        </div>
                        <Switch
                          checked={notificacoesEmail}
                          onCheckedChange={setNotificacoesEmail}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Bell className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Notificações por WhatsApp</p>
                            <p className="text-xs text-muted-foreground">Receba alertas por WhatsApp</p>
                          </div>
                        </div>
                        <Switch
                          checked={notificacoesWhatsapp}
                          onCheckedChange={setNotificacoesWhatsapp}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tipos de Notificação */}
                  <div>
                    <h3 className="text-sm sm:text-base font-semibold mb-4">Notificar sobre</h3>
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Ordens de Serviço</p>
                          <p className="text-xs text-muted-foreground">Novas OS e atualizações</p>
                        </div>
                        <Switch
                          checked={notificacoesOS}
                          onCheckedChange={setNotificacoesOS}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Garantias</p>
                          <p className="text-xs text-muted-foreground">Vencimento de garantias</p>
                        </div>
                        <Switch
                          checked={notificacoesGarantia}
                          onCheckedChange={setNotificacoesGarantia}
                        />
                      </div>
                    </div>
                  </div>

                  <Button 
                    onClick={handleSalvarNotificacoes}
                    className="w-full h-10 sm:h-auto"
                  >
                    Salvar Preferências
                  </Button>
                </div>
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
              {/* Backup */}
              <GlassCard className="rounded-3xl">
                <div className="pb-4 border-b border-white/10 mb-4">
                  <h3 className="text-base sm:text-lg font-bold">Backup de Dados</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Faça backup de todos os seus dados
                  </p>
                </div>
                <div>
                  <div className="space-y-4">
                    {ultimoBackup && (
                      <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg p-3 sm:p-4">
                        <p className="text-sm text-green-800 dark:text-green-300">
                          ✓ Último backup: {ultimoBackup.toLocaleDateString('pt-BR')} às {ultimoBackup.toLocaleTimeString('pt-BR')}
                        </p>
                      </div>
                    )}
                    <Button 
                      onClick={handleFazerBackup}
                      disabled={backup}
                      className="w-full h-10 sm:h-auto"
                    >
                      {backup ? 'Fazendo backup...' : 'Fazer Backup Agora'}
                    </Button>
                  </div>
                </div>
              </GlassCard>

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
        </Tabs>
      </div>
    </div>
  );
}
