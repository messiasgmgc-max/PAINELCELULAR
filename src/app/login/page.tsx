'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { supabase } from '@/lib/supabaseClient';
import { AlertCircle, Smartphone, Eye, EyeOff, UserCheck, KeyRound, CheckCircle2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const SUCCESS_SCREEN_DURATION_MS = 1200;
  const { login, registrar, loading: authLoading, usuario, authReady } = useAuth();
  const { config } = useStoreConfig();
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [loginFlowCompleted, setLoginFlowCompleted] = useState(false);
  const [isTransitioningToApp, setIsTransitioningToApp] = useState(false);
  const [storeName, setStoreName] = useState<string>('');

  // ── ESTADOS DE PRIMEIRO ACESSO ──
  const [modoPrimeiroAcesso, setModoPrimeiroAcesso] = useState(false);
  const [primeiroAcessoStep, setPrimeiroAcessoStep] = useState<'email' | 'senha' | 'concluido'>('email');
  const [primeiroAcessoEmail, setPrimeiroAcessoEmail] = useState('');
  const [primeiroAcessoSenha, setPrimeiroAcessoSenha] = useState('');
  const [primeiroAcessoConfirmSenha, setPrimeiroAcessoConfirmSenha] = useState('');
  const [dadosMembroValidado, setDadosMembroValidado] = useState<{ nome: string; loja_nome: string; funcao: string } | null>(null);
  const [primeiroAcessoLoading, setPrimeiroAcessoLoading] = useState(false);

  useEffect(() => {
    if (config.nomeLoja) {
      setStoreName(config.nomeLoja.toUpperCase());
    }
  }, [config.nomeLoja]);

  useEffect(() => {
    if (authReady && usuario && !isSuccess && !loginFlowCompleted && !isTransitioningToApp) {
      router.replace('/');
    }
  }, [authReady, usuario, isSuccess, loginFlowCompleted, isTransitioningToApp, router]);

  const [formData, setFormData] = useState({
    email: '',
    senha: '',
    nome: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoginFlowCompleted(false);
    setIsTransitioningToApp(false);

    try {
      const fallbackStoreName = (config.nomeLoja || 'Phone Center').toUpperCase();
      setStoreName(fallbackStoreName);

      if (isLogin) {
        await login(formData.email, formData.senha);

        const email = formData.email.trim().toLowerCase();
        const { data: perfil, error: perfilError } = await supabase
          .from('perfis')
          .select('loja_id')
          .eq('email', email)
          .maybeSingle();

        if (perfilError) {
          console.warn('Erro ao buscar perfil para a animação de boas-vindas:', perfilError.message);
        }

        if (perfil?.loja_id) {
          const { data: loja, error: lojaError } = await supabase
            .from('lojas')
            .select('nome')
            .eq('id', perfil.loja_id)
            .maybeSingle();

          if (lojaError) {
            console.warn('Erro ao buscar loja para a animação de boas-vindas:', lojaError.message);
          }

          if (loja?.nome) {
            setStoreName(loja.nome.toUpperCase());
          }
        }

        setIsSuccess(true);
        setTimeout(() => {
          setIsTransitioningToApp(true);
          router.push('/');
        }, SUCCESS_SCREEN_DURATION_MS);
      } else {
        await registrar(formData.email, formData.senha, formData.nome);
        setIsSuccess(true);
        setTimeout(() => {
          setIsTransitioningToApp(true);
          router.push('/');
        }, SUCCESS_SCREEN_DURATION_MS);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar. Verifique suas credenciais.');
    } finally {
      setLoginFlowCompleted(true);
    }
  };

  // ── FLUXO DE PRIMEIRO ACESSO ──
  const handleValidarEmailPrimeiroAcesso = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!primeiroAcessoEmail.trim()) {
      setError('Por favor, digite o seu endereço de e-mail.');
      return;
    }

    setPrimeiroAcessoLoading(true);
    try {
      const res = await fetch('/api/auth/primeiro-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validar', email: primeiroAcessoEmail.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'E-mail não encontrado na equipe.');
      }

      setDadosMembroValidado({
        nome: data.nome,
        loja_nome: data.loja_nome,
        funcao: data.funcao,
      });
      setPrimeiroAcessoStep('senha');
      toast.success(`E-mail validado! Bem-vindo(a), ${data.nome}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPrimeiroAcessoLoading(false);
    }
  };

  const handleCriarSenhaPrimeiroAcesso = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!primeiroAcessoSenha || primeiroAcessoSenha.length < 6) {
      setError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (primeiroAcessoSenha !== primeiroAcessoConfirmSenha) {
      setError('As senhas digitadas não coincidem.');
      return;
    }

    setPrimeiroAcessoLoading(true);
    try {
      const res = await fetch('/api/auth/primeiro-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'criar_senha',
          email: primeiroAcessoEmail.trim(),
          senha: primeiroAcessoSenha.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao definir senha.');
      }

      setPrimeiroAcessoStep('concluido');
      toast.success('Senha definida com sucesso!');

      // Preenche o formulário de login automaticamente
      setFormData({
        email: primeiroAcessoEmail.trim(),
        senha: primeiroAcessoSenha.trim(),
        nome: '',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPrimeiroAcessoLoading(false);
    }
  };

  const loading = authLoading || isTransitioningToApp;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-950 font-sans relative overflow-hidden">
      {/* Elementos visuais de fundo */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <section className="login-card-container w-full max-w-md bg-slate-900/90 border border-white/10 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10">
        
        {/* CONTEÚDO PRINCIPAL (FORMULÁRIO COM TRANSIÇÃO DE SUCESSO) */}
        <div className="relative">
          <div className={`transition-all duration-700 ease-out ${isSuccess ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
            
            {/* LOGO & CABEÇALHO */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 shadow-lg shadow-indigo-500/20">
                <Smartphone className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {modoPrimeiroAcesso
                  ? 'Primeiro Acesso'
                  : isLogin
                  ? 'Acessar o Painel'
                  : 'Criar Nova Conta'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                {modoPrimeiroAcesso
                  ? 'Valide seu e-mail cadastrado na equipe para criar sua senha'
                  : isLogin
                  ? 'Digite suas credenciais para entrar no sistema'
                  : 'Preencha os dados abaixo para registrar sua loja'}
              </p>
            </div>

            {/* MENSAGEM DE ERRO */}
            {error && (
              <div className="mb-4 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-start gap-3 animate-shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="text-xs sm:text-sm">{error}</span>
              </div>
            )}

            {/* ── MODO PRIMEIRO ACESSO ── */}
            {modoPrimeiroAcesso ? (
              <div className="space-y-4">
                {primeiroAcessoStep === 'email' && (
                  <form onSubmit={handleValidarEmailPrimeiroAcesso} className="space-y-4">
                    <div>
                      <label className="text-xs text-slate-300 font-semibold mb-1 block">
                        Seu E-mail Cadastrado na Equipe *
                      </label>
                      <div className="auth-field flex items-center py-3 px-4 relative rounded-full border border-white/15 bg-slate-950 focus-within:border-blue-500">
                        <input
                          type="email"
                          required
                          value={primeiroAcessoEmail}
                          onChange={(e) => setPrimeiroAcessoEmail(e.target.value)}
                          placeholder="seu@email.com"
                          className="w-full bg-transparent outline-none text-white text-sm"
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        * O administrador da sua loja deve ter cadastrado seu e-mail na aba Equipe.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      disabled={primeiroAcessoLoading}
                      className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full gap-2 shadow-lg shadow-blue-600/30"
                    >
                      {primeiroAcessoLoading ? 'Validando...' : 'Validar E-mail'}
                      <UserCheck className="w-4 h-4" />
                    </Button>
                  </form>
                )}

                {primeiroAcessoStep === 'senha' && dadosMembroValidado && (
                  <form onSubmit={handleCriarSenhaPrimeiroAcesso} className="space-y-4">
                    <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 space-y-1">
                      <p className="font-bold flex items-center gap-1.5 text-sm text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" /> E-mail Validado!
                      </p>
                      <p><strong>Nome:</strong> {dadosMembroValidado.nome}</p>
                      <p><strong>Loja:</strong> {dadosMembroValidado.loja_nome}</p>
                    </div>

                    <div>
                      <label className="text-xs text-slate-300 font-semibold mb-1 block">
                        Crie sua Senha de Acesso *
                      </label>
                      <div className="auth-field flex items-center py-3 px-4 relative rounded-full border border-white/15 bg-slate-950 focus-within:border-blue-500">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={primeiroAcessoSenha}
                          onChange={(e) => setPrimeiroAcessoSenha(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          className="w-full bg-transparent outline-none text-white text-sm pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 text-slate-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-300 font-semibold mb-1 block">
                        Confirme sua Senha *
                      </label>
                      <div className="auth-field flex items-center py-3 px-4 relative rounded-full border border-white/15 bg-slate-950 focus-within:border-blue-500">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={primeiroAcessoConfirmSenha}
                          onChange={(e) => setPrimeiroAcessoConfirmSenha(e.target.value)}
                          placeholder="Repita a senha"
                          className="w-full bg-transparent outline-none text-white text-sm"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={primeiroAcessoLoading}
                      className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full gap-2 shadow-lg shadow-emerald-600/30"
                    >
                      {primeiroAcessoLoading ? 'Salvando...' : 'Cadastrar Senha e Concluir'}
                      <KeyRound className="w-4 h-4" />
                    </Button>
                  </form>
                )}

                {primeiroAcessoStep === 'concluido' && (
                  <div className="text-center py-4 space-y-4">
                    <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Acesso Ativado com Sucesso!</h3>
                    <p className="text-xs text-slate-300">
                      Sua senha foi cadastrada. Você já pode fazer login e acessar o painel da sua loja.
                    </p>
                    <Button
                      onClick={() => {
                        setModoPrimeiroAcesso(false);
                        setIsLogin(true);
                      }}
                      className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full"
                    >
                      Ir para Tela de Login
                    </Button>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setModoPrimeiroAcesso(false)}
                    className="flex items-center justify-center gap-2 w-full text-xs text-slate-400 hover:text-white py-2"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar para o Login Normal
                  </button>
                </div>
              </div>
            ) : (
              /* ── MODO LOGIN NORMAL / REGISTRO DE LOJA ── */
              <>
                <form className="flex flex-col items-start relative self-stretch w-full z-[1]" onSubmit={handleSubmit}>
                  {/* Nome Completo (Apenas no Registro de Nova Loja) */}
                  <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] w-full ${isLogin ? 'grid-rows-[0fr] opacity-0 mb-0' : 'grid-rows-[1fr] opacity-100 mb-4'}`}>
                    <div className="overflow-hidden flex flex-col items-start gap-1 w-full">
                      <label className="text-slate-300 text-sm">Nome Completo</label>
                      <div className="auth-field flex items-center justify-center py-3 px-4 relative self-stretch w-full rounded-full border border-white/15 bg-slate-950 focus-within:border-blue-500 transition-all">
                        <input
                          name="nome"
                          type="text"
                          value={formData.nome}
                          onChange={handleInputChange}
                          placeholder="Seu nome"
                          className="auth-input w-full bg-transparent outline-none text-white text-sm"
                          required={!isLogin}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-1 relative self-stretch w-full mb-4">
                    <label className="text-slate-300 text-sm">Email</label>
                    <div className="auth-field flex items-center justify-center py-3 px-4 relative self-stretch w-full rounded-full border border-white/15 bg-slate-950 focus-within:border-blue-500 transition-all">
                      <input
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="seu@email.com"
                        className="auth-input w-full bg-transparent outline-none text-white text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-1 relative self-stretch w-full mb-6">
                    <label className="text-slate-300 text-sm">Senha</label>
                    <div className="auth-field flex items-center justify-center py-3 px-4 relative self-stretch w-full rounded-full border border-white/15 bg-slate-950 focus-within:border-blue-500 transition-all">
                      <input
                        name="senha"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.senha}
                        onChange={handleInputChange}
                        placeholder={isLogin ? 'Sua senha' : 'Mínimo 6 caracteres'}
                        className="auth-input w-full bg-transparent outline-none text-white text-sm pr-8"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 text-slate-400 hover:text-white cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center justify-center px-4 py-3 relative self-stretch w-full bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/30 cursor-pointer"
                  >
                    <span>{loading ? 'Processando...' : isLogin ? 'Entrar no Sistema' : 'Criar Conta da Loja'}</span>
                  </button>
                </form>

                {/* BOTÃO JOGADA: FUI REGISTRADO POR OUTRO / PRIMEIRO ACESSO */}
                <div className="mt-4 pt-3 border-t border-white/10 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setModoPrimeiroAcesso(true);
                      setPrimeiroAcessoStep('email');
                      setError(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4 text-indigo-400" />
                    Fui registrado por outro: Primeiro acesso (Criar Senha)
                  </button>
                </div>

                <div className="flex flex-col items-center gap-3 pt-4 mt-4 border-t border-white/10 relative self-stretch w-full">
                  <p className="text-slate-400 text-xs text-center">
                    {isLogin ? 'Deseja cadastrar uma nova loja?' : 'Já possui cadastro?'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setError(null);
                      setFormData({ email: '', senha: '', nome: '' });
                    }}
                    className="flex items-center justify-center px-4 py-2.5 relative self-stretch w-full bg-slate-800/80 hover:bg-slate-700/80 rounded-full border border-white/10 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
                  >
                    {isLogin ? 'Cadastrar Nova Loja' : 'Ir para o Login'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* CONTEÚDO DE SUCESSO (ANIMAÇÃO TELA CHEIA) */}
          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isSuccess ? 'opacity-100 scale-100 delay-500' : 'opacity-0 scale-75 pointer-events-none'}`}>
            <div className="w-20 h-20 rounded-2xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center animate-[pulse_2.8s_ease-in-out_infinite]">
              <Smartphone className="w-10 h-10 text-blue-400" />
            </div>
            <h2 className="mt-6 text-3xl font-bold text-white text-center flex flex-col gap-2 transition-all duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)]">
              <span>{isLogin ? 'Bem-vindo(a) de volta!' : 'Conta criada com sucesso!'}</span>
              {isLogin && storeName && (
                <span className="text-xl sm:text-2xl text-blue-400 font-black tracking-[0.18em] animate-fade-in">
                  {storeName}
                </span>
              )}
            </h2>
            <p className="text-slate-400 mt-2 text-center transition-opacity duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)]">
              Preparando seu ambiente...
            </p>
          </div>
        </div>

      </section>
    </main>
  );
}