import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSystemPrompt,
  detectConversationIntensity,
  mergePersonaMemories,
  sanitizeResponseConfig,
  type Persona,
  type PersonaMemoryItem,
} from './emotionEngine';
import {
  computeEmotionTimelineStats,
  createInitialSession,
  deleteMessageFromSession,
  editMessageInSession,
  getRegenerateContext,
  searchConversationHistory,
  type PersonaSessionState,
} from './sessionUtils';
import {
  createFullBackupJson,
  exportPersonaPackageJson,
  parseFullBackupJson,
  parsePersonaPackageJson,
} from './backup';
import { cleanTextForSpeech, getVoiceParamsForMood } from './speech';
import { DEFAULT_APP_SETTINGS } from './settings';

const basePersona: Persona = {
  id: 'p-aiko',
  name: 'Aiko Takahashi',
  roleTitle: 'Analis Strategi',
  mbti: 'INTJ',
  archetype: 'Tsundere',
  basePersonality: 'Perfeksionis dan peduli.',
  speakingStyle: 'Tegas namun perhatian.',
  avatarUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  sourceCategory: 'Karakter Orisinal',
  webSources: [
    {
      title: 'Referensi Arketipe',
      url: 'https://example.org/tsundere',
      snippet: 'Karakter defensif yang perlahan melunak.',
      sourceName: 'Ensiklopedia',
    },
  ],
  sourceFacts: ['Memiliki kecenderungan analitis tinggi.'],
  aiInterpretationNote: 'MBTI INTJ ditetapkan sebagai interpretasi AI.',
  baselineEmotions: {
    senang: 20,
    marah: 28,
    takut: 8,
    bingung: 26,
    sedih: 8,
    jijik: 10,
  },
  training: {
    reactivity: 1.3,
    inertia: 0.35,
    intensityBias: { rendah: 0.65, sedang: 1.0, tinggi: 1.45, ekstrem: 1.85 },
    rules: [],
  },
  responseConfig: {
    length: 'panjang',
    creativity: 0.85,
    languageStyle: 'puitis',
  },
};

test('mergePersonaMemories deduplicates content and caps categories safely', () => {
  const existing: PersonaMemoryItem[] = [
    {
      id: 'm1',
      category: 'panggilan',
      content: 'Dipanggil Kak Fahmi',
      source: 'manual',
      createdAt: '2026-11-16T00:00:00.000Z',
    },
  ];
  const merged = mergePersonaMemories(existing, [
    { category: 'panggilan', content: '  dipanggil kak fahmi  ' },
    { category: 'minat', content: 'Suka astronomi dan musik lo-fi' },
    { category: 'unknown_cat', content: 'Sedang mengerjakan proyek robotika' },
    { category: 'fakta', content: 'ok' }, // too short, skipped
  ]);

  assert.equal(merged.length, 3);
  assert.equal(merged[1].category, 'minat');
  assert.equal(merged[2].category, 'fakta');
});

test('sanitizeResponseConfig and buildSystemPrompt apply length, style, creativity, and memories', () => {
  const cfg = sanitizeResponseConfig({ length: 'singkat', creativity: 2.5, languageStyle: 'formal' });
  assert.equal(cfg.length, 'singkat');
  assert.equal(cfg.creativity, 1.0);
  assert.equal(cfg.languageStyle, 'formal');

  const prompt = buildSystemPrompt(
    basePersona,
    basePersona.baselineEmotions,
    detectConversationIntensity('Halo!'),
    { userName: 'Fahmi', relationship: 'Sahabat' },
    [
      {
        id: 'm1',
        category: 'minat',
        content: 'Suka kopi tubruk tanpa gula',
        source: 'auto',
        createdAt: '2026-11-16T00:00:00.000Z',
      },
    ]
  );

  assert.ok(prompt.includes('Suka kopi tubruk tanpa gula'));
  assert.ok(prompt.includes('4-7 kalimat'));
  assert.ok(prompt.includes('metaforis'));
  assert.ok(prompt.includes('85%'));
});

test('computeEmotionTimelineStats calculates peak, averages, frequent dominant, and volatility', () => {
  const stats = computeEmotionTimelineStats([
    {
      turn: 0,
      emotions: { senang: 20, marah: 30, takut: 10, bingung: 20, sedih: 10, jijik: 10 },
      kaomoji: '(｀^´)>',
      dominant: 'marah',
    },
    {
      turn: 1,
      emotions: { senang: 50, marah: 10, takut: 5, bingung: 20, sedih: 10, jijik: 5 },
      kaomoji: '(￣▽￣*)ゞ',
      dominant: 'senang',
    },
    {
      turn: 2,
      emotions: { senang: 60, marah: 5, takut: 5, bingung: 15, sedih: 10, jijik: 5 },
      kaomoji: '(◕‿◕✿)',
      dominant: 'senang',
    },
  ]);

  assert.equal(stats.totalTurns, 3);
  assert.equal(stats.peakEmotion.key, 'senang');
  assert.equal(stats.peakEmotion.value, 60);
  assert.equal(stats.peakEmotion.turn, 2);
  assert.equal(stats.mostFrequentDominant.key, 'senang');
  assert.equal(stats.mostFrequentDominant.count, 2);
  assert.equal(stats.averages.senang, 43);
  assert.ok(stats.volatilityScore > 0);
});

test('editMessageInSession, deleteMessageFromSession, getRegenerateContext, and searchConversationHistory work accurately', () => {
  const session: PersonaSessionState = {
    ...createInitialSession(basePersona),
    messages: [
      { id: 'u1', role: 'user', content: 'Halo Aiko, aku suka astronomi!', timestamp: '10:00' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Hmph, astronomi cukup menarik.',
        timestamp: '10:01',
        kaomoji: '(￣▽￣*)ゞ',
        dominant: 'senang',
        emotions: { senang: 45, marah: 15, takut: 5, bingung: 20, sedih: 5, jijik: 10 },
      },
      { id: 'u2', role: 'user', content: 'Bagaimana tentang teleskop?', timestamp: '10:02' },
      {
        id: 'a2',
        role: 'assistant',
        content: 'Teleskop butuh kalibrasi cermat.',
        timestamp: '10:03',
        kaomoji: '(・‿・)',
        dominant: 'bingung',
        emotions: { senang: 25, marah: 10, takut: 5, bingung: 40, sedih: 10, jijik: 10 },
      },
    ],
    history: [
      { turn: 0, emotions: basePersona.baselineEmotions, kaomoji: '(｀^´)>', dominant: 'marah' },
      {
        turn: 1,
        emotions: { senang: 45, marah: 15, takut: 5, bingung: 20, sedih: 5, jijik: 10 },
        kaomoji: '(￣▽￣*)ゞ',
        dominant: 'senang',
      },
      {
        turn: 2,
        emotions: { senang: 25, marah: 10, takut: 5, bingung: 40, sedih: 10, jijik: 10 },
        kaomoji: '(・‿・)',
        dominant: 'bingung',
      },
    ],
  };

  const edited = editMessageInSession(session, 'u2', 'Bagaimana tentang planet Mars?');
  assert.equal(edited.messages[2].content, 'Bagaimana tentang planet Mars?');
  assert.ok(edited.messages[2].editedAt);

  const regenCtx = getRegenerateContext(edited, 'a2', basePersona);
  assert.ok(regenCtx);
  assert.equal(regenCtx.userText, 'Bagaimana tentang planet Mars?');
  assert.equal(regenCtx.emotionsBeforeTurn.senang, 45);
  assert.equal(regenCtx.truncatedMessages.length, 3);
  assert.equal(regenCtx.truncatedHistory.length, 2);

  const deleted = deleteMessageFromSession(session, 'a2', basePersona);
  assert.equal(deleted.messages.length, 3);
  assert.equal(deleted.emotions.senang, 45);

  const searchAll = searchConversationHistory([basePersona], { [basePersona.id]: edited }, 'mars');
  assert.equal(searchAll.length, 1);
  assert.equal(searchAll[0].messageId, 'u2');
});

test('persona package and full backup JSON round-trip cleanly preserving photo, memories, and sessions', () => {
  const pkgJson = exportPersonaPackageJson(basePersona);
  const imported = parsePersonaPackageJson(pkgJson, new Set([basePersona.id]));

  assert.notEqual(imported.id, basePersona.id); // resolves ID collision
  assert.equal(imported.name, basePersona.name);
  assert.equal(imported.avatarUrl, basePersona.avatarUrl);
  assert.equal(imported.responseConfig?.length, 'panjang');
  assert.equal(imported.webSources?.[0].snippet, 'Karakter defensif yang perlahan melunak.');

  const sess = {
    ...createInitialSession(basePersona),
    messages: [{ id: 'u1', role: 'user' as const, content: 'Tes cadangan', timestamp: '11:00' }],
  };
  const memories: Record<string, PersonaMemoryItem[]> = {
    [basePersona.id]: [
      {
        id: 'mem1',
        category: 'panggilan',
        content: 'Panggil Fahmi',
        source: 'manual',
        createdAt: '2026-11-16T00:00:00.000Z',
      },
    ],
  };

  const backupJson = createFullBackupJson({
    personas: [basePersona],
    activePersonaId: basePersona.id,
    sessions: { [basePersona.id]: sess },
    memoriesByPersona: memories,
    settings: { ...DEFAULT_APP_SETTINGS, theme: 'midnight', voice: { autoSpeak: true, speechRate: 1.15 } },
  });

  const restored = parseFullBackupJson(backupJson);
  assert.equal(restored.personas.length, 1);
  assert.equal(restored.sessions[basePersona.id].messages[0].content, 'Tes cadangan');
  assert.equal(restored.memoriesByPersona[basePersona.id][0].content, 'Panggil Fahmi');
  assert.equal(restored.settings.theme, 'midnight');
  assert.equal(restored.settings.voice.autoSpeak, true);
});

test('cleanTextForSpeech and getVoiceParamsForMood prepare readable speech parameters', () => {
  const cleaned = cleanTextForSpeech('**Halo** (￣▽￣*)ゞ selamat pagi *teman*!');
  assert.equal(cleaned, 'Halo selamat pagi teman!');

  const sadStoik = getVoiceParamsForMood('sedih', 'Stoik', 1.0);
  const happyGenki = getVoiceParamsForMood('senang', 'Genki', 1.0);
  assert.ok(happyGenki.rate > sadStoik.rate);
  assert.ok(happyGenki.pitch > sadStoik.pitch);
});
