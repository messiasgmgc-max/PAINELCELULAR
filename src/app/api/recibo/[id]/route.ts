import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    // 1. Buscar a venda pelo ID (exato ou sufixo)
    let { data: venda } = await supabaseAdmin
      .from('vendas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!venda) {
      // Tenta buscar por id curto/sufixo
      const { data: vendasLista } = await supabaseAdmin
        .from('vendas')
        .select('*');

      venda = vendasLista?.find((v: any) => v.id.endsWith(id) || v.id.slice(-6).toUpperCase() === id.toUpperCase()) || null;
    }

    if (!venda) {
      return NextResponse.json({ error: 'Recibo não encontrado' }, { status: 404 });
    }

    // 2. Buscar dados da loja vinculada
    let loja = null;
    const targetLojaId = venda.loja_id || venda.lojaId;

    if (targetLojaId) {
      const { data: lojaData } = await supabaseAdmin
        .from('lojas')
        .select('*')
        .eq('id', targetLojaId)
        .maybeSingle();
      if (lojaData) loja = lojaData;
    }

    // Fallback inteligente: Se o loja_id não estiver salvo na venda antiga, tenta encontrar a loja do vendedor em perfis
    if (!loja && (venda.vendedor || venda.usuario_email)) {
      const termoVendedor = venda.vendedor || venda.usuario_email;
      const { data: perfil } = await supabaseAdmin
        .from('perfis')
        .select('loja_id')
        .or(`email.ilike.%${termoVendedor}%,nome.ilike.%${termoVendedor}%`)
        .maybeSingle();

      if (perfil?.loja_id) {
        const { data: lojaPerfil } = await supabaseAdmin
          .from('lojas')
          .select('*')
          .eq('id', perfil.loja_id)
          .maybeSingle();
        if (lojaPerfil) loja = lojaPerfil;
      }
    }

    // Se ainda não encontrou, busca a loja com nome personalizado (que não seja a 'Phone Center' genérica de id 00000)
    if (!loja) {
      const { data: lojaPersonalizada } = await supabaseAdmin
        .from('lojas')
        .select('*')
        .neq('nome', 'Phone Center')
        .limit(1)
        .maybeSingle();

      if (lojaPersonalizada) {
        loja = lojaPersonalizada;
      } else {
        const { data: primeiraLoja } = await supabaseAdmin
          .from('lojas')
          .select('*')
          .limit(1)
          .maybeSingle();
        if (primeiraLoja) loja = primeiraLoja;
      }
    }

    // 3. Buscar dados do cliente vinculado
    let cliente = null;
    const targetClienteId = venda.cliente_id || venda.clienteId;
    if (targetClienteId) {
      const { data: clienteData } = await supabaseAdmin
        .from('clientes')
        .select('*')
        .eq('id', targetClienteId)
        .maybeSingle();
      if (clienteData) cliente = clienteData;
    }

    return NextResponse.json({ venda, loja, cliente });
  } catch (error: any) {
    console.error('Erro na API publica de recibo:', error);
    return NextResponse.json({ error: 'Erro ao carregar recibo' }, { status: 500 });
  }
}
