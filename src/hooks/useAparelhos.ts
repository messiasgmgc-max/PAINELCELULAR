import { useState, useCallback, useEffect } from "react";
import { Aparelho } from "@/lib/db/types";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./useAuth";

interface UseAparelhosReturn {
  aparelhos: Aparelho[];
  loading: boolean;
  error: string | null;
  fetchAparelhos: () => Promise<void>;
  buscarAparelhos: (termo: string) => Promise<void>;
  criarAparelho: (dados: Omit<Aparelho, "id" | "dataCadastro">) => Promise<Aparelho | null>;
  atualizarAparelho: (id: string, dados: Partial<Aparelho>) => Promise<Aparelho | null>;
  deletarAparelho: (id: string) => Promise<boolean>;
}

export function useAparelhos(): UseAparelhosReturn {
  const { usuario } = useAuth();
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montarObservacaoBaixa = (observacoesAtuais?: string) => {
    const baixa = `BAIXA_ESTOQUE:${new Date().toISOString()}:Aparelho removido do estoque por possuir histórico vinculado.`;
    return observacoesAtuais ? `${observacoesAtuais}\n${baixa}` : baixa;
  };

  const fetchAparelhos = useCallback(async () => {
    if (!usuario?.lojaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('aparelhos')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .order('dataCadastro', { ascending: false });
      if (error) throw error;
      setAparelhos(data || []);
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
    async (dados: Omit<Aparelho, "id" | "dataCadastro">) => {
      if (!usuario?.lojaId) return null;
      setLoading(true);
      setError(null);
      try {
        const rawPayload: Record<string, any> = { ...dados, loja_id: usuario.lojaId };

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
          const response = await supabase
            .from('aparelhos')
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
          const columnMatch = errorText.match(/'([^']+)'/);
          const invalidColumn = response.error.code === 'PGRST204' ? columnMatch?.[1] : null;

          if (invalidColumn && Object.prototype.hasOwnProperty.call(payload, invalidColumn)) {
            delete payload[invalidColumn];
            continue;
          }

          break;
        }

        if (lastError || !data) {
          throw lastError || new Error('Falha ao inserir aparelho');
        }

        const aparelhoCriado = { ...data, custo: data?.custo ?? (dados as any)?.custo ?? 0 } as Aparelho;
        setAparelhos((prev) => [...prev, aparelhoCriado]);
        return aparelhoCriado;
      } catch (err: any) {
        setError(err?.message || "Erro ao criar aparelho");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [usuario?.lojaId]
  );

  const atualizarAparelho = useCallback(
    async (id: string, dados: Partial<Aparelho>) => {
      if (!usuario?.lojaId) return null;
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('aparelhos')
          .update(dados)
          .eq('id', id)
          .eq('loja_id', usuario.lojaId)
          .select()
          .single();
        if (error) throw error;
        setAparelhos((prev) =>
          prev.map((a) => (a.id === id ? data : a))
        );
        return data;
      } catch (err) {
        setError("Erro ao atualizar aparelho");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [usuario?.lojaId]
  );

  const deletarAparelho = useCallback(async (id: string) => {
    if (!usuario?.lojaId) return false;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('aparelhos')
        .delete()
        .eq('id', id)
        .eq('loja_id', usuario.lojaId);
      if (error) throw error;
      setAparelhos((prev) => prev.filter((a) => a.id !== id));
      return true;
    } catch (err: any) {
      const isForeignKeyViolation = err?.code === '23503' || String(err?.message || '').includes('foreign key constraint');

      if (isForeignKeyViolation) {
        const aparelhoAtual = aparelhos.find((aparelho) => aparelho.id === id);
        const { data, error: updateError } = await supabase
          .from('aparelhos')
          .update({
            ativo: false,
            observacoes: montarObservacaoBaixa(aparelhoAtual?.observacoes),
          })
          .eq('id', id)
          .eq('loja_id', usuario.lojaId)
          .select()
          .single();

        if (updateError) {
          setError('Erro ao dar baixa no aparelho vinculado a histórico');
          return false;
        }

        setAparelhos((prev) => prev.map((aparelho) => (aparelho.id === id ? data : aparelho)));
        return true;
      }

      setError("Erro ao deletar aparelho");
      return false;
    } finally {
      setLoading(false);
    }
  }, [aparelhos, usuario?.lojaId]);

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
