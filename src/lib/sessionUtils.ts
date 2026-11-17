import {
  EMOTION_ORDER,
  getDominantEmotion,
  normalizeEmotions,
  selectKaomoji,
  type EmotionKey,
  type EmotionState,
  type IntensityAnalysis,
  type Persona,
} from './emotionEngine';

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  kaomoji?: string;
  emotions?: EmotionState;
  deltas?: EmotionState;
  dominant?: EmotionKey;
  internalThought?: string;
  intensity?: IntensityAnalysis;
  triggeredRules?: string[];
  editedAt?: string;
}

export interface SessionEmotionSnapshot {
  turn: number;
  emotions: EmotionState;
  kaomoji: string;
  dominant: EmotionKey;
  timestamp?: string;
  label?: string;
}

export interface PersonaSessionState {
  messages: SessionMessage[];
  emotions: EmotionState;
  deltas: EmotionState | null;
  kaomoji: string;
  internalThought?: string;
  history: SessionEmotionSnapshot[];
}

export function createInitialSession(persona: Persona): PersonaSessionState {
  const normalized = normalizeEmotions(persona.baselineEmotions);
  const dominant = getDominantEmotion(normalized);
  const kaomoji = selectKaomoji(dominant.key, 0.45, persona.archetype, dominant.secondaryKey);
  return {
    messages: [],
    emotions: normalized,
    deltas: null,
    kaomoji,
    internalThought: `${persona.name} siap berinteraksi (${persona.mbti} · ${persona.archetype}).`,
    history: [
      {
        turn: 0,
        emotions: normalized,
        kaomoji,
        dominant: dominant.key,
        label: 'Awal',
      },
    ],
  };
}

export interface EmotionTimelineStats {
  totalTurns: number;
  peakEmotion: { key: EmotionKey; value: number; turn: number };
  averages: EmotionState;
  mostFrequentDominant: { key: EmotionKey; count: number };
  volatilityScore: number; // average total shift per turn
}

export function computeEmotionTimelineStats(
  history: SessionEmotionSnapshot[]
): EmotionTimelineStats {
  if (history.length === 0) {
    const empty: EmotionState = {
      senang: 0,
      marah: 0,
      takut: 0,
      bingung: 0,
      sedih: 0,
      jijik: 0,
    };
    return {
      totalTurns: 0,
      peakEmotion: { key: 'senang', value: 0, turn: 0 },
      averages: empty,
      mostFrequentDominant: { key: 'senang', count: 0 },
      volatilityScore: 0,
    };
  }

  let peakKey: EmotionKey = 'senang';
  let peakVal = -1;
  let peakTurn = 0;

  const sums: Record<EmotionKey, number> = {
    senang: 0,
    marah: 0,
    takut: 0,
    bingung: 0,
    sedih: 0,
    jijik: 0,
  };

  const domCounts: Record<EmotionKey, number> = {
    senang: 0,
    marah: 0,
    takut: 0,
    bingung: 0,
    sedih: 0,
    jijik: 0,
  };

  let totalShift = 0;

  for (let i = 0; i < history.length; i++) {
    const snap = history[i];
    domCounts[snap.dominant] = (domCounts[snap.dominant] || 0) + 1;

    for (const key of EMOTION_ORDER) {
      const v = snap.emotions[key] ?? 0;
      sums[key] += v;
      if (v > peakVal) {
        peakVal = v;
        peakKey = key;
        peakTurn = snap.turn;
      }
    }

    if (i > 0) {
      const prev = history[i - 1].emotions;
      let turnShift = 0;
      for (const key of EMOTION_ORDER) {
        turnShift += Math.abs((snap.emotions[key] ?? 0) - (prev[key] ?? 0));
      }
      totalShift += turnShift / 2;
    }
  }

  const averages = {
    senang: Math.round(sums.senang / history.length),
    marah: Math.round(sums.marah / history.length),
    takut: Math.round(sums.takut / history.length),
    bingung: Math.round(sums.bingung / history.length),
    sedih: Math.round(sums.sedih / history.length),
    jijik: Math.round(sums.jijik / history.length),
  };

  let topDomKey: EmotionKey = history[0].dominant;
  let topDomCount = 0;
  for (const key of EMOTION_ORDER) {
    if (domCounts[key] > topDomCount) {
      topDomCount = domCounts[key];
      topDomKey = key;
    }
  }

  const volatilityScore =
    history.length > 1 ? Number((totalShift / (history.length - 1)).toFixed(1)) : 0;

  return {
    totalTurns: history.length,
    peakEmotion: { key: peakKey, value: Math.max(0, peakVal), turn: peakTurn },
    averages,
    mostFrequentDominant: { key: topDomKey, count: topDomCount },
    volatilityScore,
  };
}

export interface HistorySearchResult {
  personaId: string;
  personaName: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  kaomoji?: string;
}

export function searchConversationHistory(
  personas: Persona[],
  sessions: Record<string, PersonaSessionState>,
  query: string,
  onlyPersonaId?: string
): HistorySearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const personaMap = new Map(personas.map((p) => [p.id, p]));
  const targetPersonas = onlyPersonaId
    ? personas.filter((p) => p.id === onlyPersonaId)
    : personas;

  const matches: HistorySearchResult[] = [];
  for (const p of targetPersonas) {
    const sess = sessions[p.id];
    if (!sess || sess.messages.length === 0) continue;

    for (const msg of sess.messages) {
      const hay = `${msg.content} ${msg.internalThought || ''}`.toLowerCase();
      if (hay.includes(needle)) {
        matches.push({
          personaId: p.id,
          personaName: personaMap.get(p.id)?.name || p.name,
          messageId: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          kaomoji: msg.kaomoji,
        });
      }
    }
  }

  return matches.reverse();
}

export function editMessageInSession(
  session: PersonaSessionState,
  messageId: string,
  newContent: string,
  nowLabel?: string
): PersonaSessionState {
  const trimmed = newContent.trim();
  if (!trimmed) return session;
  return {
    ...session,
    messages: session.messages.map((m) =>
      m.id === messageId
        ? {
            ...m,
            content: trimmed,
            editedAt: nowLabel || 'Diedit',
          }
        : m
    ),
  };
}

export function deleteMessageFromSession(
  session: PersonaSessionState,
  messageId: string,
  persona: Persona
): PersonaSessionState {
  const idx = session.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return session;

  const nextMessages = session.messages.filter((m) => m.id !== messageId);
  if (nextMessages.length === 0) {
    return createInitialSession(persona);
  }

  // Re-sync current emotions from the latest remaining assistant message if we deleted the last assistant turn
  const removedWasLastAssistant =
    idx === session.messages.length - 1 && session.messages[idx].role === 'assistant';
  if (removedWasLastAssistant) {
    const prevAssistant = [...nextMessages].reverse().find((m) => m.role === 'assistant');
    if (prevAssistant?.emotions) {
      const dom = getDominantEmotion(prevAssistant.emotions);
      return {
        ...session,
        messages: nextMessages,
        emotions: prevAssistant.emotions,
        deltas: prevAssistant.deltas || null,
        kaomoji:
          prevAssistant.kaomoji ||
          selectKaomoji(dom.key, 0.5, persona.archetype, dom.secondaryKey),
        internalThought: prevAssistant.internalThought || session.internalThought,
        history: session.history.length > 1 ? session.history.slice(0, -1) : session.history,
      };
    }
  }

  return {
    ...session,
    messages: nextMessages,
  };
}

export interface RegenerateContext {
  userMessageId: string;
  userText: string;
  historyBeforeUser: Array<{ role: 'user' | 'assistant'; content: string }>;
  emotionsBeforeTurn: EmotionState;
  truncatedMessages: SessionMessage[];
  truncatedHistory: SessionEmotionSnapshot[];
}

export function getRegenerateContext(
  session: PersonaSessionState,
  targetMessageId: string,
  persona: Persona
): RegenerateContext | null {
  const idx = session.messages.findIndex((m) => m.id === targetMessageId);
  if (idx < 0) return null;

  const target = session.messages[idx];
  let userIdx = -1;

  if (target.role === 'user') {
    userIdx = idx;
  } else {
    for (let i = idx - 1; i >= 0; i--) {
      if (session.messages[i].role === 'user') {
        userIdx = i;
        break;
      }
    }
  }

  if (userIdx < 0) return null;
  const userMsg = session.messages[userIdx];

  // Count how many assistant messages precede userIdx to locate the exact pre-turn emotion snapshot
  let assistantBeforeCount = 0;
  for (let i = 0; i < userIdx; i++) {
    if (session.messages[i].role === 'assistant') {
      assistantBeforeCount += 1;
    }
  }

  const prevAssistant = [...session.messages.slice(0, userIdx)]
    .reverse()
    .find((m) => m.role === 'assistant');

  const emotionsBeforeTurn = prevAssistant?.emotions
    ? normalizeEmotions(prevAssistant.emotions, persona.baselineEmotions)
    : normalizeEmotions(persona.baselineEmotions);

  const truncatedMessages = session.messages.slice(0, userIdx + 1);
  const keepSnapshotCount = Math.min(session.history.length, assistantBeforeCount + 1);
  const truncatedHistory =
    keepSnapshotCount > 0
      ? session.history.slice(0, keepSnapshotCount)
      : createInitialSession(persona).history;

  return {
    userMessageId: userMsg.id,
    userText: userMsg.content,
    historyBeforeUser: session.messages.slice(0, userIdx).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    emotionsBeforeTurn,
    truncatedMessages,
    truncatedHistory,
  };
}
