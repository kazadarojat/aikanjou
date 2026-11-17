import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatExportPayload,
  buildExportFilename,
  formatChatLogAsJson,
  formatChatLogAsText,
  slugifyFilename,
  type ChatExportInput,
} from './chatExport';
import type { Persona } from './emotionEngine';

const demoPersona: Persona = {
  id: 'aiko-tsundere',
  name: 'Aiko Tsukino',
  roleTitle: 'Arsitek Strategis',
  mbti: 'INTJ',
  archetype: 'Tsundere',
  sourceCategory: 'Karakter Orisinal',
  basePersonality: 'Tajam, perfeksionis, tapi peduli.',
  speakingStyle: 'Sedikit ketus namun teliti.',
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
    intensityBias: {
      rendah: 0.6,
      sedang: 1.0,
      tinggi: 1.4,
      ekstrem: 1.85,
    },
    rules: [],
  },
};

const sampleInput: ChatExportInput = {
  persona: demoPersona,
  messages: [
    {
      id: 'u1',
      role: 'user',
      content: 'Kamu keren banget hari ini!!',
      timestamp: '14:10',
      intensity: {
        level: 'tinggi',
        score: 0.72,
        signals: ['Tanda seru/tanya bertingkat'],
      },
    },
    {
      id: 'a1',
      role: 'assistant',
      content: 'H-hmph! Bukan berarti aku senang dipuji begitu, tapi terima kasih.',
      timestamp: '14:11',
      kaomoji: '(￣▽￣*)ゞ',
      dominant: 'senang',
      emotions: {
        senang: 42,
        marah: 20,
        takut: 6,
        bingung: 20,
        sedih: 6,
        jijik: 6,
      },
      deltas: {
        senang: 22,
        marah: -8,
        takut: -2,
        bingung: -6,
        sedih: -2,
        jijik: -4,
      },
      internalThought: 'Jantungku berdetak lebih cepat saat dipuji langsung.',
      triggeredRules: ['Salah Tingkah Saat Dipuji'],
    },
  ],
  currentEmotions: {
    senang: 42,
    marah: 20,
    takut: 6,
    bingung: 20,
    sedih: 6,
    jijik: 6,
  },
  currentKaomoji: '(￣▽￣*)ゞ',
  internalThought: 'Jantungku berdetak lebih cepat saat dipuji langsung.',
  history: [
    {
      turn: 0,
      emotions: demoPersona.baselineEmotions,
      kaomoji: '(｀^´)>',
      dominant: 'marah',
    },
    {
      turn: 1,
      emotions: {
        senang: 42,
        marah: 20,
        takut: 6,
        bingung: 20,
        sedih: 6,
        jijik: 6,
      },
      kaomoji: '(￣▽￣*)ゞ',
      dominant: 'senang',
    },
  ],
  userPreferences: {
    userName: 'Fahmi',
    relationship: 'Sahabat Dekat',
    customNote: 'Santai',
  },
  exportedAt: new Date(2026, 10, 16, 14, 15, 0),
};

test('slugifyFilename and buildExportFilename generate safe deterministic filenames', () => {
  assert.equal(slugifyFilename('Aiko Tsukino! (v2)'), 'aiko-tsukino-v2');
  assert.equal(slugifyFilename('   '), 'persona');

  const fixedDate = new Date(2026, 10, 16, 9, 5, 0);
  assert.equal(
    buildExportFilename('Aiko Tsukino', 'txt', fixedDate),
    'kanjou-log-aiko-tsukino-20261116-0905.txt'
  );
  assert.equal(
    buildExportFilename('Nikola Tesla', 'json', fixedDate),
    'kanjou-log-nikola-tesla-20261116-0905.json'
  );
});

test('formatChatLogAsText includes persona metadata, user messages, emotions, kaomoji, and history', () => {
  const txt = formatChatLogAsText(sampleInput);

  assert.ok(txt.includes('LOG PERCAKAPAN — KANJOU HARNESS'));
  assert.ok(txt.includes('Aiko Tsukino (Arsitek Strategis)'));
  assert.ok(txt.includes('INTJ · Tsundere'));
  assert.ok(txt.includes('Fahmi (Hubungan: Sahabat Dekat)'));
  assert.ok(txt.includes('Kamu keren banget hari ini!!'));
  assert.ok(txt.includes('(￣▽￣*)ゞ'));
  assert.ok(txt.includes('Batin: "Jantungku berdetak lebih cepat saat dipuji langsung."'));
  assert.ok(txt.includes('Senang 42% (+22)'));
  assert.ok(txt.includes('Aturan terpicu: Salah Tingkah Saat Dipuji'));
  assert.ok(txt.includes('JEJAK PERUBAHAN EMOSI'));
  assert.ok(txt.includes('Putaran 1: Senang (42%)'));
});

test('formatChatLogAsText handles empty message list cleanly', () => {
  const emptyTxt = formatChatLogAsText({
    ...sampleInput,
    messages: [],
    history: [sampleInput.history[0]],
  });

  assert.ok(emptyTxt.includes('Jumlah Pesan   : 0'));
  assert.ok(emptyTxt.includes('(Belum ada pesan dalam percakapan ini.)'));
});

test('formatChatLogAsJson outputs valid structured JSON preserving messages and emotion telemetry', () => {
  const raw = formatChatLogAsJson(sampleInput);
  const parsed = JSON.parse(raw) as ReturnType<typeof buildChatExportPayload>;

  assert.equal(parsed.schemaVersion, '1.0');
  assert.equal(parsed.app, 'Kanjou Harness');
  assert.equal(parsed.persona.name, 'Aiko Tsukino');
  assert.equal(parsed.userContext.userName, 'Fahmi');
  assert.equal(parsed.session.messageCount, 2);
  assert.equal(parsed.session.dominantEmotion, 'senang');
  assert.equal(parsed.session.dominantEmotionValue, 42);
  assert.equal(parsed.session.emotionHistory.length, 2);
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[1].kaomoji, '(￣▽￣*)ゞ');
});
