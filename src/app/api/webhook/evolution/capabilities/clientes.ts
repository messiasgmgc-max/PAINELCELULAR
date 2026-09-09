import { Capability, dataBr, moeda, numero, texto } from './core';

export const capabilitiesClientes: Capability[] = [
  {
    action: 'create_cliente',
    titulo: 'Cadastrar cliente',
    descricao: 'Cadastrar um novo cliente',
    recurso: 'vendas',
    papeis: ['owner', 'staff'],
    escrita: true,
    parametros: [
      { nome: 'nome', descricao: 'nome do cliente', obrigatorio: true },
      { nome: 'telefone', descricao: 'telefone' },
      { nome: 'email', descricao: 'e-mail' },
      { nome: 'cpf', descricao: 'CPF' },
    ],
    exemplos: ['"cadastra cliente Maria da Silva tel 31999990000" -> {"nome":"Maria da Silva","telefone":"31999990000"}'],
    async executar(ctx, params) {
      const nome = texto(params, 'nome', 'cliente', 'clienteNome');
      if (!nome) return '⚠️ Qual o nome do cliente a cadastrar?';

      const telefone = texto(params, 'telefone');

      // Evita duplicar: o mesmo cliente costuma ser cadastrado várias vezes.
      const { data: existente } = await ctx.supabase
        .from('clientes')
        .select('id, nome, telefone')
        .eq('loja_id', ctx.lojaId)
        .ilike('nome', nome)
        .maybeSingle();

      if (existente) {
        return `ℹ️ *${existente.nome}* já está cadastrado${existente.telefone ? ` (${existente.telefone})` : ''}.`;
      }

      const { error } = await ctx.supabase.from('clientes').insert({
        loja_id: ctx.lojaId,
        nome,
        telefone,
        email: texto(params, 'email') || '',
        cpf: texto(params, 'cpf') || '',
        dataCadastro: new Date().toISOString(),
        ativo: true,
      });
      if (error) throw error;

      return `✅ *Cliente cadastrado!*\n\n👤 ${nome}${telefone ? `\n📞 ${telefone}` : ''}`;
    },
  },

  {
    action: 'list_clientes',
    titulo: 'Buscar clientes',
    descricao: 'Buscar clientes cadastrados por nome ou telefone',
    recurso: 'vendas',
    papeis: ['owner', 'staff'],
    escrita: false,
    parametros: [
      { nome: 'nome', descricao: 'nome buscado' },
      { nome: 'telefone', descricao: 'telefone buscado' },
    ],
    exemplos: ['"busca cliente Ana" -> {"nome":"Ana"}'],
    async executar(ctx, params) {
      const nome = texto(params, 'nome', 'cliente', 'termo');
      const telefone = texto(params, 'telefone');

      let query = ctx.supabase
        .from('clientes')
        .select('id, nome, telefone, email, cpf')
        .eq('loja_id', ctx.lojaId);

      if (nome) query = query.ilike('nome', `%${nome}%`);
      if (telefone) query = query.ilike('telefone', `%${telefone}%`);

      const { data } = await query.order('nome').limit(15);
      const lista = (data || []) as Record<string, unknown>[];

      if (lista.length === 0) return `👥 Nenhum cliente encontrado${nome ? ` para *${nome}*` : ''}.`;

      const linhas = lista
        .map((c) => `• ${c.nome}${c.telefone ? ` — 📞 ${c.telefone}` : ''}${c.cpf ? ` · CPF ${c.cpf}` : ''}`)
        .join('\n');
      return `👥 *Clientes (${lista.length}):*\n\n${linhas}`;
    },
  },

  {
    action: 'list_compradores',
    titulo: 'Compradores frequentes',
    descricao: 'Listar os compradores/lojistas que mais compram',
    recurso: 'vendas',
    papeis: ['owner'],
    escrita: false,
    parametros: [{ nome: 'nome', descricao: 'filtrar por nome' }],
    exemplos: ['"quem mais compra comigo?" -> {}'],
    async executar(ctx, params) {
      const nome = texto(params, 'nome');

      let query = ctx.supabase
        .from('compradores_frequentes')
        .select('nome, tipo, telefone, total_compras, ultimo_compra')
        .eq('loja_id', ctx.lojaId);
      if (nome) query = query.ilike('nome', `%${nome}%`);

      const { data } = await query.order('total_compras', { ascending: false }).limit(15);
      const lista = (data || []) as Record<string, unknown>[];

      if (lista.length === 0) return '🤝 Nenhum comprador frequente registrado ainda.';

      const linhas = lista
        .map(
          (c) =>
            `• ${c.nome} — ${c.total_compras || 0} compra(s)` +
            `${c.ultimo_compra ? ` · última em ${dataBr(c.ultimo_compra as string)}` : ''}`
        )
        .join('\n');
      return `🤝 *Compradores frequentes (${lista.length}):*\n\n${linhas}`;
    },
  },

  // ── Fiado / cobrança (plano Intermediário para cima) ────────────────────
  {
    action: 'list_devedores',
    titulo: 'Consultar devedores',
    descricao: 'Listar lojistas/clientes com saldo devedor em aberto',
    recurso: 'fiado_devedores',
    papeis: ['owner'],
    escrita: false,
    atalho: '!fiado',
    parametros: [{ nome: 'nome', descricao: 'filtrar por nome' }],
    exemplos: ['"quem tá devendo?" -> {}'],
    async executar(ctx, params) {
      const nome = texto(params, 'nome', 'cliente');

      let query = ctx.supabase
        .from('lojistas_devedores')
        .select('nome, telefone, saldo_devedor')
        .eq('loja_id', ctx.lojaId)
        .eq('ativo', true)
        .gt('saldo_devedor', 0);
      if (nome) query = query.ilike('nome', `%${nome}%`);

      const { data } = await query.order('saldo_devedor', { ascending: false }).limit(25);
      const lista = (data || []) as Record<string, unknown>[];

      if (lista.length === 0) return '✅ Nenhum saldo devedor em aberto no momento.';

      const total = lista.reduce((s, d) => s + Number(d.saldo_devedor || 0), 0);
      const linhas = lista
        .map((d) => `• ${d.nome} — *${moeda(Number(d.saldo_devedor || 0))}*${d.telefone ? ` · ${d.telefone}` : ''}`)
        .join('\n');

      return `💳 *Devedores (${lista.length}):*\n\n${linhas}\n\n*Total em aberto:* ${moeda(total)}`;
    },
  },

  {
    action: 'abater_divida',
    titulo: 'Abater dívida',
    descricao: 'Registrar pagamento/abatimento no saldo devedor de um cliente',
    recurso: 'fiado_devedores',
    papeis: ['owner'],
    escrita: true,
    atalho: '!abater',
    parametros: [
      { nome: 'cliente', descricao: 'nome do devedor', obrigatorio: true },
      { nome: 'valor', descricao: 'valor pago', obrigatorio: true },
      { nome: 'observacao', descricao: 'observação do pagamento' },
    ],
    exemplos: ['"abater 300 do joao" -> {"cliente":"joao","valor":300}'],
    async executar(ctx, params) {
      const cliente = texto(params, 'cliente', 'nome', 'lojista');
      const valor = numero(params, 'valor');

      if (!cliente) return '⚠️ De qual cliente devo abater?';
      if (valor <= 0) return `⚠️ Qual o valor a abater da dívida de *${cliente}*?`;

      const { data } = await ctx.supabase
        .from('lojistas_devedores')
        .select('id, nome, saldo_devedor')
        .eq('loja_id', ctx.lojaId)
        .eq('ativo', true)
        .ilike('nome', `%${cliente}%`)
        .limit(5);
      const devedores = (data || []) as Record<string, unknown>[];

      if (devedores.length === 0) return `⚠️ Não encontrei *${cliente}* na lista de devedores.`;
      if (devedores.length > 1) {
        const lista = devedores
          .map((d) => `• ${d.nome} — ${moeda(Number(d.saldo_devedor || 0))}`)
          .join('\n');
        return `❓ Encontrei ${devedores.length} devedores:\n\n${lista}\n\nMe diga o nome exato.`;
      }

      const devedor = devedores[0];
      const saldoAnterior = Number(devedor.saldo_devedor || 0);
      const novoSaldo = Math.max(0, Number((saldoAnterior - valor).toFixed(2)));

      const { error } = await ctx.supabase
        .from('lojistas_devedores')
        .update({ saldo_devedor: novoSaldo, updated_at: new Date().toISOString() })
        .eq('id', devedor.id as string)
        .eq('loja_id', ctx.lojaId);
      if (error) throw error;

      await ctx.supabase.from('historico_abatimentos').insert({
        loja_id: ctx.lojaId,
        lojista_id: devedor.id as string,
        valor,
        ator_telefone: ctx.telefone,
        observacao: texto(params, 'observacao') || `Abatimento via WhatsApp por ${ctx.pushName}`,
      });

      return (
        `✅ *Abatimento registrado!*\n\n` +
        `👤 ${devedor.nome}\n` +
        `💵 Pago: ${moeda(valor)}\n` +
        `💳 Saldo: ${moeda(saldoAnterior)} → *${moeda(novoSaldo)}*\n` +
        (novoSaldo === 0 ? '\n🎉 Dívida quitada!' : '')
      );
    },
  },

  // ── IMEI (plano Intermediário para cima) ────────────────────────────────
  {
    action: 'consultar_imei',
    titulo: 'Consultar IMEI',
    descricao: 'Checar um IMEI (bloqueio/roubo) antes de comprar ou vender',
    recurso: 'consulta_imei',
    papeis: ['owner', 'staff'],
    escrita: false,
    atalho: '!checarimei',
    parametros: [{ nome: 'imei', descricao: 'IMEI a consultar', obrigatorio: true }],
    exemplos: ['"checa o imei 356789012345678" -> {"imei":"356789012345678"}'],
    async executar(ctx, params) {
      const imei = texto(params, 'imei', 'numero').replace(/\D/g, '');
      if (!imei) return '⚠️ Qual IMEI devo consultar?';
      if (imei.length < 14) return `⚠️ O IMEI *${imei}* parece incompleto (esperado 15 dígitos).`;

      if (ctx.delegates?.consultarImei) {
        return await ctx.delegates.consultarImei(imei);
      }
      return '⚠️ Consulta de IMEI indisponível no momento.';
    },
  },
];
