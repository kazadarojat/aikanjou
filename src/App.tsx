import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Quote, Sparkles } from 'lucide-react';
import { ChatWorkspace, type ChatMessage } from './components/ChatWorkspace';
import { EmotionCharts } from './components/EmotionCharts';
import { EmotionTrainerPanel } from './components/EmotionTrainerPanel';
import { PersonaEditorModal } from './components/PersonaEditorModal';
import { PersonaMemoryPanel } from './components/PersonaMemoryPanel';
import { PersonaSidebar } from './components/PersonaSidebar';
import { ResponseSettingsPanel } from './components/ResponseSettingsPanel';
import { SettingsModal, type SettingsTabId } from './components/SettingsModal';
import { DEFAULT_PERSONAS } from './data/defaultPersonas';
import {
  applyEmotionTraining,
  ARCHETYPE_PRESETS,
  detectConversationIntensity,
  EMOTION_META,
  estimateLocalStimulus,
  getDominantEmotion,
  MBTI_OPTIONS,
  mergePersonaMemories,
  normalizeEmotions,
  selectKaomoji,
  type EmotionState,
  type MemoryCategory,
  type Persona,
  type PersonaMemoryItem,
  type ResponseConfig,
} from './lib/emotionEngine';
import {
  buildByokHeaders,
  BYOK_PROVIDERS,
  DEFAULT_BYOK_CONFIG,
  isByokActive,
  sanitizeByokConfig,
  type ByokConfig,
} from './lib/byok';
import {
  DEFAULT_APP_SETTINGS,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  sanitizeAppSettings,
  THEME_OPTIONS,
  type AppSettings,
} from './lib/settings';
import {
  buildExportFilename,
  formatChatLogAsJson,
  formatChatLogAsText,
  triggerFileDownload,
  type ChatExportInput,
} from './lib/chatExport';
import {
  createInitialSession,
  deleteMessageFromSession,
  editMessageInSession,
  getRegenerateContext,
  searchConversationHistory,
  type HistorySearchResult,
  type PersonaSessionState,
} from './lib/sessionUtils';
import {
  createFullBackupJson,
  exportPersonaPackageJson,
  parseFullBackupJson,
  parsePersonaPackageJson,
} from './lib/backup';
import { speakPersonaReply, stopSpeaking } from './lib/speech';

const STORAGE_PERSONAS = 'kanjou_personas_v1';
const STORAGE_ACTIVE_ID = 'kanjou_active_persona_v1';
const STORAGE_SESSIONS = 'kanjou_sessions_v1';
const STORAGE_MEMORIES = 'kanjou_memories_v1';
const STORAGE_SETTINGS = 'kanjou_settings_v1';
const STORAGE_BYOK = 'kanjou_byok_v1';

function formatClock(): string {
  return new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'persona'
  );
}

export default function App() {
  const [personas, setPersonas] = useState<Persona[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PERSONAS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_PERSONAS;
  });

  const [activePersonaId, setActivePersonaId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ACTIVE_ID);
      if (saved) return saved;
    } catch {
      // ignore
    }
    return DEFAULT_PERSONAS[0].id;
  });

  const [sessions, setSessions] = useState<Record<string, PersonaSessionState>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SESSIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  });

  const [memoriesByPersona, setMemoriesByPersona] = useState<
    Record<string, PersonaMemoryItem[]>
  >(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MEMORIES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  });

  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS);
      if (saved) {
        return sanitizeAppSettings(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
    return DEFAULT_APP_SETTINGS;
  });

  const [byokConfig, setByokConfig] = useState<ByokConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_BYOK);
      if (saved) {
        return sanitizeByokConfig(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
    return DEFAULT_BYOK_CONFIG;
  });

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'chat' | 'telemetry'>('chat');
  const [inspectorTab, setInspectorTab] = useState<'training' | 'memory' | 'profile'>('training');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId>('user');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calibrationNotice, setCalibrationNotice] = useState<string | null>(null);

  // History Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'active' | 'all'>('active');
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Voice state
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const byokLabel = useMemo(
    () => (isByokActive(byokConfig) ? BYOK_PROVIDERS[byokConfig.provider].shortLabel : null),
    [byokConfig]
  );

  const isDark = useMemo(
    () => THEME_OPTIONS.find((t) => t.id === appSettings.theme)?.isDark ?? false,
    [appSettings.theme]
  );

  const activePersona = useMemo(
    () => personas.find((p) => p.id === activePersonaId) || personas[0],
    [personas, activePersonaId]
  );

  const activeSession = useMemo(() => {
    return sessions[activePersona.id] || createInitialSession(activePersona);
  }, [sessions, activePersona]);

  const activeMemories = useMemo(() => {
    return memoriesByPersona[activePersona.id] || [];
  }, [memoriesByPersona, activePersona.id]);

  const emotionMap = useMemo(() => {
    const map: Record<string, EmotionState> = {};
    for (const p of personas) {
      map[p.id] = sessions[p.id]?.emotions || p.baselineEmotions;
    }
    return map;
  }, [personas, sessions]);

  const messageCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of personas) {
      map[p.id] = sessions[p.id]?.messages.length || 0;
    }
    return map;
  }, [personas, sessions]);

  const searchResults = useMemo(() => {
    return searchConversationHistory(
      personas,
      sessions,
      searchQuery,
      searchScope === 'active' ? activePersona.id : undefined
    );
  }, [personas, sessions, searchQuery, searchScope, activePersona.id]);

  const backupSummary = useMemo(() => {
    const messageCount = Object.values(sessions).reduce(
      (sum, s) => sum + (s?.messages?.length || 0),
      0
    );
    const memoryCount = Object.values(memoriesByPersona).reduce(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0
    );
    return {
      personaCount: personas.length,
      messageCount,
      memoryCount,
    };
  }, [personas.length, sessions, memoriesByPersona]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PERSONAS, JSON.stringify(personas));
    } catch {
      // ignore
    }
  }, [personas]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_ID, activePersona.id);
    } catch {
      // ignore
    }
  }, [activePersona.id]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(sessions));
    } catch {
      // ignore
    }
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MEMORIES, JSON.stringify(memoriesByPersona));
    } catch {
      // ignore
    }
  }, [memoriesByPersona]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(appSettings));
    } catch {
      // ignore
    }

    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.setAttribute('data-theme', appSettings.theme);
    root.setAttribute('data-font', appSettings.font);

    const fontInfo = FONT_OPTIONS.find((f) => f.id === appSettings.font) || FONT_OPTIONS[0];
    const sizeInfo =
      FONT_SIZE_OPTIONS.find((s) => s.id === appSettings.fontSize) || FONT_SIZE_OPTIONS[1];

    root.style.setProperty('--font-body', fontInfo.cssFamily);
    root.style.setProperty('--app-font-size', `${sizeInfo.px}px`);
  }, [appSettings, isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_BYOK, JSON.stringify(byokConfig));
    } catch {
      // ignore
    }
  }, [byokConfig]);

  useEffect(() => {
    if (!highlightedMessageId) return;
    const timer = setTimeout(() => setHighlightedMessageId(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightedMessageId]);

  const openSettings = (tab: SettingsTabId = 'user') => {
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  };

  const updateSession = (
    personaId: string,
    updater: (prev: PersonaSessionState) => PersonaSessionState
  ) => {
    const targetPersona = personas.find((p) => p.id === personaId) || activePersona;
    setSessions((prev) => {
      const current = prev[personaId] || createInitialSession(targetPersona);
      return {
        ...prev,
        [personaId]: updater(current),
      };
    });
  };

  const handleSpeakMessage = (msg: ChatMessage, targetPersona: Persona = activePersona) => {
    const dom = msg.dominant || getDominantEmotion(targetPersona.baselineEmotions).key;
    setSpeakingMessageId(msg.id);
    const started = speakPersonaReply({
      text: msg.content,
      dominant: dom,
      archetype: targetPersona.archetype,
      baseRate: appSettings.voice.speechRate,
      onEnd: () => setSpeakingMessageId((curr) => (curr === msg.id ? null : curr)),
      onError: () => setSpeakingMessageId((curr) => (curr === msg.id ? null : curr)),
    });
    if (!started) {
      setSpeakingMessageId(null);
    }
  };

  const handleStopSpeaking = () => {
    stopSpeaking();
    setSpeakingMessageId(null);
  };

  const requestAiReply = async (params: {
    persona: Persona;
    userText: string;
    historyPayload: Array<{ role: 'user' | 'assistant'; content: string }>;
    emotionsBeforeTurn: EmotionState;
    memories: PersonaMemoryItem[];
  }) => {
    const { persona, userText, historyPayload, emotionsBeforeTurn, memories } = params;

    setIsSending(true);
    setError(null);
    setCalibrationNotice(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildByokHeaders(byokConfig),
        },
        body: JSON.stringify({
          message: userText,
          history: historyPayload,
          persona,
          currentEmotions: emotionsBeforeTurn,
          userPreferences: appSettings.user,
          memories,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Gagal menghubungi server (${response.status}).`);
      }

      const timestamp = formatClock();
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp,
        kaomoji: data.kaomoji,
        emotions: data.emotions,
        deltas: data.deltas,
        dominant: data.dominant,
        internalThought: data.internalThought,
        triggeredRules: data.triggeredRules,
      };

      updateSession(persona.id, (prev) => ({
        ...prev,
        messages: [...prev.messages, aiMsg],
        emotions: data.emotions,
        deltas: data.deltas,
        kaomoji: data.kaomoji,
        internalThought: data.internalThought,
        history: [
          ...prev.history,
          {
            turn: prev.history.length,
            emotions: data.emotions,
            kaomoji: data.kaomoji,
            dominant: data.dominant,
            timestamp,
          },
        ],
      }));

      if (Array.isArray(data.newMemories) && data.newMemories.length > 0) {
        setMemoriesByPersona((prev) => ({
          ...prev,
          [persona.id]: mergePersonaMemories(prev[persona.id] || [], data.newMemories, 'auto', new Date()),
        }));
      }

      if (appSettings.voice.autoSpeak) {
        handleSpeakMessage(aiMsg, persona);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan.';
      setError(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    const persona = activePersona;
    const session = activeSession;
    const intensity = detectConversationIntensity(text);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: formatClock(),
      intensity,
    };

    const historyPayload = session.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    updateSession(persona.id, (prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg],
    }));

    await requestAiReply({
      persona,
      userText: text,
      historyPayload,
      emotionsBeforeTurn: session.emotions,
      memories: activeMemories,
    });
  };

  const handleEditMessage = async (
    messageId: string,
    newContent: string,
    resendAfterEdit = false
  ) => {
    const persona = activePersona;
    const session = activeSession;
    const editedSession = editMessageInSession(session, messageId, newContent, formatClock());

    if (!resendAfterEdit) {
      updateSession(persona.id, () => editedSession);
      return;
    }

    const regen = getRegenerateContext(editedSession, messageId, persona);
    if (!regen) {
      updateSession(persona.id, () => editedSession);
      return;
    }

    handleStopSpeaking();
    updateSession(persona.id, () => ({
      ...editedSession,
      messages: regen.truncatedMessages,
      history: regen.truncatedHistory,
      emotions: regen.emotionsBeforeTurn,
      deltas: null,
    }));

    await requestAiReply({
      persona,
      userText: regen.userText,
      historyPayload: regen.historyBeforeUser,
      emotionsBeforeTurn: regen.emotionsBeforeTurn,
      memories: activeMemories,
    });
  };

  const handleDeleteMessage = (messageId: string) => {
    if (speakingMessageId === messageId) {
      handleStopSpeaking();
    }
    updateSession(activePersona.id, (prev) =>
      deleteMessageFromSession(prev, messageId, activePersona)
    );
  };

  const handleRegenerateMessage = async (messageId: string) => {
    if (isSending) return;
    const persona = activePersona;
    const regen = getRegenerateContext(activeSession, messageId, persona);
    if (!regen) return;

    handleStopSpeaking();
    updateSession(persona.id, (prev) => ({
      ...prev,
      messages: regen.truncatedMessages,
      history: regen.truncatedHistory,
      emotions: regen.emotionsBeforeTurn,
      deltas: null,
    }));

    await requestAiReply({
      persona,
      userText: regen.userText,
      historyPayload: regen.historyBeforeUser,
      emotionsBeforeTurn: regen.emotionsBeforeTurn,
      memories: activeMemories,
    });
  };

  const handleJumpToSearchResult = (res: HistorySearchResult) => {
    if (res.personaId !== activePersona.id) {
      handleStopSpeaking();
      setActivePersonaId(res.personaId);
      setError(null);
      setCalibrationNotice(null);
    }
    setMobileView('chat');
    setHighlightedMessageId(res.messageId);
  };

  const handleUpdateTraining = (training: Persona['training']) => {
    setPersonas((prev) =>
      prev.map((p) => (p.id === activePersona.id ? { ...p, training } : p))
    );
  };

  const handleUpdateResponseConfig = (responseConfig: ResponseConfig) => {
    setPersonas((prev) =>
      prev.map((p) => (p.id === activePersona.id ? { ...p, responseConfig } : p))
    );
  };

  const handleAddMemory = (category: MemoryCategory, content: string) => {
    const newItem: PersonaMemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category,
      content: content.trim(),
      source: 'manual',
      createdAt: formatClock(),
    };
    setMemoriesByPersona((prev) => ({
      ...prev,
      [activePersona.id]: [newItem, ...(prev[activePersona.id] || [])],
    }));
  };

  const handleUpdateMemory = (id: string, category: MemoryCategory, content: string) => {
    setMemoriesByPersona((prev) => ({
      ...prev,
      [activePersona.id]: (prev[activePersona.id] || []).map((m) =>
        m.id === id ? { ...m, category, content: content.trim() } : m
      ),
    }));
  };

  const handleDeleteMemory = (id: string) => {
    setMemoriesByPersona((prev) => ({
      ...prev,
      [activePersona.id]: (prev[activePersona.id] || []).filter((m) => m.id !== id),
    }));
  };

  const handleClearMemories = () => {
    setMemoriesByPersona((prev) => ({
      ...prev,
      [activePersona.id]: [],
    }));
  };

  const handleRunCalibration = (sampleText: string) => {
    const stimulus = estimateLocalStimulus(sampleText, activePersona);
    const result = applyEmotionTraining(
      activeSession.emotions,
      stimulus,
      sampleText,
      activePersona
    );
    const domMeta = EMOTION_META[result.dominant];
    const timestamp = formatClock();

    updateSession(activePersona.id, (prev) => ({
      ...prev,
      emotions: result.next,
      deltas: result.deltas,
      kaomoji: result.kaomoji,
      internalThought: `Kalibrasi intensitas ${result.intensity.level}: dominan ${domMeta.label} (${result.next[result.dominant]}%).`,
      history: [
        ...prev.history,
        {
          turn: prev.history.length,
          emotions: result.next,
          kaomoji: result.kaomoji,
          dominant: result.dominant,
          timestamp,
        },
      ],
    }));

    setCalibrationNotice(
      `Simulasi intensitas ${result.intensity.level} (${Math.round(result.intensity.score * 100)}%) → ${domMeta.label} ${result.next[result.dominant]}% ${result.kaomoji}`
    );
  };

  const handleResetEmotionsAndChat = () => {
    handleStopSpeaking();
    setError(null);
    setCalibrationNotice(null);
    setSessions((prev) => ({
      ...prev,
      [activePersona.id]: createInitialSession(activePersona),
    }));
  };

  const handleResetEmotionsOnly = () => {
    const baseline = normalizeEmotions(activePersona.baselineEmotions);
    const dom = getDominantEmotion(baseline);
    const kaomoji = selectKaomoji(dom.key, 0.45, activePersona.archetype, dom.secondaryKey);
    const timestamp = formatClock();
    updateSession(activePersona.id, (prev) => ({
      ...prev,
      emotions: baseline,
      deltas: null,
      kaomoji,
      internalThought: `Emosi dikembalikan ke komposisi dasar ${activePersona.archetype}.`,
      history: [
        ...prev.history,
        {
          turn: prev.history.length,
          emotions: baseline,
          kaomoji,
          dominant: dom.key,
          timestamp,
        },
      ],
    }));
    setCalibrationNotice('Emosi direset ke kondisi dasar persona.');
  };

  const handleExportChatLog = (format: 'txt' | 'json') => {
    const exportedAt = new Date();
    const payloadInput: ChatExportInput = {
      persona: activePersona,
      messages: activeSession.messages,
      currentEmotions: activeSession.emotions,
      currentKaomoji: activeSession.kaomoji,
      internalThought: activeSession.internalThought,
      history: activeSession.history,
      memories: activeMemories,
      userPreferences: appSettings.user,
      exportedAt,
    };

    const filename = buildExportFilename(activePersona.name, format, exportedAt);
    if (format === 'txt') {
      const textContent = formatChatLogAsText(payloadInput);
      triggerFileDownload(textContent, filename, 'text/plain;charset=utf-8');
    } else {
      const jsonContent = formatChatLogAsJson(payloadInput);
      triggerFileDownload(jsonContent, filename, 'application/json;charset=utf-8');
    }
  };

  const handleExportPersona = (persona: Persona) => {
    const json = exportPersonaPackageJson(persona, new Date());
    const dateSlug = new Date().toISOString().slice(0, 10);
    triggerFileDownload(
      json,
      `persona-${slugifyName(persona.name)}-${dateSlug}.json`,
      'application/json;charset=utf-8'
    );
  };

  const handleImportPersona = (rawJson: string): { ok: boolean; message: string } => {
    try {
      const existingIds = new Set(personas.map((p) => p.id));
      const imported = parsePersonaPackageJson(rawJson, existingIds);
      setPersonas((prev) => [...prev, imported]);
      setActivePersonaId(imported.id);
      setSessions((prev) => ({
        ...prev,
        [imported.id]: createInitialSession(imported),
      }));
      return { ok: true, message: `Persona "${imported.name}" berhasil diimpor.` };
    } catch (err: unknown) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Gagal mengimpor persona JSON.',
      };
    }
  };

  const handleDownloadFullBackup = () => {
    const now = new Date();
    const json = createFullBackupJson({
      personas,
      activePersonaId: activePersona.id,
      sessions,
      memoriesByPersona,
      settings: appSettings,
      exportedAt: now,
    });
    const stamp = now.toISOString().slice(0, 10);
    triggerFileDownload(json, `kanjou-backup-${stamp}.json`, 'application/json;charset=utf-8');
  };

  const handleRestoreFullBackup = (rawJson: string): { ok: boolean; message: string } => {
    try {
      const restored = parseFullBackupJson(rawJson);
      handleStopSpeaking();
      setPersonas(restored.personas);
      setActivePersonaId(restored.activePersonaId);
      setSessions(restored.sessions);
      setMemoriesByPersona(restored.memoriesByPersona);
      setAppSettings(restored.settings);
      setError(null);
      setCalibrationNotice(null);
      return {
        ok: true,
        message: `Cadangan dipulihkan (${restored.personas.length} persona).`,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Berkas cadangan tidak valid.',
      };
    }
  };

  const handleSavePersona = (saved: Persona) => {
    const exists = personas.some((p) => p.id === saved.id);
    if (exists) {
      setPersonas((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      updateSession(saved.id, (prev) => {
        const dom = getDominantEmotion(prev.emotions);
        return {
          ...prev,
          kaomoji: selectKaomoji(dom.key, 0.5, saved.archetype, dom.secondaryKey),
        };
      });
    } else {
      setPersonas((prev) => [...prev, saved]);
      setActivePersonaId(saved.id);
      setSessions((prev) => ({
        ...prev,
        [saved.id]: createInitialSession(saved),
      }));
    }
    setEditorOpen(false);
    setEditingPersona(null);
  };

  const handleDeletePersona = (id: string) => {
    if (personas.length <= 1) return;
    handleStopSpeaking();
    const remaining = personas.filter((p) => p.id !== id);
    setPersonas(remaining);
    setSessions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setMemoriesByPersona((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activePersona.id === id) {
      setActivePersonaId(remaining[0].id);
    }
  };

  const mbtiInfo = MBTI_OPTIONS.find((m) => m.code === activePersona.mbti);

  const telemetryContent = (
    <div className="space-y-5 p-5">
      <EmotionCharts
        emotions={activeSession.emotions}
        deltas={activeSession.deltas}
        kaomoji={activeSession.kaomoji}
        archetype={activePersona.archetype}
        internalThought={activeSession.internalThought}
        history={activeSession.history}
        isDark={isDark}
      />

      {calibrationNotice && (
        <div
          role="status"
          className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/50 px-3.5 py-2.5 text-xs font-medium text-indigo-900 dark:text-indigo-200"
        >
          {calibrationNotice}
        </div>
      )}

      {/* Switcher: Emosi & Respons vs Memori vs Identitas */}
      <div className="border-t border-[var(--app-border)] pt-4">
        <div
          role="tablist"
          aria-label="Panel konfigurasi emosi, memori, dan watak"
          className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-[var(--app-surface-alt)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={inspectorTab === 'training'}
            onClick={() => setInspectorTab('training')}
            className={`min-h-[36px] rounded-md px-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              inspectorTab === 'training'
                ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
            }`}
          >
            Emosi &amp; Respons
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inspectorTab === 'memory'}
            onClick={() => setInspectorTab('memory')}
            className={`min-h-[36px] rounded-md px-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              inspectorTab === 'memory'
                ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
            }`}
          >
            Memori ({activeMemories.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inspectorTab === 'profile'}
            onClick={() => setInspectorTab('profile')}
            className={`min-h-[36px] rounded-md px-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              inspectorTab === 'profile'
                ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
            }`}
          >
            Identitas
          </button>
        </div>

        {inspectorTab === 'training' && (
          <div className="space-y-4">
            <ResponseSettingsPanel
              persona={activePersona}
              onUpdateResponseConfig={handleUpdateResponseConfig}
              onUpdateReactivity={(reactivity) =>
                handleUpdateTraining({
                  ...activePersona.training,
                  reactivity,
                })
              }
            />
            <EmotionTrainerPanel
              persona={activePersona}
              onUpdateTraining={handleUpdateTraining}
              onRunCalibration={handleRunCalibration}
              onResetEmotions={handleResetEmotionsOnly}
            />
          </div>
        )}

        {inspectorTab === 'memory' && (
          <PersonaMemoryPanel
            personaName={activePersona.name}
            memories={activeMemories}
            onAddMemory={handleAddMemory}
            onUpdateMemory={handleUpdateMemory}
            onDeleteMemory={handleDeleteMemory}
            onClearMemories={handleClearMemories}
          />
        )}

        {inspectorTab === 'profile' && (
          <div className="space-y-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
            <div>
              <div className="text-xs font-medium text-[var(--app-text-muted)]">Identitas &amp; Peran</div>
              <div className="mt-1 text-sm font-semibold text-[var(--app-text)]">
                {activePersona.name} · {activePersona.roleTitle}
              </div>
              {activePersona.sourceCategory && (
                <div className="mt-1 text-xs font-medium text-indigo-700 dark:text-indigo-400">
                  Kategori: {activePersona.sourceCategory}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--app-border-soft)] pt-3">
              <div className="text-xs font-medium text-[var(--app-text-muted)]">Tipe MBTI</div>
              <div className="mt-1 text-xs text-[var(--app-text)]">
                <span className="font-mono font-semibold text-[var(--app-text)]">
                  {activePersona.mbti}
                </span>{' '}
                — {mbtiInfo?.summary}
              </div>
            </div>

            <div className="border-t border-[var(--app-border-soft)] pt-3">
              <div className="text-xs font-medium text-[var(--app-text-muted)]">Arketipe Watak</div>
              <div className="mt-1 text-xs leading-relaxed text-[var(--app-text)]">
                <span className="font-semibold text-[var(--app-text)]">{activePersona.archetype}:</span>{' '}
                {ARCHETYPE_PRESETS[activePersona.archetype].description}
              </div>
            </div>

            <div className="border-t border-[var(--app-border-soft)] pt-3">
              <div className="text-xs font-medium text-[var(--app-text-muted)]">Kepribadian Dasar</div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--app-text)] opacity-90">
                {activePersona.basePersonality}
              </p>
            </div>

            <div className="border-t border-[var(--app-border-soft)] pt-3">
              <div className="text-xs font-medium text-[var(--app-text-muted)]">Gaya Bicara</div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--app-text)] opacity-90">
                {activePersona.speakingStyle}
              </p>
            </div>

            {/* Pemisahan Fakta Sumber vs Interpretasi AI */}
            {(activePersona.sourceFacts?.length || activePersona.aiInterpretationNote) && (
              <div className="space-y-3 border-t border-[var(--app-border-soft)] pt-3">
                {activePersona.sourceFacts && activePersona.sourceFacts.length > 0 && (
                  <div className="rounded-lg bg-[var(--app-surface-alt)] p-3">
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Fakta Terverifikasi dari Sumber
                    </div>
                    <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-[var(--app-text)]">
                      {activePersona.sourceFacts.map((fact, idx) => (
                        <li key={idx}>• {fact}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {activePersona.aiInterpretationNote && (
                  <div className="rounded-lg bg-[var(--app-surface-alt)] p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Interpretasi AI (MBTI &amp; Emosi)</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--app-text-muted)]">
                      {activePersona.aiInterpretationNote}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Sumber Referensi Web Lengkap */}
            {activePersona.webSources && activePersona.webSources.length > 0 && (
              <div className="border-t border-[var(--app-border-soft)] pt-3">
                <div className="text-xs font-medium text-[var(--app-text-muted)]">
                  Sumber Referensi Web ({activePersona.webSources.length})
                </div>
                <ul className="mt-2 space-y-2">
                  {activePersona.webSources.map((src, idx) => (
                    <li
                      key={idx}
                      className="rounded-lg border border-[var(--app-border-soft)] bg-[var(--app-surface-alt)] p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline"
                        >
                          <span>{src.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                        {src.sourceName && (
                          <span className="shrink-0 font-mono text-[10px] text-[var(--app-text-muted)]">
                            {src.sourceName}
                          </span>
                        )}
                      </div>
                      {src.snippet && (
                        <blockquote className="mt-1 flex items-start gap-1.5 text-[11px] italic leading-relaxed text-[var(--app-text-muted)]">
                          <Quote className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                          <span>“{src.snippet}”</span>
                        </blockquote>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setEditingPersona(activePersona);
                  setEditorOpen(true);
                }}
                className="min-h-[40px] rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-3 py-2 text-xs font-medium text-[var(--app-text)] hover:border-indigo-400 whitespace-nowrap"
              >
                Ubah Identitas &amp; Sumber
              </button>
              <button
                type="button"
                onClick={() => handleExportPersona(activePersona)}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-3 py-2 text-xs font-medium text-[var(--app-text)] hover:border-indigo-400 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Ekspor Persona (.json)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]">
      {/* Left Sidebar: Persona Roster */}
      <PersonaSidebar
        personas={personas}
        activePersonaId={activePersona.id}
        emotionMap={emotionMap}
        messageCountMap={messageCountMap}
        onSelectPersona={(id) => {
          handleStopSpeaking();
          setActivePersonaId(id);
          setError(null);
          setCalibrationNotice(null);
        }}
        onCreatePersona={() => {
          setEditingPersona(null);
          setEditorOpen(true);
        }}
        onDeletePersona={handleDeletePersona}
        onExportPersona={handleExportPersona}
        onImportPersona={handleImportPersona}
        onOpenSettings={() => openSettings('user')}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        isDark={isDark}
      />

      {/* Center: Chat Harness */}
      <ChatWorkspace
        persona={activePersona}
        messages={activeSession.messages}
        currentEmotions={activeSession.emotions}
        currentKaomoji={activeSession.kaomoji}
        isSending={isSending}
        error={error}
        onDismissError={() => setError(null)}
        onSendMessage={handleSendMessage}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onRegenerateMessage={handleRegenerateMessage}
        searchQuery={searchQuery}
        searchScope={searchScope}
        searchResults={searchResults}
        highlightedMessageId={highlightedMessageId}
        onChangeSearchQuery={setSearchQuery}
        onChangeSearchScope={setSearchScope}
        onJumpToSearchResult={handleJumpToSearchResult}
        autoSpeak={appSettings.voice.autoSpeak}
        speakingMessageId={speakingMessageId}
        onToggleAutoSpeak={() =>
          setAppSettings((prev) => ({
            ...prev,
            voice: {
              ...prev.voice,
              autoSpeak: !prev.voice.autoSpeak,
            },
          }))
        }
        onSpeakMessage={(msg) => handleSpeakMessage(msg, activePersona)}
        onStopSpeaking={handleStopSpeaking}
        onOpenSidebar={() => setMobileSidebarOpen(true)}
        onOpenSettings={() => openSettings('user')}
        onOpenByok={() => openSettings('byok')}
        onEditPersona={() => {
          setEditingPersona(activePersona);
          setEditorOpen(true);
        }}
        onResetChat={handleResetEmotionsAndChat}
        onExportLog={handleExportChatLog}
        mobileView={mobileView}
        onChangeMobileView={setMobileView}
        mobileTelemetrySlot={telemetryContent}
        isDark={isDark}
        byokLabel={byokLabel}
        userPreferences={{
          userName: appSettings.user.userName,
          relationship: appSettings.user.relationship,
        }}
      />

      {/* Desktop Right Inspector: Emotion Telemetry + Training Lab + Memory */}
      <aside
        aria-label="Monitor Emosi, Memori, dan Pelatihan Intensitas"
        className="hidden h-full w-[410px] shrink-0 flex-col overflow-y-auto border-l border-[var(--app-border)] bg-[var(--app-surface)] xl:flex"
      >
        {telemetryContent}
      </aside>

      {/* Modal Editor Persona */}
      <PersonaEditorModal
        open={editorOpen}
        initialPersona={editingPersona}
        byok={byokConfig}
        onClose={() => {
          setEditorOpen(false);
          setEditingPersona(null);
        }}
        onSave={handleSavePersona}
        onExportPersona={handleExportPersona}
      />

      {/* Modal Pengaturan Aplikasi, Cadangan & Preferensi User */}
      <SettingsModal
        open={settingsOpen}
        initialTab={settingsInitialTab}
        settings={appSettings}
        byok={byokConfig}
        backupSummary={backupSummary}
        onChange={setAppSettings}
        onChangeByok={setByokConfig}
        onDownloadBackup={handleDownloadFullBackup}
        onRestoreBackup={handleRestoreFullBackup}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
