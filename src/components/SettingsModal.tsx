import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  DatabaseBackup,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Palette,
  RotateCcw,
  Trash2,
  Upload,
  User,
  Volume2,
  X,
} from 'lucide-react';
import {
  BYOK_PROVIDER_ORDER,
  BYOK_PROVIDERS,
  DEFAULT_BYOK_CONFIG,
  maskApiKey,
  type ByokConfig,
  type ByokProvider,
} from '../lib/byok';
import {
  DEFAULT_APP_SETTINGS,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  RELATIONSHIP_PRESETS,
  THEME_OPTIONS,
  type AppSettings,
} from '../lib/settings';
import { isSttSupported, isTtsSupported } from '../lib/speech';

export type SettingsTabId = 'user' | 'appearance' | 'byok' | 'data';

interface SettingsModalProps {
  open: boolean;
  initialTab?: SettingsTabId;
  settings: AppSettings;
  byok: ByokConfig;
  backupSummary?: {
    personaCount: number;
    messageCount: number;
    memoryCount: number;
  };
  onChange: (next: AppSettings) => void;
  onChangeByok: (next: ByokConfig) => void;
  onDownloadBackup?: () => void;
  onRestoreBackup?: (rawJson: string) => { ok: boolean; message: string };
  onClose: () => void;
}

export function SettingsModal({
  open,
  initialTab = 'user',
  settings,
  byok,
  backupSummary,
  onChange,
  onChangeByok,
  onDownloadBackup,
  onRestoreBackup,
  onClose,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [backupNotice, setBackupNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const verifyResultRef = useRef<HTMLDivElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (verifyResult) {
      verifyResultRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [verifyResult]);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setVerifyResult(null);
      setBackupNotice(null);
      setShowApiKey(false);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const updateUser = (patch: Partial<AppSettings['user']>) => {
    onChange({
      ...settings,
      user: {
        ...settings.user,
        ...patch,
      },
    });
  };

  const updateVoice = (patch: Partial<AppSettings['voice']>) => {
    onChange({
      ...settings,
      voice: {
        ...settings.voice,
        ...patch,
      },
    });
  };

  const updateByok = (patch: Partial<ByokConfig>) => {
    setVerifyResult(null);
    onChangeByok({
      ...byok,
      ...patch,
    });
  };

  const handleSelectProvider = (provider: ByokProvider) => {
    const meta = BYOK_PROVIDERS[provider];
    setVerifyResult(null);
    onChangeByok({
      ...byok,
      provider,
      model: meta.defaultModel,
      baseUrl: meta.defaultBaseUrl,
    });
  };

  const handleVerifyKey = async () => {
    if (!byok.apiKey.trim()) {
      setVerifyResult({
        ok: false,
        message: 'Masukkan API key terlebih dahulu sebelum menguji koneksi.',
      });
      return;
    }

    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/byok/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: byok.provider,
          apiKey: byok.apiKey.trim(),
          model: byok.model.trim() || BYOK_PROVIDERS[byok.provider].defaultModel,
          baseUrl: byok.baseUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyResult({
          ok: false,
          message: data.error || `Verifikasi gagal (${res.status}).`,
        });
      } else {
        setVerifyResult({
          ok: true,
          message: data.message || 'API key valid dan terhubung.',
        });
      }
    } catch (err: unknown) {
      setVerifyResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Gagal menghubungi server verifikasi.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onRestoreBackup) return;
    try {
      const text = await file.text();
      const result = onRestoreBackup(text);
      setBackupNotice(result);
    } catch {
      setBackupNotice({ ok: false, message: 'Gagal membaca berkas cadangan JSON.' });
    }
  };

  const activeProviderMeta = BYOK_PROVIDERS[byok.provider];
  const ttsReady = isTtsSupported();
  const sttReady = isSttSupported();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-border)] px-6 py-4">
          <h2 id="settings-modal-title" className="font-display text-lg font-bold">
            Pengaturan Aplikasi &amp; Preferensi
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-[var(--app-border)] px-4 py-3 sm:px-6">
          <div
            role="tablist"
            aria-label="Kategori pengaturan"
            className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--app-surface-alt)] p-1 sm:grid-cols-4"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'user'}
              onClick={() => setActiveTab('user')}
              className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'user'
                  ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
              }`}
            >
              <User className="h-3.5 w-3.5 shrink-0" />
              <span>Preferensi</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'appearance'}
              onClick={() => setActiveTab('appearance')}
              className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'appearance'
                  ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
              }`}
            >
              <Palette className="h-3.5 w-3.5 shrink-0" />
              <span>Tampilan</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'byok'}
              onClick={() => setActiveTab('byok')}
              className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'byok'
                  ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5 shrink-0" />
              <span>BYOK</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'data'}
              onClick={() => setActiveTab('data')}
              className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'data'
                  ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
              }`}
            >
              <DatabaseBackup className="h-3.5 w-3.5 shrink-0" />
              <span>Cadangan &amp; Suara</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {activeTab === 'user' && (
            <div className="space-y-5">
              <p className="text-xs leading-relaxed text-[var(--app-text-muted)]">
                Informasi ini disertakan dalam konteks percakapan sehingga setiap persona mengenali nama panggilan Anda dan menyesuaikan sikap sesuai hubungan yang dipilih.
              </p>

              <div>
                <label htmlFor="settings-user-name" className="block text-xs font-semibold">
                  Nama Anda
                </label>
                <input
                  id="settings-user-name"
                  type="text"
                  value={settings.user.userName}
                  onChange={(e) => updateUser({ userName: e.target.value })}
                  placeholder="Contoh: Fahmi (kosongkan jika tidak ingin disebut)"
                  className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2.5">
                <label htmlFor="settings-relationship" className="block text-xs font-semibold">
                  Hubungan dengan Persona
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {RELATIONSHIP_PRESETS.map((rel) => {
                    const active = settings.user.relationship === rel;
                    return (
                      <button
                        key={rel}
                        type="button"
                        onClick={() => updateUser({ relationship: rel })}
                        className={`min-h-[34px] rounded-lg border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          active
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-[var(--app-border)] bg-[var(--app-surface-alt)] text-[var(--app-text)] hover:border-indigo-400'
                        }`}
                      >
                        {rel}
                      </button>
                    );
                  })}
                </div>
                <input
                  id="settings-relationship"
                  type="text"
                  value={settings.user.relationship}
                  onChange={(e) => updateUser({ relationship: e.target.value })}
                  placeholder="Atau ketik hubungan khusus (mis. Kakak Kelas, Asisten Pribadi)"
                  className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="settings-custom-note" className="block text-xs font-semibold">
                  Catatan Konteks Tambahan (Opsional)
                </label>
                <textarea
                  id="settings-custom-note"
                  rows={3}
                  value={settings.user.customNote}
                  onChange={(e) => updateUser({ customNote: e.target.value })}
                  placeholder="Contoh: Gunakan sapaan santai aku/kamu, atau suka berdiskusi tentang riset teknologi."
                  className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              {/* Tema Tampilan */}
              <section aria-label="Pilih tema tampilan" className="space-y-2.5">
                <div className="text-xs font-semibold">Tema Tampilan Aplikasi</div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {THEME_OPTIONS.map((t) => {
                    const selected = settings.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange({ ...settings, theme: t.id })}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                          selected
                            ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-500/10'
                            : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:border-indigo-400'
                        }`}
                      >
                        <div
                          aria-hidden="true"
                          style={{ backgroundColor: t.swatchBg, borderColor: t.swatchAccent }}
                          className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border"
                        >
                          <div
                            style={{ backgroundColor: t.swatchSurface }}
                            className="flex h-6 w-8 items-center justify-center rounded-sm"
                          >
                            <span
                              style={{ backgroundColor: t.swatchAccent }}
                              className="h-2 w-4 rounded-xs"
                            />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">{t.label}</div>
                          <div className="truncate text-xs text-[var(--app-text-muted)]">
                            {t.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Jenis Font */}
              <section aria-label="Pilih jenis font" className="space-y-2.5">
                <div className="text-xs font-semibold">Jenis Huruf (Font)</div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {FONT_OPTIONS.map((f) => {
                    const selected = settings.font === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange({ ...settings, font: f.id })}
                        style={{ fontFamily: f.cssFamily }}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          selected
                            ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-500/10'
                            : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:border-indigo-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{f.label}</span>
                          <span className="text-[11px] text-[var(--app-text-muted)]">
                            {f.category}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-[var(--app-text-muted)]">
                          {f.sampleText}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Ukuran Huruf */}
              <section aria-label="Pilih ukuran huruf" className="space-y-2.5">
                <div className="text-xs font-semibold">Ukuran Huruf</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {FONT_SIZE_OPTIONS.map((sz) => {
                    const selected = settings.fontSize === sz.id;
                    return (
                      <button
                        key={sz.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange({ ...settings, fontSize: sz.id })}
                        className={`min-h-[42px] rounded-xl border px-3 py-2 text-center transition-colors ${
                          selected
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-[var(--app-border)] bg-[var(--app-surface-alt)] text-[var(--app-text)] hover:border-indigo-400'
                        }`}
                      >
                        <div className="text-xs font-semibold whitespace-nowrap">{sz.label}</div>
                        <div
                          className={`font-mono text-[11px] tabular-nums ${
                            selected ? 'text-indigo-100' : 'text-[var(--app-text-muted)]'
                          }`}
                        >
                          {sz.px}px
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Pratinjau Langsung */}
              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-4">
                <div className="text-[11px] font-medium text-[var(--app-text-muted)]">
                  Pratinjau Teks Obrolan
                </div>
                <p className="mt-1.5 text-sm leading-relaxed">
                  {settings.user.userName.trim()
                    ? `“Halo ${settings.user.userName.trim()}, sebagai ${settings.user.relationship || 'Rekan Diskusi'}, aku siap membahas topik apa pun hari ini.”`
                    : `“Halo, sebagai ${settings.user.relationship || 'Rekan Diskusi'}, aku siap membahas topik apa pun hari ini.”`}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'byok' && (
            <div className="space-y-5">
              <p className="text-xs leading-relaxed text-[var(--app-text-muted)]">
                Gunakan API key Anda sendiri (Bring Your Own Key) untuk percakapan dan analisa tokoh dari web. Kunci hanya disimpan di browser lokal Anda dan diteruskan per permintaan melalui proxy server tanpa disimpan di database server.
              </p>

              {/* Mode Kunci */}
              <section aria-label="Mode sumber API key" className="space-y-2">
                <div className="text-xs font-semibold">Sumber Kunci AI</div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={!byok.enabled}
                    onClick={() => updateByok({ enabled: false })}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      !byok.enabled
                        ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-500/10'
                        : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:border-indigo-400'
                    }`}
                  >
                    <div className="text-sm font-semibold">Bawaan Server</div>
                    <div className="mt-0.5 text-xs text-[var(--app-text-muted)]">
                      Memakai kuota default yang terkonfigurasi di server.
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-pressed={byok.enabled}
                    onClick={() => updateByok({ enabled: true })}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      byok.enabled
                        ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-500/10'
                        : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:border-indigo-400'
                    }`}
                  >
                    <div className="text-sm font-semibold">Gunakan Kunci Sendiri (BYOK)</div>
                    <div className="mt-0.5 text-xs text-[var(--app-text-muted)]">
                      {byok.apiKey.trim()
                        ? `Tersimpan: ${maskApiKey(byok.apiKey)}`
                        : 'Masukkan kunci Gemini, OpenAI, atau provider lain.'}
                    </div>
                  </button>
                </div>
              </section>

              {/* Konfigurasi Provider BYOK */}
              <div className="space-y-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold">Provider AI</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {BYOK_PROVIDER_ORDER.map((pid) => {
                      const meta = BYOK_PROVIDERS[pid];
                      const selected = byok.provider === pid;
                      return (
                        <button
                          key={pid}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => handleSelectProvider(pid)}
                          className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                            selected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-indigo-400'
                          }`}
                        >
                          <div className="text-xs font-semibold whitespace-nowrap">{meta.label}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--app-text-muted)]">
                    {activeProviderMeta.description}
                  </p>
                </div>

                {/* API Key Input */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="byok-api-key" className="block text-xs font-semibold">
                      API Key ({activeProviderMeta.label})
                    </label>
                    {byok.apiKey && (
                      <button
                        type="button"
                        onClick={() => updateByok({ apiKey: '', enabled: false })}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Hapus Kunci</span>
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      id="byok-api-key"
                      type={showApiKey ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      value={byok.apiKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateByok({
                          apiKey: val,
                          enabled: val.trim().length > 0 ? true : byok.enabled,
                        });
                      }}
                      placeholder={activeProviderMeta.keyPlaceholder}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 font-mono text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((s) => !s)}
                      aria-label={showApiKey ? 'Sembunyikan API key' : 'Tampilkan API key'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Base URL */}
                {byok.provider === 'openai-compatible' && (
                  <div>
                    <label htmlFor="byok-base-url" className="block text-xs font-semibold">
                      Endpoint Base URL (/v1)
                    </label>
                    <input
                      id="byok-base-url"
                      type="text"
                      value={byok.baseUrl}
                      onChange={(e) => updateByok({ baseUrl: e.target.value })}
                      placeholder="https://api.groq.com/openai/v1"
                      className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 font-mono text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                      {[
                        { label: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
                        { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
                        { label: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() =>
                            updateByok({ baseUrl: preset.url, model: preset.model })
                          }
                          className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-medium text-[var(--app-text)] hover:border-indigo-400"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Model Selector */}
                <div className="space-y-2">
                  <label htmlFor="byok-model-input" className="block text-xs font-semibold">
                    Nama Model
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {activeProviderMeta.suggestedModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updateByok({ model: m })}
                        className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                          byok.model === m
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-indigo-400'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <input
                    id="byok-model-input"
                    type="text"
                    value={byok.model}
                    onChange={(e) => updateByok({ model: e.target.value })}
                    placeholder={activeProviderMeta.defaultModel}
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 font-mono text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Verifikasi Koneksi */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] pt-3">
                  <button
                    type="button"
                    disabled={isVerifying || !byok.apiKey.trim()}
                    onClick={handleVerifyKey}
                    className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--app-text)] transition-colors hover:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Menguji Koneksi...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Uji Koneksi Key</span>
                      </>
                    )}
                  </button>

                  {byok.enabled && !byok.apiKey.trim() && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400">
                      Masukkan API key untuk mengaktifkan BYOK.
                    </span>
                  )}
                </div>

                {verifyResult && (
                  <div
                    ref={verifyResultRef}
                    role="status"
                    className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                      verifyResult.ok
                        ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
                        : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    {verifyResult.message}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              {/* Cadangan Data Lengkap */}
              <section
                aria-label="Cadangan data aplikasi"
                className="space-y-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-4"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                  <DatabaseBackup className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Cadangan Data Lengkap</span>
                </div>
                <p className="text-xs leading-relaxed text-[var(--app-text-muted)]">
                  Simpan seluruh daftar persona, foto profil, aturan emosi, memori, preferensi tampilan, dan riwayat percakapan ke dalam satu berkas JSON, lalu pulihkan kapan saja di perangkat ini atau perangkat lain.
                </p>

                {backupSummary && (
                  <div className="font-mono text-xs text-[var(--app-text)] tabular-nums">
                    {backupSummary.personaCount} persona · {backupSummary.messageCount} pesan ·{' '}
                    {backupSummary.memoryCount} ingatan tersimpan
                  </div>
                )}

                <div className="flex flex-wrap gap-2.5 pt-1">
                  {onDownloadBackup && (
                    <button
                      type="button"
                      onClick={() => {
                        onDownloadBackup();
                        setBackupNotice({
                          ok: true,
                          message: 'Berkas cadangan lengkap (.json) berhasil diunduh.',
                        });
                      }}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Unduh Cadangan (.json)</span>
                    </button>
                  )}

                  {onRestoreBackup && (
                    <>
                      <input
                        ref={restoreInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleRestoreFile}
                        aria-label="Pilih berkas cadangan JSON untuk dipulihkan"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setBackupNotice(null);
                          restoreInputRef.current?.click();
                        }}
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-xs font-semibold text-[var(--app-text)] transition-colors hover:border-indigo-400 whitespace-nowrap"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Pulihkan dari Cadangan</span>
                      </button>
                    </>
                  )}
                </div>

                {backupNotice && (
                  <div
                    role="status"
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      backupNotice.ok
                        ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
                        : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    {backupNotice.message}
                  </div>
                )}
              </section>

              {/* Mode Suara */}
              <section
                aria-label="Pengaturan mode suara"
                className="space-y-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-4"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                  <Volume2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Mode Suara (TTS &amp; Mikrofon)</span>
                </div>

                <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
                  <div>
                    <div className="text-xs font-semibold text-[var(--app-text)]">
                      Bacakan respons persona otomatis
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--app-text-muted)]">
                      Setiap jawaban baru dari AI akan langsung dibacakan sesuai nada suasana emosi saat itu.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.voice.autoSpeak}
                    onChange={(e) => updateVoice({ autoSpeak: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--app-border)] text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="voice-rate-slider" className="font-semibold text-[var(--app-text)]">
                      Kecepatan Bicara Dasar
                    </label>
                    <span className="font-mono font-semibold text-[var(--app-text)] tabular-nums">
                      {settings.voice.speechRate.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    id="voice-rate-slider"
                    type="range"
                    min={0.7}
                    max={1.5}
                    step={0.05}
                    value={settings.voice.speechRate}
                    onChange={(e) => updateVoice({ speechRate: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-[var(--app-text-muted)]">
                    <span>Pelan (0.70x)</span>
                    <span>Cepat (1.50x)</span>
                  </div>
                </div>

                <div className="text-[11px] text-[var(--app-text-muted)]">
                  Dukungan browser: Output suara (TTS) {ttsReady ? 'tersedia' : 'tidak tersedia'} ·
                  Input mikrofon (STT) {sttReady ? 'tersedia' : 'tidak didukung di browser ini'}.
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-6 py-4">
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'byok') {
                setVerifyResult(null);
                onChangeByok(DEFAULT_BYOK_CONFIG);
              } else {
                onChange(DEFAULT_APP_SETTINGS);
              }
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3.5 py-2 text-xs font-medium text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)] whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{activeTab === 'byok' ? 'Reset BYOK' : 'Reset Default'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
          >
            Simpan &amp; Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
