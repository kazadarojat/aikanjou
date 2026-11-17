import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  Edit2,
  Edit3,
  FileJson,
  FileText,
  KeyRound,
  Menu,
  Mic,
  MicOff,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  detectConversationIntensity,
  EMOTION_META,
  EMOTION_ORDER,
  getDominantEmotion,
  type Archetype,
  type EmotionKey,
  type EmotionState,
  type Persona,
} from '../lib/emotionEngine';
import type { HistorySearchResult, SessionMessage } from '../lib/sessionUtils';
import {
  getSpeechRecognitionCtor,
  isSttSupported,
  isTtsSupported,
  type SpeechRecognitionLike,
} from '../lib/speech';
import { InteractiveKaomoji } from './InteractiveKaomoji';
import { PersonaAvatar } from './PersonaAvatar';

export type ChatMessage = SessionMessage;

interface ChatWorkspaceProps {
  persona: Persona;
  messages: ChatMessage[];
  currentEmotions: EmotionState;
  currentKaomoji: string;
  isSending: boolean;
  error: string | null;
  onDismissError: () => void;
  onSendMessage: (text: string) => void;
  onEditMessage: (messageId: string, newContent: string, resendAfterEdit?: boolean) => void;
  onDeleteMessage: (messageId: string) => void;
  onRegenerateMessage: (messageId: string) => void;
  searchQuery: string;
  searchScope: 'active' | 'all';
  searchResults: HistorySearchResult[];
  highlightedMessageId: string | null;
  onChangeSearchQuery: (q: string) => void;
  onChangeSearchScope: (scope: 'active' | 'all') => void;
  onJumpToSearchResult: (result: HistorySearchResult) => void;
  autoSpeak: boolean;
  speakingMessageId: string | null;
  onToggleAutoSpeak: () => void;
  onSpeakMessage: (msg: ChatMessage) => void;
  onStopSpeaking: () => void;
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
  onOpenByok?: () => void;
  onEditPersona: () => void;
  onResetChat: () => void;
  onExportLog: (format: 'txt' | 'json') => void;
  mobileView: 'chat' | 'telemetry';
  onChangeMobileView: (view: 'chat' | 'telemetry') => void;
  mobileTelemetrySlot?: ReactNode;
  isDark?: boolean;
  byokLabel?: string | null;
  userPreferences?: {
    userName: string;
    relationship: string;
  };
}

const ARCHETYPE_STARTERS: Record<Archetype, string[]> = {
  Tsundere: [
    'Kamu hebat banget hari ini, makasih ya sudah bantu!',
    'Aku bingung nih sama masalah ini, jelaskan pelan-pelan dong.',
    'Kayaknya idemu tadi kurang tepat deh, coba pikir ulang!',
  ],
  Yandere: [
    'Maaf baru balas, aku seharian ngobrol sama teman lama.',
    'Aku paling nyaman cerita cuma sama kamu kok.',
    'Kamu selalu memperhatikan hal kecil ya, makasih sudah peduli.',
  ],
  Kuudere: [
    'Bagaimana analisismu tentang keputusan paling rasional hari ini?',
    'Kenapa manusia sering membuat keputusan yang penuh drama?',
    'Terima kasih, penjelasanmu sangat ringkas dan membantu.',
  ],
  Dandere: [
    'Hai, maaf kalau tiba-tiba mengganggu, kamu lagi sibuk?',
    'Pendapatmu kemarin sebenarnya keren banget lho!',
    'Pelan-pelan saja ceritanya, aku siap mendengarkan.',
  ],
  Genki: [
    'Ayo kita buat proyek baru yang seru hari ini!!',
    'Aku lagi kurang bersemangat nih, punya ide biar ceria lagi?',
    'Keren banget sih energi kamu hari ini!',
  ],
  Stoik: [
    'Bagaimana cara tetap tenang saat situasi di luar kendali?',
    'Hari ini semuanya terasa berantakan dan bikin kesal!',
    'Menurutmu apa hal paling penting untuk difokuskan sekarang?',
  ],
  Melankolis: [
    'Pernah merasa hari berjalan cepat tapi rasanya hampa?',
    'Terima kasih sudah mau mendengarkan tanpa menghakimi.',
    'Kenangan mana yang menurutmu paling sulit dilupakan?',
  ],
  Kustom: [
    'Halo, ceritakan sedikit tentang dirimu dan cara pandangmu!',
    'Hari ini aku punya kabar yang sangat mengejutkan!!',
    'Menurutmu apa reaksi terbaik saat menghadapi kritik tajam?',
  ],
};

export function ChatWorkspace({
  persona,
  messages,
  currentEmotions,
  currentKaomoji,
  isSending,
  error,
  onDismissError,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onRegenerateMessage,
  searchQuery,
  searchScope,
  searchResults,
  highlightedMessageId,
  onChangeSearchQuery,
  onChangeSearchScope,
  onJumpToSearchResult,
  autoSpeak,
  speakingMessageId,
  onToggleAutoSpeak,
  onSpeakMessage,
  onStopSpeaking,
  onOpenSidebar,
  onOpenSettings,
  onOpenByok,
  onEditPersona,
  onResetChat,
  onExportLog,
  mobileView,
  onChangeMobileView,
  mobileTelemetrySlot,
  isDark = false,
  byokLabel,
  userPreferences,
}: ChatWorkspaceProps) {
  const [input, setInput] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportSuccessNotice, setExportSuccessNotice] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const liveIntensity = useMemo(() => detectConversationIntensity(input), [input]);
  const dominant = getDominantEmotion(currentEmotions);
  const dominantMeta = EMOTION_META[dominant.key];
  const starters = ARCHETYPE_STARTERS[persona.archetype] || ARCHETYPE_STARTERS.Kustom;
  const ttsAvailable = isTtsSupported();
  const sttAvailable = isSttSupported();

  useEffect(() => {
    if (highlightedMessageId && msgRefs.current[highlightedMessageId]) {
      msgRefs.current[highlightedMessageId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [highlightedMessageId, messages.length]);

  useEffect(() => {
    if (!highlightedMessageId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isSending, highlightedMessageId]);

  useEffect(() => {
    setEditingMsgId(null);
    setEditingText('');
  }, [persona.id]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleKeyDownWindow = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDownWindow);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDownWindow);
    };
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!exportSuccessNotice) return;
    const timer = setTimeout(() => setExportSuccessNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [exportSuccessNotice]);

  const handleSelectExport = (format: 'txt' | 'json') => {
    onExportLog(format);
    setExportMenuOpen(false);
    setExportSuccessNotice(
      format === 'txt'
        ? `Log .txt berhasil diunduh (${messages.length} pesan).`
        : `Log .json berhasil diunduh (${messages.length} pesan).`
    );
  };

  const handleToggleMic = () => {
    setVoiceError(null);
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceError('Input suara mikrofon belum didukung di browser ini. Gunakan Chrome/Edge terbaru.');
      return;
    }

    try {
      const rec = new Ctor();
      rec.lang = 'id-ID';
      rec.interimResults = true;
      rec.continuous = false;
      const baseInput = input.trim();

      rec.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0]?.transcript || '';
        }
        const combined = baseInput ? `${baseInput} ${transcript.trim()}` : transcript.trim();
        setInput(combined);
      };

      rec.onerror = (ev) => {
        setIsListening(false);
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setVoiceError('Izin mikrofon ditolak. Aktifkan izin mikrofon pada browser Anda.');
        } else {
          setVoiceError(`Input suara terhenti (${ev.error || 'gangguan mikrofon'}).`);
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
      setVoiceError('Tidak dapat memulai perekaman mikrofon.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const getEmotionLabelColor = (key: EmotionKey) =>
    isDark ? EMOTION_META[key].color : EMOTION_META[key].textColor;

  const hasUserContext =
    Boolean(userPreferences?.userName?.trim()) || Boolean(userPreferences?.relationship?.trim());

  const startEditMsg = (msg: ChatMessage) => {
    setEditingMsgId(msg.id);
    setEditingText(msg.content);
  };

  const saveEditMsg = (msgId: string, resend: boolean) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    onEditMessage(msgId, trimmed, resend);
    setEditingMsgId(null);
    setEditingText('');
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[var(--app-bg)] text-[var(--app-text)]">
      {/* Header Workspace */}
      <header className="flex items-center justify-between gap-1.5 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-3 sm:gap-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Buka daftar persona"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-surface-alt)] sm:h-10 sm:w-10 lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <PersonaAvatar name={persona.name} avatarUrl={persona.avatarUrl} size="md" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-sm font-bold text-[var(--app-text)] sm:text-lg">
                {persona.name}
              </h1>
              <span className="hidden shrink-0 sm:inline-flex">
                <InteractiveKaomoji
                  variant="inline"
                  kaomoji={currentKaomoji}
                  dominant={dominant.key}
                  archetype={persona.archetype}
                  isDark={isDark}
                />
              </span>
            </div>
            <div className="flex items-center gap-1.5 truncate text-[11px] sm:text-xs text-[var(--app-text-muted)]">
              <span className="font-mono font-medium text-[var(--app-text)]">{persona.mbti}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{persona.archetype}</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span
                style={{ color: getEmotionLabelColor(dominant.key) }}
                className="hidden font-semibold tabular-nums sm:inline"
              >
                {dominantMeta.label} {dominant.value}%
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex shrink-0 items-center gap-1 sm:static sm:gap-1.5">
          {/* Pencarian Riwayat */}
          <button
            type="button"
            onClick={() => setSearchOpen((s) => !s)}
            aria-label="Cari riwayat percakapan"
            aria-expanded={searchOpen}
            title="Cari riwayat percakapan"
            className={`inline-flex h-8 w-8 sm:h-[38px] sm:w-[38px] 2xl:w-auto items-center justify-center gap-1.5 rounded-lg border 2xl:px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              searchOpen
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:bg-[var(--app-surface-alt)]'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">Cari</span>
          </button>

          {/* Toggle Suara Auto-Baca */}
          {ttsAvailable && (
            <button
              type="button"
              onClick={onToggleAutoSpeak}
              aria-label={autoSpeak ? 'Matikan suara otomatis' : 'Aktifkan suara otomatis'}
              aria-pressed={autoSpeak}
              title={autoSpeak ? 'Mode Suara Otomatis: Aktif' : 'Mode Suara Otomatis: Nonaktif'}
              className={`inline-flex h-8 w-8 sm:h-[38px] sm:w-[38px] 2xl:w-auto items-center justify-center gap-1.5 rounded-lg border 2xl:px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                autoSpeak
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]'
              }`}
            >
              {autoSpeak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span className="hidden 2xl:inline">Suara</span>
            </button>
          )}

          {onOpenByok && (
            <button
              type="button"
              onClick={onOpenByok}
              aria-label="Pengaturan API Key BYOK"
              title="Pengaturan API Key BYOK"
              className={`hidden sm:inline-flex h-[38px] items-center justify-center gap-1.5 rounded-lg border sm:px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                byokLabel
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20'
                  : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{byokLabel ? `BYOK · ${byokLabel}` : 'BYOK'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onEditPersona}
            aria-label="Edit Persona"
            title="Edit Persona"
            className="hidden sm:inline-flex h-[38px] w-[38px] 2xl:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] 2xl:px-2.5 py-1.5 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-alt)] whitespace-nowrap shrink-0"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">Edit</span>
          </button>

          <div className="sm:relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((prev) => !prev)}
              aria-label="Ekspor log percakapan"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              title="Ekspor log percakapan"
              className="inline-flex h-8 w-8 sm:h-[38px] sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] sm:px-2.5 py-1.5 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-alt)] whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Ekspor</span>
            </button>

            {exportMenuOpen && (
              <div
                role="menu"
                aria-label="Pilih format ekspor log percakapan"
                className="absolute right-0 top-full z-40 mt-2 w-[min(18rem,calc(100vw-1.5rem))] sm:w-72 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-xl"
              >
                <div className="border-b border-[var(--app-border-soft)] px-3 py-2">
                  <div className="text-xs font-semibold text-[var(--app-text)]">
                    Unduh Log Percakapan
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--app-text-muted)]">
                    {persona.name} · {messages.length} pesan tersimpan
                  </div>
                </div>

                <div className="mt-1 space-y-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelectExport('txt')}
                    className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--app-surface-alt)]"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--app-text)]">
                        File Teks (.txt)
                      </div>
                      <div className="text-[11px] text-[var(--app-text-muted)]">
                        Transkrip rapi, kaomoji &amp; rincian emosi
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelectExport('json')}
                    className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--app-surface-alt)]"
                  >
                    <FileJson className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--app-text)]">
                        File JSON (.json)
                      </div>
                      <div className="text-[11px] text-[var(--app-text-muted)]">
                        Data terstruktur lengkap, memori &amp; jejak grafik
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onResetChat}
            aria-label="Reset obrolan dan emosi"
            className="inline-flex h-8 w-8 sm:h-[38px] sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] sm:px-2.5 py-1.5 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-alt)] whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Buka pengaturan"
            className="inline-flex h-8 w-8 sm:h-[38px] sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] sm:px-2.5 py-1.5 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-alt)] lg:hidden whitespace-nowrap shrink-0"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Bar Pencarian Riwayat */}
      {searchOpen && (
        <section
          aria-label="Pencarian riwayat percakapan"
          className="border-b border-[var(--app-border)] bg-[var(--app-surface-alt)] px-3 py-2.5 sm:px-6"
        >
          <div className="mx-auto max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onChangeSearchQuery(e.target.value)}
                  aria-label="Kata kunci pencarian riwayat"
                  placeholder="Cari kata kunci percakapan atau isi batin..."
                  className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div
                role="tablist"
                aria-label="Cakupan pencarian riwayat"
                className="inline-flex items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={searchScope === 'active'}
                  onClick={() => onChangeSearchScope('active')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${
                    searchScope === 'active'
                      ? 'bg-indigo-600 text-white'
                      : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                  }`}
                >
                  Persona Ini
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={searchScope === 'all'}
                  onClick={() => onChangeSearchScope('all')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${
                    searchScope === 'all'
                      ? 'bg-indigo-600 text-white'
                      : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                  }`}
                >
                  Semua Persona
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  onChangeSearchQuery('');
                }}
                aria-label="Tutup pencarian"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {searchQuery.trim() && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)]">
                {searchResults.length > 0 ? (
                  <ul className="divide-y divide-[var(--app-border-soft)]" data-testid="search-results">
                    {searchResults.map((res) => (
                      <li key={`${res.personaId}-${res.messageId}`}>
                        <button
                          type="button"
                          onClick={() => onJumpToSearchResult(res)}
                          className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--app-surface-alt)]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-[11px] text-[var(--app-text-muted)]">
                              <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                                {res.personaName}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{res.role === 'user' ? 'Anda' : 'AI'}</span>
                              {res.kaomoji && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono">{res.kaomoji}</span>
                                </>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-[var(--app-text)]">
                              {res.content}
                            </p>
                          </div>
                          <span className="shrink-0 font-mono text-[10px] text-[var(--app-text-muted)] tabular-nums">
                            {res.timestamp}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-3 text-center text-xs text-[var(--app-text-muted)]">
                    Tidak ditemukan pesan yang cocok dengan “{searchQuery.trim()}”.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {exportSuccessNotice && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 border-b border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/50 px-4 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200 sm:px-6"
        >
          <div className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>{exportSuccessNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportSuccessNotice(null)}
            className="text-[11px] font-semibold hover:underline whitespace-nowrap"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Mobile Tab Switcher (Obrolan vs Grafik & Latihan) */}
      <div className="flex border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 xl:hidden">
        <div
          role="tablist"
          aria-label="Navigasi tampilan mobile"
          className="grid w-full grid-cols-2 gap-1 rounded-lg bg-[var(--app-surface-alt)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === 'chat'}
            onClick={() => onChangeMobileView('chat')}
            className={`min-h-[36px] rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              mobileView === 'chat'
                ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
            }`}
          >
            Obrolan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === 'telemetry'}
            onClick={() => onChangeMobileView('telemetry')}
            className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              mobileView === 'telemetry'
                ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Grafik &amp; Memori</span>
          </button>
        </div>
      </div>

      {/* Mobile Telemetry View */}
      {mobileView === 'telemetry' && mobileTelemetrySlot && (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--app-surface)] xl:hidden">
          {mobileTelemetrySlot}
        </div>
      )}

      {/* Chat Content Container */}
      <div
        className={`flex min-h-0 flex-1 flex-col ${
          mobileView === 'telemetry' ? 'hidden xl:flex' : 'flex'
        }`}
      >
        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <PersonaAvatar name={persona.name} avatarUrl={persona.avatarUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-display text-lg font-bold text-[var(--app-text)]">
                        {persona.name}
                      </h2>
                      <InteractiveKaomoji
                        variant="inline"
                        kaomoji={currentKaomoji}
                        dominant={dominant.key}
                        archetype={persona.archetype}
                        isDark={isDark}
                      />
                    </div>
                    <div className="mt-1 text-xs text-[var(--app-text-muted)]">
                      {persona.roleTitle} · {persona.mbti} · {persona.archetype}
                    </div>
                    {hasUserContext && (
                      <div className="mt-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        {userPreferences?.userName?.trim()
                          ? `Menyapa ${userPreferences.userName.trim()}`
                          : 'Konteks Sapaan'}
                        {userPreferences?.relationship?.trim()
                          ? ` · Hubungan: ${userPreferences.relationship.trim()}`
                          : ''}
                      </div>
                    )}
                    <p className="mt-3 text-sm leading-relaxed text-[var(--app-text)] opacity-90">
                      {persona.basePersonality}
                    </p>
                  </div>
                </div>

                <div className="mt-5 border-t border-[var(--app-border-soft)] pt-4">
                  <div className="mb-2.5 text-xs font-medium text-[var(--app-text-muted)]">
                    Mulai percakapan untuk mengamati perubahan emosi:
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {starters.map((promptText, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onSendMessage(promptText)}
                        className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-3.5 py-2.5 text-left text-xs font-medium text-[var(--app-text)] transition-colors hover:border-indigo-400"
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isHighlighted = highlightedMessageId === msg.id;
                const isEditing = editingMsgId === msg.id;

                if (msg.role === 'user') {
                  return (
                    <div
                      key={msg.id}
                      ref={(el) => {
                        msgRefs.current[msg.id] = el;
                      }}
                      className="group flex justify-end"
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 dark:bg-indigo-600 px-4 py-3 text-sm leading-relaxed text-white sm:max-w-[75%] transition-shadow ${
                          isHighlighted ? 'ring-2 ring-amber-400 ring-offset-2' : ''
                        }`}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              rows={3}
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              aria-label="Edit pesan pengguna"
                              className="w-full min-w-[220px] rounded-lg border border-white/25 bg-black/20 p-2 text-xs text-white focus:border-white focus:outline-none"
                            />
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingMsgId(null)}
                                className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-medium hover:bg-white/25"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                onClick={() => saveEditMsg(msg.id, false)}
                                className="rounded-md bg-white/20 px-2.5 py-1 text-[11px] font-medium hover:bg-white/30"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                disabled={isSending}
                                onClick={() => saveEditMsg(msg.id, true)}
                                className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50"
                              >
                                Simpan &amp; Kirim Ulang
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <div className="mt-1.5 flex flex-wrap items-center justify-end gap-2 text-[11px] text-slate-300 dark:text-indigo-100 tabular-nums">
                              {msg.intensity && (
                                <span className="capitalize">Intensitas {msg.intensity.level}</span>
                              )}
                              {msg.editedAt && <span>· Diedit</span>}
                              <span aria-hidden="true">·</span>
                              <span>{msg.timestamp}</span>
                              <div className="ml-1 flex items-center gap-1 opacity-75 transition-opacity group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => startEditMsg(msg)}
                                  aria-label="Edit pesan ini"
                                  title="Edit pesan"
                                  className="rounded p-1 hover:bg-white/15"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteMessage(msg.id)}
                                  aria-label="Hapus pesan ini"
                                  title="Hapus pesan"
                                  className="rounded p-1 hover:bg-white/15"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }

                const msgDomKey = msg.dominant || dominant.key;
                const msgDomMeta = EMOTION_META[msgDomKey];
                const msgDomVal =
                  msg.emotions && msg.dominant ? msg.emotions[msg.dominant] : dominant.value;
                const isSpeakingThis = speakingMessageId === msg.id;

                return (
                  <div
                    key={msg.id}
                    ref={(el) => {
                      msgRefs.current[msg.id] = el;
                    }}
                    className="group flex items-start gap-3"
                  >
                    <PersonaAvatar
                      name={persona.name}
                      avatarUrl={persona.avatarUrl}
                      size="sm"
                      className="mt-0.5"
                    />
                    <div
                      className={`min-w-0 max-w-[88%] flex-1 rounded-2xl rounded-tl-sm border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3.5 sm:max-w-[82%] transition-shadow ${
                        isHighlighted ? 'ring-2 ring-indigo-500' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border-soft)] pb-2">
                        <div className="flex items-center gap-2.5">
                          <InteractiveKaomoji
                            variant="inline"
                            kaomoji={msg.kaomoji || currentKaomoji}
                            dominant={msgDomKey}
                            archetype={persona.archetype}
                            isDark={isDark}
                          />
                          <span
                            style={{ color: getEmotionLabelColor(msgDomKey) }}
                            className="text-xs font-semibold tabular-nums"
                          >
                            {msgDomMeta.label} {msgDomVal}%
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--app-text-muted)] tabular-nums">
                          {msg.editedAt && <span>Diedit ·</span>}
                          <span>{msg.timestamp}</span>
                          <div className="ml-1 flex items-center gap-0.5">
                            {ttsAvailable && (
                              <button
                                type="button"
                                onClick={() =>
                                  isSpeakingThis ? onStopSpeaking() : onSpeakMessage(msg)
                                }
                                aria-label={
                                  isSpeakingThis ? 'Hentikan suara' : 'Bacakan respons ini'
                                }
                                title={isSpeakingThis ? 'Hentikan' : 'Bacakan'}
                                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                                  isSpeakingThis
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]'
                                }`}
                              >
                                {isSpeakingThis ? (
                                  <VolumeX className="h-3.5 w-3.5" />
                                ) : (
                                  <Volume2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isSending}
                              onClick={() => onRegenerateMessage(msg.id)}
                              aria-label="Buat ulang jawaban ini"
                              title="Buat ulang jawaban"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] hover:text-indigo-600 disabled:opacity-40"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditMsg(msg)}
                              aria-label="Edit pesan AI"
                              title="Edit pesan"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteMessage(msg.id)}
                              aria-label="Hapus pesan AI"
                              title="Hapus pesan"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--app-text-muted)] hover:bg-rose-500/10 hover:text-rose-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="mt-2.5 space-y-2">
                          <textarea
                            rows={3}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            aria-label="Edit respons persona"
                            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-2.5 text-sm text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingMsgId(null)}
                              className="rounded-md border border-[var(--app-border)] px-3 py-1 text-xs font-medium text-[var(--app-text-muted)]"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditMsg(msg.id, false)}
                              className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                            >
                              Simpan Perubahan
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--app-text)]">
                          {msg.content}
                        </p>
                      )}

                      {msg.internalThought && (
                        <p className="mt-2.5 text-xs italic leading-relaxed text-[var(--app-text-muted)]">
                          Batin: “{msg.internalThought}”
                        </p>
                      )}

                      {msg.emotions && (
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--app-border-soft)] pt-2 text-[11px] text-[var(--app-text-muted)] font-mono tabular-nums">
                          {EMOTION_ORDER.map((k) => {
                            const delta = msg.deltas ? msg.deltas[k] : 0;
                            return (
                              <span key={k}>
                                <span
                                  style={{ color: getEmotionLabelColor(k) }}
                                  className="font-semibold"
                                >
                                  {EMOTION_META[k].label}
                                </span>{' '}
                                {msg.emotions![k]}%
                                {delta !== 0 && (
                                  <span
                                    className={
                                      delta > 0
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : 'text-rose-700 dark:text-rose-400'
                                    }
                                  >
                                    ({delta > 0 ? `+${delta}` : delta})
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {msg.triggeredRules && msg.triggeredRules.length > 0 && (
                        <div className="mt-1.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-400">
                          Aturan terpicu: {msg.triggeredRules.join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {isSending && (
              <div className="flex items-start gap-3">
                <PersonaAvatar name={persona.name} avatarUrl={persona.avatarUrl} size="sm" />
                <div className="rounded-2xl rounded-tl-sm border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-xs text-[var(--app-text-muted)]">
                  {persona.name} sedang memproses reaksi emosional...
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Error / Voice Banner */}
        {(error || voiceError) && (
          <div className="mx-auto mb-2 w-full max-w-3xl px-4 sm:px-6">
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/50 px-4 py-2.5 text-xs text-rose-800 dark:text-rose-200"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{error || voiceError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onDismissError();
                  setVoiceError(null);
                }}
                className="font-semibold text-rose-700 dark:text-rose-300 hover:underline whitespace-nowrap shrink-0"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* Message Composer */}
        <div className="border-t border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 sm:px-6">
          <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[var(--app-text-muted)]">
              <div className="flex items-center gap-2">
                <span>Deteksi Intensitas Pesan:</span>
                <span className="font-mono font-semibold capitalize text-[var(--app-text)] tabular-nums">
                  {liveIntensity.level} ({Math.round(liveIntensity.score * 100)}%)
                </span>
              </div>
              <span className="hidden truncate sm:inline">
                {isListening ? 'Mendengarkan suara Anda (Bahasa Indonesia)...' : liveIntensity.signals[0]}
              </span>
            </div>

            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label={`Kirim pesan ke ${persona.name}`}
                placeholder={`Tulis pesan untuk ${persona.name}... (Enter untuk kirim)`}
                className="min-h-[48px] max-h-36 flex-1 resize-none rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-3.5 py-2.5 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:bg-[var(--app-surface)] focus:outline-none"
              />

              <button
                type="button"
                onClick={handleToggleMic}
                aria-label={isListening ? 'Hentikan mikrofon' : 'Input suara mikrofon'}
                title={
                  sttAvailable
                    ? isListening
                      ? 'Hentikan dikte suara'
                      : 'Dikte pesan lewat mikrofon'
                    : 'Mikrofon suara (browser tidak mendukung Web Speech API)'
                }
                className={`inline-flex h-[48px] w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                  isListening
                    ? 'border-rose-500 bg-rose-600 text-white'
                    : 'border-[var(--app-border)] bg-[var(--app-surface-alt)] text-[var(--app-text)] hover:border-indigo-400'
                }`}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>

              <button
                type="submit"
                disabled={!input.trim() || isSending}
                aria-label="Kirim pesan"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
              >
                <Send className="h-4 w-4" />
                <span>Kirim</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
