'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Sparkles,
  Play,
  Save,
  RefreshCw,
  Users,
  Megaphone,
  Pause,
  CreditCard,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Plus,
} from 'lucide-react';

const formatBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface SectionProps {
  buildHeaders: () => Promise<Record<string, string>>;
  lojaNome: string;
}

export function VisaoGeralSection({ buildHeaders, lojaNome }: SectionProps) {
  const [ranking, setRanking] = useState<{
    faturamentoTotal: number;
    totalVendas: number;
    ticketMedioGeral: number;
  } | null>(null);
  const [ads, setAds] = useState<{
    totalLeads: number;
    convertidos: number;
    receitaAtribuida: number;
  } | null>(null);
  const [minhaLoja, setMinhaLoja] = useState<{
    crmFrontendUrl: string;
    modoTenant?: string;
    planoLiberado: boolean;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const h = await buildHeaders();
      const [rRes, aRes, mRes] = await Promise.all([
        fetch('/api/crm-bridge/ranking?dias=30', { headers: h, credentials: 'include' }),
        fetch('/api/crm-bridge/leads-anuncio?dias=30', { headers: h, credentials: 'include' }),
        fetch('/api/crm-bridge/minha-loja', { headers: h, credentials: 'include' }),
      ]);
      const r = await rRes.json().catch(() => ({}));
      const a = await aRes.json().catch(() => ({}));
      const m = await mRes.json().catch(() => ({}));
      if (r.ok) setRanking(r);
      if (a.ok) setAds(a);
      if (m.ok) setMinhaLoja(m);
    })();
  }, [buildHeaders]);

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10">
          <div className="text-xs text-slate-400">Faturamento 30d (ERP)</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {ranking ? formatBRL(ranking.faturamentoTotal) : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {ranking ? `${ranking.totalVendas} venda(s)` : 'Carregando...'}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10">
          <div className="text-xs text-slate-400">Ticket Médio</div>
          <div className="text-xl font-bold text-blue-400 mt-1">
            {ranking ? formatBRL(ranking.ticketMedioGeral) : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{lojaNome}</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10">
          <div className="text-xs text-slate-400">Leads de Anúncio (30d)</div>
          <div className="text-xl font-bold text-white mt-1">
            {ads ? ads.totalLeads : '—'}
          </div>
          <div className="text-[11px] text-emerald-400 mt-0.5">
            {ads ? `${ads.convertidos} convertido(s)` : 'Meta CTWA / UTM'}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10">
          <div className="text-xs text-slate-400">Receita Atribuída Ads</div>
          <div className="text-xl font-bold text-amber-300 mt-1">
            {ads ? formatBRL(ads.receitaAtribuida) : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Meta CAPI Purchase</div>
        </div>
      </div>

      {/* Financeiro / Assinatura CRM */}
      <div className="p-5 rounded-2xl bg-[#0f172a] border border-[#0066FF]/35 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-bold text-white text-sm">
            <CreditCard className="w-4 h-4 text-[#007BFF]" />
            Financeiro &amp; Plano do Ecossistema ({lojaNome})
          </div>
          <p className="text-xs text-slate-400">
            Plano Avançado (R$ 299/mês) — inclui PhoneCenterCRM Omnichannel, IA com Estoque Vivo
            via MCP, Pós-Venda Automático e zero cobrança por atendente. Modo:{' '}
            <strong className="text-blue-300">{minhaLoja?.modoTenant || 'compartilhado'}</strong>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={minhaLoja?.crmFrontendUrl || 'https://crm.phonecenter.tech'}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-semibold flex items-center gap-1.5"
          >
            Abrir Chat Omnichannel <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="/crm-config"
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold"
          >
            Tokens &amp; Instâncias
          </a>
        </div>
      </div>
    </div>
  );
}

export function PosVendaSection({ buildHeaders }: SectionProps) {
  const [ativo, setAtivo] = useState(false);
  const [googleUrl, setGoogleUrl] = useState('');
  const [regras, setRegras] = useState<
    Array<{
      tipo: string;
      titulo: string;
      descricao: string;
      ativo: boolean;
      dias_apos: number;
      template_mensagem: string;
      incluir_avaliacao_upgrade: boolean;
    }>
  >([]);
  const [elegiveis, setElegiveis] = useState<
    Array<{ regraTipo: string; clienteNome: string; clienteTelefone: string; aparelho: string; mensagem: string }>
  >([]);
  const [disparos, setDisparos] = useState<Array<Record<string, unknown>>>([]);
  const [migrationPendente, setMigrationPendente] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [executando, setExecutando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const h = await buildHeaders();
      const res = await fetch('/api/crm-bridge/pos-venda', { headers: h, credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setAtivo(Boolean(data.posVendaAtivo));
        setGoogleUrl(String(data.googleReviewUrl || ''));
        setRegras(data.regras || []);
        setElegiveis(data.elegiveisPreview || []);
        setDisparos(data.disparos || []);
        setMigrationPendente(Boolean(data.migrationPendente));
      }
    } finally {
      setLoading(false);
    }
  }, [buildHeaders]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = async () => {
    setStatusMsg('Salvando réguas...');
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/pos-venda', {
      method: 'PUT',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({ posVendaAtivo: ativo, googleReviewUrl: googleUrl, regras }),
    });
    const d = await res.json();
    setStatusMsg(res.ok && d.ok ? 'Réguas e configuração salvas!' : d.error || 'Erro ao salvar.');
    carregar();
  };

  const disparar = async (dryRun: boolean) => {
    setExecutando(true);
    setStatusMsg(dryRun ? 'Simulando fila...' : 'Disparando mensagens elegíveis no WhatsApp...');
    try {
      const h = await buildHeaders();
      const res = await fetch('/api/crm-bridge/pos-venda', {
        method: 'POST',
        headers: h,
        credentials: 'include',
        body: JSON.stringify({ dryRun, limit: 20 }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setStatusMsg(
          dryRun
            ? `Simulação: ${d.totalElegiveis} cliente(s) elegível(is) hoje.`
            : `Disparo concluído: ${d.enviados} enviado(s), ${d.erros} erro(s) de ${d.totalElegiveis} elegíveis.`
        );
        carregar();
      } else {
        setStatusMsg(d.error || 'Erro ao executar.');
      }
    } finally {
      setExecutando(false);
    }
  };

  return (
    <div className="space-y-4">
      {migrationPendente && (
        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Execute <code>supabase/migrations/20261121_phonecenter_crm_completo.sql</code> para persistir
          réguas e log de disparos.
        </div>
      )}

      {statusMsg && (
        <div className="p-3 rounded-xl bg-[#0066FF]/15 border border-[#0066FF]/40 text-blue-200 text-xs">
          {statusMsg}
        </div>
      )}

      <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-white cursor-pointer">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="accent-[#0066FF] w-4 h-4"
            />
            Motor PhoneCenter Turbo IA Ativo (D+0, D+7 Google, Recompra Upgrade, Garantia)
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => disparar(true)}
              disabled={executando}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200"
            >
              Simular Elegíveis
            </button>
            <button
              onClick={() => disparar(false)}
              disabled={executando}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1"
            >
              <Play className="w-3.5 h-3.5" /> Disparar Agora ({elegiveis.length})
            </button>
            <button
              onClick={salvar}
              className="px-3.5 py-1.5 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-xs font-semibold text-white flex items-center gap-1"
            >
              <Save className="w-3.5 h-3.5" /> Salvar
            </button>
          </div>
        </div>

        <input
          value={googleUrl}
          onChange={(e) => setGoogleUrl(e.target.value)}
          placeholder="Link de avaliação do Google Meu Negócio (usado na régua D+7)"
          className="w-full px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-xs text-white"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400 text-xs">Carregando réguas...</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-3">
          {regras.map((regra, idx) => (
            <div
              key={regra.tipo}
              className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#007BFF]" />
                    {regra.titulo}
                  </div>
                  <div className="text-[11px] text-slate-400">{regra.descricao}</div>
                </div>
                <input
                  type="checkbox"
                  checked={regra.ativo}
                  onChange={(e) => {
                    const copy = [...regras];
                    copy[idx] = { ...regra, ativo: e.target.checked };
                    setRegras(copy);
                  }}
                  className="accent-[#0066FF] w-4 h-4 shrink-0"
                />
              </div>

              <div className="flex items-center gap-3 text-[11px] text-slate-300">
                <label className="flex items-center gap-1.5">
                  Dias:
                  <input
                    type="number"
                    value={regra.dias_apos}
                    onChange={(e) => {
                      const copy = [...regras];
                      copy[idx] = { ...regra, dias_apos: Number(e.target.value) || 0 };
                      setRegras(copy);
                    }}
                    className="w-16 px-2 py-1 rounded bg-[#090d16] border border-white/10 text-white"
                  />
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regra.incluir_avaliacao_upgrade}
                    onChange={(e) => {
                      const copy = [...regras];
                      copy[idx] = { ...regra, incluir_avaliacao_upgrade: e.target.checked };
                      setRegras(copy);
                    }}
                    className="accent-[#0066FF]"
                  />
                  Calcular avaliação de troca automática
                </label>
              </div>

              <textarea
                rows={3}
                value={regra.template_mensagem}
                onChange={(e) => {
                  const copy = [...regras];
                  copy[idx] = { ...regra, template_mensagem: e.target.value };
                  setRegras(copy);
                }}
                className="w-full p-2.5 rounded-xl bg-[#090d16] border border-white/10 text-xs text-slate-200"
              />
            </div>
          ))}
        </div>
      )}

      {disparos.length > 0 && (
        <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-2">
          <div className="font-bold text-white text-xs">Últimos Disparos Registrados</div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {disparos.map((d) => (
              <div
                key={String(d.id)}
                className="p-2 rounded-lg bg-[#090d16] border border-white/5 flex items-center justify-between text-[11px]"
              >
                <div className="truncate pr-2">
                  <strong className="text-blue-300">[{String(d.regra_tipo)}]</strong>{' '}
                  <span className="text-white">{String(d.cliente_nome)}</span> —{' '}
                  <span className="text-slate-400">{String(d.mensagem).slice(0, 70)}...</span>
                </div>
                <span
                  className={
                    d.status === 'enviado' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'
                  }
                >
                  {String(d.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RodizioSection({ buildHeaders }: SectionProps) {
  const [regras, setRegras] = useState<
    Array<{
      setor: string;
      ativo: boolean;
      limite_simultaneo: number;
      respeitar_online: boolean;
      horario_inicio: string;
      horario_fim: string;
      agentes: Array<{ nome: string; ativo?: boolean } | string>;
      ultimo_indice: number;
    }>
  >([]);
  const [equipe, setEquipe] = useState<string[]>([]);
  const [novoAgente, setNovoAgente] = useState<Record<string, string>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/rodizio', { headers: h, credentials: 'include' });
    const d = await res.json();
    if (res.ok && d.ok) {
      setRegras(d.regras || []);
      setEquipe(d.equipeDisponivel || []);
    }
  }, [buildHeaders]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvarRegra = async (regra: (typeof regras)[number]) => {
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/rodizio', {
      method: 'PUT',
      headers: h,
      credentials: 'include',
      body: JSON.stringify(regra),
    });
    const d = await res.json();
    setStatusMsg(res.ok && d.ok ? `Rodízio "${regra.setor}" salvo!` : d.error || 'Erro ao salvar.');
    carregar();
  };

  const testarProximo = async (setor: string) => {
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/rodizio', {
      method: 'POST',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({ setor }),
    });
    const d = await res.json();
    setStatusMsg(
      d.agenteSelecionado
        ? `Próximo da fila em ${setor}: ${d.agenteSelecionado}`
        : `Fallback em ${setor}: ${d.motivoFallback || d.error || 'configure agentes e salve primeiro'}`
    );
    carregar();
  };

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className="p-3 rounded-xl bg-[#0066FF]/15 border border-[#0066FF]/40 text-blue-200 text-xs">
          {statusMsg}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {regras.map((regra, idx) => {
          const listaNomes = regra.agentes.map((a) => (typeof a === 'string' ? a : a.nome));
          return (
            <div
              key={regra.setor}
              className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#007BFF]" />
                  {regra.setor}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regra.ativo}
                    onChange={(e) => {
                      const copy = [...regras];
                      copy[idx] = { ...regra, ativo: e.target.checked };
                      setRegras(copy);
                    }}
                    className="accent-[#0066FF]"
                  />
                  Ativo
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400">Início</label>
                  <input
                    value={regra.horario_inicio}
                    onChange={(e) => {
                      const copy = [...regras];
                      copy[idx] = { ...regra, horario_inicio: e.target.value };
                      setRegras(copy);
                    }}
                    className="w-full mt-0.5 px-2 py-1 rounded bg-[#090d16] border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Fim</label>
                  <input
                    value={regra.horario_fim}
                    onChange={(e) => {
                      const copy = [...regras];
                      copy[idx] = { ...regra, horario_fim: e.target.value };
                      setRegras(copy);
                    }}
                    className="w-full mt-0.5 px-2 py-1 rounded bg-[#090d16] border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Limite simultâneo</label>
                  <input
                    type="number"
                    value={regra.limite_simultaneo}
                    onChange={(e) => {
                      const copy = [...regras];
                      copy[idx] = { ...regra, limite_simultaneo: Number(e.target.value) || 8 };
                      setRegras(copy);
                    }}
                    className="w-full mt-0.5 px-2 py-1 rounded bg-[#090d16] border border-white/10 text-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={regra.respeitar_online}
                  onChange={(e) => {
                    const copy = [...regras];
                    copy[idx] = { ...regra, respeitar_online: e.target.checked };
                    setRegras(copy);
                  }}
                  className="accent-[#0066FF]"
                />
                Respeitar status Online (pular Ausente/Offline)
              </label>

              <div className="space-y-1.5">
                <div className="text-[11px] text-slate-400">Agentes na fila:</div>
                <div className="flex flex-wrap gap-1.5">
                  {listaNomes.map((nome) => (
                    <span
                      key={nome}
                      className="px-2 py-1 rounded-full bg-[#0066FF]/20 border border-[#0066FF]/40 text-blue-200 text-[11px] flex items-center gap-1.5"
                    >
                      {nome}
                      <button
                        onClick={() => {
                          const copy = [...regras];
                          copy[idx] = {
                            ...regra,
                            agentes: listaNomes.filter((n) => n !== nome),
                          };
                          setRegras(copy);
                        }}
                        className="text-red-300 hover:text-red-200"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {listaNomes.length === 0 && (
                    <span className="text-[11px] text-slate-500">Nenhum agente na fila</span>
                  )}
                </div>

                <div className="flex gap-1.5 pt-1">
                  <input
                    list={`equipe-${idx}`}
                    value={novoAgente[regra.setor] || ''}
                    onChange={(e) =>
                      setNovoAgente((prev) => ({ ...prev, [regra.setor]: e.target.value }))
                    }
                    placeholder="Adicionar vendedor/técnico..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-white/10 text-xs text-white"
                  />
                  <datalist id={`equipe-${idx}`}>
                    {equipe.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                  <button
                    onClick={() => {
                      const val = (novoAgente[regra.setor] || '').trim();
                      if (!val || listaNomes.includes(val)) return;
                      const copy = [...regras];
                      copy[idx] = { ...regra, agentes: [...listaNomes, val] };
                      setRegras(copy);
                      setNovoAgente((prev) => ({ ...prev, [regra.setor]: '' }));
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => salvarRegra(regra)}
                  className="flex-1 py-1.5 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-xs font-semibold text-white"
                >
                  Salvar {regra.setor}
                </button>
                <button
                  onClick={() => testarProximo(regra.setor)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200"
                >
                  Testar Próximo
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CampanhasSection({ buildHeaders }: SectionProps) {
  const [campanhas, setCampanhas] = useState<Array<Record<string, unknown>>>([]);
  const [segmentos, setSegmentos] = useState<Array<{ id: string; label: string; total: number }>>([]);
  const [nome, setNome] = useState('');
  const [segmento, setSegmento] = useState('upgrade_iphones_antigos');
  const [mensagem, setMensagem] = useState(
    'Olá {{cliente}}! Aqui é da {{loja}}. Estamos com condição especial de upgrade para iPhone 15 e 16 aceitando seu usado na troca. Quer simular?'
  );
  const [delayMin, setDelayMin] = useState('25');
  const [delayMax, setDelayMax] = useState('65');
  const [limiteDiario, setLimiteDiario] = useState('80');
  const [janelaInicio, setJanelaInicio] = useState('09:00');
  const [janelaFim, setJanelaFim] = useState('19:00');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/campanhas', { headers: h, credentials: 'include' });
    const d = await res.json();
    if (res.ok && d.ok) {
      setCampanhas(d.campanhas || []);
      setSegmentos(d.segmentos || []);
    }
  }, [buildHeaders]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criarCampanha = async () => {
    if (!nome.trim() || !mensagem.trim()) return;
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/campanhas', {
      method: 'POST',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({
        nome,
        segmento,
        mensagem,
        delayMinSeg: Number(delayMin) || 25,
        delayMaxSeg: Number(delayMax) || 65,
        limiteDiario: Number(limiteDiario) || 80,
        janelaInicio,
        janelaFim,
      }),
    });
    const d = await res.json();
    if (res.ok && d.ok) {
      setNome('');
      setStatusMsg(`Campanha criada (${d.totalAlvo} destinatários no segmento).`);
      carregar();
    } else {
      setStatusMsg(d.error || 'Erro ao criar campanha.');
    }
  };

  const acaoCampanha = async (id: string, action: 'disparar_lote' | 'pausar') => {
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/campanhas', {
      method: 'PATCH',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({ id, action, tamanhoLote: 10 }),
    });
    const d = await res.json();
    if (res.ok && d.ok) {
      setStatusMsg(
        action === 'disparar_lote'
          ? `Lote executado: ${d.enviadosAgora ?? 0} enviado(s), ${d.errosAgora ?? 0} erro(s).`
          : 'Campanha pausada.'
      );
      carregar();
    } else {
      setStatusMsg(d.error || 'Erro na ação.');
    }
  };

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className="p-3 rounded-xl bg-[#0066FF]/15 border border-[#0066FF]/40 text-blue-200 text-xs">
          {statusMsg}
        </div>
      )}

      <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-3">
        <div className="font-bold text-white text-sm flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-[#007BFF]" />
          Nova Campanha Segmentada (Proteção Anti-Ban)
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da campanha (ex: Upgrade Novembro)"
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-xs text-white"
          />
          <select
            value={segmento}
            onChange={(e) => setSegmento(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-xs text-white"
          >
            {segmentos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.total} contatos)
              </option>
            ))}
          </select>
        </div>

        <textarea
          rows={3}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          className="w-full p-3 rounded-xl bg-[#090d16] border border-white/10 text-xs text-white"
        />

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div>
            <label className="text-[10px] text-slate-400">Delay mín (s)</label>
            <input
              type="number"
              value={delayMin}
              onChange={(e) => setDelayMin(e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 rounded bg-[#090d16] border border-white/10 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400">Delay máx (s)</label>
            <input
              type="number"
              value={delayMax}
              onChange={(e) => setDelayMax(e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 rounded bg-[#090d16] border border-white/10 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400">Limite/dia</label>
            <input
              type="number"
              value={limiteDiario}
              onChange={(e) => setLimiteDiario(e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 rounded bg-[#090d16] border border-white/10 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400">Janela início</label>
            <input
              value={janelaInicio}
              onChange={(e) => setJanelaInicio(e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 rounded bg-[#090d16] border border-white/10 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400">Janela fim</label>
            <input
              value={janelaFim}
              onChange={(e) => setJanelaFim(e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 rounded bg-[#090d16] border border-white/10 text-white"
            />
          </div>
        </div>

        <button
          onClick={criarCampanha}
          className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-xs font-semibold text-white"
        >
          Criar Campanha Segmentada
        </button>
      </div>

      <div className="space-y-2.5">
        {campanhas.map((c) => {
          const total = Number(c.total_alvo) || 0;
          const env = Number(c.total_enviados) || 0;
          const pct = total > 0 ? Math.min(100, Math.round((env / total) * 100)) : 0;
          return (
            <div
              key={String(c.id)}
              className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-1 flex-1 min-w-[220px]">
                <div className="flex items-center gap-2">
                  <strong className="text-sm text-white">{String(c.nome)}</strong>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-blue-300 uppercase">
                    {String(c.status)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {env}/{total} enviados ({pct}%) • Janela {String(c.janela_inicio)}–
                  {String(c.janela_fim)} • Delay {String(c.delay_min_seg)}–{String(c.delay_max_seg)}s
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => acaoCampanha(String(c.id), 'disparar_lote')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Disparar Lote (10)
                </button>
                <button
                  onClick={() => acaoCampanha(String(c.id), 'pausar')}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 flex items-center gap-1"
                >
                  <Pause className="w-3.5 h-3.5" /> Pausar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
