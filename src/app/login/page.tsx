'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { AlertCircle, Smartphone, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  // usa o loading e funções do hook centralizado
  const { login, registrar, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [storeName, setStoreName] = useState<string>('');

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

    try {
      if (isLogin) {
        await login(formData.email, formData.senha);
        
        // Busca o nome da loja vinculada ao email
        const { data: perfil } = await supabase
          .from('perfis')
          .select('loja_id')
          .eq('email', formData.email)
          .single();
          
        if (perfil?.loja_id) {
          const { data: loja } = await supabase
            .from('lojas')
            .select('nome')
            .eq('id', perfil.loja_id)
            .single();
            
          if (loja?.nome) {
            setStoreName(loja.nome.toUpperCase());
          }
        }
      } else {
        await registrar(formData.email, formData.senha, formData.nome);
      }
      
      // Ativa a animação de sucesso cobrindo a tela toda
      setIsSuccess(true);
      
      // Força a animação a durar pelo menos 2 segundos (2000ms)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Redireciona para o dashboard após a animação
      router.push('/');
    } catch (err: any) {
      setError(err?.message ?? 'Erro desconhecido');
    }
  };

  const loading = authLoading;

  return (
    <main className={`flex items-center justify-center relative bg-[linear-gradient(160deg,rgba(239,246,255,1)_0%,rgba(219,234,254,1)_100%)] dark:bg-[linear-gradient(160deg,rgba(15,23,42,1)_0%,rgba(30,41,59,1)_100%)] transition-all duration-700 ${isSuccess ? 'p-0 fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden overscroll-none touch-none' : 'min-h-[100dvh] px-4 py-12'}`}>
      <section className={`flex flex-col items-center justify-center relative transition-all duration-700 ease-in-out ${isSuccess ? 'w-screen h-[100dvh] max-w-full gap-0' : 'max-w-md w-full gap-6'}`}>
        <header className={`flex flex-col items-center gap-1 relative self-stretch w-full transition-all duration-500 ${isSuccess ? 'h-0 opacity-0 overflow-hidden scale-90' : 'h-auto opacity-100 scale-100'}`}>
          <div className="flex w-12 h-12 items-center justify-center relative bg-[#155cfb] rounded-[10px] shadow-lg shadow-blue-500/30">
            <Smartphone className="text-white w-6 h-6" />
          </div>
          <div className="flex flex-col items-center pt-3 pb-0 px-0 relative self-stretch w-full">
            <h1 className="text-[#101727] dark:text-white text-3xl text-center font-normal tracking-[0] leading-9">
              Phone Center
            </h1>
          </div>
          <div className="flex flex-col items-center relative self-stretch w-full">
            <p className="text-[#495565] dark:text-gray-400 text-sm text-center tracking-[0] leading-5">
              Sistema de Gestão de Reparo
            </p>
          </div>
        </header>

        <div className={`flex flex-col bg-white dark:bg-slate-900 shadow-[0px_10px_15px_-3px_#0000001a] overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-50 ${isSuccess ? 'w-full h-full rounded-none border-0 items-center justify-center p-6' : 'items-start pt-10 pb-8 px-6 sm:px-8 relative w-full rounded-[30px] sm:rounded-[45px] border-2 border-solid border-neutral-200 dark:border-slate-800'}`}>
          
          {/* ENVOLTÓRIO DO CONTEÚDO (FADE OUT QUANDO SUCESSO) */}
          <div className={`w-full flex flex-col transition-all duration-500 ${isSuccess ? 'opacity-0 translate-y-8 pointer-events-none absolute' : 'opacity-100 translate-y-0 relative'}`}>
            {error && (
              <div className="flex items-start gap-2 p-3 mb-6 bg-red-50 border border-red-200 rounded-2xl text-red-800 w-full">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="text-xs sm:text-sm">{error}</span>
              </div>
            )}

            <form
              className="flex flex-col items-start relative self-stretch w-full z-[1]"
              onSubmit={handleSubmit}
            >
              {/* Animação suave com Grid para o input de Nome */}
              <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] w-full ${isLogin ? 'grid-rows-[0fr] opacity-0 mb-0' : 'grid-rows-[1fr] opacity-100 mb-4'}`}>
                <div className="overflow-hidden flex flex-col items-start gap-1 w-full">
                  <label className="text-[#354152] dark:text-gray-300 text-sm tracking-[0] leading-5">
                    Nome Completo
                  </label>
                  <div className="flex items-center justify-center py-3 px-4 relative self-stretch w-full rounded-[45px] border border-solid border-[#d0d5db] dark:border-slate-700 bg-transparent focus-within:border-[#155dfc] focus-within:ring-1 focus-within:ring-[#155dfc] transition-all">
                    <input
                      name="nome"
                      type="text"
                      value={formData.nome}
                      onChange={handleInputChange}
                      placeholder="Seu nome"
                      className="w-full bg-transparent outline-none text-[#0a0a0a80] dark:text-gray-300 text-sm tracking-[0] leading-[normal] placeholder:text-[#0a0a0a80] dark:placeholder:text-gray-500"
                      required={!isLogin}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start gap-1 relative self-stretch w-full mb-4">
                <label className="text-[#354152] dark:text-gray-300 text-sm tracking-[0] leading-5">
                  Email
                </label>
                <div className="flex items-center justify-center py-3 px-4 relative self-stretch w-full rounded-[45px] border border-solid border-[#d0d5db] dark:border-slate-700 bg-transparent focus-within:border-[#155dfc] focus-within:ring-1 focus-within:ring-[#155dfc] transition-all">
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="seu@email.com"
                    className="w-full bg-transparent outline-none text-[#0a0a0a80] dark:text-gray-300 text-sm tracking-[0] leading-[normal] placeholder:text-[#0a0a0a80] dark:placeholder:text-gray-500"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col items-start gap-1 relative self-stretch w-full mb-6">
                <label className="text-[#354152] dark:text-gray-300 text-sm tracking-[0] leading-5">
                  Senha
                </label>
                <div className="flex items-center justify-center py-3 px-4 relative self-stretch w-full rounded-[45px] border border-solid border-[#d0d5db] dark:border-slate-700 bg-transparent focus-within:border-[#155dfc] focus-within:ring-1 focus-within:ring-[#155dfc] transition-all">
                    <input
                      name="senha"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.senha}
                      onChange={handleInputChange}
                      placeholder={isLogin ? 'Sua senha' : 'Mínimo 6 caracteres'}
                      className="w-full bg-transparent outline-none text-[#0a0a0a80] dark:text-gray-300 text-sm tracking-[0] leading-[normal] placeholder:text-[#0a0a0a80] dark:placeholder:text-gray-500 pr-8"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center px-4 py-3 relative self-stretch w-full bg-[#155cfb2e] dark:bg-[#155cfb50] rounded-[45px] border-[3px] border-solid border-[#155dfc] hover:bg-[#155cfb40] dark:hover:bg-[#155cfb80] transition-colors disabled:opacity-50"
              >
                <span className="text-[#354152] dark:text-white text-base font-semibold text-center whitespace-nowrap">
                  {loading ? 'Processando...' : isLogin ? 'Entrar' : 'Criar Conta'}
                </span>
              </button>
            </form>

            <div className="flex flex-col items-center gap-4 pt-6 mt-2 relative self-stretch w-full border-t border-solid border-neutral-200 dark:border-slate-800 z-[1]">
              <p className="text-[#495565] dark:text-gray-400 text-sm text-center">
                {isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'}
              </p>
              <button
                type="button"
                onClick={() => {
                  const newIsLogin = !isLogin;
                  setIsLogin(newIsLogin);
                  setError(null);
                  setFormData({
                    email: '',
                    senha: '',
                    nome: ''
                  });
                }}
                className="flex items-center justify-center px-4 py-3 relative self-stretch w-full bg-white dark:bg-slate-800 rounded-[45px] border border-solid border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-700 transition-colors"
              >
                <span className="text-neutral-950 dark:text-white text-base font-medium text-center whitespace-nowrap">
                  {isLogin ? 'Criar Conta' : 'Fazer Login'}
                </span>
              </button>
            </div>
          </div>

          {/* CONTEÚDO DE SUCESSO (ANIMAÇÃO TELA CHEIA) */}
          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ease-out ${isSuccess ? 'opacity-100 scale-100 delay-300' : 'opacity-0 scale-50 pointer-events-none'}`}>
            <div className="w-20 h-20 bg-[#155cfb] rounded-[20px] flex items-center justify-center shadow-lg shadow-blue-500/30 animate-bounce">
              <Smartphone className="text-white w-10 h-10" />
            </div>
            <h2 className="mt-6 text-3xl font-bold text-[#101727] dark:text-white text-center flex flex-col gap-2">
              <span>{isLogin ? 'Bem-vindo(a) de volta!' : 'Conta criada com sucesso!'}</span>
              {isLogin && storeName && (
                <span className="text-xl sm:text-2xl text-[#155cfb] dark:text-blue-400 font-black tracking-wide animate-fade-in">
                  {storeName}
                </span>
              )}
            </h2>
            <p className="text-[#495565] dark:text-gray-400 mt-2 text-center">
              Preparando seu ambiente...
            </p>
          </div>
        </div>

      </section>
    </main>
  );
}