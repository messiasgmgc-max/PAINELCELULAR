import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Minus } from 'lucide-react';
import { PLANOS_SISTEMA, DIAS_TESTE_GRATIS, type TipoPlano } from '@/lib/planos-config';
import {
  DATA_CONSULTA_MERCADOPHONE_TEXTO,
  PLANOS_MERCADOPHONE,
  RECURSOS_COMPARADOS,
  economiaDoPeriodo,
  formatarPreco,
  resumoComparacao,
} from '@/lib/assinar/comparacao';

export const metadata: Metadata = {
  title: 'Phone Center x MercadoPhone: comparação de planos e preços',
  description: `Preços e recursos do Phone Center comparados com os planos públicos do MercadoPhone (consulta em ${DATA_CONSULTA_MERCADOPHONE_TEXTO}).`,
};

/**
 * /comparar: Phone Center x MercadoPhone, só com fatos.
 *  - Preços do Phone Center vêm de planos-config.ts (a mesma fonte do checkout).
 *  - Preços e recursos do MercadoPhone: páginas públicas consultadas em 10/09/2026.
 *  - Só entram recursos que o Phone Center realmente tem. Sem logo do concorrente.
 */
export default function CompararPage() {
  const planos = Object.keys(PLANOS_SISTEMA) as TipoPlano[];
  const resumo = resumoComparacao();
  const entrada = PLANOS_SISTEMA.entrada;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <nav className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16">
          <Link href="/assinar" className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Voltar para assinar
          </Link>
          <Link href="/assinar#formulario" className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500">
            Testar {DIAS_TESTE_GRATIS} dias grátis
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-12">
        <header className="space-y-3 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Comparação</span>
          <h1 className="text-2xl font-black text-white sm:text-4xl">Phone Center x MercadoPhone</h1>
          <p className="mx-auto max-w-2xl text-xs leading-relaxed text-slate-400 sm:text-sm">
            Preços do Phone Center são os mesmos do checkout. Preços e recursos do MercadoPhone foram lidos nas páginas públicas dele em{' '}
            <strong className="text-slate-200">{DATA_CONSULTA_MERCADOPHONE_TEXTO}</strong> e podem ter mudado depois disso. Comparamos só o que o Phone Center realmente tem.
          </p>
        </header>

        {/* Resumo em destaque */}
        <section className="rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-950 p-5 sm:p-8">
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="space-y-2">
              <h2 className="text-lg font-black text-white sm:text-2xl">
                OS, nota fiscal, app e etiquetas: R$ {formatarPreco(resumo.phoneCenter.precoMensal)} aqui, R$ {formatarPreco(resumo.mercadoPhone.precoMensal)} lá
              </h2>
              <p className="text-xs leading-relaxed text-slate-300 sm:text-sm">
                No MercadoPhone esses quatro recursos entram a partir do plano {resumo.mercadoPhone.nome}. No Phone Center já vêm no plano {resumo.phoneCenter.nome}, o mais barato.
                Diferença de <strong className="text-white">R$ {formatarPreco(resumo.diferencaMensal)} por mês</strong> (R$ {formatarPreco(resumo.diferencaAnual)} por ano), comparando os preços mensais dos dois.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl border border-emerald-500/30 bg-slate-950/70 p-4">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400">Phone Center {resumo.phoneCenter.nome}</span>
                <span className="font-mono text-2xl font-black text-white">R$ {formatarPreco(resumo.phoneCenter.precoMensal)}</span>
                <span className="block text-[10px] text-slate-400">/mês</span>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">MercadoPhone {resumo.mercadoPhone.nome}</span>
                <span className="font-mono text-2xl font-black text-slate-200">R$ {formatarPreco(resumo.mercadoPhone.precoMensal)}</span>
                <span className="block text-[10px] text-slate-400">/mês</span>
              </div>
            </div>
          </div>
        </section>

        {/* Tabela de recursos */}
        <section className="space-y-3">
          <h2 className="text-lg font-black text-white sm:text-2xl">Recursos, plano a plano</h2>
          <div className="overflow-x-auto rounded-3xl border border-slate-800">
            <table className="w-full min-w-[720px] text-left text-xs sm:text-sm">
              <thead className="bg-slate-900 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="p-3 font-bold sm:p-4">Recurso</th>
                  {planos.map((chave) => (
                    <th key={chave} className="p-3 font-bold text-emerald-400 sm:p-4">
                      Phone Center {PLANOS_SISTEMA[chave].nome}
                      <span className="block font-mono text-white">R$ {formatarPreco(PLANOS_SISTEMA[chave].precos.mensal.valorMensal)}/mês</span>
                    </th>
                  ))}
                  <th className="p-3 font-bold text-slate-300 sm:p-4">
                    MercadoPhone
                    <span className="block text-[10px] font-normal normal-case text-slate-500">consulta em {DATA_CONSULTA_MERCADOPHONE_TEXTO}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {RECURSOS_COMPARADOS.map((r) => (
                  <tr key={r.recurso} className="bg-slate-950/60">
                    <td className="p-3 sm:p-4">
                      <span className="block font-bold text-white">{r.titulo}</span>
                      <span className="block text-[11px] text-slate-400">{r.detalhe}</span>
                    </td>
                    {planos.map((chave) => (
                      <td key={chave} className="p-3 sm:p-4">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-400">
                          <Check className="h-4 w-4" aria-hidden /> Incluso
                        </span>
                      </td>
                    ))}
                    <td className="p-3 text-slate-300 sm:p-4">{r.noMercadoPhone}</td>
                  </tr>
                ))}
                <tr className="bg-slate-900/60">
                  <td className="p-3 sm:p-4">
                    <span className="block font-bold text-white">Teste grátis</span>
                  </td>
                  {planos.map((chave) => (
                    <td key={chave} className="p-3 text-slate-200 sm:p-4">{DIAS_TESTE_GRATIS} dias, sem cartão</td>
                  ))}
                  <td className="p-3 text-slate-500 sm:p-4">
                    <span className="inline-flex items-center gap-1.5"><Minus className="h-4 w-4" aria-hidden /> não consultado</span>
                  </td>
                </tr>
                <tr className="bg-slate-950/60">
                  <td className="p-3 sm:p-4">
                    <span className="block font-bold text-white">Preço no anual</span>
                    <span className="block text-[11px] text-slate-400">por mês, pagando o ano</span>
                  </td>
                  {planos.map((chave) => (
                    <td key={chave} className="p-3 sm:p-4">
                      <span className="font-mono font-bold text-white">R$ {formatarPreco(PLANOS_SISTEMA[chave].precos.anual.valorMensal)}</span>
                      <span className="block text-[11px] text-emerald-400">economia de R$ {formatarPreco(economiaDoPeriodo(chave, 'anual'))} no ano</span>
                    </td>
                  ))}
                  <td className="p-3 text-slate-500 sm:p-4">
                    <span className="inline-flex items-center gap-1.5"><Minus className="h-4 w-4" aria-hidden /> não consultado</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            Nota fiscal no Phone Center usa a Focus NFe com a conta e o certificado digital da própria loja. O app é o painel instalado na tela inicial do celular (Android e iPhone).
          </p>
        </section>

        {/* Preços públicos do MercadoPhone */}
        <section className="space-y-3">
          <h2 className="text-lg font-black text-white sm:text-2xl">Planos públicos do MercadoPhone em {DATA_CONSULTA_MERCADOPHONE_TEXTO}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {PLANOS_MERCADOPHONE.map((p) => (
              <div key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{p.nome}</span>
                <p className="font-mono text-2xl font-black text-white">R$ {formatarPreco(p.precoMensal)}<span className="text-xs font-normal text-slate-400">/mês</span></p>
                <p className="mt-1 text-xs text-slate-300">{p.resumo}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            Resumo do que as páginas públicas mostravam na data da consulta. Para detalhes atuais, consulte o site do MercadoPhone.
          </p>
        </section>

        {/* O que o Phone Center tem e não entrou na comparação */}
        <section className="space-y-3">
          <h2 className="text-lg font-black text-white sm:text-2xl">O que mais vem no Phone Center (não comparado)</h2>
          <p className="text-xs text-slate-400 sm:text-sm">
            Não consultamos se o MercadoPhone tem estes recursos, então eles ficam fora da tabela. No Phone Center, o plano {entrada.nome} inclui:
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {entrada.beneficios.map((b) => (
              <li key={b} className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden /> {b}
              </li>
            ))}
          </ul>
          {entrada.naoInclui && (
            <p className="text-[11px] text-slate-500">
              Não vem no {entrada.nome} (só nos planos maiores): {entrada.naoInclui.join('; ')}.
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 text-center sm:p-8">
          <h2 className="text-lg font-black text-white sm:text-2xl">Teste com o seu estoque</h2>
          <p className="mx-auto mt-2 max-w-xl text-xs text-slate-400 sm:text-sm">
            {DIAS_TESTE_GRATIS} dias grátis, sem cartão. Se vem do MercadoPhone, o importador traz estoque, clientes e vendas com prévia antes de gravar. Sem fidelidade: cancela pelo painel.
          </p>
          <Link
            href="/assinar#formulario"
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-3.5 text-sm font-black text-white shadow-xl shadow-blue-500/25 hover:from-blue-500 hover:to-purple-500"
          >
            Criar minha loja grátis <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 px-4 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Phone Center. MercadoPhone é marca de terceiros, citada só para comparação de preços públicos.
      </footer>
    </div>
  );
}
