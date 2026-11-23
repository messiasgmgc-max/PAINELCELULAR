'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { SessaoUsuario } from '@/lib/db/types';
import { logAuth } from '@/lib/logger';

interface AuthContextType {
  usuario: SessaoUsuario | null;
  loading: boolean;
  authReady: boolean;
  login: (email: string, senha: string) => Promise<void>;
  registrar: (email: string, senha: string, nome?: string) => Promise<void>;
  logout: () => Promise<void>;
  recarregarUsuario: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHE_KEY = 'sessao_usuario_cache_v2';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<SessaoUsuario | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const router = useRouter();
  const pathname = usePathname();

  const usuarioRef = React.useRef<SessaoUsuario | null>(null);

  const atualizarUsuarioSeMudou = useCallback((proximo: SessaoUsuario | null) => {
    setUsuario((anterior) => {
      if (anterior === proximo) return anterior;
      if (
        anterior &&
        proximo &&
        anterior.id === proximo.id &&
        anterior.email === proximo.email &&
        anterior.nome === proximo.nome &&
        anterior.role === proximo.role &&
        anterior.lojaId === proximo.lojaId
      ) {
        return anterior;
      }
      usuarioRef.current = proximo;
      return proximo;
    });
  }, []);

  // Tenta carregar cache síncrono do localStorage para ter 0ms de espera na renderização inicial
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.id) {
          atualizarUsuarioSeMudou(parsed);
          setLoading(false);
          setAuthReady(true);
        }
      }
    } catch (e) {
      // Ignora erro de parse de cache
    }
  }, [atualizarUsuarioSeMudou]);

  // Montar objeto de usuário combinando Supabase Auth + Tabela perfis
  const montarUsuario = useCallback(async (session: any): Promise<SessaoUsuario | null> => {
    if (!session?.user) return null;

    try {
      const { data: perfil } = await supabase
        .from('perfis')
        .select('nome, role, loja_id')
        .eq('id', session.user.id)
        .maybeSingle();

      const userObj: SessaoUsuario = {
        id: session.user.id,
        email: session.user.email ?? '',
        nome: perfil?.nome ?? session.user.user_metadata?.nome ?? session.user.email?.split('@')[0] ?? 'Usuário',
        role: (perfil?.role as SessaoUsuario['role']) ?? (session.user.user_metadata?.role as SessaoUsuario['role']) ?? 'operador',
        lojaId: perfil?.loja_id ?? session.user.user_metadata?.lojaId ?? session.user.user_metadata?.loja_id ?? null,
      };

      // Salva no localStorage para carregamentos instantâneos futuros
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(userObj));
      } catch (e) {}

      return userObj;
    } catch (error) {
      console.error('Erro ao montar usuário:', error);
      return {
        id: session.user.id,
        email: session.user.email ?? '',
        nome: session.user.user_metadata?.nome ?? session.user.email?.split('@')[0] ?? 'Usuário',
        role: (session.user.user_metadata?.role as SessaoUsuario['role']) ?? 'operador',
        lojaId: session.user.user_metadata?.lojaId ?? session.user.user_metadata?.loja_id ?? null,
      };
    }
  }, []);

  // Recarregar dados do usuário logado
  const recarregarUsuario = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const u = await montarUsuario(session);
        if (u) atualizarUsuarioSeMudou(u);
      }
    } catch (e) {
      console.error('Erro ao recarregar usuário:', e);
    }
  }, [montarUsuario, atualizarUsuarioSeMudou]);

  // Efeito principal de verificação de sessão (executa apenas uma vez no Root Layout)
  useEffect(() => {
    let isMounted = true;

    const inicializarSessao = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) console.warn('Erro ao obter sessão:', error.message);

        if (session?.user) {
          document.cookie = `sessao_usuario=${session.access_token}; path=/; max-age=86400; SameSite=Lax`;
          const usuarioMontado = await montarUsuario(session);
          if (isMounted) {
            atualizarUsuarioSeMudou(usuarioMontado);
          }
        } else {
          // Tenta via getUser caso exista cookie ativo sem sessão em memória
          const { data: { user } } = await supabase.auth.getUser();
          if (user && isMounted) {
            const usuarioMontado = await montarUsuario({ user });
            atualizarUsuarioSeMudou(usuarioMontado);
          } else if (isMounted) {
            document.cookie = `sessao_usuario=; path=/; max-age=0;`;
            try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
            atualizarUsuarioSeMudou(null);
          }
        }
      } catch (err) {
        console.error('Erro ao inicializar sessão:', err);
        if (isMounted) atualizarUsuarioSeMudou(null);
      } finally {
        if (isMounted) {
          setLoading(false);
          setAuthReady(true);
        }
      }
    };

    inicializarSessao();

    // Listener para mudanças de estado do Supabase (Login, Logout, Token Refresh).
    // IMPORTANTE: o callback NÃO pode ser async nem aguardar queries do Supabase
    // diretamente aqui, pois GoTrueClient aguarda onAuthStateChange enquanto segura
    // o lock interno de sessão — chamar supabase.from() aqui causa deadlock infinito.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      // INITIAL_SESSION já é tratado por inicializarSessao() acima — evita query duplicada em `perfis`
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || (session && event !== 'SIGNED_OUT')) {
        if (session?.access_token) {
          document.cookie = `sessao_usuario=${session.access_token}; path=/; max-age=86400; SameSite=Lax`;
        }
        setLoading(false);
        setAuthReady(true);

        // Executa fora do lock do GoTrueClient para nunca travar `.from()` / `.rpc()`
        setTimeout(() => {
          if (!isMounted) return;
          montarUsuario(session)
            .then((usuarioMontado) => {
              if (!isMounted) return;
              atualizarUsuarioSeMudou(usuarioMontado);
              if (event === 'SIGNED_IN' && usuarioMontado) {
                logAuth(usuarioMontado, 'Login');
              }
            })
            .catch((err) => {
              console.error('Erro ao sincronizar usuário após evento de auth:', err);
            });
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        const prevUser = usuarioRef.current;
        document.cookie = `sessao_usuario=; path=/; max-age=0;`;
        try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
        atualizarUsuarioSeMudou(null);
        setLoading(false);
        setAuthReady(true);

        if (prevUser) {
          setTimeout(() => {
            logAuth(prevUser, 'Logout');
          }, 0);
        }
      }
    });

    return () => {
      isMounted = false;
      try { listener?.subscription?.unsubscribe?.(); } catch (e) {}
    };
  }, [montarUsuario, atualizarUsuarioSeMudou]);

  // Redirecionamento automático seguro (somente quando deslogado e tentando acessar rota privada)
  useEffect(() => {
    if (!authReady || loading) return;

    const rotasPublicas = ['/login', '/assinar', '/avaliar', '/upgrade', '/coleta', '/motoboy', '/recibo', '/bio', '/proposta', '/crm-sidebar', '/privacidade', '/termos', '/exclusao-dados'];
    const ehRotaPublica = rotasPublicas.some(r => pathname === r || pathname?.startsWith(`${r}/`));

    if (!usuario && !ehRotaPublica && !pathname?.startsWith('/api/')) {
      router.replace('/login');
    }
  }, [authReady, loading, usuario, pathname, router]);

  const login = useCallback(async (email: string, senha: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      setLoading(false);
      throw error;
    }
  }, []);

  const registrar = useCallback(async (email: string, senha: string, nome?: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });
    if (error) {
      setLoading(false);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Erro no signOut:', e);
    } finally {
      document.cookie = `sessao_usuario=; path=/; max-age=0;`;
      try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
      setUsuario(null);
      setLoading(false);
      setAuthReady(true);
      router.replace('/login');
    }
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        usuario,
        loading,
        authReady,
        login,
        registrar,
        logout,
        recarregarUsuario,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext deve ser usado dentro de um AuthProvider');
  }
  return context;
}
