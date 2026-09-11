-- ====================================================================
-- search_path fixo nas funções apontadas pelo Security Advisor
-- (function_search_path_mutable). Sem isso, uma função SECURITY DEFINER
-- pode resolver nomes em um schema controlado por quem chama.
-- Os corpos não mudam: todos já usam public.* ou só funções do pg_catalog.
-- ====================================================================

alter function public.get_user_loja_id() set search_path = public;
alter function public.current_loja_id() set search_path = public;
alter function public.handle_new_user() set search_path = public;
alter function public.touch_updated_at() set search_path = '';
alter function public.set_etiqueta_modelos_globais_updated_at() set search_path = '';
