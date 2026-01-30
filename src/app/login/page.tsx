'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Smartphone, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  // usa o loading e funções do hook centralizado
  const { login, registrar, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
      } else {
        await registrar(formData.email, formData.senha, formData.nome);
      }
      // Não fazer redirect manual aqui — onAuthStateChange no hook fará o redirect.
    } catch (err: any) {
      setError(err?.message ?? 'Erro desconhecido');
    }
  };

  const loading = authLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-sm sm:max-w-md">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-blue-600 text-white mx-auto mb-3 sm:mb-4">
            <Smartphone className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50">Phone Center</h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">Sistema de Gestão de Reparo</p>
        </div>

        {/* Card */}
        <Card className="p-4 sm:p-8 space-y-4 sm:space-y-6 border-2 shadow-lg">
          {/* Erro */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span className="text-xs sm:text-sm">{error}</span>
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                  Nome Completo
                </label>
                <input
                  type="text"
                  name="nome"
                  value={formData.nome}
                  onChange={handleInputChange}
                  placeholder="Seu nome"
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 dark:border-slate-700 dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder={isLogin ? 'admin@phonecenter.com' : 'seu@email.com'}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 dark:border-slate-700 dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              {isLogin && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Demo: admin@phonecenter.com</p>
              )}
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="senha"
                  value={formData.senha}
                  onChange={handleInputChange}
                  placeholder={isLogin ? 'admin123' : 'Mínimo 6 caracteres'}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 dark:border-slate-700 dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : (
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </button>
              </div>
              {isLogin && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Demo: admin123</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 sm:py-2.5 text-sm sm:text-base h-10 sm:h-auto"
            >
              {loading
                ? 'Processando...'
                : isLogin
                  ? 'Entrar'
                  : 'Criar Conta'}
            </Button>
          </form>

          {/* Toggle */}
          <div className="border-t pt-4 sm:pt-6">
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center mb-3 sm:mb-4">
              {isLogin
                ? 'Não tem uma conta?'
                : 'Já tem uma conta?'}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
                setFormData({ email: '', senha: '', nome: '' });
              }}
              className="w-full text-sm sm:text-base h-10 sm:h-auto"
            >
              {isLogin ? 'Criar Conta' : 'Fazer Login'}
            </Button>
          </div>
        </Card>

        {/* Info */}
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-gray-200 dark:border-slate-800">
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            <strong>Conta Demo:</strong>
            <br />
            Email: admin@phonecenter.com
            <br />
            Senha: admin123
          </p>
        </div>
      </div>
    </div>
  );
}