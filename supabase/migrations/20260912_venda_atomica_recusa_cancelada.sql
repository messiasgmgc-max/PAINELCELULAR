-- ====================================================================
-- VENDA CANCELADA NÃO É GRAVADA DE NOVO
--
-- Editar e salvar uma venda cancelada chamava registrar_venda_atomica com
-- p_venda_id; a função baixava de novo os aparelhos dos itens, que já tinham
-- voltado ao estoque pela devolução (venda #106952: o 17 Pro Max Azul saiu
-- vendido com a venda continuando cancelada). A função passa a recusar.
--
-- Só insere o bloqueio logo depois de VENDA_NAO_ENCONTRADA; o resto da função
-- continua igual. Falha se o trecho não for encontrado.
-- ====================================================================

do $$
declare
  definicao text;
  trecho constant text := $t$raise exception 'VENDA_NAO_ENCONTRADA' using errcode = 'P0001';
    end if;$t$;
begin
  select pg_get_functiondef('public.registrar_venda_atomica(jsonb,uuid[],uuid,uuid[],jsonb,jsonb,uuid,text,uuid,text,text)'::regprocedure)
    into definicao;

  if position('VENDA_CANCELADA' in definicao) > 0 then
    return;
  end if;

  if position(trecho in definicao) = 0 then
    raise exception 'Trecho de VENDA_NAO_ENCONTRADA não encontrado em registrar_venda_atomica';
  end if;

  definicao := replace(definicao, trecho, trecho || $t$
    if coalesce(v_venda.status, '') ilike 'cancel%' then
      raise exception 'VENDA_CANCELADA' using errcode = 'P0001';
    end if;$t$);

  execute definicao;
end $$;
