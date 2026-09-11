import { useState, useCallback, useEffect } from "react";
import { buscarTodasPaginas } from '@/lib/supabase/paginar';
import { toast } from "sonner";
import { Aparelho } from "@/lib/db/types";
import { supabase } from "@/lib/supabaseClient";
import {
  MOTIVOS_SAIDA,
  estaNoEstoque,
  patchRestauracao,
  patchSaida,
  type EstadoCicloAparelho,
  type MotivoSaida,
  type OrigemMovimentacao,
  type PatchCiclo,
  type TipoMovimentacao,
} from "@/lib/estoque/ciclo";
import { aplicarMudancaEstoque, registrarEntradaEstoque } from "@/lib/estoque/movimentacoes";
import { useAuth } from "./useAuth";

/** Contexto opcional de um cadastro, usado na auditoria da entrada no estoque. */
export interface OpcoesCadastroAparelho {
  /** De onde o aparelho veio. Padrão: 'manual'. */
  origem?: OrigemMovimentacao;
  /** Agrupa os cadastros de uma mesma importação num único lote de auditoria. */
  loteId?: string;
  observacao?: string;
  /** false quando quem chama registra a entrada por conta própria (evita a entrada em dobro). */
  registrarEntrada?: boolean;
  /** Lança o erro do banco em vez de só guardar em `error` (quem chama mostra a mensagem real). */
  lancarErro?: boolean;
}

interface UseAparelhosReturn {
  aparelhos: Aparelho[];
  loading: boolean;
  error: string | null;
  fetchAparelhos: () => Promise<void>;
  buscarAparelhos: (termo: string) => Promise<void>;
  criarAparelho: (
    dados: Omit<Aparelho, "id" | "dataCadastro" | "lojaId">,
    opcoes?: OpcoesCadastroAparelho
  ) => Promise<Aparelho | null>;
  atualizarAparelho: (id: string, dados: Partial<Aparelho>) => Promise<Aparelho | null>;
  deletarAparelho: (id: string) => Promise<boolean>;
}

/**
 * Colunas do ciclo de vida que a edição comum não grava direto: mudança nelas
 * passa por aplicarMudancaEstoque. `condicao` é estado físico e segue na edição.
 */
const CAMPOS_CICLO_EDICAO = ["ativo", "status", "data_saida", "motivo_saida"] as const;
const STATUS_FORA_DO_ESTOQUE = ["vendido", "baixado"];
const STATUS_NO_ESTOQUE = ["disponivel", "manutencao"];
const COLUNAS_ESTADO_CICLO = "id, loja_id, ativo, status, condicao, data_saida, motivo_saida, observacoes";

/** 'vendido' não é condição física (ver src/lib/estoque/ciclo.ts) e nunca vai para `condicao`. */
function ehCondicaoVendido(valor: unknown): boolean {
  return typeof valor === "string" && valor.trim().toLowerCase() === "vendido";
}

function avisarAuditoriaIncompleta(mensagem: string, detalhe?: string) {
  console.warn(`[Estoque] ${mensagem}`, detalhe || "");
  // id fixo: numa importação em lote vira um aviso só, não um por aparelho.
  toast.warning(mensagem, { id: "estoque-auditoria-incompleta" });
}

async function lerEstadoCiclo(id: string, lojaId: string): Promise<EstadoCicloAparelho | null> {
  const { data, error } = await supabase
    .from("aparelhos")
    .select(COLUNAS_ESTADO_CICLO)
    .eq("id", id)
    .eq("loja_id", lojaId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as EstadoCicloAparelho | null) ?? null;
}

function mesmaSituacao(a: EstadoCicloAparelho, b: EstadoCicloAparelho): boolean {
  return (a.ativo !== false) === (b.ativo !== false) && (a.status || "disponivel") === (b.status || "disponivel");
}

interface PlanoCiclo {
  patch: PatchCiclo;
  tipo: TipoMovimentacao;
  origem: OrigemMovimentacao;
  observacao: string;
}

/**
 * Traduz o que uma edição pediu para ativo/status numa transição do ciclo de
 * vida. Retorna null quando nada muda — por exemplo, o formulário reenviando
 * ativo=true para um aparelho que já está no estoque. Combinações impossíveis
 * (ativo=true com status 'vendido', por exemplo) falham antes de qualquer escrita.
 */
function planejarMudancaCiclo(atual: EstadoCicloAparelho, pedido: Record<string, unknown>): PlanoCiclo | null {
  const ativoAtual = atual.ativo !== false;
  const statusAtual = String(atual.status || "disponivel");

  const statusPedido =
    typeof pedido.status === "string" && pedido.status.trim() ? pedido.status.trim() : undefined;
  const ativoPedido = typeof pedido.ativo === "boolean" ? pedido.ativo : undefined;

  if (statusPedido && !STATUS_FORA_DO_ESTOQUE.includes(statusPedido) && !STATUS_NO_ESTOQUE.includes(statusPedido)) {
    throw new Error(`Status '${statusPedido}' não pertence ao ciclo de vida do estoque.`);
  }

  let statusAlvo: string;
  if (statusPedido) {
    statusAlvo = statusPedido;
  } else if (ativoPedido === undefined || ativoPedido === ativoAtual) {
    // Repetir o ativo que já está gravado não é pedido de transição.
    statusAlvo = statusAtual;
  } else if (ativoPedido === false) {
    statusAlvo = STATUS_FORA_DO_ESTOQUE.includes(statusAtual) ? statusAtual : "baixado";
  } else {
    statusAlvo = "disponivel";
  }

  const ativoAlvo = ativoPedido ?? (statusPedido ? !STATUS_FORA_DO_ESTOQUE.includes(statusPedido) : ativoAtual);

  if (ativoAlvo === ativoAtual && statusAlvo === statusAtual) return null;

  if (ativoAlvo === STATUS_FORA_DO_ESTOQUE.includes(statusAlvo)) {
    throw new Error(`Combinação inválida para o estoque: ativo=${ativoAlvo} com status '${statusAlvo}'.`);
  }

  if (!ativoAlvo) {
    const status = statusAlvo as "vendido" | "baixado";
    const motivoPedido =
      typeof pedido.motivo_saida === "string" && (MOTIVOS_SAIDA as readonly string[]).includes(pedido.motivo_saida)
        ? (pedido.motivo_saida as MotivoSaida)
        : undefined;
    const motivo: MotivoSaida = motivoPedido ?? (status === "vendido" ? "venda" : "baixa_manual");
    // Reclassificar uma saída (baixado -> vendido) mantém a data em que o aparelho saiu.
    const dataBruta = pedido.data_saida ?? (ativoAtual ? undefined : atual.data_saida);
    const quando = dataBruta ? new Date(String(dataBruta)) : new Date();
    return {
      patch: patchSaida(status, motivo, Number.isNaN(quando.getTime()) ? new Date() : quando),
      tipo: status === "vendido" ? "venda" : "baixa",
      origem: "manual",
      observacao:
        status === "vendido" ? "Aparelho marcado como vendido na edição." : "Aparelho baixado do estoque na edição.",
    };
  }

  if (statusAlvo === "manutencao") {
    // Continua sendo da loja: sem data_saida. Se estava fora, volta a contar.
    return {
      patch: {
        status: "manutencao",
        ...(ativoAtual ? {} : { ativo: true, data_saida: null, motivo_saida: null }),
      },
      tipo: "saida",
      origem: "manutencao",
      observacao: "Aparelho enviado para manutenção.",
    };
  }

  const voltaDaManutencao = ativoAtual && statusAtual === "manutencao";
  return {
    patch: patchRestauracao(),
    tipo: "restauracao",
    origem: voltaDaManutencao ? "manutencao" : "manual",
    observacao: voltaDaManutencao ? "Aparelho retornou da manutenção." : "Aparelho devolvido ao estoque na edição.",
  };
}

export function useAparelhos(): UseAparelhosReturn {
  const { usuario } = useAuth();
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montarObservacaoBaixa = (observacoesAtuais?: string | null) => {
    const baixa = `BAIXA_ESTOQUE:${new Date().toISOString()}:Aparelho removido do estoque manualmente.`;
    return observacoesAtuais ? `${observacoesAtuais}\n${baixa}` : baixa;
  };

  const fetchAparelhos = useCallback(async () => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const lojaId = usuario.lojaId;
      // Paginado: acima de 1000 aparelhos o estoque aparecia incompleto.
      const data = await buscarTodasPaginas((de, ate) =>
        supabase.from('aparelhos').select('*').eq('loja_id', lojaId).order('dataCadastro', { ascending: false }).order('id').range(de, ate)
      );
      setAparelhos(data);
    } catch (err) {
      setError("Erro ao buscar aparelhos");
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const buscarAparelhos = useCallback(async (termo: string) => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('aparelhos')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .or(`modelo.ilike.%${termo}%,marca.ilike.%${termo}%`);
      if (error) throw error;
      setAparelhos(data || []);
    } catch (err) {
      setError("Erro ao buscar aparelhos");
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  const criarAparelho = useCallback(
    async (dados: Omit<Aparelho, "id" | "dataCadastro" | "lojaId">, opcoes: OpcoesCadastroAparelho = {}) => {
      if (!usuario?.lojaId) return null;
      setLoading(true);
      setError(null);
      try {
        const uniqueId = (dados as any)?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
        const codigo8Digitos = String(Math.floor(10000000 + Math.random() * 90000000));
        const rawPayload: Record<string, any> = {
          id: uniqueId,
          ...dados,
          loja_id: usuario.lojaId,
          ativo: (dados as any).ativo !== undefined ? (dados as any).ativo : true,
          // 'vendido' não é condição física: conta como não informada.
          condicao: (!ehCondicaoVendido(dados.condicao) && dados.condicao) || 'seminovo',
        };

        // `codigo` só vai quando informado: sem ele, a etiqueta continua usando o ID importado
        // (observações/numeroSerie). Colunas inexistentes caem no retry abaixo.
        if (!rawPayload.codigo) delete rawPayload.codigo;
        delete rawPayload.saudeBateria;

        // Evita enviar string vazia para colunas opcionais.
        Object.keys(rawPayload).forEach((key) => {
          if (typeof rawPayload[key] === 'string' && rawPayload[key].trim() === '') {
            delete rawPayload[key];
          }
        });

        let payload = { ...rawPayload };
        let data: any = null;
        let lastError: any = null;

        for (let tentativa = 0; tentativa < 5; tentativa += 1) {
          // Cadastro: a linha criada é registrada logo abaixo com registrarEntradaEstoque.
          const response = await supabase
            .from('aparelhos') // estoque-guard: auditado
            .insert([payload])
            .select()
            .single();

          if (!response.error) {
            data = response.data;
            lastError = null;
            break;
          }

          lastError = response.error;

          const errorText = `${response.error.message || ''} ${response.error.details || ''}`;
          const columnMatch = errorText.match(/'([^']+)' column/) || errorText.match(/'([^']+)'/);
          const invalidColumn = columnMatch?.[1];

          if (invalidColumn && Object.prototype.hasOwnProperty.call(payload, invalidColumn)) {
            delete payload[invalidColumn];
            continue;
          }

          break;
        }

        if (lastError || !data) {
          throw lastError || new Error('Falha ao inserir aparelho');
        }

        // O aparelho já existe: falha na auditoria só gera aviso, nunca desfaz o cadastro.
        try {
          const entrada = opcoes.registrarEntrada === false
            ? null
            : await registrarEntradaEstoque(supabase, {
            aparelhos: [
              {
                id: data.id,
                loja_id: data.loja_id ?? usuario.lojaId,
                ativo: data.ativo,
                status: data.status,
                condicao: data.condicao,
              },
            ],
            origem: opcoes.origem || 'manual',
            loteId: opcoes.loteId,
            lojaId: usuario.lojaId,
            usuarioId: usuario.id,
            usuarioNome: usuario.nome,
            observacao: opcoes.observacao || null,
          });
          if (entrada && !entrada.auditoriaRegistrada) {
            avisarAuditoriaIncompleta(
              'Aparelho cadastrado, mas a entrada no estoque não foi gravada na auditoria. Avise o suporte.',
              entrada.erroAuditoria
            );
          }
        } catch (erroAuditoria: any) {
          avisarAuditoriaIncompleta(
            'Aparelho cadastrado, mas a entrada no estoque não foi gravada na auditoria. Avise o suporte.',
            erroAuditoria?.message
          );
        }

        const aparelhoCriado = { ...data, custo: data?.custo ?? (dados as any)?.custo ?? 0 } as Aparelho;
        setAparelhos((prev) => [...prev, aparelhoCriado]);
        return aparelhoCriado;
      } catch (err: any) {
        setError(err?.message || "Erro ao criar aparelho");
        if (opcoes.lancarErro) throw err;
        return null;
      } finally {
        setLoading(false);
      }
    },
    [usuario?.lojaId, usuario?.id, usuario?.nome]
  );

  const atualizarAparelho = useCallback(
    async (id: string, dados: Partial<Aparelho>) => {
      if (!usuario?.lojaId) return null;
      const lojaId = usuario.lojaId;
      setLoading(true);
      setError(null);
      try {
        let payload: Record<string, any> = { ...dados };
        delete payload.saudeBateria;
        if (ehCondicaoVendido(payload.condicao)) delete payload.condicao;

        // Campos do ciclo de vida saem do update comum e seguem pelo módulo de estoque.
        const pedidoCiclo: Record<string, unknown> = {};
        for (const campo of CAMPOS_CICLO_EDICAO) {
          if (!Object.prototype.hasOwnProperty.call(payload, campo)) continue;
          if (payload[campo] !== undefined) pedidoCiclo[campo] = payload[campo];
          delete payload[campo];
        }

        // Planeja antes de escrever: combinação inválida não pode deixar edição pela metade.
        let estadoAntes: EstadoCicloAparelho | null = null;
        let plano: PlanoCiclo | null = null;
        if (Object.keys(pedidoCiclo).length > 0) {
          estadoAntes = await lerEstadoCiclo(id, lojaId);
          if (!estadoAntes) throw new Error('Aparelho não encontrado nesta loja.');
          plano = planejarMudancaCiclo(estadoAntes, pedidoCiclo);
        }

        let data: any = null;

        if (Object.keys(payload).length > 0) {
          let lastError: any = null;

          for (let tentativa = 0; tentativa < 5; tentativa += 1) {
            // ativo/status/data_saida/motivo_saida foram retirados do payload acima.
            const response = await supabase
              .from('aparelhos') // estoque-guard: sem-ciclo
              .update(payload)
              .eq('id', id)
              .eq('loja_id', lojaId)
              .select()
              .single();

            if (!response.error) {
              data = response.data;
              lastError = null;
              break;
            }

            lastError = response.error;
            const errorText = `${response.error.message || ''} ${response.error.details || ''}`;
            const columnMatch = errorText.match(/'([^']+)' column/) || errorText.match(/'([^']+)'/);
            const invalidColumn = columnMatch?.[1];

            if (invalidColumn && Object.prototype.hasOwnProperty.call(payload, invalidColumn)) {
              delete payload[invalidColumn];
              continue;
            }

            break;
          }

          if (lastError || !data) {
            throw lastError || new Error('Falha ao atualizar aparelho');
          }
        }

        if (plano && estadoAntes) {
          const antes = estadoAntes;
          const r = await aplicarMudancaEstoque(supabase, {
            ids: [id],
            patch: plano.patch,
            tipo: plano.tipo,
            origem: plano.origem,
            lojaId,
            usuarioId: usuario.id,
            usuarioNome: usuario.nome,
            observacao: plano.observacao,
            // Se outra tela mudou a situação do aparelho no meio tempo, não sobrescreve.
            filtroElegivel: (estado) => mesmaSituacao(estado, antes),
          });
          if (r.afetados === 0) {
            throw new Error('O aparelho mudou de situação durante a edição. Recarregue a lista e tente de novo.');
          }
          if (!r.auditoriaRegistrada) {
            avisarAuditoriaIncompleta(
              'Alteração de estoque aplicada, mas a auditoria não foi gravada inteira. Avise o suporte.',
              r.erroAuditoria
            );
          }
        }

        if (!data || plano) {
          const { data: linha, error: erroReleitura } = await supabase
            .from('aparelhos')
            .select('*')
            .eq('id', id)
            .eq('loja_id', lojaId)
            .single();
          if (erroReleitura) throw erroReleitura;
          data = linha;
        }

        setAparelhos((prev) =>
          prev.map((a) => (a.id === id ? data : a))
        );
        return data;
      } catch (err: any) {
        setError(err?.message || "Erro ao atualizar aparelho");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [usuario?.lojaId, usuario?.id, usuario?.nome]
  );

  /**
   * Remove o aparelho do estoque. Não apaga a linha: vendas, garantias e OS
   * continuam apontando para ele, e a baixa fica registrada na auditoria.
   */
  const deletarAparelho = useCallback(async (id: string) => {
    if (!usuario?.lojaId) return false;
    const lojaId = usuario.lojaId;
    setLoading(true);
    setError(null);
    try {
      const atual = await lerEstadoCiclo(id, lojaId);
      if (!atual) {
        setError('Aparelho não encontrado');
        return false;
      }

      // Já saiu do estoque (vendido ou baixado): regravar como baixa apagaria
      // o registro da venda. Não há o que remover.
      if (!estaNoEstoque(atual)) return true;

      const patch: PatchCiclo = {
        ...patchSaida('baixado', 'baixa_manual'),
        observacoes: montarObservacaoBaixa(atual.observacoes as string | null | undefined),
      };

      const r = await aplicarMudancaEstoque(supabase, {
        ids: [id],
        patch,
        tipo: 'baixa',
        origem: 'manual',
        lojaId,
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        observacao: 'Aparelho removido do estoque manualmente.',
        filtroElegivel: (estado) => estaNoEstoque(estado),
      });

      if (r.afetados > 0) {
        if (!r.auditoriaRegistrada) {
          avisarAuditoriaIncompleta(
            'Baixa aplicada, mas a auditoria não foi gravada inteira. Avise o suporte.',
            r.erroAuditoria
          );
        }
        setAparelhos((prev) =>
          prev.map((aparelho) => (aparelho.id === id ? ({ ...aparelho, ...patch } as Aparelho) : aparelho))
        );
      }
      return true;
    } catch (err: any) {
      setError(err?.message ? `Erro ao remover aparelho do estoque: ${err.message}` : "Erro ao deletar aparelho");
      return false;
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId, usuario?.id, usuario?.nome]);

  useEffect(() => {
    fetchAparelhos();
  }, [fetchAparelhos]);

  return {
    aparelhos,
    loading,
    error,
    fetchAparelhos,
    buscarAparelhos,
    criarAparelho,
    atualizarAparelho,
    deletarAparelho,
  };
}
