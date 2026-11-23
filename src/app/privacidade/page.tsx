import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de Privacidade — PhoneCenter & PhoneCenterCRM',
  description:
    'Política de Privacidade da plataforma PhoneCenter ERP e PhoneCenterCRM para integrações Meta, Instagram, Facebook Messenger e WhatsApp.',
};

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 px-4 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800/80 bg-[#0f172a] p-6 sm:p-10 shadow-2xl">
        <div className="mb-8 border-b border-slate-800 pb-6">
          <span className="inline-block rounded-full bg-[#0066FF]/15 px-3 py-1 text-xs font-semibold text-[#60a5fa] border border-[#0066FF]/30">
            PhoneCenter Tecnologia · LGPD & Meta Platform Terms
          </span>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold text-white">
            Política de Privacidade
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Aplicável ao PhoneCenter ERP (<code className="text-slate-200">app.phonecenter.tech</code>) e ao
            PhoneCenterCRM (<code className="text-slate-200">crm.phonecenter.tech</code>). Última atualização: novembro de 2026.
          </p>
        </div>

        <div className="space-y-6 text-sm sm:text-base leading-relaxed text-slate-300">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Quem Somos</h2>
            <p>
              A <strong>PhoneCenter Tecnologia</strong> fornece o sistema de gestão empresarial (PhoneCenter ERP) e a
              central de atendimento omnichannel (PhoneCenterCRM) destinados a lojas de smartphones, assistência técnica e
              comércio varejista/atacadista. Atuamos em conformidade com a Lei Geral de Proteção de Dados Pessoais
              (LGPD — Lei nº 13.709/2018) e com os Termos da Plataforma Meta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Dados Coletados e Tratados nas Integrações Meta</h2>
            <p className="mb-2">
              Quando uma loja conecta voluntariamente seus canais oficiais (Instagram Direct e Comentários, Facebook
              Messenger/Página, WhatsApp Business API e Meta Conversions API) ao PhoneCenterCRM, tratamos apenas os dados
              estritamente necessários para operar o atendimento autorizado:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-slate-300">
              <li>Identificadores da conta comercial conectada (ID da conta profissional do Instagram, Página do Facebook ou WABA) e tokens de acesso OAuth fornecidos pela Meta;</li>
              <li>Nome, nome de usuário (<code>@</code>), foto de perfil pública e identificador de contato dos clientes que iniciarem interação com a loja;</li>
              <li>Conteúdo de mensagens diretas, comentários em publicações/Reels, respostas a Stories e anexos de mídia trocados no atendimento;</li>
              <li>Registros operacionais vinculados no ERP mediante atendimento (orçamentos, propostas, reservas, ordens de serviço e garantias).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Finalidade do Tratamento</h2>
            <p>
              Os dados são utilizados <strong>exclusivamente</strong> para: (a) receber e responder mensagens de clientes
              em tempo real no painel da loja autorizada; (b) consultar disponibilidade de estoque, simular trocas/parcelamentos e
              emitir propostas/notificações de venda e OS; (c) exibir métricas de atendimento e atribuição de anúncios da própria loja.
              <strong> Nunca vendemos, alugamos ou compartilhamos dados obtidos via APIs da Meta com terceiros para fins publicitários externos.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Armazenamento, Segurança e Retenção</h2>
            <p>
              Todo o tráfego entre navegador, servidores PhoneCenter e APIs da Meta utiliza criptografia em trânsito (HTTPS/TLS).
              O acesso aos dados é isolado por loja contratante e protegido por autenticação e controle de permissões (RBAC).
              Tokens de integração são mantidos apenas enquanto o canal permanecer conectado e os dados são retidos somente pelo período
              necessário à prestação do serviço e cumprimento de obrigações legais (como prazos de garantia comercial).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Direitos do Titular e Exclusão de Dados</h2>
            <p>
              O titular ou administrador da conta pode, a qualquer momento, revogar as permissões do PhoneCenterCRM diretamente
              nas configurações da sua conta Meta/Instagram ou solicitar acesso, correção e exclusão definitiva de seus dados pessoais
              seguindo as instruções em{' '}
              <Link href="/exclusao-dados" className="text-[#60a5fa] underline hover:text-blue-300">
                app.phonecenter.tech/exclusao-dados
              </Link>{' '}
              ou enviando solicitação para{' '}
              <a href="mailto:contato@phonecenter.tech" className="text-[#60a5fa] underline hover:text-blue-300">
                contato@phonecenter.tech
              </a>.
            </p>
          </section>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-6 text-xs text-slate-400">
          <span>© 2026 PhoneCenter Tecnologia · contato@phonecenter.tech</span>
          <nav className="flex gap-4">
            <Link href="/privacidade" className="text-white underline">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-white underline">
              Termos de Serviço
            </Link>
            <Link href="/exclusao-dados" className="hover:text-white underline">
              Exclusão de Dados
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
