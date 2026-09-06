import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

function normalizarTelefone(tel: string): string {
  const limpo = String(tel || '').replace(/\D/g, '');
  if (limpo.startsWith('55') && limpo.length >= 12) {
    return limpo;
  }
  if (limpo.length >= 10 && limpo.length <= 11) {
    return `55${limpo}`;
  }
  return limpo;
}

// ── GET: Listar Equipe e Permissões do WhatsApp da Loja ──
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lojaId = searchParams.get('loja_id');

    if (!lojaId) {
      return NextResponse.json({ error: 'loja_id é obrigatório.' }, { status: 400 });
    }

    // 1. Dados da Loja e do Dono
    const { data: loja } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, telefone, email, dono_whatsapp, plano_tipo, plano_status, data_vencimento')
      .eq('id', lojaId)
      .maybeSingle();

    // 2. Colaboradores da equipe
    const { data: tecnicos } = await supabaseAdmin
      .from('tecnicos')
      .select('*')
      .eq('loja_id', lojaId)
      .order('nome', { ascending: true });

    // 3. Permissões ativas no WhatsApp
    const { data: permissoes } = await supabaseAdmin
      .from('whatsapp_permissoes')
      .select('*')
      .eq('loja_id', lojaId);

    return NextResponse.json({
      success: true,
      loja,
      tecnicos: tecnicos || [],
      permissoes: permissoes || [],
    });
  } catch (err: any) {
    console.error('Erro ao listar equipe:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}

// ── POST: Cadastrar ou Atualizar Colaborador com WhatsApp ──
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, loja_id, nome, telefone, email, cargo = 'vendedor', ativo = true } = body;

    if (!loja_id || !nome?.trim()) {
      return NextResponse.json({ error: 'loja_id e nome são obrigatórios.' }, { status: 400 });
    }

    const cleanNome = String(nome).trim();
    const rawTelefone = String(telefone || '').trim();
    const cleanTelefone = normalizarTelefone(rawTelefone);

    if (!cleanTelefone || cleanTelefone.length < 10) {
      return NextResponse.json({ error: 'Número de WhatsApp com DDD é obrigatório para identificação no bot.' }, { status: 400 });
    }

    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanCargo = String(cargo).toLowerCase().trim();

    // 1. Salvar na tabela tecnicos
    let tecnicoId = id;
    if (id) {
      const { error: errUpdate } = await supabaseAdmin
        .from('tecnicos')
        .update({
          nome: cleanNome,
          telefone: rawTelefone,
          whatsapp: cleanTelefone,
          email: cleanEmail,
          cargo: cleanCargo,
          tipo: cleanCargo,
          ativo: ativo !== false,
        })
        .eq('id', id)
        .eq('loja_id', loja_id);

      if (errUpdate) throw errUpdate;
    } else {
      const { data: novo, error: errInsert } = await supabaseAdmin
        .from('tecnicos')
        .insert({
          loja_id,
          nome: cleanNome,
          telefone: rawTelefone,
          whatsapp: cleanTelefone,
          email: cleanEmail,
          cargo: cleanCargo,
          tipo: cleanCargo,
          ativo: ativo !== false,
        })
        .select()
        .single();

      if (errInsert) throw errInsert;
      tecnicoId = novo.id;
    }

    // 2. Mapeia papel para whatsapp_permissoes ('owner', 'staff', 'motoboy')
    let papelWhatsApp: 'owner' | 'staff' | 'motoboy' = 'staff';
    if (['owner', 'dono', 'administrador', 'admin', 'gerente'].includes(cleanCargo)) {
      papelWhatsApp = 'owner';
    } else if (['motoboy', 'entregador'].includes(cleanCargo)) {
      papelWhatsApp = 'motoboy';
    }

    // 3. Sincronizar em whatsapp_permissoes para identificação instantânea pelo Bot
    const { error: errPerm } = await supabaseAdmin
      .from('whatsapp_permissoes')
      .upsert({
        loja_id,
        telefone: cleanTelefone,
        nome: cleanNome,
        papel: papelWhatsApp,
        ativo: ativo !== false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'loja_id,telefone' });

    if (errPerm) {
      console.warn('Aviso ao sincronizar whatsapp_permissoes:', errPerm);
    }

    // Se for o dono, sincroniza também em lojas.dono_whatsapp
    if (papelWhatsApp === 'owner') {
      await supabaseAdmin
        .from('lojas')
        .update({ dono_whatsapp: cleanTelefone, telefone: rawTelefone })
        .eq('id', loja_id);
    }

    return NextResponse.json({
      success: true,
      id: tecnicoId,
      mensagem: `Colaborador ${cleanNome} salvo e WhatsApp vinculado com sucesso ao Bot!`,
    });
  } catch (err: any) {
    console.error('Erro ao salvar colaborador:', err);
    return NextResponse.json({ error: err.message || 'Erro ao processar.' }, { status: 500 });
  }
}

// ── DELETE: Excluir Colaborador e Revogar Acesso do Bot ──
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const lojaId = searchParams.get('loja_id');

    if (!id || !lojaId) {
      return NextResponse.json({ error: 'id e loja_id são obrigatórios.' }, { status: 400 });
    }

    // 1. Busca dados do colaborador antes de excluir
    const { data: tec } = await supabaseAdmin
      .from('tecnicos')
      .select('whatsapp, telefone, nome')
      .eq('id', id)
      .eq('loja_id', lojaId)
      .maybeSingle();

    // 2. Exclui da tabela tecnicos
    const { error: errDel } = await supabaseAdmin
      .from('tecnicos')
      .delete()
      .eq('id', id)
      .eq('loja_id', lojaId);

    if (errDel) throw errDel;

    // 3. Revoga permissão no WhatsApp
    if (tec) {
      const tel1 = normalizarTelefone(tec.whatsapp || '');
      const tel2 = normalizarTelefone(tec.telefone || '');
      const telefones = [tel1, tel2].filter(Boolean);

      if (telefones.length > 0) {
        await supabaseAdmin
          .from('whatsapp_permissoes')
          .delete()
          .eq('loja_id', lojaId)
          .in('telefone', telefones);
      }
    }

    return NextResponse.json({
      success: true,
      mensagem: 'Colaborador excluído e acesso do WhatsApp revogado com sucesso.',
    });
  } catch (err: any) {
    console.error('Erro ao excluir colaborador:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
