'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Save,
  Check,
  Copy,
  RefreshCw,
  Plug,
  QrCode,
  Megaphone,
  ExternalLink,
  AlertTriangle,
  ShieldCheck,
  Radio,
} from 'lucide-react';

interface LojaItem {
  id: string;
  nome: string;
}

interface InstanciaEvo {
  name: string;
  connectionStatus: string;
  ownerJid?: string | null;
  profileName?: string | null;
}

interface ConfigForm {
  crm_ativo: boolean;
  crm_frontend_url: string;
  crm_api_url: string;
  crm_access_token: string;
  evolution_instance_name: string;
  espelhar_webhook_crm: boolean;
  pix_key: string;
  pix_city: string;
  pix_provedor: 'estatico_emv' | 'mercadopago' | 'asaas';
  mercadopago_access_token: string;
  asaas_api_key: string;
  asaas_customer_id: string;
  meta_pixel_id: string;
  meta_capi_access_token: string;
  whatsapp_bio_numero: string;
}

const DEFAULT_FORM: ConfigForm = {
  crm_ativo: true,
  crm_frontend_url: 'https://crm.phonecenter.tech',
  crm_api_url: 'https://api-crm.phonecenter.tech',
  crm_access_token: '',
  evolution_instance_name: '',
  espelhar_webhook_crm: false,
  pix_key: '',
  pix_city: 'BELO HORIZONTE',
  pix_provedor: 'estatico_emv',
  mercadopago_access_token: '',
  asaas_api_key: '',
  asaas_customer_id: '',
  meta_pixel_id: '',
  meta_capi_access_token: '',
  whatsapp_bio_numero: '',
};

export default function CrmConfigPage() {
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [lojas, setLojas] = useState<LojaItem[]>([]);
  const [lojaId, setLojaId] = useState('');
  const [lojaNome, setLojaNome] = useState('');
  const [form, setForm] = useState<ConfigForm>(DEFAULT_FORM);
  const [instancias, setInstancias] = useState<InstanciaEvo[]>([]);
  const [migrationPendente, setMigrationPendente] = useState(false);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get('token') || window.localStorage.getItem('pc_crm_bridge_token') || '';
    const l = sp.get('loja_id') || '';
    if (t) {
      window.localStorage.setItem('pc_crm_bridge_token', t);
      setToken(t);
    }
    if (l) setLojaId(l);
  }, []);

  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-PhoneCenter-CRM-Key'] = token;
    if (lojaId) h['x-phonecenter-loja-id'] = lojaId;
    return h;
  }, [token, lojaId]);

  const carregarTudo = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMensagem(null);
    try {
      const qs = new URLSearchParams({ listar_lojas: '1' });
      if (lojaId) qs.set('loja_id', lojaId);

      const [cfgRes, evoRes] = await Promise.all([
        fetch(`/api/crm-bridge/config-loja?${qs.toString()}`, { headers }),
        fetch('/api/crm-bridge/conexoes', { headers }),
      ]);

      const cfgData = await cfgRes.json();
      const evoData = await evoRes.json().catch(() => ({}));

      if (!cfgRes.ok || !cfgData.ok) {
        setMensagem({ tipo: 'erro', texto: cfgData.error || 'Chave CRM_BRIDGE_SECRET inválida.' });
        return;
      }

      if (Array.isArray(cfgData.lojas)) setLojas(cfgData.lojas);
      if (cfgData.loja?.id) {
        setLojaId(cfgData.loja.id);
        setLojaNome(cfgData.loja.nome);
      }
      setMigrationPendente(Boolean(cfgData.migrationPendente));

      if (cfgData.config) {
        setForm({
          ...DEFAULT_FORM,
          ...cfgData.config,
        });
      }

      if (evoData.ok && Array.isArray(evoData.instancias)) {
        setInstancias(evoData.instancias);
      }
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro de conexão ao carregar configurações.' });
    } finally {
      setLoading(false);
    }
  }, [token, lojaId, headers]);

  useEffect(() => {
    if (token) carregarTudo();
  }, [token, lojaId, carregarTudo]);

  const salvar = async () => {
    if (!token || !lojaId) return;
    setSalvando(true);
    setMensagem(null);
    try {
      const res = await fetch('/api/crm-bridge/config-loja', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ loja_id: lojaId, ...form }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMensagem({ tipo: 'erro', texto: data.error || 'Erro ao salvar configuração.' });
        return;
      }
      setMensagem({
        tipo: 'ok',
        texto: `Configuração da loja "${lojaNome}" salva no Supabase com sucesso!`,
      });
      carregarTudo();
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Falha de rede ao salvar.' });
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async (id: string, val: string) => {
    await navigator.clipboard.writeText(val);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 1800);
  };

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://app.phonecenter.tech';

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Topo */}
        <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
              src="/logosnome.png"
              alt="PhoneCenterCRM"
              className="w-11 h-11 rounded-xl bg-[#0f172a] p-1 border border-[#0066FF]/50"
            />
            <div>
              <h1 className="text-xl font-bold text-white">
                PhoneCenter<span className="text-[#007BFF]">CRM</span> — Configuração por Loja / Instância
              </h1>
              <p className="text-xs text-slate-400">
                Cada loja guarda sua própria instância Evolution API, Chave Pix, Token CRM e Meta CAPI no Supabase.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={form.crm_frontend_url || 'https://crm.phonecenter.tech'}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-semibold flex items-center gap-1.5"
            >
              Abrir CRM <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href="/"
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold"
            >
              Voltar ao ERP
            </a>
          </div>
        </header>

        {/* Autenticação */}
        {!token && (
          <div className="p-5 rounded-2xl bg-[#0f172a] border border-[#0066FF]/40 space-y-3">
            <div className="font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#007BFF]" />
              Informe sua chave CRM_BRIDGE_SECRET
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tokenInput.trim()) {
                    window.localStorage.setItem('pc_crm_bridge_token', tokenInput.trim());
                    setToken(tokenInput.trim());
                  }
                }}
                placeholder="Digite o CRM_BRIDGE_SECRET configurado no Coolify..."
                className="flex-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/15 text-sm text-white"
              />
              <button
                onClick={() => {
                  if (tokenInput.trim()) {
                    window.localStorage.setItem('pc_crm_bridge_token', tokenInput.trim());
                    setToken(tokenInput.trim());
                  }
                }}
                className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-white text-sm font-semibold"
              >
                Entrar
              </button>
            </div>
          </div>
        )}

        {migrationPendente && (
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <strong>Migration pendente no Supabase:</strong> execute{' '}
              <code>supabase/migrations/20261120_phonecenter_crm_loja_configs.sql</code> no SQL
              Editor do Supabase para habilitar o salvamento por loja.
            </div>
          </div>
        )}

        {mensagem && (
          <div
            className={`p-3.5 rounded-xl text-sm border ${
              mensagem.tipo === 'ok'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : 'bg-red-500/15 border-red-500/40 text-red-200'
            }`}
          >
            {mensagem.texto}
          </div>
        )}

        {token && (
          <>
            {/* Seletor de Loja */}
            <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-[240px]">
                <label className="text-xs font-semibold text-slate-300 shrink-0">
                  Loja / Tenant:
                </label>
                <select
                  value={lojaId}
                  onChange={(e) => setLojaId(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/15 text-sm text-white"
                >
                  {lojas.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} ({l.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={carregarTudo}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>

            {/* Bloco 1: Instância Evolution API */}
            <section className="p-5 rounded-2xl bg-[#0f172a] border border-white/10 space-y-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                1. Instância WhatsApp (Evolution API) desta Loja
              </h2>

              <div className="grid sm:grid-cols-2 gap-3">
                {instancias.map((inst) => {
                  const selecionada = form.evolution_instance_name === inst.name;
                  const open = String(inst.connectionStatus).toLowerCase() === 'open';
                  return (
                    <button
                      key={inst.name}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, evolution_instance_name: inst.name }))
                      }
                      className={`p-3 rounded-xl text-left border transition ${
                        selecionada
                          ? 'bg-[#0066FF]/20 border-[#0066FF] text-white'
                          : 'bg-[#090d16] border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{inst.name}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                            open
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {inst.connectionStatus}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 truncate">
                        {inst.ownerJid || inst.profileName || 'Aguardando leitura de QR Code'}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Nome da Instância Evolution API</label>
                  <input
                    value={form.evolution_instance_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, evolution_instance_name: e.target.value }))
                    }
                    placeholder="ex: lucasimports ou testegui"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090d16] border border-white/10 cursor-pointer w-full">
                    <input
                      type="checkbox"
                      checked={form.espelhar_webhook_crm}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, espelhar_webhook_crm: e.target.checked }))
                      }
                      className="mt-0.5 accent-[#0066FF]"
                    />
                    <span className="text-xs text-slate-300 leading-snug">
                      <strong className="text-white block">
                        Espelhar Webhook pro CRM (Modo Seguro)
                      </strong>
                      Use se a instância já roda o bot de notinhas do PhoneCenter — encaminha cópia
                      para o CRM sem derrubar o bot!
                    </span>
                  </label>
                </div>
              </div>
            </section>

            {/* Bloco 2: URLs & Token do CRM */}
            <section className="p-5 rounded-2xl bg-[#0f172a] border border-white/10 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Plug className="w-4 h-4 text-[#007BFF]" />
                2. Instância PhoneCenterCRM desta Loja
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">URL Frontend do CRM</label>
                  <input
                    value={form.crm_frontend_url}
                    onChange={(e) => setForm((f) => ({ ...f, crm_frontend_url: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">URL API do CRM</label>
                  <input
                    value={form.crm_api_url}
                    onChange={(e) => setForm((f) => ({ ...f, crm_api_url: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">
                    Access Token do CRM (settings/access-tokens)
                  </label>
                  <input
                    value={form.crm_access_token}
                    onChange={(e) => setForm((f) => ({ ...f, crm_access_token: e.target.value }))}
                    placeholder="Opcional — usado para operações em massa de tickets"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">WhatsApp do Link na Bio (com DDI)</label>
                  <input
                    value={form.whatsapp_bio_numero}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, whatsapp_bio_numero: e.target.value }))
                    }
                    placeholder="ex: 5531999999999"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
              </div>
            </section>

            {/* Bloco 3: Pix & Pagamentos desta Loja */}
            <section className="p-5 rounded-2xl bg-[#0f172a] border border-white/10 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                3. Pix &amp; Sinal de Reserva (Exclusivo desta Loja)
              </h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Chave Pix da Loja</label>
                  <input
                    value={form.pix_key}
                    onChange={(e) => setForm((f) => ({ ...f, pix_key: e.target.value }))}
                    placeholder="CNPJ, e-mail, telefone ou aleatória"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Cidade (sem acento)</label>
                  <input
                    value={form.pix_city}
                    onChange={(e) => setForm((f) => ({ ...f, pix_city: e.target.value }))}
                    placeholder="BELO HORIZONTE"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Provedor Pix</label>
                  <select
                    value={form.pix_provedor}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pix_provedor: e.target.value as ConfigForm['pix_provedor'],
                      }))
                    }
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  >
                    <option value="estatico_emv">Pix Copia e Cola EMV (Chave Direta)</option>
                    <option value="mercadopago">Mercado Pago (Dinâmico)</option>
                    <option value="asaas">Asaas (Dinâmico)</option>
                  </select>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Mercado Pago Token (opc.)</label>
                  <input
                    value={form.mercadopago_access_token}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, mercadopago_access_token: e.target.value }))
                    }
                    placeholder="APP_USR-..."
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Asaas API Key (opc.)</label>
                  <input
                    value={form.asaas_api_key}
                    onChange={(e) => setForm((f) => ({ ...f, asaas_api_key: e.target.value }))}
                    placeholder="$aact_..."
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Asaas Customer ID (opc.)</label>
                  <input
                    value={form.asaas_customer_id}
                    onChange={(e) => setForm((f) => ({ ...f, asaas_customer_id: e.target.value }))}
                    placeholder="cus_..."
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
              </div>
            </section>

            {/* Bloco 4: Meta Ads CAPI desta Loja */}
            <section className="p-5 rounded-2xl bg-[#0f172a] border border-white/10 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-blue-400" />
                4. Meta Ads Conversions API / ROAS (Exclusivo desta Loja)
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Meta Pixel ID (opc.)</label>
                  <input
                    value={form.meta_pixel_id}
                    onChange={(e) => setForm((f) => ({ ...f, meta_pixel_id: e.target.value }))}
                    placeholder="ex: 123456789012345"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Meta CAPI Access Token (opc.)</label>
                  <input
                    value={form.meta_capi_access_token}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, meta_capi_access_token: e.target.value }))
                    }
                    placeholder="EAAG..."
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-sm text-white"
                  />
                </div>
              </div>
            </section>

            {/* Botão Salvar */}
            <div className="flex justify-end">
              <button
                onClick={salvar}
                disabled={salvando || !lojaId}
                className="px-6 py-3 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] disabled:opacity-50 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-[#0066FF]/30"
              >
                <Save className="w-4 h-4" />
                {salvando ? 'Salvando no Supabase...' : `Salvar Configuração de ${lojaNome || 'Loja'}`}
              </button>
            </div>

            {/* Links Prontos para Colar no CRM */}
            {lojaId && (
              <section className="p-5 rounded-2xl bg-[#0f172a] border border-[#0066FF]/35 space-y-3">
                <h2 className="text-sm font-bold text-white">
                  Links Prontos desta Loja (copie e cole no PhoneCenterCRM)
                </h2>
                {[
                  {
                    id: 'sidebar',
                    label: 'Dashboard App (Barra Lateral do Chat)',
                    url: `${origin}/crm-sidebar?loja_id=${lojaId}&token=${encodeURIComponent(token)}`,
                  },
                  {
                    id: 'mcp',
                    label: 'MCP Server IA (Admin > MCP Servers + header X-PhoneCenter-CRM-Key)',
                    url: `${origin}/api/crm-bridge/mcp?loja_id=${lojaId}`,
                  },
                  {
                    id: 'webhook',
                    label: 'Webhook do CRM → ERP (captura Leads CTWA & Eventos)',
                    url: `${origin}/api/crm-bridge/webhooks/evo?loja_id=${lojaId}&token=${encodeURIComponent(token)}`,
                  },
                  {
                    id: 'bio',
                    label: 'Link na Bio + Vitrine Pública da Loja',
                    url: `${origin}/bio?loja_id=${lojaId}${form.whatsapp_bio_numero ? `&wa=${form.whatsapp_bio_numero.replace(/\D/g, '')}` : ''}`,
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-[#090d16] border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-blue-300">{item.label}</div>
                      <div className="text-xs font-mono text-slate-300 truncate">{item.url}</div>
                    </div>
                    <button
                      onClick={() => copiar(item.id, item.url)}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white flex items-center gap-1 shrink-0"
                    >
                      {copiado === item.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
