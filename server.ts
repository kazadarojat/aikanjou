import express, { type Request } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  applyEmotionTraining,
  buildSystemPrompt,
  detectConversationIntensity,
  normalizeEmotions,
  sanitizeAnalyzedDraft,
  sanitizeResponseConfig,
  type EmotionState,
  type Persona,
  type PersonaMemoryItem,
  type UserPromptContext,
  type WebSourceRef,
} from './src/lib/emotionEngine.ts';
import {
  BYOK_PROVIDERS,
  isValidHttpUrl,
  type ByokProvider,
} from './src/lib/byok.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  message?: string;
  history?: ChatTurn[];
  persona?: Persona;
  currentEmotions?: EmotionState;
  userPreferences?: UserPromptContext;
  memories?: PersonaMemoryItem[];
}

interface ResolvedAiContext {
  isByok: boolean;
  provider: ByokProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

function getHeaderString(req: Request, name: string): string {
  const val = req.header(name);
  return typeof val === 'string' ? val.trim() : '';
}

function resolveAiContext(req: Request): ResolvedAiContext | null {
  const byokKey = getHeaderString(req, 'x-byok-api-key');
  if (byokKey) {
    const rawProvider = getHeaderString(req, 'x-byok-provider');
    const provider: ByokProvider =
      rawProvider === 'openai' || rawProvider === 'openai-compatible' || rawProvider === 'gemini'
        ? rawProvider
        : 'gemini';
    const meta = BYOK_PROVIDERS[provider];
    const model = getHeaderString(req, 'x-byok-model') || meta.defaultModel;
    const rawBase = getHeaderString(req, 'x-byok-base-url').replace(/\/+$/, '');
    const baseUrl =
      rawBase && isValidHttpUrl(rawBase)
        ? rawBase
        : meta.defaultBaseUrl || 'https://api.openai.com/v1';

    return {
      isByok: true,
      provider,
      apiKey: byokKey,
      model,
      baseUrl,
    };
  }

  const serverKey = process.env.GEMINI_API_KEY;
  if (!serverKey || serverKey === 'MY_GEMINI_API_KEY') {
    return null;
  }

  return {
    isByok: false,
    provider: 'gemini',
    apiKey: serverKey,
    model: 'gemini-4-hydrogen',
    baseUrl: '',
  };
}

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function supportsThinkingConfig(model: string): boolean {
  return model.startsWith('gemini-4') || model.startsWith('gemini-3');
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('Respons JSON tidak valid dari model AI.');
  }
}

class ProviderHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function callOpenAiCompatibleJson(
  ctx: ResolvedAiContext,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const url = `${ctx.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const payloadBase: Record<string, unknown> = {
    model: ctx.model,
    messages,
  };
  if (options?.maxTokens) {
    payloadBase.max_tokens = options.maxTokens;
  }
  if (typeof options?.temperature === 'number' && Number.isFinite(options.temperature)) {
    payloadBase.temperature = options.temperature;
  }

  const attemptRequest = async (withJsonFormat: boolean) => {
    const body = withJsonFormat
      ? { ...payloadBase, response_format: { type: 'json_object' } }
      : payloadBase;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });

    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (!response.ok) {
      const errMsg = data?.error?.message || `HTTP ${response.status} dari ${ctx.baseUrl}`;
      if (withJsonFormat && response.status === 400 && errMsg.toLowerCase().includes('response_format')) {
        return null; // retry without response_format
      }
      throw new ProviderHttpError(response.status, errMsg);
    }

    return data?.choices?.[0]?.message?.content?.trim() || '';
  };

  const withFormat = await attemptRequest(true);
  if (withFormat !== null) {
    return withFormat;
  }
  const withoutFormat = await attemptRequest(false);
  return withoutFormat || '';
}

function extractErrorStatus(err: unknown): number {
  if (err instanceof ProviderHttpError) return err.status;
  const directStatus = (err as { status?: number })?.status;
  if (typeof directStatus === 'number' && directStatus > 0) return directStatus;
  const msg = err instanceof Error ? err.message : String(err || '');
  try {
    const parsed = JSON.parse(msg);
    const code = parsed?.error?.code;
    if (typeof code === 'number') return code;
  } catch {
    // not JSON
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('"code":429')) return 429;
  if (msg.includes('PERMISSION_DENIED') || msg.includes('"code":403')) return 403;
  if (msg.includes('UNAUTHORIZED') || msg.includes('"code":401')) return 401;
  if (msg.includes('API_KEY_INVALID') || msg.includes('"code":400')) return 400;
  return 500;
}

function formatProviderError(
  err: unknown,
  fallback: string,
  isByok: boolean
): { status: number; message: string } {
  const status = extractErrorStatus(err);
  if (status === 429) {
    return {
      status: 429,
      message: isByok
        ? 'Kuota API key BYOK Anda mencapai batas sementara (429). Tunggu sebentar atau periksa limit akun provider Anda.'
        : 'Kuota Gemini API sedang penuh atau mencapai batas sementara (429). Tunggu beberapa saat lalu coba lagi, atau gunakan API key Anda sendiri lewat Pengaturan > API Key (BYOK).',
    };
  }
  if (status === 401 || status === 403 || status === 400) {
    const rawDetail = err instanceof Error ? err.message : '';
    return {
      status,
      message: isByok
        ? `API key BYOK atau konfigurasi model ditolak (${status}). Periksa kembali kunci, provider, dan nama model di Pengaturan > API Key (BYOK).${rawDetail && rawDetail.length < 180 ? ` (${rawDetail})` : ''}`
        : `Permintaan Gemini API ditolak (${status}). Periksa GEMINI_API_KEY di panel Settings > Secrets.`,
    };
  }
  const rawMsg = err instanceof Error ? err.message : fallback;
  try {
    const parsed = JSON.parse(rawMsg);
    if (typeof parsed?.error?.message === 'string') {
      return { status, message: parsed.error.message };
    }
  } catch {
    // plain text
  }
  return { status, message: rawMsg || fallback };
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = extractErrorStatus(err);
      const retryable = status === 503 || status === 500;
      if (!retryable || attempt === maxAttempts - 1) {
        throw err;
      }
      const delayMs = 400 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function fetchWikipediaResearch(
  characterName: string,
  categoryHint: string
): Promise<{ notes: string; sources: WebSourceRef[] }> {
  const headers = {
    'User-Agent': 'KanjouHarness/1.0 (https://localhost:3000; contact@kanjou.local)',
    Accept: 'application/json',
  };

  const queryWiki = async (lang: 'id' | 'en', query: string) => {
    const searchUrl =
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}` +
      `&srlimit=3&utf8=1&format=json`;
    const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(7000) });
    if (!searchRes.ok) return { extracts: [] as string[], sources: [] as WebSourceRef[] };
    const searchData = (await searchRes.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    const titles = (searchData.query?.search || [])
      .map((item) => item.title)
      .filter((t): t is string => Boolean(t))
      .slice(0, 2);

    if (titles.length === 0) {
      return { extracts: [] as string[], sources: [] as WebSourceRef[] };
    }

    const extractUrl =
      `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts|info&exintro=1&explaintext=1` +
      `&inprop=url&redirects=1&titles=${encodeURIComponent(titles.join('|'))}&format=json`;
    const extractRes = await fetch(extractUrl, { headers, signal: AbortSignal.timeout(7000) });
    if (!extractRes.ok) return { extracts: [] as string[], sources: [] as WebSourceRef[] };
    const extractData = (await extractRes.json()) as {
      query?: {
        pages?: Record<
          string,
          { title?: string; extract?: string; fullurl?: string }
        >;
      };
    };

    const pages = Object.values(extractData.query?.pages || {});
    const extracts: string[] = [];
    const sources: WebSourceRef[] = [];

    for (const page of pages) {
      if (page.title && page.extract) {
        const cleanExtract = page.extract.replace(/\s+/g, ' ').trim();
        extracts.push(`[${lang.toUpperCase()} Wikipedia — ${page.title}]\n${cleanExtract.slice(0, 1400)}`);
        if (page.fullurl) {
          const snippet = cleanExtract.slice(0, 220) + (cleanExtract.length > 220 ? '...' : '');
          sources.push({
            title: page.title || characterName,
            url: page.fullurl,
            snippet,
            sourceName: `${lang.toUpperCase()} Wikipedia`,
          });
        }
      } else if (page.fullurl) {
        sources.push({
          title: page.title || characterName,
          url: page.fullurl,
          sourceName: `${lang.toUpperCase()} Wikipedia`,
        });
      }
    }

    return { extracts, sources };
  };

  const [idWiki, enWiki] = await Promise.allSettled([
    queryWiki('id', characterName),
    queryWiki('en', `${characterName}`),
  ]);

  const extracts: string[] = [];
  const sources: WebSourceRef[] = [];
  const seenUrls = new Set<string>();

  for (const result of [idWiki, enWiki]) {
    if (result.status === 'fulfilled') {
      extracts.push(...result.value.extracts);
      for (const src of result.value.sources) {
        if (!seenUrls.has(src.url) && sources.length < 6) {
          seenUrls.add(src.url);
          sources.push(src);
        }
      }
    }
  }

  const notes =
    extracts.length > 0
      ? extracts.join('\n\n')
      : `Tokoh/karakter yang diminta: ${characterName} (kategori: ${categoryHint}).`;

  return { notes, sources };
}

app.get('/api/health', (req, res) => {
  const ctx = resolveAiContext(req);
  res.json({ ok: true, hasApiKey: Boolean(ctx) });
});

app.post('/api/byok/verify', async (req, res) => {
  const body = (req.body || {}) as {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  const provider: ByokProvider =
    body.provider === 'openai' || body.provider === 'openai-compatible' || body.provider === 'gemini'
      ? body.provider
      : 'gemini';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const meta = BYOK_PROVIDERS[provider];
  const model = (typeof body.model === 'string' ? body.model.trim() : '') || meta.defaultModel;
  const rawBase = typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/, '') : '';
  const baseUrl =
    rawBase && isValidHttpUrl(rawBase)
      ? rawBase
      : meta.defaultBaseUrl || 'https://api.openai.com/v1';

  if (!apiKey) {
    res.status(400).json({ error: 'Masukkan API key terlebih dahulu sebelum menguji koneksi.' });
    return;
  }

  const ctx: ResolvedAiContext = {
    isByok: true,
    provider,
    apiKey,
    model,
    baseUrl,
  };

  try {
    if (provider === 'gemini') {
      const ai = createGeminiClient(apiKey);
      const response = await ai.models.generateContent({
        model,
        contents: 'Balas hanya dengan kata: OK',
        config: supportsThinkingConfig(model)
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : undefined,
      });
      if (!response.text && response.candidates?.length === 0) {
        throw new Error('Tidak ada respons dari model Gemini.');
      }
    } else {
      await callOpenAiCompatibleJson(
        ctx,
        [
          { role: 'system', content: 'Balas dengan objek JSON {"status":"ok"}.' },
          { role: 'user', content: 'Tes koneksi.' },
        ],
        { maxTokens: 24 }
      );
    }

    res.json({
      ok: true,
      provider,
      model,
      message: `Kunci valid! Terhubung ke ${meta.label} (${model}).`,
    });
  } catch (err: unknown) {
    const formatted = formatProviderError(err, 'Gagal memverifikasi API key BYOK.', true);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const body = (req.body || {}) as ChatRequestBody;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const persona = body.persona;

  if (!message) {
    res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
    return;
  }

  if (!persona || !persona.name || !persona.mbti || !persona.archetype) {
    res.status(400).json({ error: 'Konfigurasi persona tidak valid.' });
    return;
  }

  const ctx = resolveAiContext(req);
  if (!ctx) {
    res.status(503).json({
      error:
        'API key belum tersedia. Tambahkan kunci Anda sendiri lewat Pengaturan > API Key (BYOK), atau atur GEMINI_API_KEY di panel Settings > Secrets.',
    });
    return;
  }

  const currentEmotions = normalizeEmotions(
    body.currentEmotions || persona.baselineEmotions,
    persona.baselineEmotions
  );
  const intensity = detectConversationIntensity(message);
  const responseCfg = sanitizeResponseConfig(persona.responseConfig);
  const systemInstruction = buildSystemPrompt(
    persona,
    currentEmotions,
    intensity,
    body.userPreferences,
    body.memories
  );

  const history = Array.isArray(body.history) ? body.history.slice(-16) : [];

  try {
    let parsed: {
      reply?: string;
      internalThought?: string;
      emotionStimulus?: Partial<EmotionState>;
      newMemories?: Array<{ category?: string; content?: string }>;
    };

    if (ctx.provider === 'gemini') {
      const ai = createGeminiClient(ctx.apiKey);
      const contents = [
        ...history.map((turn) => ({
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: turn.content }],
        })),
        {
          role: 'user',
          parts: [{ text: message }],
        },
      ];

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: ctx.model,
          contents,
          config: {
            systemInstruction,
            ...(supportsThinkingConfig(ctx.model)
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: {
                  type: Type.STRING,
                  description:
                    'Balasan dialog penuh dalam karakter persona, natural, tanpa format JSON atau penjelasan meta.',
                },
                internalThought: {
                  type: Type.STRING,
                  description:
                    'Monolog batin singkat (1 kalimat) mengapa karakter merasakan perubahan emosi ini.',
                },
                emotionStimulus: {
                  type: Type.OBJECT,
                  properties: {
                    senang: { type: Type.NUMBER },
                    marah: { type: Type.NUMBER },
                    takut: { type: Type.NUMBER },
                    bingung: { type: Type.NUMBER },
                    sedih: { type: Type.NUMBER },
                    jijik: { type: Type.NUMBER },
                  },
                  required: ['senang', 'marah', 'takut', 'bingung', 'sedih', 'jijik'],
                },
                newMemories: {
                  type: Type.ARRAY,
                  description:
                    'Fakta personal penting baru yang diungkap user (panggilan, minat, hubungan, atau fakta) jika ada; kosong [] bila tidak ada.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      category: { type: Type.STRING },
                      content: { type: Type.STRING },
                    },
                    required: ['category', 'content'],
                  },
                },
              },
              required: ['reply', 'internalThought', 'emotionStimulus'],
            },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      try {
        parsed = extractJsonObject(rawText) as typeof parsed;
      } catch {
        parsed = {
          reply: rawText || '...',
          internalThought: 'Mencerna ucapan lawan bicara.',
          emotionStimulus: currentEmotions,
          newMemories: [],
        };
      }
    } else {
      const openAiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        {
          role: 'system',
          content: `${systemInstruction}\n\nPENTING: Jawab HANYA dengan objek JSON valid berformat persis seperti ini:\n{"reply":"string","internalThought":"string","emotionStimulus":{"senang":0,"marah":0,"takut":0,"bingung":0,"sedih":0,"jijik":0},"newMemories":[{"category":"panggilan|minat|hubungan|fakta","content":"string"}]}`,
        },
        ...history.map((turn) => ({
          role: (turn.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
          content: turn.content,
        })),
        { role: 'user', content: message },
      ];

      const temperature = Number((0.2 + responseCfg.creativity * 0.9).toFixed(2));
      const rawText = await withRetry(() =>
        callOpenAiCompatibleJson(ctx, openAiMessages, { temperature })
      );
      try {
        parsed = extractJsonObject(rawText) as typeof parsed;
      } catch {
        parsed = {
          reply: rawText || '...',
          internalThought: 'Mencerna ucapan lawan bicara.',
          emotionStimulus: currentEmotions,
          newMemories: [],
        };
      }
    }

    const trained = applyEmotionTraining(
      currentEmotions,
      parsed.emotionStimulus || currentEmotions,
      message,
      persona
    );

    const newMemories = Array.isArray(parsed.newMemories)
      ? parsed.newMemories.filter(
          (m) => m && typeof m.content === 'string' && m.content.trim().length >= 3
        )
      : [];

    res.json({
      reply: parsed.reply || '...',
      internalThought: parsed.internalThought || '',
      emotions: trained.next,
      deltas: trained.deltas,
      dominant: trained.dominant,
      kaomoji: trained.kaomoji,
      intensity: trained.intensity,
      triggeredRules: trained.triggeredRules,
      newMemories,
    });
  } catch (err: unknown) {
    const formatted = formatProviderError(err, 'Gagal menghubungi layanan AI.', ctx.isByok);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

interface AnalyzePersonaBody {
  characterName?: string;
  category?: 'otomatis' | 'sejarah' | 'publik_figur' | 'fiksi_film_game';
}

const CATEGORY_HINT: Record<NonNullable<AnalyzePersonaBody['category']>, string> = {
  otomatis: 'tokoh sejarah, publik figur, atau karakter fiksi (film/game/anime/novel)',
  sejarah: 'tokoh sejarah dunia/nusantara',
  publik_figur: 'publik figur, ilmuwan, seniman, atau tokoh masyarakat modern',
  fiksi_film_game: 'karakter fiksi dari film, serial, anime, atau video game',
};

app.post('/api/persona/analyze', async (req, res) => {
  const body = (req.body || {}) as AnalyzePersonaBody;
  const characterName = typeof body.characterName === 'string' ? body.characterName.trim() : '';
  const category = body.category || 'otomatis';

  if (!characterName || characterName.length < 2) {
    res.status(400).json({ error: 'Masukkan nama tokoh atau karakter minimal 2 karakter.' });
    return;
  }

  const ctx = resolveAiContext(req);
  if (!ctx) {
    res.status(503).json({
      error:
        'API key belum tersedia untuk analisa tokoh. Aktifkan BYOK di Pengaturan atau atur GEMINI_API_KEY di panel Settings > Secrets.',
    });
    return;
  }

  try {
    const categoryLabel = CATEGORY_HINT[category] || CATEGORY_HINT.otomatis;
    let researchNotes = '';
    const seenUrls = new Set<string>();
    const sources: WebSourceRef[] = [];

    if (ctx.provider === 'gemini') {
      const ai = createGeminiClient(ctx.apiKey);
      // Step 1: Web-grounded research via Gemini Google Search (falls back to Wikipedia Web API if grounding quota is 429)
      try {
        const searchResponse = await ai.models.generateContent({
          model: ctx.model,
          contents: [
            `Telusuri informasi faktual dari web mengenai "${characterName}" (${categoryLabel}).`,
            `Rangkum dalam Bahasa Indonesia:`,
            `1. Identitas resmi, era/karya asal (sejarah, publik figur, film, atau game), dan perannya.`,
            `2. Watak, kepribadian dasar, nilai moral, serta kelemahan atau sisi emosionalnya.`,
            `3. Gaya bicara, diksi khas, dan cara merespons tekanan, pujian, atau konflik.`,
            `4. Estimasi tipe MBTI yang paling mendekati beserta alasannya.`,
            `5. Pemicu emosi utama (hal yang membuatnya senang, marah, takut, bingung, sedih, atau jijik).`,
          ].join('\n'),
          config: {
            tools: [{ googleSearch: {} }],
            ...(supportsThinkingConfig(ctx.model)
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        });

        researchNotes = (searchResponse.text ?? '').trim();
        const metadata = searchResponse.candidates?.[0]?.groundingMetadata;
        const rawChunks = metadata?.groundingChunks || [];
        const rawSupports = metadata?.groundingSupports || [];
        const chunkSnippets = new Map<number, string>();
        for (const sup of rawSupports) {
          const text = sup?.segment?.text?.trim();
          const idxs = sup?.groundingChunkIndices || [];
          if (text) {
            for (const idx of idxs) {
              if (!chunkSnippets.has(idx)) {
                chunkSnippets.set(idx, text.slice(0, 220));
              }
            }
          }
        }
        rawChunks.forEach((chunk, idx) => {
          if (sources.length >= 6) return;
          const uri = chunk?.web?.uri;
          if (uri && !seenUrls.has(uri)) {
            seenUrls.add(uri);
            let sourceName = 'Web';
            try {
              sourceName = new URL(uri).hostname.replace(/^www\./, '');
            } catch {
              // ignore URL parse error
            }
            sources.push({
              title: chunk.web?.title || uri,
              url: uri,
              sourceName,
              ...(chunkSnippets.get(idx) ? { snippet: chunkSnippets.get(idx) } : {}),
            });
          }
        });
      } catch (searchErr: unknown) {
        const searchStatus = extractErrorStatus(searchErr);
        if (searchStatus === 401 || searchStatus === 403 || searchStatus === 400) {
          throw searchErr;
        }
        const wiki = await fetchWikipediaResearch(characterName, categoryLabel);
        researchNotes = wiki.notes;
        for (const src of wiki.sources) {
          if (!seenUrls.has(src.url) && sources.length < 6) {
            seenUrls.add(src.url);
            sources.push(src);
          }
        }
      }
    }

    // Also enrich with Wikipedia structured quotes if we have fewer than 3 sources so users always get multi-source citations & quotes
    if (!researchNotes || sources.length < 3) {
      const wiki = await fetchWikipediaResearch(characterName, categoryLabel);
      if (!researchNotes) {
        researchNotes = wiki.notes;
      } else if (wiki.notes && wiki.sources.length > 0) {
        researchNotes = `${researchNotes}\n\nTambahan Referensi Ensiklopedia:\n${wiki.notes.slice(0, 1200)}`;
      }
      for (const src of wiki.sources) {
        if (!seenUrls.has(src.url) && sources.length < 6) {
          seenUrls.add(src.url);
          sources.push(src);
        }
      }
    }

    const synthesisPrompt = [
      `Berdasarkan hasil riset web berikut tentang "${characterName}", susun profil Persona AI dalam format JSON terstruktur.`,
      `Catatan Riset Web:\n${researchNotes || `Karakter: ${characterName} (${categoryLabel})`}`,
      ``,
      `Panduan pengisian:`,
      `- sourceCategory: pilih salah satu yang paling akurat: "Tokoh Sejarah", "Publik Figur", atau "Karakter Fiksi (Film/Game)".`,
      `- mbti: salah satu dari 16 kode MBTI standar (INTJ, INTP, ENTJ, ENTP, INFJ, INFP, ENFJ, ENFP, ISTJ, ISFJ, ESTJ, ESFJ, ISTP, ISFP, ESTP, ESFP).`,
      `- archetype: pilih yang paling mendekati dari: Tsundere, Yandere, Kuudere, Dandere, Genki, Stoik, Melankolis, atau Kustom.`,
      `- baselineEmotions: nilai 6 emosi (senang, marah, takut, bingung, sedih, jijik) dengan total 100.`,
      `- reactivity: angka 0.3 hingga 2.0 (seberapa cepat emosi berubah).`,
      `- inertia: angka 0.05 hingga 0.85 (seberapa kuat emosi bertahan).`,
      `- suggestedRules: 2 atau 3 aturan pemicu emosi spesifik tokoh ini (kata kunci Bahasa Indonesia yang relevan saat diajak bicara).`,
      `- webSummary: ringkasan singkat 1-2 kalimat hasil analisa web dalam Bahasa Indonesia.`,
      `- sourceFacts: 3 hingga 5 poin fakta singkat yang benar-benar bersumber dari catatan riset web di atas (bukan spekulasi).`,
      `- aiInterpretationNote: 1-2 kalimat transparan yang membedakan mana interpretasi AI (mis. estimasi MBTI, arketipe watak, persentase emosi awal, gaya dialog) dari fakta sumber.`,
    ].join('\n');

    let parsedRaw: Record<string, unknown> = {};

    if (ctx.provider === 'gemini') {
      const ai = createGeminiClient(ctx.apiKey);
      const synthesisResponse = await withRetry(() =>
        ai.models.generateContent({
          model: ctx.model,
          contents: synthesisPrompt,
          config: {
            ...(supportsThinkingConfig(ctx.model)
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                roleTitle: { type: Type.STRING },
                sourceCategory: { type: Type.STRING },
                mbti: { type: Type.STRING },
                archetype: { type: Type.STRING },
                basePersonality: { type: Type.STRING },
                speakingStyle: { type: Type.STRING },
                webSummary: { type: Type.STRING },
                sourceFacts: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                aiInterpretationNote: { type: Type.STRING },
                reactivity: { type: Type.NUMBER },
                inertia: { type: Type.NUMBER },
                baselineEmotions: {
                  type: Type.OBJECT,
                  properties: {
                    senang: { type: Type.NUMBER },
                    marah: { type: Type.NUMBER },
                    takut: { type: Type.NUMBER },
                    bingung: { type: Type.NUMBER },
                    sedih: { type: Type.NUMBER },
                    jijik: { type: Type.NUMBER },
                  },
                  required: ['senang', 'marah', 'takut', 'bingung', 'sedih', 'jijik'],
                },
                suggestedRules: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      triggerKeywords: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      targetEmotion: { type: Type.STRING },
                      boostAmount: { type: Type.NUMBER },
                    },
                    required: ['label', 'triggerKeywords', 'targetEmotion', 'boostAmount'],
                  },
                },
              },
              required: [
                'name',
                'roleTitle',
                'sourceCategory',
                'mbti',
                'archetype',
                'basePersonality',
                'speakingStyle',
                'webSummary',
                'sourceFacts',
                'aiInterpretationNote',
                'reactivity',
                'inertia',
                'baselineEmotions',
                'suggestedRules',
              ],
            },
          },
        })
      );

      const rawJson = (synthesisResponse.text ?? '{}').trim();
      try {
        parsedRaw = extractJsonObject(rawJson);
      } catch {
        parsedRaw = {};
      }
    } else {
      const rawJson = await withRetry(() =>
        callOpenAiCompatibleJson(ctx, [
          {
            role: 'system',
            content:
              'Kamu adalah analis karakter & psikologi persona AI. Balas HANYA dengan objek JSON valid berisi field: name, roleTitle, sourceCategory, mbti, archetype, basePersonality, speakingStyle, webSummary, sourceFacts ([string]), aiInterpretationNote, reactivity, inertia, baselineEmotions (senang, marah, takut, bingung, sedih, jijik), suggestedRules ([{label, triggerKeywords, targetEmotion, boostAmount}]).',
          },
          { role: 'user', content: synthesisPrompt },
        ])
      );
      try {
        parsedRaw = extractJsonObject(rawJson);
      } catch {
        parsedRaw = {};
      }
    }

    const draft = sanitizeAnalyzedDraft(parsedRaw, characterName);

    res.json({
      draft,
      sources,
    });
  } catch (err: unknown) {
    const formatted = formatProviderError(
      err,
      'Gagal menganalisa karakter dari web.',
      ctx.isByok
    );
    res.status(formatted.status).json({ error: formatted.message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Kanjou Harness server running on http://localhost:${port}`);
  });
}

startServer();
