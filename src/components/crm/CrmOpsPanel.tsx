'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Megaphone,
  MessageSquare,
  Plug,
  RefreshCw,
  Send,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  AlertTriangle,
  QrCode,
  Copy,
  Check,
} from 'lucide-react';

interface Props {
  headersBridge: Record<string, string>;
  token: string;
  agenteNome?: string;
}

type SubAba = 'ads' | 'chat' | 'pix' | 'ops';

const formatBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CrmOpsPanel({ headersBridge, token, agenteNome }: Props) {
  const [sub, setSub] = useState<SubAba>('ads');

  // Leads de Anúncio
  const [adsData, setAdsData] = useState<{
    totalLeads: number;
    convertidos: number;
    taxaConversao: number;
    receitaAtribuida: number;
    porAnuncio: Array<{
      chave: string;
      titulo: string;
      origem: string;
      leads: number;
      convertidos: number;
      receita: number;
      taxaConversao: number;
    }>;
    leads: Array<Record<string, unknown>>;
    migrationPendente?: boolean;
  } | null>(null);
  const [loadingAds, setLoadingAds] = useState(false);

  // Chat Interno
  const [canal, setCanal] = useState('geral');
  const [mensagens, setMensagens] = useState<
    Array<{ id: string; autor_nome: string; mensagem: string; created_at: string }>
  >([]);
  const [novaMsg, setNovaMsg] = useState('');
  const [autorChat, setAutorChat] = useState(agenteNome || 'Vendedor');
  const [chatMigrationPendente, setChatMigrationPendente] = useState(false);

  // Conexões & Tickets Ops
  const [instancias, setInstancias] = useState<
    Array<{ name: string; connectionStatus: string; profileName?: string | null }>
  >([]);
  const [inboxes, setInboxes] = useState<Array<{ id: number; name: string }>>([]);
  const [evoConfigured, setEvoConfigured] = useState(false);
  const [origemInbox, setOrigemInbox] = useState('');
  const [destinoInbox, setDestinoInbox] = useState('');
  const [diasInativo, setDiasInativo] = useState('7');
  const [statusOps, setStatusOps] = useState<string | null>(null);
  const [loadingOps, setLoadingOps] = useState(false);

  // Pix / Sinal Reserva
  const [pixModelo, setPixModelo] = useState('');
  const [pixValor, setPixValor] = useState('200');
  const [pixChave, setPixChave] = useState('');
  const [pixCliente, setPixCliente] = useState('');
  const [pixGerado, setPixGerado] = useState<{
    protocolo: string;
    provedor: string;
    pixCopiaCola: string;
    textoWhatsapp: string;
  } | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);

  const carregarAds = useCallback(async () => {
    if (!token) return;
    setLoadingAds(true);
    try {
      const res = await fetch('/api/crm-bridge/leads-anuncio?dias=30', { headers: headersBridge });
      const data = await res.json();
      if (res.ok && data.ok) setAdsData(data);
    } finally {
      setLoadingAds(false);
    }
  }, [token, headersBridge]);

  const carregarChat = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/crm-bridge/chat-interno?canal=${canal}`, {
        headers: headersBridge,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMensagens(data.mensagens || []);
        setChatMigrationPendente(Boolean(data.migrationPendente));
      }
    } catch {
      // ignora
    }
  }, [token, canal, headersBridge]);

  const carregarOps = useCallback(async () => {
    if (!token) return;
    setLoadingOps(true);
    try {
      const [cRes, tRes] = await Promise.all([
        fetch('/api/crm-bridge/conexoes', { headers: headersBridge }),
        fetch('/api/crm-bridge/tickets-ops', { headers: headersBridge }),
      ]);
      const cData = await cRes.json().catch(() => ({}));
      const tData = await tRes.json().catch(() => ({}));
      if (cData.ok) setInstancias(cData.instancias || []);
      if (tData.ok) {
        setEvoConfigured(Boolean(tData.configured));
        setInboxes(
          Array.isArray(tData.inboxes)
            ? tData.inboxes.map((i: Record<string, unknown>) => ({
                id: Number(i.id),
                name: String(i.name || `Inbox #${i.id}`),
              }))
            : []
        );
      }
    } finally {
      setLoadingOps(false);
    }
  }, [token, headersBridge]);

  useEffect(() => {
    if (sub === 'ads') carregarAds();
    if (sub === 'chat') carregarChat();
    if (sub === 'ops') carregarOps();
  }, [sub, carregarAds, carregarChat, carregarOps]);

  const enviarChat = async () => {
    if (!novaMsg.trim() || !token) return;
    const res = await fetch('/api/crm-bridge/chat-interno', {
      method: 'POST',
      headers: headersBridge,
      body: JSON.stringify({
        canal,
        autorNome: autorChat || 'Vendedor',
        mensagem: novaMsg.trim(),
      }),
    });
    if (res.ok) {
      setNovaMsg('');
      carregarChat();
    }
  };

  const converterLead = async (id: string) => {
    const valStr = window.prompt('Valor da venda fechada (R$):', '3500');
    if (!valStr) return;
    const valorVenda = Number(valStr.replace(',', '.')) || 0;
    const res = await fetch('/api/crm-bridge/leads-anuncio', {
      method: 'PATCH',
      headers: headersBridge,
      body: JSON.stringify({ id, status: 'convertido', valorVenda }),
    });
    if (res.ok) carregarAds();
  };

  const reiniciarInstancia = async (instanceName: string) => {
    setStatusOps(`Reiniciando ${instanceName}...`);
    const res = await fetch('/api/crm-bridge/conexoes', {
      method: 'POST',
      headers: headersBridge,
      body: JSON.stringify({ action: 'restart', instanceName }),
    });
    const data = await res.json().catch(() => ({}));
    setStatusOps(res.ok ? `Instância ${instanceName} reiniciada!` : data.error || 'Erro ao reiniciar.');
    carregarOps();
  };

  const executarTicketOp = async (
    action: 'fechar_todos' | 'fechar_por_filtro' | 'migrar_conexao'
  ) => {
    if (action === 'fechar_todos' && !window.confirm('Encerrar todos os atendimentos abertos?')) {
      return;
    }
    setStatusOps('Executando operação no CRM...');
    const res = await fetch('/api/crm-bridge/tickets-ops', {
      method: 'POST',
      headers: headersBridge,
      body: JSON.stringify({
        action,
        inboxId: origemInbox ? Number(origemInbox) : undefined,
        origemInboxId: origemInbox ? Number(origemInbox) : undefined,
        destinoInboxId: destinoInbox ? Number(destinoInbox) : undefined,
        diasInativo: action === 'fechar_por_filtro' ? Number(diasInativo) || 7 : 0,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setStatusOps(
        action === 'migrar_conexao'
          ? `Migrados: ${data.migrados}/${data.encontrados} tickets.`
          : `Encerrados: ${data.encerrados}/${data.analisados} tickets.`
      );
    } else {
      setStatusOps(data.error || 'Erro na operação.');
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Sub-navegação */}
      <div className="grid grid-cols-4 gap-1 bg-[#0f172a] p-1 rounded-xl border border-white/10">
        {(
          [
            { id: 'ads', label: 'Ads', icon: Megaphone },
            { id: 'pix', label: 'Pix', icon: QrCode },
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'ops', label: 'Ops', icon: Plug },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setSub(item.id)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 ${
                sub === item.id
                  ? 'bg-[#0066FF] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================== ADS / CTWA ==================== */}
      {sub === 'ads' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">Leads de Anúncio (30d)</span>
            <button
              onClick={carregarAds}
              className="p-1.5 rounded-lg bg-[#0f172a] border border-white/10 text-slate-300"
            >
              <RefreshCw className={`w-3 h-3 ${loadingAds ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {adsData?.migrationPendente && (
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-[11px] flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Aplique a migration <code>20261120_phonecenter_crm_modulos.sql</code> no Supabase para
                ativar Leads de Anúncio, Propostas e Chat Interno.
              </span>
            </div>
          )}

          {adsData && !adsData.migrationPendente && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10">
                  <div className="text-[10px] text-slate-400">Leads / Conversão</div>
                  <div className="text-sm font-bold text-blue-400">
                    {adsData.totalLeads} • {adsData.taxaConversao}%
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10">
                  <div className="text-[10px] text-slate-400">Receita Atribuída</div>
                  <div className="text-sm font-bold text-emerald-400">
                    {formatBRL(adsData.receitaAtribuida)}
                  </div>
                </div>
              </div>

              {adsData.porAnuncio.length > 0 && (
                <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-1.5">
                  <div className="font-semibold text-white text-[11px]">Performance por Anúncio</div>
                  {adsData.porAnuncio.map((a) => (
                    <div
                      key={a.chave}
                      className="flex justify-between items-center py-1 border-b border-white/5 last:border-0"
                    >
                      <div className="truncate pr-2">
                        <div className="text-white font-medium truncate">{a.titulo}</div>
                        <div className="text-[10px] text-slate-400">
                          {a.leads} lead(s) • {a.convertidos} venda(s) ({a.taxaConversao}%)
                        </div>
                      </div>
                      <span className="font-bold text-emerald-400 shrink-0">
                        {formatBRL(a.receita)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-1.5">
                <div className="font-semibold text-white text-[11px]">Leads Recentes</div>
                {adsData.leads.slice(0, 12).map((l) => {
                  const id = String(l.id);
                  const conv = l.status === 'convertido';
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0 gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-white truncate">
                          {String(l.contato_nome || l.contato_telefone || 'Lead Meta')}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {String(l.ad_headline || l.campaign_name || l.origem)}
                        </div>
                      </div>
                      {conv ? (
                        <span className="text-emerald-400 text-[10px] font-bold shrink-0">
                          ✓ {formatBRL(Number(l.valor_venda) || 0)}
                        </span>
                      ) : (
                        <button
                          onClick={() => converterLead(id)}
                          className="px-2 py-1 rounded bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-200 text-[10px] shrink-0"
                        >
                          Converter
                        </button>
                      )}
                    </div>
                  );
                })}
                {adsData.leads.length === 0 && (
                  <div className="text-center py-4 text-slate-500">
                    Nenhum lead de anúncio capturado ainda. Aponte o webhook do CRM para{' '}
                    <code>/api/crm-bridge/webhooks/evo</code>.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== CHAT INTERNO DA EQUIPE ==================== */}
      {sub === 'chat' && (
        <div className="space-y-2">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {['geral', 'vendas', 'trocas', 'assistencia', 'gerencia'].map((c) => (
              <button
                key={c}
                onClick={() => setCanal(c)}
                className={`px-2.5 py-1 rounded-full text-[11px] border shrink-0 ${
                  canal === c
                    ? 'bg-[#0066FF] border-[#0066FF] text-white'
                    : 'bg-[#0f172a] border-white/10 text-slate-400'
                }`}
              >
                #{c}
              </button>
            ))}
          </div>

          {chatMigrationPendente && (
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-[11px]">
              Aplique a migration <code>20261120_phonecenter_crm_modulos.sql</code> no Supabase.
            </div>
          )}

          <input
            value={autorChat}
            onChange={(e) => setAutorChat(e.target.value)}
            placeholder="Seu nome na equipe..."
            className="w-full px-2.5 py-1 rounded-lg bg-[#0f172a] border border-white/10 text-[11px] text-slate-200"
          />

          <div className="h-60 overflow-y-auto p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-2">
            {mensagens.map((m) => (
              <div key={m.id} className="p-2 rounded-lg bg-[#090d16] border border-white/5">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <strong className="text-blue-300">{m.autor_nome}</strong>
                  <span>{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="text-slate-100 mt-0.5 whitespace-pre-wrap">{m.mensagem}</div>
              </div>
            ))}
            {mensagens.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                Nenhuma mensagem em #{canal} ainda.
              </div>
            )}
          </div>

          <div className="flex gap-1.5">
            <input
              value={novaMsg}
              onChange={(e) => setNovaMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enviarChat()}
              placeholder={`Mensagem para #${canal}...`}
              className="flex-1 px-2.5 py-2 rounded-lg bg-[#0f172a] border border-white/10 text-white outline-none focus:border-[#0066FF]"
            />
            <button
              onClick={enviarChat}
              className="px-3 rounded-lg bg-[#0066FF] hover:bg-[#0052CC] text-white"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== PIX / SINAL DE RESERVA ==================== */}
      {sub === 'pix' && (
        <div className="space-y-2.5">
          <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-2">
            <div className="font-semibold text-white text-[12px] flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5 text-emerald-400" />
              Gerar Sinal Pix / Reserva de Aparelho
            </div>
            <input
              value={pixModelo}
              onChange={(e) => setPixModelo(e.target.value)}
              placeholder="Aparelho (ex: iPhone 16 Pro 256GB Natural)"
              className="w-full px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-white/10 text-white"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                value={pixValor}
                onChange={(e) => setPixValor(e.target.value)}
                placeholder="Sinal R$"
                className="px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-white/10 text-white"
              />
              <input
                value={pixCliente}
                onChange={(e) => setPixCliente(e.target.value)}
                placeholder="Nome do cliente"
                className="px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-white/10 text-white"
              />
            </div>
            <input
              value={pixChave}
              onChange={(e) => setPixChave(e.target.value)}
              placeholder="Chave Pix da loja (opcional se CRM_PIX_KEY estiver no Coolify)"
              className="w-full px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-white/10 text-white"
            />
            <button
              disabled={pixLoading || !pixModelo || !pixValor}
              onClick={async () => {
                setPixLoading(true);
                setStatusOps(null);
                try {
                  const res = await fetch('/api/crm-bridge/pix-reserva', {
                    method: 'POST',
                    headers: headersBridge,
                    body: JSON.stringify({
                      aparelhoModelo: pixModelo,
                      valorSinal: Number(pixValor.replace(',', '.')) || 0,
                      clienteNome: pixCliente || 'Cliente',
                      chavePix: pixChave || undefined,
                    }),
                  });
                  const data = await res.json();
                  if (res.ok && data.ok) {
                    setPixGerado({
                      protocolo: data.protocolo,
                      provedor: data.provedor,
                      pixCopiaCola: data.pixCopiaCola,
                      textoWhatsapp: data.textoWhatsapp,
                    });
                  } else {
                    setStatusOps(data.error || 'Erro ao gerar Pix.');
                  }
                } finally {
                  setPixLoading(false);
                }
              }}
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
            >
              {pixLoading ? 'Gerando Pix...' : 'Gerar Pix Copia e Cola'}
            </button>
            {statusOps && (
              <div className="text-[11px] text-amber-300 bg-amber-500/10 p-2 rounded-lg">
                {statusOps}
              </div>
            )}
          </div>

          {pixGerado && (
            <div className="p-2.5 rounded-xl bg-[#0f172a] border border-emerald-500/40 space-y-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-emerald-300 font-bold">#{pixGerado.protocolo}</span>
                <span className="text-slate-400 uppercase text-[10px]">{pixGerado.provedor}</span>
              </div>
              <textarea
                readOnly
                rows={3}
                value={pixGerado.pixCopiaCola}
                className="w-full p-2 rounded-lg bg-[#090d16] border border-white/10 text-[10px] font-mono text-slate-300"
              />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(pixGerado.textoWhatsapp);
                  setPixCopiado(true);
                  setTimeout(() => setPixCopiado(false), 1800);
                }}
                className="w-full py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#0052CC] text-white font-semibold flex items-center justify-center gap-1.5"
              >
                {pixCopiado ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Mensagem + Pix Copiados!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copiar Mensagem + Pix pro WhatsApp
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================== GESTÃO DE CONEXÕES & TICKETS ==================== */}
      {sub === 'ops' && (
        <div className="space-y-2.5">
          {statusOps && (
            <div className="p-2 rounded-lg bg-[#0066FF]/20 border border-[#0066FF]/40 text-blue-200 text-[11px]">
              {statusOps}
            </div>
          )}

          <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white text-[11px]">
                Conexões WhatsApp (Evolution API)
              </span>
              <button onClick={carregarOps} className="text-slate-400 hover:text-white">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOps ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {instancias.map((inst) => {
              const online = String(inst.connectionStatus).toLowerCase() === 'open';
              return (
                <div
                  key={inst.name}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#090d16] border border-white/10"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-white truncate flex items-center gap-1.5">
                      {online ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      )}
                      {inst.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Status: {inst.connectionStatus}
                    </div>
                  </div>
                  <button
                    onClick={() => reiniciarInstancia(inst.name)}
                    className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-slate-200 text-[10px]"
                  >
                    Reiniciar
                  </button>
                </div>
              );
            })}
            {instancias.length === 0 && (
              <div className="text-slate-500 text-center py-2">Nenhuma instância listada.</div>
            )}
          </div>

          <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-2">
            <div className="font-semibold text-white text-[11px] flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#007BFF]" />
              Gerenciar Atendimentos em Massa
            </div>
            {!evoConfigured ? (
              <p className="text-[11px] text-slate-400">
                Para migrar/fechar tickets em massa, adicione{' '}
                <code className="text-blue-300">CRM_EVO_ACCESS_TOKEN</code> nas envs do{' '}
                <code>PAINELCELULAR</code> (gere em{' '}
                <code>crm.phonecenter.tech/settings/access-tokens</code>).
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={origemInbox}
                    onChange={(e) => setOrigemInbox(e.target.value)}
                    className="px-2 py-1.5 rounded bg-[#090d16] border border-white/10 text-white"
                  >
                    <option value="">Conexão Origem...</option>
                    {inboxes.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={destinoInbox}
                    onChange={(e) => setDestinoInbox(e.target.value)}
                    className="px-2 py-1.5 rounded bg-[#090d16] border border-white/10 text-white"
                  >
                    <option value="">Conexão Destino...</option>
                    {inboxes.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => executarTicketOp('migrar_conexao')}
                  className="w-full py-1.5 rounded-lg bg-[#0066FF]/25 hover:bg-[#0066FF]/40 border border-[#0066FF]/40 text-blue-200 font-medium"
                >
                  Migrar Tickets (Origem → Destino)
                </button>

                <div className="flex gap-1.5 items-center">
                  <input
                    type="number"
                    value={diasInativo}
                    onChange={(e) => setDiasInativo(e.target.value)}
                    className="w-16 px-2 py-1.5 rounded bg-[#090d16] border border-white/10 text-white"
                    title="Dias sem atividade"
                  />
                  <button
                    onClick={() => executarTicketOp('fechar_por_filtro')}
                    className="flex-1 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-200 font-medium"
                  >
                    Fechar inativos ({diasInativo}d+)
                  </button>
                </div>

                <button
                  onClick={() => executarTicketOp('fechar_todos')}
                  className="w-full py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/35 border border-red-500/40 text-red-200 font-medium"
                >
                  Fechar Todos os Tickets Abertos
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
