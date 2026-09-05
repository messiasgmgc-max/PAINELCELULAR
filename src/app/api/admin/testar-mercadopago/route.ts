import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    let token = body.token?.trim();
    const lojaId = body.lojaId;

    // Se não passou token direto, tentar buscar da loja especificada, ou de qualquer loja configurada, ou do .env
    if (!token && lojaId) {
      const { data: loja } = await supabaseAdmin
        .from('lojas')
        .select('mp_access_token')
        .eq('id', lojaId)
        .maybeSingle();
      if (loja?.mp_access_token) {
        token = loja.mp_access_token.trim();
      }
    }

    if (!token) {
      const { data: anyLoja } = await supabaseAdmin
        .from('lojas')
        .select('mp_access_token')
        .not('mp_access_token', 'is', null)
        .neq('mp_access_token', '')
        .limit(1)
        .maybeSingle();
      if (anyLoja?.mp_access_token) {
        token = anyLoja.mp_access_token.trim();
      }
    }

    if (!token) {
      token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    }

    if (!token) {
      return NextResponse.json({
        success: false,
        error: 'Nenhum Access Token do Mercado Pago foi informado nem encontrado nas configurações.'
      }, { status: 400 });
    }

    // Validar token chamando endpoint oficial de perfil do Mercado Pago
    const mpRes = await fetch('https://api.mercadopago.com/users/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const mpData = await mpRes.json().catch(() => ({}));

    if (mpRes.ok && mpData.id) {
      return NextResponse.json({
        success: true,
        conta: mpData.nickname || mpData.id,
        email: mpData.email || 'Email não disponível',
        siteId: mpData.site_id || 'MLB',
        pais: mpData.country_id || 'BR',
        message: `Conexão bem sucedida! Conta vinculada: ${mpData.nickname || mpData.id}`
      });
    }

    return NextResponse.json({
      success: false,
      error: mpData.message || mpData.error || 'Token inválido ou não autorizado pelo Mercado Pago.'
    }, { status: 400 });

  } catch (err: any) {
    console.error('Erro ao testar Mercado Pago:', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Falha interna ao se comunicar com o Mercado Pago'
    }, { status: 500 });
  }
}
