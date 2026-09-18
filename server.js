const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const pkg = require('./package.json');
const {
  buildAskResponse,
  collapseWhitespace,
  extractClaudeText,
  extractPassageTextFromChapterData,
  normalizeLang,
  previewForLog
} = require('./lib/answerPipeline');
const { dailyVerse } = require('./lib/dailyVerses');

// One place to change the model. Sonnet 5 unless the environment says
// otherwise, so a model swap is a Railway variable, not a deploy.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const app = express();

// Railway terminates TLS in a proxy in front of this process, so every request
// arrives carrying the proxy's address. Without this the rate limiter would see
// a single client for the whole world: one script would lock out every real
// user at once. The value is the number of proxies to trust, not `true` —
// trusting blindly lets a caller forge X-Forwarded-For and dodge the limit.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

/// Shared shape so a throttled client gets the same error envelope as any
/// other failure and can show a real message instead of "unexpected error".
function makeLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',   // RateLimit-* headers, so a client can back off
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'rate_limited', message } }),
  });
}

// /ask and /interpret each spend an Anthropic call. A person working through a
// feeling sends a handful of these in a sitting; a loop reaches thirty in under
// a minute, which is exactly the difference worth acting on.
const modelLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: 'Too many requests. Please wait a few minutes and try again.',
});

// Everything else only reads scripture from a free upstream. The limit here is
// to stop hammering, not to protect a bill, so it is deliberately loose —
// several readers behind one carrier NAT must not collide.
const readLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  message: 'Too many requests. Please slow down.',
});

app.use('/ask',       modelLimiter);
app.use('/interpret', modelLimiter);
app.use('/verse-of-day', readLimiter);
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: {
        code: 'invalid_json',
        message: 'Malformed JSON request body.'
      }
    });
  }

  return next(err);
});

const SERVER_STARTED_AT = new Date().toISOString();
const SERVER_COMMIT_SHA =
  process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.SOURCE_VERSION
  || process.env.GIT_COMMIT_SHA
  || null;

function buildInfo() {
  return {
    version: pkg.version,
    commit: SERVER_COMMIT_SHA,
    startedAt: SERVER_STARTED_AT,
    frenchTranslation: TRANSLATIONS.fr || null,
    filipinoTranslation: TRANSLATIONS.fil || null,
    georgianTranslation: TRANSLATIONS.ka || null,
    georgianUsesEnglishSourceFallback: TRANSLATIONS.ka === TRANSLATIONS.en,
    frenchPromptConfigured: Boolean(PROMPTS.fr),
    frenchBooksCount: Array.isArray(BOOKS.fr) ? BOOKS.fr.length : 0
  };
}

app.use((req, res, next) => {
  res.setHeader('X-Bible-Answer-Version', pkg.version);
  if (SERVER_COMMIT_SHA) {
    res.setHeader('X-Bible-Answer-Commit', SERVER_COMMIT_SHA.slice(0, 12));
  }
  next();
});

// ── Переводы ──────────────────────────────────────────────
const TRANSLATIONS = {
  en:  'BSB',
  pt:  'por_bsl',
  es:  'spa_r09', // Reina-Valera 1909 (public domain); RVG is copyrighted
  ru:  'rus_syn',
  fr:  'fra_lsg',
  fil: 'tgl_ulb',
  ka:  'BSB' // TODO: Replace English fallback with verified Georgian Bible translation/source when available.
};

// ── Коды книг (1-66 → трёхбуквенный код) ─────────────────
const BOOK_CODES = [
  "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT",
  "1SA","2SA","1KI","2KI","1CH","2CH","EZR","NEH",
  "EST","JOB","PSA","PRO","ECC","SNG","ISA","JER",
  "LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON",
  "MIC","NAM","HAB","ZEP","HAG","ZEC","MAL","MAT",
  "MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL",
  "EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT",
  "PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN",
  "JUD","REV"
];

// ── Названия книг на 4 языках ─────────────────────────────
const BOOKS = {
  en: ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"],
  pt: ["Gênesis","Êxodo","Levítico","Números","Deuteronômio","Josué","Juízes","Rute","1 Samuel","2 Samuel","1 Reis","2 Reis","1 Crônicas","2 Crônicas","Esdras","Neemias","Ester","Jó","Salmos","Provérbios","Eclesiastes","Cantares","Isaías","Jeremias","Lamentações","Ezequiel","Daniel","Oséias","Joel","Amós","Obadias","Jonas","Miquéias","Naum","Habacuque","Sofonias","Ageu","Zacarias","Malaquias","Mateus","Marcos","Lucas","João","Atos","Romanos","1 Coríntios","2 Coríntios","Gálatas","Efésios","Filipenses","Colossenses","1 Tessalonicenses","2 Tessalonicenses","1 Timóteo","2 Timóteo","Tito","Filemom","Hebreus","Tiago","1 Pedro","2 Pedro","1 João","2 João","3 João","Judas","Apocalipse"],
  es: ["Génesis","Éxodo","Levítico","Números","Deuteronomio","Josué","Jueces","Rut","1 Samuel","2 Samuel","1 Reyes","2 Reyes","1 Crónicas","2 Crónicas","Esdras","Nehemías","Ester","Job","Salmos","Proverbios","Eclesiastés","Cantares","Isaías","Jeremías","Lamentaciones","Ezequiel","Daniel","Oseas","Joel","Amós","Abdías","Jonás","Miqueas","Nahúm","Habacuc","Sofonías","Hageo","Zacarías","Malaquías","Mateo","Marcos","Lucas","Juan","Hechos","Romanos","1 Corintios","2 Corintios","Gálatas","Efesios","Filipenses","Colosenses","1 Tesalonicenses","2 Tesalonicenses","1 Timoteo","2 Timoteo","Tito","Filemón","Hebreos","Santiago","1 Pedro","2 Pedro","1 Juan","2 Juan","3 Juan","Judas","Apocalipsis"],
  ru: ["Бытие","Исход","Левит","Числа","Второзаконие","Иисус Навин","Судьи","Руфь","1 Царств","2 Царств","3 Царств","4 Царств","1 Паралипоменон","2 Паралипоменон","Ездра","Неемия","Есфирь","Иов","Псалтирь","Притчи","Екклесиаст","Песня песней","Исаия","Иеремия","Плач Иеремии","Иезекииль","Даниил","Осия","Иоиль","Амос","Авдий","Иона","Михей","Наум","Аввакум","Софония","Аггей","Захария","Малахия","Матфея","Марка","Луки","Иоанна","Деяния","Римлянам","1 Коринфянам","2 Коринфянам","Галатам","Ефесянам","Филиппийцам","Колоссянам","1 Фессалоникийцам","2 Фессалоникийцам","1 Тимофею","2 Тимофею","Титу","Филимону","Евреям","Иакова","1 Петра","2 Петра","1 Иоанна","2 Иоанна","3 Иоанна","Иуды","Откровение"],
  fr:  ["Genèse","Exode","Lévitique","Nombres","Deutéronome","Josué","Juges","Ruth","1 Samuel","2 Samuel","1 Rois","2 Rois","1 Chroniques","2 Chroniques","Esdras","Néhémie","Esther","Job","Psaumes","Proverbes","Ecclésiaste","Cantique des Cantiques","Isaïe","Jérémie","Lamentations","Ézéchiel","Daniel","Osée","Joël","Amos","Abdias","Jonas","Michée","Nahoum","Habacuc","Sophonie","Aggée","Zacharie","Malachie","Matthieu","Marc","Luc","Jean","Actes","Romains","1 Corinthiens","2 Corinthiens","Galates","Éphésiens","Philippiens","Colossiens","1 Thessaloniciens","2 Thessaloniciens","1 Timothée","2 Timothée","Tite","Philémon","Hébreux","Jacques","1 Pierre","2 Pierre","1 Jean","2 Jean","3 Jean","Jude","Apocalypse"],
  fil: ["Genesis","Exodo","Levitico","Mga Bilang","Deuteronomio","Josue","Mga Hukom","Ruth","1 Samuel","2 Samuel","1 Mga Hari","2 Mga Hari","1 Mga Cronica","2 Mga Cronica","Ezra","Nehemias","Ester","Job","Mga Awit","Mga Kawikaan","Eclesiastes","Awit ng mga Awit","Isaias","Jeremias","Panaghoy","Ezekiel","Daniel","Oseas","Joel","Amos","Abdias","Jonas","Mikas","Nahum","Habacuc","Sofonias","Hageo","Zacarias","Malaquias","Mateo","Marcos","Lucas","Juan","Mga Gawa","Roma","1 Corinto","2 Corinto","Galacia","Efeso","Filipos","Colosas","1 Tesalonica","2 Tesalonica","1 Timoteo","2 Timoteo","Tito","Filemon","Hebreo","Santiago","1 Pedro","2 Pedro","1 Juan","2 Juan","3 Juan","Judas","Apocalipsis"],
  ka:  ["დაბადება","გამოსვლა","ლევიტელი","რიცხვები","მეორე სჯული","იესო ნავეს ძე","მსაჯულნი","რუთი","1 მეფეთა","2 მეფეთა","3 მეფეთა","4 მეფეთა","1 ნეშტთა","2 ნეშტთა","ეზრა","ნეემია","ესთერი","იობი","ფსალმუნნი","იგავნი","ეკლესიასტე","ქებათა ქება","ესაია","იერემია","გოდება","ეზეკიელი","დანიელი","ოსია","იოველი","ამოსი","აბდია","იონა","მიქა","ნაუმი","აბაკუმი","სოფონია","ახაია","ზაქარია","მალაქია","მათე","მარკოზი","ლუკა","იოანე","საქმეები","რომაელთა","1 კორინთელთა","2 კორინთელთა","გალატელთა","ეფესელთა","ფილიპელთა","კოლასელთა","1 თესალონიკელთა","2 თესალონიკელთა","1 ტიმოთეს","2 ტიმოთეს","ტიტეს","ფილიმონი","ებრაელთა","იაკობი","1 პეტრე","2 პეტრე","1 იოანე","2 იოანე","3 იოანე","იუდა","გამოცხადება"]
};

// ── System промпты для Claude ─────────────────────────────
const PROMPTS = {
  en: `You are a kind and wise spiritual companion.
The user shares a feeling or question from the heart.
Find ONE Bible verse that speaks to their situation.
The fields "book", "chapter", and "verse" must be JSON numbers, not strings.

You MUST reply with ONLY a raw JSON object. No markdown, no backticks, no explanation.
Exactly this format:
{"book":50,"chapter":4,"verse":6,"context":"1-2 sentences who wrote it and when","application":"2-3 warm sentences connecting verse to user situation","prayer":"one short prayer"}`,

  pt: `Você é um companheiro espiritual gentil e sábio.
O usuário compartilha um sentimento ou pergunta do coração.
Encontre UM versículo bíblico que fale à situação dele.
Os campos "book", "chapter" e "verse" devem ser números JSON, não strings.

Responda com APENAS um objeto JSON puro. Sem markdown, sem crases, sem explicação.
Exatamente neste formato:
{"book":50,"chapter":4,"verse":6,"context":"1-2 frases quem escreveu e quando","application":"2-3 frases calorosas conectando o versículo à situação","prayer":"uma breve oração"}`,

  es: `Eres un compañero espiritual amable y sabio.
El usuario comparte un sentimiento o pregunta del corazón.
Encuentra UN versículo bíblico que hable a su situación.
Los campos "book", "chapter" y "verse" deben ser números JSON, no cadenas.

Debes responder con SOLO un objeto JSON puro. Sin markdown, sin comillas invertidas, sin explicación.
Exactamente en este formato:
{"book":50,"chapter":4,"verse":6,"context":"1-2 frases quién escribió y cuándo","application":"2-3 frases cálidas conectando el versículo con la situación","prayer":"una breve oración"}`,

  ru: `Ты — добрый и мудрый духовный помощник.
Пользователь делится чувством или вопросом от сердца.
Найди ОДИН стих из Библии который говорит о его ситуации.
Поля "book", "chapter" и "verse" должны быть числами JSON, а не строками.

Отвечай ТОЛЬКО чистым JSON объектом. Без markdown, без обратных кавычек, без объяснений.
Точно в таком формате:
{"book":50,"chapter":4,"verse":6,"context":"1-2 предложения кто написал и когда","application":"2-3 тёплых предложения связывающих стих с ситуацией","prayer":"одна короткая молитва"}`,

  fr: `Tu es un compagnon spirituel bienveillant et sage. L'utilisateur partage un sentiment ou une question du cœur. Trouve UN verset biblique qui parle à sa situation. Les champs "book", "chapter" et "verse" doivent être des nombres JSON, pas des chaînes. Tu DOIS répondre avec SEULEMENT un objet JSON pur. Sans markdown, sans backticks, sans explication. Exactement dans ce format:
{"book":50,"chapter":4,"verse":6,"context":"1-2 phrases qui a écrit et quand","application":"2-3 phrases chaleureuses reliant le verset à la situation","prayer":"une courte prière"}`,

  fil: `Ikaw ay isang mabait at marunong na espirituwal na kasama.
Ang gumagamit ay nagbabahagi ng damdamin o tanong mula sa puso.
Maghanap ng ISANG talata ng Bibliya na nagsasalita sa kanyang sitwasyon.
Ang mga field na "book", "chapter" at "verse" ay dapat na mga JSON number, hindi mga string.

DAPAT kang sumagot ng ISANG purong JSON object lamang. Walang markdown, walang backticks, walang paliwanag.
Eksaktong sa format na ito:
{"book":50,"chapter":4,"verse":6,"context":"1-2 pangungusap kung sino ang sumulat at kailan","application":"2-3 mainit na pangungusap na nag-uugnay ng talata sa sitwasyon","prayer":"isang maikling panalangin"}`,

  ka: `შენ ხარ კეთილი და ბრძენი სულიერი მეგობარი.
მომხმარებელი იზიარებს გრძნობას ან კითხვას გულიდან.
იპოვე ერთი ბიბლიური მუხლი რომელიც ეხება მის სიტუაციას.
"book", "chapter" და "verse" ველები უნდა იყოს JSON რიცხვები, არა სტრიქონები.

უნდა უპასუხო მხოლოდ სუფთა JSON ობიექტით. მარკდაუნის გარეშე, backtick-ების გარეშე, განმარტების გარეშე.
ზუსტად ამ ფორმატში:
{"book":50,"chapter":4,"verse":6,"context":"1-2 წინადადება ვინ დაწერა და როდის","application":"2-3 თბილი წინადადება რომელიც აკავშირებს მუხლს სიტუაციასთან","prayer":"ერთი მოკლე ლოცვა"}`
};

const RETRY_PROMPTS = {
  en:  'The previous answer could not be rendered into a verse. Return ONLY one raw JSON object with numeric book, chapter, and verse fields. Choose a verse that exists in the requested translation.',
  pt:  'A resposta anterior não pôde ser convertida em um versículo. Retorne APENAS um objeto JSON puro com os campos book, chapter e verse numéricos. Escolha um versículo que exista na tradução solicitada.',
  es:  'La respuesta anterior no pudo convertirse en un versículo renderizable. Devuelve SOLO un objeto JSON puro con book, chapter y verse numéricos. Elige un versículo que exista en la traducción solicitada.',
  ru:  'Предыдущий ответ не удалось превратить в отображаемый стих. Верни ТОЛЬКО один чистый JSON объект с числовыми полями book, chapter и verse. Выбери стих, который существует в нужном переводе.',
  fr:  'La réponse précédente n\'a pas pu être rendue comme un verset. Renvoie SEULEMENT un objet JSON brut avec des champs book, chapter et verse numériques. Choisis un verset qui existe dans la traduction demandée.',
  fil: 'Ang nakaraang sagot ay hindi ma-render bilang talata. Ibalik lamang ang ISANG raw JSON object na may numeric na book, chapter, at verse na mga field. Pumili ng talata na mayroon sa hiniling na pagsasalin.',
  ka:  'წინა პასუხი ვერ გარდაიქმნა მუხლად. დააბრუნე მხოლოდ ერთი raw JSON ობიექტი numeric book, chapter და verse ველებით. აირჩიე მუხლი რომელიც არსებობს მოთხოვნილ თარგმანში.'
};

class AppHttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'AppHttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildErrorPayload(error, fallbackMessage = 'Unexpected server error.') {
  const message = collapseWhitespace(error?.message || fallbackMessage);
  const payload = {
    error: {
      code: error?.code || 'internal_error',
      message
    }
  };

  if (error?.details && typeof error.details === 'object' && Object.keys(error.details).length > 0) {
    payload.error.details = error.details;
  }

  return payload;
}

function sendJsonError(res, error, fallbackMessage) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  return res.status(status).json(buildErrorPayload(error, fallbackMessage));
}

function resolveTranslationConfig(lang) {
  if (lang === 'ka') {
    return {
      translation: TRANSLATIONS.ka,
      sourceLang: 'en',
      fallbackCode: 'georgian_translation_fallback',
      fallbackMessage: 'Replace English fallback with verified Georgian Bible translation/source when available.'
    };
  }

  if (TRANSLATIONS[lang]) {
    return {
      translation: TRANSLATIONS[lang],
      sourceLang: lang,
      fallbackCode: null,
      fallbackMessage: null
    };
  }

  return {
    translation: TRANSLATIONS.en,
    sourceLang: 'en',
    fallbackCode: 'unmapped_translation_fallback',
    fallbackMessage: `No translation mapping configured for lang "${lang}". Falling back to English translation.`
  };
}

function logLanguageResolution(route, requestedLang, lang, translationConfig) {
  console.log(`[${route}] Incoming payload: ${JSON.stringify({ lang: requestedLang })}`);
  console.log(`[${route}] Normalized lang: ${lang}`);

  if (requestedLang && requestedLang !== lang) {
    console.log(`[${route}] Lang normalized from "${requestedLang}" to "${lang}"`);
  }

  console.log(`[${route}] Resolved translation: ${translationConfig.translation}`);

  if (translationConfig.fallbackCode) {
    console.warn(
      `[${route}] Translation fallback active: code=${translationConfig.fallbackCode} sourceLang=${translationConfig.sourceLang} message="${translationConfig.fallbackMessage}"`
    );
  }
}

function looksLikeHtml(bodyText, contentType) {
  const normalizedType = String(contentType || '').toLowerCase();
  const normalizedBody = collapseWhitespace(bodyText).toLowerCase();
  return normalizedType.includes('text/html')
    || normalizedBody.startsWith('<!doctype html')
    || normalizedBody.startsWith('<html');
}

function looksLikeJson(bodyText, contentType) {
  const normalizedType = String(contentType || '').toLowerCase();
  const trimmed = typeof bodyText === 'string' ? bodyText.trim() : '';

  if (normalizedType.includes('application/json') || normalizedType.includes('text/json')) {
    return true;
  }

  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

// ── Вспомогательная функция получения стиха ───────────────
async function getPassageText({ book, chapter, verseStart, verseEnd, lang }) {
  const translationConfig = resolveTranslationConfig(lang);
  const { translation, sourceLang, fallbackCode } = translationConfig;
  const bookCode = BOOK_CODES[book - 1];

  if (!bookCode) {
    throw new AppHttpError(400, 'invalid_book', `Invalid Bible book index: ${book}`, {
      book,
      chapter,
      verseStart,
      verseEnd,
      lang
    });
  }

  const url = `https://bible.helloao.org/api/${translation}/${bookCode}/${chapter}.json`;

  console.log(
    `[getPassageText] book=${book} bookCode=${bookCode} chapter=${chapter} verse=${verseStart}-${verseEnd} lang=${lang} sourceLang=${sourceLang} translation=${translation}`
  );
  console.log(`[getPassageText] URL: ${url}`);
  if (fallbackCode) {
    console.warn(`[getPassageText] Translation fallback active: ${fallbackCode}`);
  }

  let res;
  let rawBody = '';
  let contentType = '';

  try {
    res = await fetch(url);
    contentType = res.headers.get('content-type') || '';
    rawBody = await res.text();
  } catch (error) {
    throw new AppHttpError(
      502,
      'bible_source_request_failed',
      `Failed to reach Bible source for translation "${translation}".`,
      {
        lang,
        sourceLang,
        translation,
        bookCode,
        chapter,
        verseStart,
        verseEnd,
        cause: collapseWhitespace(error?.message)
      }
    );
  }

  console.log(`[getPassageText] Response status=${res.status} contentType=${contentType || 'unknown'}`);
  console.log(`[getPassageText] Raw body preview: "${previewForLog(rawBody, 160)}"`);

  if (!res.ok) {
    throw new AppHttpError(
      502,
      'bible_source_unavailable',
      `Bible source unavailable for translation "${translation}".`,
      {
        lang,
        sourceLang,
        translation,
        upstreamStatus: res.status,
        contentType,
        bodyPreview: previewForLog(rawBody, 160),
        url
      }
    );
  }

  if (!looksLikeJson(rawBody, contentType) || looksLikeHtml(rawBody, contentType)) {
    throw new AppHttpError(
      502,
      'bible_source_invalid_response',
      'Bible source returned a non-JSON response.',
      {
        lang,
        sourceLang,
        translation,
        contentType,
        bodyPreview: previewForLog(rawBody, 160),
        url
      }
    );
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch (error) {
    throw new AppHttpError(
      502,
      'bible_source_invalid_json',
      'Bible source returned invalid JSON.',
      {
        lang,
        sourceLang,
        translation,
        contentType,
        bodyPreview: previewForLog(rawBody, 160),
        cause: collapseWhitespace(error?.message),
        url
      }
    );
  }

  const { text, missing } = extractPassageTextFromChapterData(data, verseStart, verseEnd);

  if (missing.length > 0) {
    console.warn(
      `[getPassageText] Missing or empty verse content for ${bookCode} ${chapter}:${missing.join(',')}`
    );
  }

  console.log(`[getPassageText] Extracted: "${previewForLog(text)}" (len=${text.length})`);
  return text;
}

function buildUserMessage(query, lang, attempt, previousRawText) {
  if (attempt <= 1) {
    return query;
  }

  const retryPrompt = RETRY_PROMPTS[lang] || RETRY_PROMPTS.en;
  const previous = typeof previousRawText === 'string' && previousRawText.trim()
    ? `Previous raw response:\n${previousRawText.trim().slice(0, 1200)}`
    : null;

  return [
    retryPrompt,
    previous,
    `Original user query:\n${query}`
  ].filter(Boolean).join('\n\n');
}

async function requestModelSelection({ query, lang, attempt, previousRawText }) {
  const modelRequest = {
    model: MODEL,
    max_tokens: 1024,
    // Sonnet 5 runs adaptive thinking by default; disable it so the small
    // max_tokens budget goes entirely to the JSON answer and latency stays low.
    thinking: { type: 'disabled' },
    system: PROMPTS[lang] || PROMPTS.en,
    messages: [{
      role: 'user',
      content: buildUserMessage(query, lang, attempt, previousRawText)
    }]
  };

  console.log(`[ask] Model request attempt ${attempt}: ${modelRequest.messages[0].content.length} chars`);

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(modelRequest)
  });

  const claudeData = await claudeRes.json();
  const rawText = extractClaudeText(claudeData);

  console.log(`[ask] Raw model response attempt ${attempt}: ${previewForLog(rawText, 600)}`);

  if (!claudeRes.ok) {
    const apiMessage = collapseWhitespace(
      claudeData?.error?.message
      || claudeData?.message
      || JSON.stringify(claudeData)
    );
    throw new Error(`Anthropic API error ${claudeRes.status}: ${apiMessage}`);
  }

  return rawText;
}

// ── POST /ask ─────────────────────────────────────────────
app.post('/ask', async (req, res) => {
  const { query, lang: requestedLang } = req.body;
  const lang = normalizeLang(requestedLang);
  const translationConfig = resolveTranslationConfig(lang);
  if (!query?.trim()) {
    return res.status(400).json({
      error: {
        code: 'query_required',
        message: 'Query is required.'
      }
    });
  }

  try {
    // Length and language only — the question itself is the person's and
    // the privacy policy says we do not keep it.
    console.log(`[ask] Incoming: lang=${requestedLang} queryLength=${(query || '').length}`);
    logLanguageResolution('ask', requestedLang, lang, translationConfig);

    const response = await buildAskResponse({
      query,
      lang,
      translation: translationConfig.translation,
      books: BOOKS,
      logger: console,
      selectAnswer: requestModelSelection,
      fetchPassageText: getPassageText
    });

    // The reflection and prayer are written to the person's situation, so
    // they are as private as the question; only the reference is logged.
    console.log(`[ask] Answered: ${response.reference} (${response.translation})`);

    res.json(response);

  } catch (err) {
    console.error('[ask] Error:', err);
    return sendJsonError(res, err, 'Failed to produce a Bible answer.');
  }
});

// ── GET /verse-of-day ─────────────────────────────────────
// ── GET /health ───────────────────────────────────────────
// For Railway's checks and uptime monitors. Says nothing about upstreams on
// purpose: a probe that fans out to Anthropic and helloao would turn every
// monitor tick into paid traffic.
app.get('/health', (_req, res) => {
  res.json({ ok: true, version: pkg.version, uptime: Math.round(process.uptime()) });
});

// ── Synodal Psalter numbering ─────────────────────────────
// The Russian Synodal text on helloao follows the Septuagint: from Psalm 10
// to 147 its chapter numbers run one behind the Masoretic numbering the other
// five translations use, and superscriptions ("A Psalm of David…") are
// counted as verses, pushing the verse numbers down by one or two. Both are
// corrected here so a Masoretic reference reads the same words in Russian.
// The psalms the two systems split or merge differently (9–10, 114–116,
// 147) are returned unchanged; the daily list avoids them.
function synodalPsalmChapter(masoretic) {
  if (masoretic >= 11 && masoretic <= 113) return masoretic - 1;
  if (masoretic >= 117 && masoretic <= 146) return masoretic - 1;
  return masoretic;
}

async function synodalVerseOffset(synodalChapter, masoreticChapter) {
  // The offset is the superscription's verse count, which is exactly the
  // difference in verse counts between the two texts for the same psalm.
  const count = async (translation, chapter) => {
    const res = await fetch(`https://bible.helloao.org/api/${translation}/PSA/${chapter}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.chapter?.content || []).filter(c => c && c.type === 'verse').length;
  };
  const [syn, bsb] = await Promise.all([count('rus_syn', synodalChapter), count('BSB', masoreticChapter)]);
  if (syn == null || bsb == null) return 0;
  return Math.max(0, Math.min(2, syn - bsb));
}

/// Masoretic (book 19, chapter, verse) → what to fetch and show for `lang`.
async function localizeReference({ book, chapter, verse, lang }) {
  const { translation } = resolveTranslationConfig(lang);
  if (book !== 19 || translation !== 'rus_syn') return { chapter, verse };
  const synChapter = synodalPsalmChapter(chapter);
  const offset = await synodalVerseOffset(synChapter, chapter);
  return { chapter: synChapter, verse: verse + offset };
}

// ── Daily tagline, written once a day per language ────────
// A sentence under the verse. Cached by day and language: the first reader
// of the day in each language pays one small model call, everyone after
// reads the cache. The cache is in memory — a restart costs one more call.
const taglineCache = new Map();   // "2026-09-18|ru" → string

const TAGLINE_LANG_NAMES = {
  en: 'English', ru: 'Russian', es: 'Spanish', pt: 'Brazilian Portuguese', fr: 'French', fil: 'Filipino (Tagalog)'
};

async function dailyTagline({ reference, verseText, lang, dayKey }) {
  const key = `${dayKey}|${lang}`;
  if (taglineCache.has(key)) return taglineCache.get(key);

  const language = TAGLINE_LANG_NAMES[lang] || 'English';
  const request = {
    model: MODEL,
    max_tokens: 120,
    thinking: { type: 'disabled' },
    system: `You write the one-line caption shown under the Bible verse of the day in a devotional app. ` +
            `Write in ${language}. One sentence, at most 12 words, warm and plain, no exclamation marks, ` +
            `no quotation marks, no emoji, no reference to the verse number. Say what the verse gives a ` +
            `person today. Reply with the sentence only.`,
    messages: [{ role: 'user', content: `${reference}\n\n${verseText}` }]
  };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(request)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `status ${res.status}`);
    const text = collapseWhitespace(extractClaudeText(data)).replace(/^["«»“”']+|["«»“”'.]+$/g, '').trim();
    if (text) {
      taglineCache.set(key, text + '.');
      // Keep the map from growing across days.
      for (const k of taglineCache.keys()) if (!k.startsWith(dayKey)) taglineCache.delete(k);
      return text + '.';
    }
  } catch (err) {
    console.warn(`[verse-of-day] tagline failed (${lang}): ${err.message}`);
  }
  return '';
}

app.get('/verse-of-day', async (req, res) => {
  const requestedLang = req.query.lang;
  const lang = normalizeLang(requestedLang);
  const translationConfig = resolveTranslationConfig(lang);
  logLanguageResolution('verse-of-day', requestedLang, lang, translationConfig);

  const { book, chapter, verse, dayOfYear } = dailyVerse();
  const dayKey = `${new Date().getUTCFullYear()}-${dayOfYear}`;

  try {
    const local = await localizeReference({ book, chapter, verse, lang });
    const verseText = await getPassageText({
      book,
      chapter:    local.chapter,
      verseStart: local.verse,
      verseEnd:   local.verse,
      lang
    });

    if (!verseText) {
      throw new Error(`Verse of the day returned empty verse text for ${book}:${local.chapter}:${local.verse}`);
    }

    const bookName  = BOOKS[lang]?.[book - 1] || '';
    const reference = `${bookName} ${local.chapter}:${local.verse}`;
    const tagline   = await dailyTagline({ reference, verseText, lang, dayKey });
    res.json({
      verse:       verseText,
      reference,
      tagline,
      translation: translationConfig.translation
    });
  } catch (err) {
    return sendJsonError(res, err, 'Failed to fetch verse of the day.');
  }
});

// ── /debug/* — gated ──────────────────────────────────────
// Answers 404 rather than 403 when the token is missing or wrong: a 403 tells
// a stranger there is something here worth guessing at, while a 404 is
// indistinguishable from a route that was never deployed. With DEBUG_TOKEN
// unset — the normal state in production — these routes simply do not exist.
app.use('/debug', (req, res, next) => {
  const expected = process.env.DEBUG_TOKEN;
  const provided = req.get('x-debug-token') || req.query.token;
  if (expected && provided === expected) return next();
  return res.status(404).json({
    error: { code: 'not_found', message: 'Route not found.' }
  });
});

// ── GET /debug/build ──────────────────────────────────────
app.get('/debug/build', (_req, res) => {
  res.json(buildInfo());
});

// ── GET /debug/verse ─────────────────────────────────────
app.get('/debug/verse', async (req, res) => {
  const requestedLang = req.query.lang;
  const lang = normalizeLang(requestedLang);
  const translationConfig = resolveTranslationConfig(lang);
  const book = Number(req.query.book);
  const chapter = Number(req.query.chapter);
  const verseStart = Number(req.query.verseStart ?? req.query.verse);
  const verseEnd = Number(req.query.verseEnd ?? req.query.verse ?? req.query.verseStart);

  if (!Number.isInteger(book) || !Number.isInteger(chapter) || !Number.isInteger(verseStart)) {
    return res.status(400).json({
      error: {
        code: 'invalid_debug_params',
        message: 'book, chapter, and verse are required numeric params.'
      }
    });
  }

  const bookCode = BOOK_CODES[book - 1];
  if (!bookCode) {
    return res.status(400).json({
      error: {
        code: 'invalid_book',
        message: 'Invalid book index (1-66).'
      }
    });
  }

  const translation = translationConfig.translation;
  const url = `https://bible.helloao.org/api/${translation}/${bookCode}/${chapter}.json`;

  console.log(`[debug/verse] Incoming payload: ${JSON.stringify({ lang: requestedLang, book, chapter, verseStart, verseEnd })}`);
  logLanguageResolution('debug/verse', requestedLang, lang, translationConfig);
  console.log(`[debug/verse] URL: ${url}`);

  try {
    const text = await getPassageText({
      book,
      chapter,
      verseStart,
      verseEnd: Number.isInteger(verseEnd) ? verseEnd : verseStart,
      lang
    });

    return res.json({
      requestedLang,
      normalizedLang: lang,
      translation,
      sourceLang: translationConfig.sourceLang,
      url,
      verseTextPreview: previewForLog(text, 120),
      verseTextLength: text.length
    });
  } catch (err) {
    console.error('[debug/verse] Error:', err);
    return sendJsonError(res, new AppHttpError(
      Number.isInteger(err?.status) ? err.status : 500,
      err?.code || 'debug_verse_failed',
      err?.message || 'Debug verse lookup failed.',
      {
        ...(err?.details || {}),
        requestedLang,
        normalizedLang: lang,
        translation,
        sourceLang: translationConfig.sourceLang,
        url
      }
    ));
  }
});

// ── POST /interpret ───────────────────────────────────────
// Returns all three interpretive "lenses" for a verse in one model call.
// Doing it in a single request is ~3x cheaper than one call per lens, and it
// lets the app switch between lenses instantly with no further network work.
//
// Unlike /ask, this uses one English meta-prompt with a target-language
// instruction rather than six hand-maintained prompts: three lenses across six
// languages would be eighteen prompts to keep in sync, and Claude writes the
// target language reliably from an instruction.
const LANGUAGE_NAMES = {
  en:  'English',
  ru:  'Russian',
  es:  'Spanish',
  pt:  'Portuguese',
  fr:  'French',
  fil: 'Filipino (Tagalog)'
};

function buildInterpretPrompt(lang, scope) {
  const languageName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en;
  const subject = scope === 'chapter'
    ? `Given a whole chapter of the Bible, produce three distinct readings of it as a single movement — what the chapter as a whole is doing, not a verse-by-verse walk`
    : `Given one Bible verse, produce three distinct readings of it`;

  return `You are a thoughtful guide to Scripture, writing for a contemplative reader.

${subject}. Write every field in ${languageName}.

"theological" — The historical-grammatical reading. Who wrote this, to whom, in what situation, and what it meant to its first hearers. Ground it in the text and its context. 2-4 sentences.

"symbolic" — The inner or allegorical reading, in the tradition of Philo, Origen and the Church Fathers: the passage as a map of the soul. Characters and places may stand for faculties, impulses or states within a person. For example, Cain and Abel read this way is not only about envy between brothers, but about the calculating mind and the trusting heart within one person. Be concrete about what stands for what. Never invent occult or fortune-telling content — this is a literary and psychological reading, not divination. 2-4 sentences.

"application" — What this asks of the reader today. Warm, direct, second person. Do not be preachy or generic. 2-3 sentences.

Reply with ONLY a raw JSON object, no markdown, no backticks:
{"theological":"...","symbolic":"...","application":"..."}`;
}

app.post('/interpret', async (req, res) => {
  try {
    const { reference, verseText } = req.body || {};
    const lang = normalizeLang(req.body?.lang);
    const scope = req.body?.scope === 'chapter' ? 'chapter' : 'verse';

    if (!reference || !verseText) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'reference and verseText are required.' }
      });
    }

    const modelRequest = {
      model: MODEL,
      max_tokens: scope === 'chapter' ? 2000 : 1400,
      thinking: { type: 'disabled' },
      system: buildInterpretPrompt(lang, scope),
      messages: [{
        role: 'user',
        content: `${reference}\n\n"${collapseWhitespace(String(verseText)).slice(0, scope === 'chapter' ? 12000 : 1500)}"`
      }]
    };

    console.log(`[interpret] ${reference} lang=${lang} scope=${scope}`);

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(modelRequest)
    });

    const claudeData = await claudeRes.json();

    if (!claudeRes.ok) {
      const apiMessage = collapseWhitespace(
        claudeData?.error?.message || claudeData?.message || JSON.stringify(claudeData)
      );
      throw new Error(`Anthropic API error ${claudeRes.status}: ${apiMessage}`);
    }

    const rawText = extractClaudeText(claudeData);
    let parsed;
    try {
      parsed = JSON.parse(rawText.replace(/^```(?:json)?|```$/g, '').trim());
    } catch (parseErr) {
      console.error('[interpret] Unparseable model output:', previewForLog(rawText, 400));
      throw new Error('Model returned malformed JSON.');
    }

    res.json({
      reference,
      lang,
      theological: collapseWhitespace(parsed.theological || ''),
      symbolic:    collapseWhitespace(parsed.symbolic    || ''),
      application: collapseWhitespace(parsed.application || '')
    });

  } catch (err) {
    console.error('[interpret] Error:', err);
    return sendJsonError(res, err, 'Failed to produce an interpretation.');
  }
});

// ── GET / — health check ──────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: '✝️ Bible Answer API is running' });
});

app.use((req, res) => {
  return res.status(404).json({
    error: {
      code: 'not_found',
      message: 'Route not found.'
    }
  });
});

app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  return sendJsonError(res, err, 'Unexpected server error.');
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`[startup] Build info: ${JSON.stringify(buildInfo())}`);
  console.log(
    process.env.DEBUG_TOKEN
      ? '✝️ Debug routes enabled (token required): /debug/build, /debug/verse'
      : '✝️ Debug routes disabled (set DEBUG_TOKEN to enable)'
  );
  console.log(`✝️ Server running on port ${process.env.PORT || 3000}`);
});
