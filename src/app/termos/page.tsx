import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Termos de Serviço — PhoneCenter & PhoneCenterCRM',
  description:
    'Termos de Serviço aplicáveis ao uso do sistema PhoneCenter ERP e da plataforma omnichannel PhoneCenterCRM.',
};

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 px-4 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800/80 bg-[#0f172a] p-6 sm:p-10 shadow-2xl">
        <div className="mb-8 border-b border-slate-800 pb-6">
          <span className="inline-block rounded-full bg-[#0066FF]/15 px-3 py-1 text-xs font-semibold text-[#60a5fa] border border-[#0066FF]/30">
            PhoneCenter Tecnologia · Condições de Uso
          </span>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold text-white">
            Termos de Serviço
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Válido para <code className="text-slate-200">app.phonecenter.tech</code> e{' '}
            <code className="text-slate-200">crm.phonecenter.tech</code>. Última atualização: novembro de 2026.
          </p>
        </div>

        <div className="space-y-6 text-sm sm:text-base leading-relaxed text-slate-300">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Objeto e Escopo da Plataforma</h2>
            <p>
              O <strong>PhoneCenter ERP</strong> e o <strong>PhoneCenterCRM</strong> disponibilizam ferramentas em nuvem
              para controle de estoque, vendas, garantias, ordens de serviço e atendimento multicanal integrado ao WhatsApp,
              Instagram Direct/Comentários, Facebook Messenger e serviços auxiliares autorizados pelo cliente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Elegibilidade e Contas Conectadas</h2>
            <p>
              Cada lojista é integralmente responsável pela veracidade dos cadastros, guarda de suas credenciais e legitimidade
              das contas comerciais conectadas (Meta/Instagram, Facebook, WhatsApp e Google), devendo possuir autorização legal
              e administrativa sobre as páginas, perfis profissionais e números vinculados.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Uso Aceitável e Conformidade Anti-Spam</h2>
            <p>
              É expressamente proibido utilizar a plataforma para envio de spam, mensagens em massa não solicitadas, automações
              abusivas, coleta não autorizada de dados ou qualquer atividade que viole os Termos da Plataforma Meta, as Políticas
              Comerciais do WhatsApp ou a legislação brasileira vigente (incluindo LGPD e Código de Defesa do Consumidor).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Planos, Assinatura e Cancelamento</h2>
            <p>
              Os recursos avançados de CRM omnichannel são habilitados conforme o plano contratado pela loja no painel.
              O cliente pode solicitar cancelamento ou desconexão de seus canais a qualquer tempo sem fidelidade oculta,
              preservando o direito de exportação e solicitação de remoção de dados nos termos da lei.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Propriedade Intelectual e Disponibilidade</h2>
            <p>
              O código, layout, marca e módulos exclusivos do ecossistema PhoneCenter pertencem à PhoneCenter Tecnologia.
              Empregamos boas práticas de infraestrutura e backups diários para alta disponibilidade, não nos responsabilizando
              por indisponibilidades temporárias, alterações unilaterais de APIs ou bloqueios aplicados diretamente por terceiros
              (como Meta, Google ou provedores de pagamento/telefonia).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Privacidade e Contato</h2>
            <p>
              O tratamento de dados pessoais segue integralmente nossa{' '}
              <Link href="/privacidade" className="text-[#60a5fa] underline hover:text-blue-300">
                Política de Privacidade
              </Link>
              . Dúvidas, suporte ou notificações formais podem ser enviadas para{' '}
              <a href="mailto:contato@phonecenter.tech" className="text-[#60a5fa] underline hover:text-blue-300">
                contato@phonecenter.tech
              </a>.
            </p>
          </section>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-6 text-xs text-slate-400">
          <span>© 2026 PhoneCenter Tecnologia · contato@phonecenter.tech</span>
          <nav className="flex gap-4">
            <Link href="/privacidade" className="hover:text-white underline">
              Privacidade
            </Link>
            <Link href="/termos" className="text-white underline">
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
