'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { SessaoUsuario } from '@/lib/db/types';

export function useAuth() {
  const [usuario, setUsuario] = useState<SessaoUsuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Função auxiliar para montar o usuário combinando Auth + Tabela Perfis
  const montarUsuario = useCallback(async (session: any) => {
    if (!session?.user) return null;

    try {
      // Busca dados atualizados da tabela perfis (Single Source of Truth)
      const { data: perfil, error: perfilError } = await supabase
        .from('perfis')
        .select('*')
        .eq('email', session.user.email)
        .maybeSingle();

      if (perfilError) {
        console.warn('Perfil não encontrado ou indisponível:', perfilError.message);
      }

      return {
        id: session.user.id,
        email: session.user.email ?? '',
        nome: session.user.user_metadata?.nome ?? session.user.email?.split('@')[0] ?? 'Usuário',
        // Prioriza a role do banco de dados; se não tiver, usa do Auth; se não, 'operador'
        role: (perfil?.role as SessaoUsuario['role']) ?? (session.user.user_metadata?.role as SessaoUsuario['role']) ?? 'operador',
        lojaId: perfil?.loja_id ?? session.user.user_metadata?.lojaId ?? session.user.user_metadata?.loja_id ?? null
      };
    } catch (error) {
      console.error('Erro ao buscar perfil complementar:', error);
      // Fallback seguro apenas com dados do Auth
      return {
        id: session.user.id,
        email: session.user.email ?? '',
        nome: session.user.user_metadata?.nome ?? session.user.email?.split('@')[0] ?? 'Usuário',
        role: (session.user.user_metadata?.role as SessaoUsuario['role']) ?? 'operador',
        lojaId: session.user.user_metadata?.lojaId ?? session.user.user_metadata?.loja_id ?? null
      };
    }
  }, []);

  // Carregar sessão do Supabase ao iniciar
  useEffect(() => {
    console.debug('useAuth: mounted');
    let mounted = true;

    const carregarSessao = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!mounted) return;

        if (session?.user) {
          const usuarioMontado = await montarUsuario(session);
          setUsuario(usuarioMontado || {
            id: session.user.id,
            email: session.user.email ?? '',
            nome: session.user.user_metadata?.nome ?? session.user.email?.split('@')[0] ?? 'Usuário',
            role: (session.user.user_metadata?.role as SessaoUsuario['role']) ?? 'operador',
            lojaId: session.user.user_metadata?.lojaId
          });
        } else {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError) {
            console.warn('getUser sem sessão ativa:', userError.message);
          }

          if (!mounted) return;

          if (user) {
            const usuarioMontado = await montarUsuario({ user } as any);
            setUsuario(usuarioMontado || {
              id: user.id,
              email: user.email ?? '',
              nome: user.user_metadata?.nome ?? user.email?.split('@')[0] ?? 'Usuário',
              role: (user.user_metadata?.role as SessaoUsuario['role']) ?? 'operador',
              lojaId: user.user_metadata?.lojaId
            });
          } else {
            setUsuario(null);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar sessão:', error);
        setUsuario(null);
      } finally {
        if (mounted) {
          setLoading(false);
          setAuthReady(true);
        }
      }
    };

    carregarSessao();

    // Escutar mudanças na autenticação
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.debug('onAuthStateChange', _event, session);
      if (!mounted) return;

      if (session?.user) {
        document.cookie = `sessao_usuario=${session.access_token}; path=/; max-age=86400; SameSite=Lax`;
        const usuarioMontado = await montarUsuario(session);
        setUsuario(usuarioMontado || {
          id: session.user.id,
          email: session.user.email ?? '',
          nome: session.user.user_metadata?.nome ?? session.user.email?.split('@')[0] ?? 'Usuário',
          role: (session.user.user_metadata?.role as SessaoUsuario['role']) ?? 'operador',
          lojaId: session.user.user_metadata?.lojaId
        });
      } else {
        document.cookie = `sessao_usuario=; path=/; max-age=0;`;
        setUsuario(null);
      }

      setLoading(false);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      try {
        listener?.subscription?.unsubscribe?.();
      } catch (e) {
        // ignore
      }
    };
  }, [montarUsuario]);

  // Redirecionamento automático de segurança: só ocorre após a sessão ser validada.
  useEffect(() => {
    console.debug('useAuth: redirect check', { authReady, loading, usuario: !!usuario, pathname });
    if (!authReady || loading) return;

    if (!usuario && pathname !== '/login' && !pathname.startsWith('/api/')) {
      router.replace('/login');
    }
  }, [authReady, usuario, loading, pathname, router]);

  const login = useCallback(async (email: string, senha: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (error) throw error;

      // Não forçar redirect aqui — deixe onAuthStateChange e o useEffect cuidarem do redirect.
      return true;
    } catch (error) {
      console.error('Erro no login:', error);
      setLoading(false);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      // onAuthStateChange vai ajustar usuario; podemos navegar explicitamente para /login
      router.push('/login');
    } catch (err) {
      console.error('Erro no logout:', err);
      throw err;
    }
  }, [router]);

  const registrar = useCallback(async (email: string, senha: string, nome: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          data: { nome, role: 'operador' }
        }
      });
      if (error) throw error;
      console.debug('signUp data:', data);
      return true;
    } catch (error) {
      console.error('Erro no registro:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    usuario,
    loading,
    authReady,
    autenticado: !!usuario,
    login,
    logout,
    registrar
  };
}