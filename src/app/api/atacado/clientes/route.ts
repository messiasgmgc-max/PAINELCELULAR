import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const lojaId = url.searchParams.get('lojaId');

    if (!lojaId) {
      return NextResponse.json({ error: 'ID da loja é obrigatório' }, { status: 400 });
    }

    const { data: clientes, error } = await supabaseAdmin
      .from('lojistas_devedores')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .order('saldo_devedor', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      clientes: (clientes || []).map(c => ({
        id: c.id,
        nome: c.nome,
        whatsapp: c.whatsapp || c.telefone || '',
        telefone: c.telefone || c.whatsapp || '',
        saldoDevedor: Number(c.saldo_devedor || 0),
        limiteCredito: Number(c.limite_credito || 0),
        cpfCnpj: c.cpf_cnpj || '',
        cidade: c.cidade || '',
        observacoes: c.observacoes || '',
        chavePix: c.chave_pix || '',
        ultimoDisparo: c.ultimo_disparo_cobranca || null,
        createdAt: c.created_at
      }))
    });
  } catch (err: any) {
    console.error('Erro ao buscar clientes de atacado:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      id,
      lojaId,
      nome,
      whatsapp,
      telefone,
      limiteCredito = 0,
      cpfCnpj,
      cidade,
      observacoes,
      chavePix,
      saldoDevedor
    } = body;

    if (!lojaId || !nome?.trim()) {
      return NextResponse.json({ error: 'ID da loja e Nome do cliente são obrigatórios' }, { status: 400 });
    }

    const cleanNome = String(nome).trim();
    const cleanWhatsapp = (whatsapp || telefone || '').replace(/\D/g, '');

    const recordPayload: any = {
      loja_id: lojaId,
      nome: cleanNome,
      whatsapp: cleanWhatsapp || null,
      telefone: cleanWhatsapp || null,
      limite_credito: Number(limiteCredito || 0),
      cpf_cnpj: cpfCnpj?.trim() || null,
      cidade: cidade?.trim() || null,
      observacoes: observacoes?.trim() || null,
      chave_pix: chavePix?.trim() || null,
      ativo: true,
      updated_at: new Date().toISOString()
    };

    if (saldoDevedor !== undefined) {
      recordPayload.saldo_devedor = Math.max(0, Number(saldoDevedor || 0));
    }

    let resultado;
    if (id) {
      // Atualizar existente
      const { data, error } = await supabaseAdmin
        .from('lojistas_devedores')
        .update(recordPayload)
        .eq('id', id)
        .eq('loja_id', lojaId)
        .select()
        .single();

      if (error) throw error;
      resultado = data;
    } else {
      // Criar novo
      const { data, error } = await supabaseAdmin
        .from('lojistas_devedores')
        .insert(recordPayload)
        .select()
        .single();

      if (error) throw error;
      resultado = data;
    }

    return NextResponse.json({
      success: true,
      cliente: resultado,
      mensagem: id ? 'Cliente atualizado com sucesso!' : 'Cliente de atacado cadastrado com sucesso!'
    });
  } catch (err: any) {
    console.error('Erro ao salvar cliente de atacado:', err);
    return NextResponse.json({ error: err.message || 'Erro interno ao salvar cliente' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const lojaId = url.searchParams.get('lojaId');

    if (!id || !lojaId) {
      return NextResponse.json({ error: 'ID do cliente e da loja são obrigatórios' }, { status: 400 });
    }

    // Soft delete
    const { error } = await supabaseAdmin
      .from('lojistas_devedores')
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('loja_id', lojaId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      mensagem: 'Cliente removido com sucesso!'
    });
  } catch (err: any) {
    console.error('Erro ao excluir cliente de atacado:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
