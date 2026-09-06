import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { obterDadosFiscaisLoja } from '@/lib/fiscal/fiscalService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lojaId = searchParams.get('lojaId');

    if (!lojaId) {
      return NextResponse.json({ error: 'lojaId é obrigatório' }, { status: 400 });
    }

    const config = await obterDadosFiscaisLoja(lojaId);
    return NextResponse.json({ config: config || {} });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lojaId, dadosFiscais } = body;

    if (!lojaId || !dadosFiscais) {
      return NextResponse.json({ error: 'lojaId e dadosFiscais são obrigatórios' }, { status: 400 });
    }

    // Atualiza coluna dados_fiscais na tabela lojas
    const { data, error } = await supabaseAdmin
      .from('lojas')
      .update({
        dados_fiscais: dadosFiscais,
        cnpj: dadosFiscais.cnpj || undefined
      })
      .eq('id', lojaId)
      .select('id, dados_fiscais')
      .single();

    if (error) {
      // Se a coluna dados_fiscais ainda não existir na tabela lojas, grava em regras_upgrade como fallback seguro
      console.warn('Fallback: salvando dados fiscais em regras_upgrade.dados_fiscais');
      const { data: lojaAtual } = await supabaseAdmin.from('lojas').select('regras_upgrade').eq('id', lojaId).maybeSingle();
      const regras = (lojaAtual?.regras_upgrade || {}) as any;
      regras.dados_fiscais = dadosFiscais;

      await supabaseAdmin.from('lojas').update({ regras_upgrade: regras }).eq('id', lojaId);
      return NextResponse.json({ sucesso: true, dadosFiscais, fallback: true });
    }

    return NextResponse.json({ sucesso: true, dadosFiscais: data.dados_fiscais });
  } catch (error: any) {
    console.error('Erro ao salvar dados fiscais:', error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
