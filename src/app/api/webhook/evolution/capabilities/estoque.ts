import {
  Capability,
  descreverAparelho,
  moeda,
  numero,
  texto,
} from './core';

/** Colunas seguras para exibir um aparelho no WhatsApp. */
const COLUNAS_APARELHO = 'id, marca, modelo, capacidade, cor, imei, codigo, preco, custo, condicao, status, ativo';

/**
 * Localiza UM aparelho a partir de identificadores livres (imei, código ou
 * modelo). Retorna a lista de candidatos para que a capacidade possa pedir
 * desambiguação em vez de alterar vários registros de uma vez.
 */
async function localizarAparelhos(
  supabase: Capability extends never ? never : Parameters<Capability['executar']>[0]['supabase'],
  lojaId: string,
  identificador: string,
  imei?: string
) {
  let query = supabase.from('aparelhos').select(COLUNAS_APARELHO).eq('loja_id', lojaId).eq('ativo', true);

  if (imei) {
    query = query.eq('imei', imei);
  } else if (/^\d{6,}$/.test(identificador)) {
    query = query.or(`imei.eq.${identificador},codigo.eq.${identificador}`);
  } else {
    query = query.ilike('modelo', `%${identificador}%`);
  }

  const { data } = await query.limit(10);
  return (data || []) as Record<string, unknown>[];
}

function listarCandidatos(itens: Record<string, unknown>[]): string {
  return itens
    .map((ap, i) => `${i + 1}. ${descreverAparelho(ap)} — ${moeda(Number(ap.preco || 0))}${ap.imei ? ` | IMEI ${ap.imei}` : ''}`)
    .join('\n');
}

export const capabilitiesEstoque: Capability[] = [
  {
    action: 'list_estoque',
    titulo: 'Consultar estoque',
    descricao: 'Listar ou buscar aparelhos disponíveis no estoque',
    recurso: 'estoque',
    papeis: ['owner', 'staff', 'motoboy'],
    escrita: false,
    atalho: '!estoque',
    parametros: [
      { nome: 'termo', descricao: 'modelo ou texto buscado (opcional)' },
    ],
    exemplos: ['"tem iphone 13?" -> {"termo": "iphone 13"}', '"me manda o estoque" -> {}'],
    async executar(ctx, params) {
      const termo = texto(params, 'termo', 'modelo', 'aparelho', 'busca');

      // A consulta natural multi-loja continua no route.ts; reaproveitamos.
      if (ctx.delegates?.listarEstoque) {
        const resposta = await ctx.delegates.listarEstoque(termo);
        if (resposta) return resposta;
      }

      let query = ctx.supabase
        .from('aparelhos')
        .select(COLUNAS_APARELHO)
        .eq('loja_id', ctx.lojaId)
        .eq('ativo', true);

      if (termo) query = query.ilike('modelo', `%${termo}%`);

      const { data } = await query.order('modelo').limit(30);
      const itens = (data || []) as Record<string, unknown>[];

      if (itens.length === 0) {
        return termo
          ? `📦 Nenhum aparelho encontrado para *${termo}*.`
          : '📦 Nenhum aparelho disponível no estoque no momento.';
      }

      const linhas = itens
        .map((ap) => `• ${descreverAparelho(ap)} — ${moeda(Number(ap.preco || 0))}`)
        .join('\n');
      return `📦 *Estoque${termo ? ` — ${termo}` : ''}* (${itens.length}):\n\n${linhas}`;
    },
  },

  {
    action: 'create_aparelho',
    titulo: 'Cadastrar aparelho',
    descricao: 'Cadastrar um novo aparelho no estoque',
    recurso: 'estoque',
    papeis: ['owner', 'staff'],
    escrita: true,
    atalho: '!cadastrar',
    parametros: [
      { nome: 'modelo', descricao: 'modelo do aparelho', obrigatorio: true },
      { nome: 'preco', descricao: 'preço de venda', obrigatorio: true },
      { nome: 'marca', descricao: 'marca (padrão Apple)' },
      { nome: 'capacidade', descricao: 'capacidade, ex 128gb' },
      { nome: 'cor', descricao: 'cor' },
      { nome: 'imei', descricao: 'IMEI' },
      { nome: 'custo', descricao: 'custo de aquisição' },
      { nome: 'condicao', descricao: 'novo | seminovo | usado' },
    ],
    exemplos: [
      '"cadastra um iphone 12 128gb preto por 1800" -> {"marca":"Apple","modelo":"iPhone 12","capacidade":"128gb","cor":"preto","preco":1800}',
    ],
    async executar(ctx, params) {
      const modelo = texto(params, 'modelo', 'aparelho');
      const preco = numero(params, 'preco', 'valor');

      if (!modelo) return '⚠️ Qual é o modelo do aparelho a cadastrar?';
      if (preco <= 0) return `⚠️ Qual é o preço de venda do *${modelo}*?`;

      const imei = texto(params, 'imei');

      if (imei) {
        const { data: existente } = await ctx.supabase
          .from('aparelhos')
          .select('id, modelo')
          .eq('loja_id', ctx.lojaId)
          .eq('imei', imei)
          .eq('ativo', true)
          .maybeSingle();
        if (existente) {
          return `⚠️ Já existe um aparelho ativo com o IMEI *${imei}* (${existente.modelo}). Cadastro cancelado para não duplicar.`;
        }
      }

      const registro = {
        loja_id: ctx.lojaId,
        lojaId: ctx.lojaId,
        marca: texto(params, 'marca') || 'Apple',
        modelo,
        capacidade: texto(params, 'capacidade') || null,
        cor: texto(params, 'cor') || null,
        preco,
        custo: numero(params, 'custo') || 0,
        imei: imei || null,
        condicao: texto(params, 'condicao') || 'seminovo',
        status: 'disponivel',
        ativo: true,
        dataCadastro: new Date().toISOString(),
        observacoes: `Cadastrado via WhatsApp por ${ctx.pushName}`,
      };

      const { error } = await ctx.supabase.from('aparelhos').insert(registro);
      if (error) throw error;

      return (
        `✅ *Aparelho cadastrado!*\n\n` +
        `📱 ${descreverAparelho(registro)}\n` +
        `💰 ${moeda(preco)}\n` +
        (imei ? `🔢 IMEI: ${imei}\n` : '')
      );
    },
  },

  {
    action: 'update_preco',
    titulo: 'Alterar preço',
    descricao: 'Alterar o preço de venda de um aparelho do estoque',
    recurso: 'estoque',
    papeis: ['owner', 'staff'],
    escrita: true,
    parametros: [
      { nome: 'aparelho', descricao: 'modelo, código ou IMEI do aparelho', obrigatorio: true },
      { nome: 'novoPreco', descricao: 'novo preço de venda', obrigatorio: true },
    ],
    exemplos: ['"muda o preço do 13 pro pra 3000" -> {"aparelho":"13 pro","novoPreco":3000}'],
    async executar(ctx, params) {
      const identificador = texto(params, 'aparelho', 'modelo', 'imei', 'codigo');
      const novoPreco = numero(params, 'novoPreco', 'preco', 'valor');

      if (!identificador) return '⚠️ Qual aparelho (modelo, código ou IMEI) deve ter o preço alterado?';
      if (novoPreco <= 0) return `⚠️ Para qual valor devo alterar o preço de *${identificador}*?`;

      const candidatos = await localizarAparelhos(ctx.supabase, ctx.lojaId, identificador, texto(params, 'imei'));

      if (candidatos.length === 0) {
        return `⚠️ Não encontrei nenhum aparelho ativo para *${identificador}*.`;
      }

      // Alterar preço em massa por um "ilike" solto é destrutivo: pede escolha.
      if (candidatos.length > 1) {
        return (
          `❓ Encontrei ${candidatos.length} aparelhos para *${identificador}*:\n\n` +
          `${listarCandidatos(candidatos)}\n\n` +
          `Me diga o IMEI ou o código do que você quer alterar.`
        );
      }

      const alvo = candidatos[0];
      const precoAnterior = Number(alvo.preco || 0);

      const { error } = await ctx.supabase
        .from('aparelhos')
        .update({ preco: novoPreco })
        .eq('id', alvo.id as string)
        .eq('loja_id', ctx.lojaId);
      if (error) throw error;

      return (
        `✅ *Preço atualizado!*\n\n` +
        `📱 ${descreverAparelho(alvo)}\n` +
        `De ${moeda(precoAnterior)} para *${moeda(novoPreco)}*`
      );
    },
  },

  {
    action: 'update_aparelho',
    titulo: 'Editar aparelho',
    descricao: 'Editar dados de um aparelho do estoque (cor, capacidade, condição, custo, IMEI)',
    recurso: 'estoque',
    papeis: ['owner', 'staff'],
    escrita: true,
    parametros: [
      { nome: 'aparelho', descricao: 'modelo, código ou IMEI do aparelho', obrigatorio: true },
      { nome: 'cor', descricao: 'nova cor' },
      { nome: 'capacidade', descricao: 'nova capacidade' },
      { nome: 'condicao', descricao: 'novo estado: novo | seminovo | usado' },
      { nome: 'custo', descricao: 'novo custo de aquisição' },
      { nome: 'novoImei', descricao: 'IMEI a gravar' },
    ],
    exemplos: ['"o 13 pro é seminovo, corrige aí" -> {"aparelho":"13 pro","condicao":"seminovo"}'],
    async executar(ctx, params) {
      const identificador = texto(params, 'aparelho', 'modelo', 'imei', 'codigo');
      if (!identificador) return '⚠️ Qual aparelho devo editar?';

      const alteracoes: Record<string, unknown> = {};
      const cor = texto(params, 'cor');
      const capacidade = texto(params, 'capacidade');
      const condicao = texto(params, 'condicao');
      const novoImei = texto(params, 'novoImei');
      const custo = numero(params, 'custo');

      if (cor) alteracoes.cor = cor;
      if (capacidade) alteracoes.capacidade = capacidade;
      if (condicao) alteracoes.condicao = condicao;
      if (novoImei) alteracoes.imei = novoImei;
      if (custo > 0) alteracoes.custo = custo;

      if (Object.keys(alteracoes).length === 0) {
        return '⚠️ O que devo alterar nesse aparelho? (cor, capacidade, condição, custo ou IMEI)';
      }

      const candidatos = await localizarAparelhos(ctx.supabase, ctx.lojaId, identificador, texto(params, 'imei'));
      if (candidatos.length === 0) return `⚠️ Não encontrei nenhum aparelho ativo para *${identificador}*.`;
      if (candidatos.length > 1) {
        return (
          `❓ Encontrei ${candidatos.length} aparelhos para *${identificador}*:\n\n` +
          `${listarCandidatos(candidatos)}\n\nMe diga o IMEI ou o código do que devo editar.`
        );
      }

      const alvo = candidatos[0];
      const { error } = await ctx.supabase
        .from('aparelhos')
        .update(alteracoes)
        .eq('id', alvo.id as string)
        .eq('loja_id', ctx.lojaId);
      if (error) throw error;

      const resumo = Object.entries(alteracoes)
        .map(([campo, valor]) => `• ${campo}: ${valor}`)
        .join('\n');
      return `✅ *Aparelho atualizado!*\n\n📱 ${descreverAparelho(alvo)}\n\n${resumo}`;
    },
  },

  {
    action: 'remover_aparelho',
    titulo: 'Remover do estoque',
    descricao: 'Desativar/dar baixa em um aparelho sem registrar venda (perda, devolução, erro de cadastro)',
    recurso: 'estoque',
    papeis: ['owner'],
    escrita: true,
    parametros: [
      { nome: 'aparelho', descricao: 'modelo, código ou IMEI do aparelho', obrigatorio: true },
      { nome: 'motivo', descricao: 'motivo da baixa' },
    ],
    exemplos: ['"tira o iphone 11 de imei 123 do estoque, foi devolvido" -> {"aparelho":"123","motivo":"devolvido"}'],
    async executar(ctx, params) {
      const identificador = texto(params, 'aparelho', 'modelo', 'imei', 'codigo');
      if (!identificador) return '⚠️ Qual aparelho devo remover do estoque?';

      const candidatos = await localizarAparelhos(ctx.supabase, ctx.lojaId, identificador, texto(params, 'imei'));
      if (candidatos.length === 0) return `⚠️ Não encontrei nenhum aparelho ativo para *${identificador}*.`;
      if (candidatos.length > 1) {
        return (
          `❓ Encontrei ${candidatos.length} aparelhos para *${identificador}*:\n\n` +
          `${listarCandidatos(candidatos)}\n\nMe diga o IMEI ou o código do que devo remover.`
        );
      }

      const alvo = candidatos[0];
      const motivo = texto(params, 'motivo') || 'baixa manual';

      const { error } = await ctx.supabase
        .from('aparelhos')
        .update({
          ativo: false,
          observacoes: `Baixa via WhatsApp por ${ctx.pushName}: ${motivo}`,
        })
        .eq('id', alvo.id as string)
        .eq('loja_id', ctx.lojaId);
      if (error) throw error;

      return `✅ *${descreverAparelho(alvo)}* removido do estoque.\n📝 Motivo: ${motivo}`;
    },
  },
];
