import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase em memória para testes. Implementa só o subconjunto usado
 * pelo módulo de estoque: select/update/insert/delete com eq, neq e in.
 */

type Linha = Record<string, any>;
type Filtro = [coluna: string, operador: 'eq' | 'neq' | 'in', valor: any];

export interface ChamadaRegistrada {
  tabela: string;
  operacao: 'select' | 'update' | 'insert' | 'delete';
  payload?: any;
  filtros: Filtro[];
}

export interface OpcoesFake {
  falharInsertEm?: string[];
  falharUpdateEm?: string[];
}

export function criarSupabaseFake(inicial: Record<string, Linha[]> = {}, opcoes: OpcoesFake = {}) {
  const tabelas: Record<string, Linha[]> = {};
  for (const [nome, linhas] of Object.entries(inicial)) tabelas[nome] = linhas.map((l) => ({ ...l }));
  const chamadas: ChamadaRegistrada[] = [];

  function consulta(tabela: string) {
    let operacao: ChamadaRegistrada['operacao'] = 'select';
    let payload: any;
    let colunas = '*';
    const filtros: Filtro[] = [];

    const casa = (l: Linha) =>
      filtros.every(([c, op, v]) =>
        op === 'eq' ? l[c] === v : op === 'neq' ? l[c] !== v : (v as any[]).includes(l[c])
      );

    const projetar = (l: Linha) => {
      if (colunas.trim() === '*') return { ...l };
      const saida: Linha = {};
      for (const c of colunas.split(',').map((x) => x.trim()).filter(Boolean)) {
        if (c in l) saida[c] = l[c];
      }
      return saida;
    };

    const executar = () => {
      chamadas.push({ tabela, operacao, payload, filtros: [...filtros] });
      const linhas = (tabelas[tabela] ??= []);

      if (operacao === 'select') {
        return { data: linhas.filter(casa).map(projetar), error: null };
      }
      if (operacao === 'update') {
        if (opcoes.falharUpdateEm?.includes(tabela)) return { data: null, error: { message: 'falha simulada' } };
        const alvo = linhas.filter(casa);
        alvo.forEach((l) => Object.assign(l, payload));
        return { data: alvo, error: null };
      }
      if (operacao === 'insert') {
        if (opcoes.falharInsertEm?.includes(tabela)) return { data: null, error: { message: 'falha simulada' } };
        const novas = (Array.isArray(payload) ? payload : [payload]).map((r: Linha) => ({ ...r }));
        linhas.push(...novas);
        return { data: novas, error: null };
      }
      tabelas[tabela] = linhas.filter((l) => !casa(l));
      return { data: null, error: null };
    };

    const api: any = {
      select(c = '*') {
        if (operacao === 'select') colunas = c;
        return api;
      },
      update(p: any) {
        operacao = 'update';
        payload = p;
        return api;
      },
      insert(p: any) {
        operacao = 'insert';
        payload = p;
        return api;
      },
      delete() {
        operacao = 'delete';
        return api;
      },
      eq(c: string, v: any) {
        filtros.push([c, 'eq', v]);
        return api;
      },
      neq(c: string, v: any) {
        filtros.push([c, 'neq', v]);
        return api;
      },
      in(c: string, v: any[]) {
        filtros.push([c, 'in', v]);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve().then(executar).then(resolve, reject);
      },
    };
    return api;
  }

  return {
    client: { from: (t: string) => consulta(t) } as unknown as SupabaseClient,
    tabelas,
    chamadas,
  };
}
