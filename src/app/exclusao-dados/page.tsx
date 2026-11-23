import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Exclusão de Dados — PhoneCenter & PhoneCenterCRM',
  description:
    'Instruções passo a passo para revogar acesso e solicitar a exclusão definitiva de dados no PhoneCenterCRM e PhoneCenter ERP.',
};

export default function ExclusaoDadosPage() {
  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 px-4 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800/80 bg-[#0f172a] p-6 sm:p-10 shadow-2xl">
        <div className="mb-8 border-b border-slate-800 pb-6">
          <span className="inline-block rounded-full bg-[#0066FF]/15 px-3 py-1 text-xs font-semibold text-[#60a5fa] border border-[#0066FF]/30">
            PhoneCenter Tecnologia · Direitos do Titular (LGPD)
          </span>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold text-white">
            Instruções para Exclusão de Dados do Usuário
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Como revogar permissões conectadas via Meta (Instagram/Facebook) e remover seus registros do PhoneCenterCRM.
          </p>
        </div>

        <div className="space-y-6 text-sm sm:text-base leading-relaxed text-slate-300">
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-semibold text-white mb-2">
              Passo 1 — Remover a conexão no seu Facebook / Instagram
            </h2>
            <ol className="list-decimal pl-5 space-y-2 text-slate-300">
              <li>Acesse as configurações da sua conta no Facebook ou no aplicativo do Instagram.</li>
              <li>
                Entre em <strong>Configurações e privacidade → Integrações comerciais</strong> (no Facebook) ou{' '}
                <strong>Permissões do site → Aplicativos e sites</strong> (no Instagram).
              </li>
              <li>Localize o aplicativo <strong>PhoneCenterCRM</strong> e clique em <strong>Remover</strong>.</li>
            </ol>
            <p className="mt-3 text-xs text-slate-400">
              Ao remover a autorização, o aplicativo perde imediatamente o acesso para ler ou enviar novas mensagens em seu nome.
            </p>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-semibold text-white mb-2">
              Passo 2 — Solicitar a exclusão definitiva dos dados armazenados
            </h2>
            <p className="mb-3">
              Para excluir definitivamente mensagens, histórico de contatos e tokens armazenados nos bancos de dados do
              PhoneCenterCRM e PhoneCenter ERP (ressalvadas obrigações legais de guarda fiscal/garantia):
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>
                Envie um e-mail para{' '}
                <a href="mailto:contato@phonecenter.tech?subject=Exclus%C3%A3o%20de%20Dados%20%E2%80%94%20PhoneCenterCRM" className="text-[#60a5fa] underline hover:text-blue-300">
                  contato@phonecenter.tech
                </a>
              </li>
              <li>
                Assunto: <strong>&quot;Exclusão de Dados — PhoneCenterCRM&quot;</strong>
              </li>
              <li>Informe no corpo do e-mail o seu <code>@</code> do Instagram, telefone com DDD ou e-mail cadastrado.</li>
            </ul>
            <p className="mt-3 text-sm text-slate-300">
              Confirmaremos o recebimento e concluiremos a exclusão em até <strong>15 dias úteis</strong>, em conformidade com a LGPD (Lei nº 13.709/2018).
            </p>
          </section>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-6 text-xs text-slate-400">
          <span>© 2026 PhoneCenter Tecnologia · contato@phonecenter.tech</span>
          <nav className="flex gap-4">
            <Link href="/privacidade" className="hover:text-white underline">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-white underline">
              Termos de Serviço
            </Link>
            <Link href="/exclusao-dados" className="text-white underline">
              Exclusão de Dados
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
