import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/integrations/supabase/server";
import {
  gerarCsvEstoqueMercadoPhone,
  montarMatrizEstoqueMercadoPhone,
  criarWorkbookMercadoPhone,
  AparelhoExportacaoMP,
} from "@/lib/estoque/exportarMercadoPhone";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const formato = (searchParams.get("formato") || "csv").toLowerCase();
    const lojaIdParam = searchParams.get("lojaId");
    const incluirInstrucoes = searchParams.get("instrucoes") === "true";
    const separadorParam = searchParams.get("separador");
    const separador = separadorParam === "," ? "," : ";";

    let query = supabaseAdmin
      .from("aparelhos")
      .select("*")
      .eq("ativo", true);

    if (lojaIdParam) {
      query = query.eq("loja_id", lojaIdParam);
    } else {
      // Padrão: loja Lucas Imports
      query = query.eq("loja_id", "e2858e7b-3046-4211-ac06-3ad45e3ea6af");
    }

    const { data: aparelhosDb, error } = await query.order("modelo");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const aparelhosFormatados: AparelhoExportacaoMP[] = (aparelhosDb || []).map((d) => ({
      ...d,
      saudeBateria: d.saude_bateria,
      precoAtacado: d.precoAtacado || d.preco_atacado,
    }));

    const dataHoje = new Date().toISOString().split("T")[0];

    if (formato === "xlsx") {
      const matriz = montarMatrizEstoqueMercadoPhone(aparelhosFormatados);
      const wb = criarWorkbookMercadoPhone(matriz);
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="estoque_mercadophone_${dataHoje}.xlsx"`,
        },
      });
    }

    // Padrão: CSV oficial Mercado Phone
    const csvTexto = gerarCsvEstoqueMercadoPhone(aparelhosFormatados, {
      separador,
      incluirCabecalhoInstrucoes: incluirInstrucoes,
      incluirColunaVaziaInicial: incluirInstrucoes,
    });

    return new Response(csvTexto, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="estoque_mercadophone_${dataHoje}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("Erro na rota de exportação Mercado Phone:", err);
    return NextResponse.json(
      { error: err?.message || "Erro desconhecido na exportação" },
      { status: 500 }
    );
  }
}
