import { Capability, dataBr, moeda, numero, texto } from './core';

const STATUS_OS = ['aguardando_pecas', 'em_andamento', 'concluido', 'aguardando_retirada', 'entregue'];

function normalizarStatusOS(valor: string): string {
  const limpo = valor.toLowerCase().replace(/[\s-]/g, '_');
  if (STATUS_OS.includes(limpo)) return limpo;
  if (limpo.includes('pronto') || limpo.includes('conclu')) return 'concluido';
  if (limpo.includes('andamento') || limpo.includes('fazendo')) return 'em_andamento';
  if (limpo.includes('retirada')) return 'aguardando_retirada';
  if (limpo.includes('entreg')) return 'entregue';
  return 'aguardando_pecas';
}

/**
 * Interpreta datas relativas comuns no WhatsApp ("hoje", "amanhã", "12/05").
 * Retorna null quando não reconhece, para a capacidade poder pedir de novo.
 */
function interpretarData(valor: string, hora?: string): string | null {
  if (!valor) return null;
  const limpo = valor.trim().toLowerCase();
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  let alvo: Date | null = null;
  if (limpo.includes('hoje')) alvo = base;
  else if (limpo.includes('amanh')) alvo = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  else if (limpo.includes('depois de amanh')) alvo = new Date(base.getTime() + 48 * 60 * 60 * 1000);
  else {
    const br = limpo.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (br) {
      const ano = br[3] ? Number(br[3].length === 2 ? `20${br[3]}` : br[3]) : base.getFullYear();
      alvo = new Date(ano, Number(br[2]) - 1, Number(br[1]));
    } else {
      const iso = new Date(limpo);
      if (!Number.isNaN(iso.getTime())) alvo = iso;
    }
  }

  if (!alvo || Number.isNaN(alvo.getTime())) return null;

  const h = (hora || '').match(/(\d{1,2})(?:[:h](\d{2}))?/);
  if (h) alvo.setHours(Number(h[1]), Number(h[2] || 0), 0, 0);

  return alvo.toISOString();
}

export const capabilitiesServicos: Capability[] = [
  // ── Ordens de Serviço ───────────────────────────────────────────────────
  {
    action: 'create_os',
    titulo: 'Abrir ordem de serviço',
    descricao: 'Abrir uma nova OS de conserto',
    recurso: 'os',
    papeis: ['owner', 'staff'],
    escrita: true,
    parametros: [
      { nome: 'clienteNome', descricao: 'nome do cliente', obrigatorio: true },
      { nome: 'defeito', descricao: 'defeito relatado', obrigatorio: true },
      { nome: 'aparelhoModelo', descricao: 'aparelho' },
      { nome: 'tecnico', descricao: 'técnico responsável' },
      { nome: 'maoDeObra', descricao: 'valor da mão de obra' },
    ],
    exemplos: ['"abre OS pro João, tela quebrada" -> {"clienteNome":"João","defeito":"tela quebrada"}'],
    async executar(ctx, params) {
      const cliente = texto(params, 'clienteNome', 'cliente', 'nome');
      const defeito = texto(params, 'defeito', 'problema');
      if (!cliente) return '⚠️ Para qual cliente devo abrir a OS?';
      if (!defeito) return `⚠️ Qual o defeito relatado pelo ${cliente}?`;

      const { data, error } = await ctx.supabase
        .from('ordens_servico')
        .insert({
          loja_id: ctx.lojaId,
          clienteNome: cliente,
          aparelhoModelo: texto(params, 'aparelhoModelo', 'aparelho', 'modelo') || 'Não informado',
          defeito,
          status: 'aguardando_pecas',
          tecnico: texto(params, 'tecnico', 'tecnicoNome') || null,
          maoDeObra: numero(params, 'maoDeObra', 'valor') || 0,
          observacoes: `OS aberta via WhatsApp por ${ctx.pushName}`,
          dataEntrada: new Date().toISOString(),
          ativo: true,
        })
        .select()
        .single();
      if (error) throw error;

      const numeroOS = (data as Record<string, unknown> | null)?.numeroOS;
      return (
        `✅ *OS aberta${numeroOS ? ` #${numeroOS}` : ''}!*\n\n` +
        `👤 ${cliente}\n🔧 ${defeito}\n📌 Status: aguardando peças`
      );
    },
  },

  {
    action: 'list_os',
    titulo: 'Consultar ordens de serviço',
    descricao: 'Listar OS por cliente, número ou status',
    recurso: 'os',
    papeis: ['owner', 'staff'],
    escrita: false,
    parametros: [
      { nome: 'clienteNome', descricao: 'nome do cliente' },
      { nome: 'status', descricao: 'status da OS' },
      { nome: 'numeroOS', descricao: 'número da OS' },
    ],
    exemplos: ['"quais OS abertas?" -> {"status":"em_andamento"}'],
    async executar(ctx, params) {
      const cliente = texto(params, 'clienteNome', 'cliente');
      const status = texto(params, 'status');
      const numeroOS = texto(params, 'numeroOS', 'numero');

      let query = ctx.supabase
        .from('ordens_servico')
        .select('id, numeroOS, clienteNome, aparelhoModelo, defeito, status, dataEntrada')
        .eq('loja_id', ctx.lojaId)
        .eq('ativo', true);

      if (cliente) query = query.ilike('clienteNome', `%${cliente}%`);
      if (status) query = query.eq('status', normalizarStatusOS(status));
      if (numeroOS && /^\d+$/.test(numeroOS)) query = query.eq('numeroOS', Number(numeroOS));

      const { data } = await query.order('dataEntrada', { ascending: false }).limit(15);
      const lista = (data || []) as Record<string, unknown>[];

      if (lista.length === 0) return '🔧 Nenhuma OS encontrada com esses filtros.';

      const linhas = lista
        .map(
          (os) =>
            `• OS #${os.numeroOS || '?'} — ${os.clienteNome}\n  ${os.aparelhoModelo || '-'} | ${os.defeito || '-'}\n  📌 ${os.status} · ${dataBr(os.dataEntrada as string)}`
        )
        .join('\n\n');
      return `🔧 *Ordens de Serviço (${lista.length}):*\n\n${linhas}`;
    },
  },

  {
    action: 'update_os',
    titulo: 'Atualizar status da OS',
    descricao: 'Mudar o status de uma ordem de serviço',
    recurso: 'os',
    papeis: ['owner', 'staff'],
    escrita: true,
    parametros: [
      { nome: 'novoStatus', descricao: 'aguardando_pecas | em_andamento | concluido | aguardando_retirada | entregue', obrigatorio: true },
      { nome: 'numeroOS', descricao: 'número da OS' },
      { nome: 'clienteNome', descricao: 'nome do cliente' },
    ],
    exemplos: ['"OS 42 entregue" -> {"numeroOS":"42","novoStatus":"entregue"}'],
    async executar(ctx, params) {
      const novoStatus = texto(params, 'novoStatus', 'status');
      const numeroOS = texto(params, 'numeroOS', 'numero');
      const cliente = texto(params, 'clienteNome', 'cliente');

      if (!novoStatus) return '⚠️ Qual o novo status da OS? (aguardando peças, em andamento, concluído, entregue)';
      if (!numeroOS && !cliente) return '⚠️ Qual OS devo atualizar? Me diga o número ou o cliente.';

      let busca = ctx.supabase
        .from('ordens_servico')
        .select('id, numeroOS, clienteNome, status')
        .eq('loja_id', ctx.lojaId)
        .eq('ativo', true);
      if (numeroOS && /^\d+$/.test(numeroOS)) busca = busca.eq('numeroOS', Number(numeroOS));
      else busca = busca.ilike('clienteNome', `%${cliente}%`);

      const { data } = await busca.order('dataEntrada', { ascending: false }).limit(5);
      const encontradas = (data || []) as Record<string, unknown>[];

      if (encontradas.length === 0) return `⚠️ Não encontrei OS para *${numeroOS || cliente}*.`;
      if (encontradas.length > 1) {
        const lista = encontradas.map((os) => `• OS #${os.numeroOS} — ${os.clienteNome} (${os.status})`).join('\n');
        return `❓ Encontrei ${encontradas.length} OS:\n\n${lista}\n\nMe diga o número da OS.`;
      }

      const alvo = encontradas[0];
      const status = normalizarStatusOS(novoStatus);

      const { error } = await ctx.supabase
        .from('ordens_servico')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', alvo.id as string)
        .eq('loja_id', ctx.lojaId);
      if (error) throw error;

      return `✅ *OS #${alvo.numeroOS}* (${alvo.clienteNome})\n📌 ${alvo.status} → *${status}*`;
    },
  },

  // ── Peças ───────────────────────────────────────────────────────────────
  {
    action: 'list_pecas',
    titulo: 'Consultar peças',
    descricao: 'Consultar o estoque de peças',
    recurso: 'os',
    papeis: ['owner', 'staff'],
    escrita: false,
    parametros: [{ nome: 'nome', descricao: 'nome da peça buscada' }],
    exemplos: ['"tem tela de iphone 11?" -> {"nome":"tela iphone 11"}'],
    async executar(ctx, params) {
      const nome = texto(params, 'nome', 'peca', 'termo');

      let query = ctx.supabase.from('pecas').select('*').eq('loja_id', ctx.lojaId);
      if (nome) query = query.ilike('nome', `%${nome}%`);

      const { data } = await query.order('nome').limit(20);
      const pecas = (data || []) as Record<string, unknown>[];

      if (pecas.length === 0) return `🔩 Nenhuma peça encontrada${nome ? ` para *${nome}*` : ''}.`;

      // A tabela varia entre instalações; lê o campo que existir.
      const linhas = pecas
        .map((p) => {
          const qtd = p.estoque ?? p.quantidade ?? 0;
          const preco = Number(p.vendaPeca ?? p.preco ?? 0);
          return `• ${p.nome} — ${qtd} un.${preco > 0 ? ` · ${moeda(preco)}` : ''}`;
        })
        .join('\n');
      return `🔩 *Peças (${pecas.length}):*\n\n${linhas}`;
    },
  },

  {
    action: 'create_peca',
    titulo: 'Cadastrar peça',
    descricao: 'Cadastrar uma nova peça no estoque de peças',
    recurso: 'os',
    papeis: ['owner', 'staff'],
    escrita: true,
    parametros: [
      { nome: 'nome', descricao: 'nome da peça', obrigatorio: true },
      { nome: 'quantidade', descricao: 'quantidade em estoque' },
      { nome: 'custo', descricao: 'custo unitário' },
      { nome: 'preco', descricao: 'preço de venda' },
    ],
    exemplos: ['"cadastra 5 telas de iphone 11, custo 120 venda 250" -> {"nome":"Tela iPhone 11","quantidade":5,"custo":120,"preco":250}'],
    async executar(ctx, params) {
      const nome = texto(params, 'nome', 'peca');
      if (!nome) return '⚠️ Qual o nome da peça a cadastrar?';

      const quantidade = Math.max(0, Math.trunc(numero(params, 'quantidade', 'qtd', 'estoque')));
      const custo = numero(params, 'custo', 'custoPeca');
      const preco = numero(params, 'preco', 'vendaPeca', 'valor');

      const { error } = await ctx.supabase.from('pecas').insert({
        loja_id: ctx.lojaId,
        nome,
        codigoUnico: `WPP-${Date.now().toString(36).toUpperCase()}`,
        custoPeca: custo,
        vendaPeca: preco,
        estoque: quantidade,
        estoqueMinimo: 0,
        estoqueMaximo: Math.max(quantidade, 10),
        descricao: `Cadastrada via WhatsApp por ${ctx.pushName}`,
        dataCadastro: new Date().toISOString(),
        ativo: true,
      });
      if (error) throw error;

      return (
        `✅ *Peça cadastrada!*\n\n🔩 ${nome}\n📦 ${quantidade} un.` +
        (preco > 0 ? `\n💰 ${moeda(preco)}` : '')
      );
    },
  },

  {
    action: 'update_estoque_peca',
    titulo: 'Ajustar estoque de peça',
    descricao: 'Somar ou definir a quantidade em estoque de uma peça',
    recurso: 'os',
    papeis: ['owner', 'staff'],
    escrita: true,
    parametros: [
      { nome: 'nome', descricao: 'nome da peça', obrigatorio: true },
      { nome: 'quantidade', descricao: 'quantidade a somar (use negativo para baixar)', obrigatorio: true },
      { nome: 'definir', descricao: 'true para substituir o total em vez de somar' },
    ],
    exemplos: ['"chegaram mais 10 telas de iphone 11" -> {"nome":"tela iphone 11","quantidade":10}'],
    async executar(ctx, params) {
      const nome = texto(params, 'nome', 'peca');
      const quantidade = Math.trunc(numero(params, 'quantidade', 'qtd'));
      if (!nome) return '⚠️ Qual peça devo ajustar?';
      if (quantidade === 0) return `⚠️ Quantas unidades de *${nome}* devo lançar?`;

      const { data } = await ctx.supabase
        .from('pecas')
        .select('*')
        .eq('loja_id', ctx.lojaId)
        .ilike('nome', `%${nome}%`)
        .limit(5);
      const pecas = (data || []) as Record<string, unknown>[];

      if (pecas.length === 0) return `⚠️ Não encontrei a peça *${nome}*.`;
      if (pecas.length > 1) {
        return `❓ Encontrei ${pecas.length} peças:\n\n${pecas.map((p) => `• ${p.nome}`).join('\n')}\n\nMe diga o nome exato.`;
      }

      const peca = pecas[0];
      const campoQtd = peca.estoque !== undefined ? 'estoque' : 'quantidade';
      const atual = Number(peca[campoQtd] || 0);
      const definir = String(params.definir || '').toLowerCase() === 'true';
      const novo = Math.max(0, definir ? quantidade : atual + quantidade);

      const { error } = await ctx.supabase
        .from('pecas')
        .update({ [campoQtd]: novo })
        .eq('id', peca.id as string)
        .eq('loja_id', ctx.lojaId);
      if (error) throw error;

      return `✅ *${peca.nome}*\n📦 Estoque: ${atual} → *${novo}* un.`;
    },
  },

  // ── Técnicos ────────────────────────────────────────────────────────────
  {
    action: 'list_tecnicos',
    titulo: 'Listar técnicos',
    descricao: 'Listar técnicos e vendedores cadastrados',
    recurso: 'os',
    papeis: ['owner', 'staff'],
    escrita: false,
    parametros: [{ nome: 'nome', descricao: 'filtrar por nome' }],
    exemplos: ['"quais técnicos temos?" -> {}'],
    async executar(ctx, params) {
      const nome = texto(params, 'nome');
      let query = ctx.supabase.from('tecnicos').select('*').eq('loja_id', ctx.lojaId);
      if (nome) query = query.ilike('nome', `%${nome}%`);

      const { data } = await query.order('nome').limit(30);
      const tecnicos = (data || []) as Record<string, unknown>[];

      if (tecnicos.length === 0) return '👨‍🔧 Nenhum técnico cadastrado ainda.';

      const linhas = tecnicos
        .map((t) => `• ${t.nome}${t.especialidade ? ` — ${t.especialidade}` : ''}${t.telefone ? ` · ${t.telefone}` : ''}`)
        .join('\n');
      return `👨‍🔧 *Equipe (${tecnicos.length}):*\n\n${linhas}`;
    },
  },

  {
    action: 'create_tecnico',
    titulo: 'Cadastrar técnico',
    descricao: 'Cadastrar um técnico ou vendedor na equipe',
    recurso: 'os',
    papeis: ['owner'],
    escrita: true,
    parametros: [
      { nome: 'nome', descricao: 'nome do técnico', obrigatorio: true },
      { nome: 'telefone', descricao: 'telefone' },
      { nome: 'especialidade', descricao: 'especialidade' },
    ],
    exemplos: ['"cadastra o técnico Pedro, tel 31999990000" -> {"nome":"Pedro","telefone":"31999990000"}'],
    async executar(ctx, params) {
      const nome = texto(params, 'nome', 'tecnico');
      if (!nome) return '⚠️ Qual o nome do técnico a cadastrar?';

      const { error } = await ctx.supabase.from('tecnicos').insert({
        loja_id: ctx.lojaId,
        nome,
        telefone: texto(params, 'telefone') || '',
        especialidade: texto(params, 'especialidade') || null,
        dataCadastro: new Date().toISOString(),
        ativo: true,
      });
      if (error) throw error;

      return `✅ *Técnico cadastrado!*\n\n👨‍🔧 ${nome}`;
    },
  },

  // ── Agendamentos ────────────────────────────────────────────────────────
  {
    action: 'create_agendamento',
    titulo: 'Criar agendamento',
    descricao: 'Agendar um atendimento ou serviço',
    recurso: 'os',
    papeis: ['owner', 'staff'],
    escrita: true,
    parametros: [
      { nome: 'clienteNome', descricao: 'nome do cliente', obrigatorio: true },
      { nome: 'data', descricao: 'data (hoje, amanhã ou dd/mm)', obrigatorio: true },
      { nome: 'hora', descricao: 'horário' },
      { nome: 'tipoServico', descricao: 'serviço a realizar' },
    ],
    exemplos: ['"agenda o Lucas amanhã 14h pra troca de tela" -> {"clienteNome":"Lucas","data":"amanhã","hora":"14:00","tipoServico":"troca de tela"}'],
    async executar(ctx, params) {
      const cliente = texto(params, 'clienteNome', 'cliente', 'nome');
      const dataBruta = texto(params, 'data');
      if (!cliente) return '⚠️ Para qual cliente é o agendamento?';
      if (!dataBruta) return `⚠️ Para qual data devo agendar o ${cliente}?`;

      const dataIso = interpretarData(dataBruta, texto(params, 'hora'));
      if (!dataIso) return `⚠️ Não entendi a data "${dataBruta}". Tente "amanhã", "hoje" ou "12/05".`;

      const { error } = await ctx.supabase.from('agendamentos').insert({
        loja_id: ctx.lojaId,
        clienteNome: cliente,
        telefone: texto(params, 'telefone') || '',
        data: dataIso,
        descricao: texto(params, 'tipoServico', 'servico', 'descricao') || 'Atendimento',
        status: 'agendado',
        observacoes: `Agendado via WhatsApp por ${ctx.pushName}`,
        dataCadastro: new Date().toISOString(),
        ativo: true,
      });
      if (error) throw error;

      const quando = new Date(dataIso);
      return (
        `✅ *Agendamento criado!*\n\n` +
        `👤 ${cliente}\n📅 ${quando.toLocaleDateString('pt-BR')} às ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      );
    },
  },

  {
    action: 'list_agendamentos',
    titulo: 'Consultar agenda',
    descricao: 'Consultar os agendamentos de um dia ou cliente',
    recurso: 'os',
    papeis: ['owner', 'staff'],
    escrita: false,
    parametros: [
      { nome: 'data', descricao: 'hoje, amanhã ou dd/mm' },
      { nome: 'clienteNome', descricao: 'nome do cliente' },
    ],
    exemplos: ['"quais agendamentos de hoje?" -> {"data":"hoje"}'],
    async executar(ctx, params) {
      const cliente = texto(params, 'clienteNome', 'cliente');
      const dataBruta = texto(params, 'data');

      let query = ctx.supabase
        .from('agendamentos')
        .select('id, clienteNome, data, descricao, status')
        .eq('loja_id', ctx.lojaId)
        .eq('ativo', true);

      if (cliente) {
        query = query.ilike('clienteNome', `%${cliente}%`);
      } else {
        const iso = interpretarData(dataBruta || 'hoje');
        if (iso) {
          const inicio = new Date(iso);
          inicio.setHours(0, 0, 0, 0);
          const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
          query = query.gte('data', inicio.toISOString()).lt('data', fim.toISOString());
        }
      }

      const { data } = await query.order('data').limit(20);
      const lista = (data || []) as Record<string, unknown>[];

      if (lista.length === 0) return '📅 Nenhum agendamento encontrado.';

      const linhas = lista
        .map((a) => {
          const d = new Date(a.data as string);
          const hora = Number.isNaN(d.getTime()) ? '' : ` ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
          return `• ${dataBr(a.data as string)}${hora} — ${a.clienteNome} · ${a.descricao || 'Atendimento'}`;
        })
        .join('\n');
      return `📅 *Agendamentos (${lista.length}):*\n\n${linhas}`;
    },
  },

  // ── Garantias ───────────────────────────────────────────────────────────
  {
    action: 'list_garantias',
    titulo: 'Consultar garantias',
    descricao: 'Consultar garantias por cliente ou aparelho',
    recurso: 'os',
    papeis: ['owner', 'staff'],
    escrita: false,
    parametros: [
      { nome: 'clienteNome', descricao: 'nome do cliente' },
      { nome: 'aparelhoModelo', descricao: 'modelo do aparelho' },
    ],
    exemplos: ['"a garantia do João tá ativa?" -> {"clienteNome":"João"}'],
    async executar(ctx, params) {
      const cliente = texto(params, 'clienteNome', 'cliente');
      const modelo = texto(params, 'aparelhoModelo', 'aparelho', 'modelo');

      let query = ctx.supabase.from('garantias').select('*').eq('loja_id', ctx.lojaId).eq('ativo', true);
      if (cliente) query = query.ilike('clienteNome', `%${cliente}%`);
      if (modelo) query = query.ilike('aparelhoDescricao', `%${modelo}%`);

      const { data } = await query.limit(15);
      const lista = (data || []) as Record<string, unknown>[];

      if (lista.length === 0) return '🛡️ Nenhuma garantia encontrada com esses filtros.';

      const linhas = lista
        .map((g) => {
          const inicio = (g.dataInicio || g.data_inicio) as string | undefined;
          const dias = Number(g.diasGarantia || g.dias_garantia || 0);
          let restante = '';
          if (inicio && dias > 0) {
            const fim = new Date(new Date(inicio).getTime() + dias * 24 * 60 * 60 * 1000);
            const faltam = Math.ceil((fim.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
            restante = faltam > 0 ? ` · ⏳ ${faltam} dias restantes` : ' · ❌ expirada';
          }
          const aparelho = g.aparelhoDescricao || g.aparelhoModelo || '-';
          return `• ${g.clienteNome} — ${aparelho}\n  Início ${dataBr(inicio)}${restante}`;
        })
        .join('\n\n');
      return `🛡️ *Garantias (${lista.length}):*\n\n${linhas}`;
    },
  },
];
