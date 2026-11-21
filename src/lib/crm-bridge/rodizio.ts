export interface AgenteRodizio {
  nome: string;
  ativo?: boolean;
  email?: string;
}

export interface RegraRodizio {
  setor: string;
  ativo: boolean;
  estrategia: string;
  limite_simultaneo: number;
  respeitar_online: boolean;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: number[];
  agentes: Array<string | AgenteRodizio>;
  ultimo_indice: number;
}

export type MapaStatusAgentes = Record<
  string,
  {
    status?: 'online' | 'busy' | 'offline' | string;
    conversasAbertas?: number;
  }
>;

export const SETORES_PADRAO_RODIZIO: RegraRodizio[] = [
  {
    setor: 'Vendas',
    ativo: true,
    estrategia: 'round_robin',
    limite_simultaneo: 8,
    respeitar_online: true,
    horario_inicio: '09:00',
    horario_fim: '19:00',
    dias_semana: [1, 2, 3, 4, 5, 6],
    agentes: [],
    ultimo_indice: -1,
  },
  {
    setor: 'Troca/Upgrade',
    ativo: true,
    estrategia: 'round_robin',
    limite_simultaneo: 6,
    respeitar_online: true,
    horario_inicio: '09:00',
    horario_fim: '19:00',
    dias_semana: [1, 2, 3, 4, 5, 6],
    agentes: [],
    ultimo_indice: -1,
  },
  {
    setor: 'Assistência/Garantia',
    ativo: true,
    estrategia: 'round_robin',
    limite_simultaneo: 10,
    respeitar_online: true,
    horario_inicio: '09:00',
    horario_fim: '18:00',
    dias_semana: [1, 2, 3, 4, 5, 6],
    agentes: [],
    ultimo_indice: -1,
  },
  {
    setor: 'Atacado',
    ativo: true,
    estrategia: 'round_robin',
    limite_simultaneo: 12,
    respeitar_online: false,
    horario_inicio: '08:00',
    horario_fim: '20:00',
    dias_semana: [1, 2, 3, 4, 5, 6],
    agentes: [],
    ultimo_indice: -1,
  },
  {
    setor: 'Financeiro',
    ativo: true,
    estrategia: 'round_robin',
    limite_simultaneo: 8,
    respeitar_online: true,
    horario_inicio: '09:00',
    horario_fim: '18:00',
    dias_semana: [1, 2, 3, 4, 5],
    agentes: [],
    ultimo_indice: -1,
  },
];

function minutosDoDia(hhmm: string, padrao: number): number {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return padrao;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function dentroHorarioComercial(
  horarioInicio: string,
  horarioFim: string,
  diasSemana: number[] = [1, 2, 3, 4, 5, 6],
  agora: Date = new Date()
): boolean {
  const dia = agora.getDay();
  if (Array.isArray(diasSemana) && diasSemana.length > 0 && !diasSemana.includes(dia)) {
    return false;
  }

  const ini = minutosDoDia(horarioInicio, 9 * 60);
  const fim = minutosDoDia(horarioFim, 19 * 60);
  const atual = agora.getHours() * 60 + agora.getMinutes();

  if (ini <= fim) {
    return atual >= ini && atual <= fim;
  }
  return atual >= ini || atual <= fim;
}

export function selecionarProximoAgenteRodizio(
  regra: RegraRodizio,
  statusAgentes?: MapaStatusAgentes,
  agora: Date = new Date()
): {
  agenteSelecionado: string | null;
  proximoIndice: number;
  motivoFallback?: string;
} {
  if (!regra.ativo) {
    return {
      agenteSelecionado: null,
      proximoIndice: regra.ultimo_indice,
      motivoFallback: 'rodizio_desativado',
    };
  }

  if (!dentroHorarioComercial(regra.horario_inicio, regra.horario_fim, regra.dias_semana, agora)) {
    return {
      agenteSelecionado: null,
      proximoIndice: regra.ultimo_indice,
      motivoFallback: 'fora_horario_comercial',
    };
  }

  const lista = (regra.agentes || []).map((item) =>
    typeof item === 'string' ? { nome: item.trim(), ativo: true } : { ...item, nome: item.nome.trim() }
  );

  if (lista.length === 0) {
    return {
      agenteSelecionado: null,
      proximoIndice: -1,
      motivoFallback: 'sem_agentes_configurados',
    };
  }

  const total = lista.length;
  const ultimoNum = Number(regra.ultimo_indice);
  const ultimoValido = Number.isFinite(ultimoNum) ? ultimoNum : -1;
  const inicio = (((ultimoValido + 1) % total) + total) % total;

  for (let offset = 0; offset < total; offset++) {
    const idx = (inicio + offset) % total;
    const cand = lista[idx];
    if (!cand.nome || cand.ativo === false) continue;

    if (statusAgentes) {
      const st = statusAgentes[cand.nome] || statusAgentes[cand.nome.toLowerCase()];
      if (regra.respeitar_online && st && st.status && st.status !== 'online') {
        continue;
      }
      if (
        st &&
        st.conversasAbertas != null &&
        regra.limite_simultaneo > 0 &&
        st.conversasAbertas >= regra.limite_simultaneo
      ) {
        continue;
      }
    }

    return {
      agenteSelecionado: cand.nome,
      proximoIndice: idx,
    };
  }

  return {
    agenteSelecionado: null,
    proximoIndice: regra.ultimo_indice,
    motivoFallback: 'nenhum_agente_disponivel',
  };
}
