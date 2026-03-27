const express = require('express');
const cors    = require('cors');
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

const app = express();
app.use(cors());
app.use(express.json());

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
  en: 'BSB',
  pt: 'por_bsl',
  es: 'spa_rvg',
  ru: 'rus_syn',
  fr: 'fra_lsg'
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
  fr: ["Genèse","Exode","Lévitique","Nombres","Deutéronome","Josué","Juges","Ruth","1 Samuel","2 Samuel","1 Rois","2 Rois","1 Chroniques","2 Chroniques","Esdras","Néhémie","Esther","Job","Psaumes","Proverbes","Ecclésiaste","Cantique des Cantiques","Isaïe","Jérémie","Lamentations","Ézéchiel","Daniel","Osée","Joël","Amos","Abdias","Jonas","Michée","Nahoum","Habacuc","Sophonie","Aggée","Zacharie","Malachie","Matthieu","Marc","Luc","Jean","Actes","Romains","1 Corinthiens","2 Corinthiens","Galates","Éphésiens","Philippiens","Colossiens","1 Thessaloniciens","2 Thessaloniciens","1 Timothée","2 Timothée","Tite","Philémon","Hébreux","Jacques","1 Pierre","2 Pierre","1 Jean","2 Jean","3 Jean","Jude","Apocalypse"]
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
{"book":50,"chapter":4,"verse":6,"context":"1-2 phrases qui a écrit et quand","application":"2-3 phrases chaleureuses reliant le verset à la situation","prayer":"une courte prière"}`
};

const RETRY_PROMPTS = {
  en: 'The previous answer could not be rendered into a verse. Return ONLY one raw JSON object with numeric book, chapter, and verse fields. Choose a verse that exists in the requested translation.',
  pt: 'A resposta anterior não pôde ser convertida em um versículo. Retorne APENAS um objeto JSON puro com os campos book, chapter e verse numéricos. Escolha um versículo que exista na tradução solicitada.',
  es: 'La respuesta anterior no pudo convertirse en un versículo renderizable. Devuelve SOLO un objeto JSON puro con book, chapter y verse numéricos. Elige un versículo que exista en la traducción solicitada.',
  ru: 'Предыдущий ответ не удалось превратить в отображаемый стих. Верни ТОЛЬКО один чистый JSON объект с числовыми полями book, chapter и verse. Выбери стих, который существует в нужном переводе.',
  fr: 'La réponse précédente n’a pas pu être rendue comme un verset. Renvoie SEULEMENT un objet JSON brut avec des champs book, chapter et verse numériques. Choisis un verset qui existe dans la traduction demandée.'
};

// ── Вспомогательная функция получения стиха ───────────────
async function getPassageText({ book, chapter, verseStart, verseEnd, lang }) {
  const translation = TRANSLATIONS[lang] || 'BSB';
  if (!TRANSLATIONS[lang]) {
    console.warn(`[getPassageText] No translation mapping for lang="${lang}", falling back to BSB`);
  }
  const bookCode    = BOOK_CODES[book - 1];
  const url = `https://bible.helloao.org/api/${translation}/${bookCode}/${chapter}.json`;

  console.log(
    `[getPassageText] book=${book} bookCode=${bookCode} chapter=${chapter} verse=${verseStart}-${verseEnd} lang=${lang} translation=${translation}`
  );
  console.log(`[getPassageText] URL: ${url}`);

  const res  = await fetch(url);
  if (!res.ok) {
    throw new Error(`Bible API error ${res.status} for ${bookCode} ${chapter}`);
  }
  const data = await res.json();
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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: PROMPTS[lang] || PROMPTS.en,
    messages: [{
      role: 'user',
      content: buildUserMessage(query, lang, attempt, previousRawText)
    }]
  };

  console.log(`[ask] Model request attempt ${attempt}: ${previewForLog(modelRequest.messages[0].content, 320)}`);

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
  if (!query?.trim()) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    console.log(`[ask] Incoming payload: ${JSON.stringify({ query, lang: requestedLang })}`);
    console.log(`[ask] Normalized lang: ${lang}`);
    if (requestedLang && requestedLang !== lang) {
      console.log(`[ask] Lang normalized from "${requestedLang}" to "${lang}"`);
    }
    if (requestedLang && normalizeLang(requestedLang) === 'en' && requestedLang !== 'en') {
      console.warn(`[ask] Requested lang "${requestedLang}" normalized to "en" (fallback).`);
    }
    console.log(`[ask] Resolved translation: ${TRANSLATIONS[lang] || 'BSB'}`);

    const response = await buildAskResponse({
      query,
      lang,
      translation: TRANSLATIONS[lang] || 'BSB',
      books: BOOKS,
      logger: console,
      selectAnswer: requestModelSelection,
      fetchPassageText: getPassageText
    });

    console.log(`[ask] Final normalized response: ${JSON.stringify({
      reference: response.reference,
      verseTextPreview: previewForLog(response.verseText),
      contextPreview: previewForLog(response.context),
      applicationPreview: previewForLog(response.application),
      prayerPreview: previewForLog(response.prayer),
      translation: response.translation
    })}`);

    res.json(response);

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /verse-of-day ─────────────────────────────────────
app.get('/verse-of-day', async (req, res) => {
  const requestedLang = req.query.lang;
  const lang = normalizeLang(requestedLang);
  console.log(`[verse-of-day] Incoming payload: ${JSON.stringify({ lang: requestedLang })}`);
  console.log(`[verse-of-day] Normalized lang: ${lang}`);
  if (requestedLang && requestedLang !== lang) {
    console.log(`[verse-of-day] Lang normalized from "${requestedLang}" to "${lang}"`);
  }
  if (requestedLang && normalizeLang(requestedLang) === 'en' && requestedLang !== 'en') {
    console.warn(`[verse-of-day] Requested lang "${requestedLang}" normalized to "en" (fallback).`);
  }
  console.log(`[verse-of-day] Resolved translation: ${TRANSLATIONS[lang] || 'BSB'}`);

  // 30 popular verses — one per day, cycles monthly
  const DAILY = [
    { book: 43, chapter: 3,  verse: 16, tagline: { en: "God's greatest act of love for humanity.", pt: "O maior ato de amor de Deus pela humanidade.", es: "El mayor acto de amor de Dios por la humanidad.", ru: "Величайший акт любви Бога к человечеству.", fr: "Le plus grand acte d'amour de Dieu pour l'humanité." } },
    { book: 19, chapter: 23, verse: 1,  tagline: { en: "God is our faithful shepherd in every season.", pt: "Deus é nosso fiel pastor em toda estação.", es: "Dios es nuestro fiel pastor en toda estación.", ru: "Бог — наш верный пастырь в любое время.", fr: "Dieu est notre berger fidèle en toute saison." } },
    { book: 50, chapter: 4,  verse: 13, tagline: { en: "Christ gives us strength beyond our own limits.", pt: "Cristo nos dá força além dos nossos próprios limites.", es: "Cristo nos da fortaleza más allá de nuestros límites.", ru: "Христос даёт нам силу, превосходящую наши возможности.", fr: "Christ nous donne une force au-delà de nos limites." } },
    { book: 24, chapter: 29, verse: 11, tagline: { en: "God's plans for you are full of hope and purpose.", pt: "Os planos de Deus para você são cheios de esperança.", es: "Los planes de Dios para ti están llenos de esperanza.", ru: "Планы Бога о тебе полны надежды и смысла.", fr: "Les plans de Dieu pour toi sont pleins d'espérance et de sens." } },
    { book: 40, chapter: 6,  verse: 34, tagline: { en: "Lay down tomorrow's worries — today is enough.", pt: "Deixe as preocupações de amanhã — hoje é suficiente.", es: "Deja las preocupaciones de mañana — hoy es suficiente.", ru: "Оставь заботы о завтрашнем дне — сегодняшнего достаточно.", fr: "Dépose les soucis de demain — aujourd'hui suffit." } },
    { book: 19, chapter: 46, verse: 1,  tagline: { en: "God is our refuge and strength in times of trouble.", pt: "Deus é nosso refúgio e força nos tempos de tribulação.", es: "Dios es nuestro refugio y fortaleza en tiempos de angustia.", ru: "Бог — наше прибежище и сила в трудные времена.", fr: "Dieu est notre refuge et notre force dans la détresse." } },
    { book: 45, chapter: 8,  verse: 28, tagline: { en: "All things — even hard ones — work for good in God's hands.", pt: "Todas as coisas cooperam para o bem nas mãos de Deus.", es: "Todas las cosas cooperan para bien en las manos de Dios.", ru: "Все — даже трудное — обращается ко благу в руках Бога.", fr: "Toutes choses, même difficiles, concourent au bien dans les mains de Dieu." } },
    { book: 20, chapter: 3,  verse: 5,  tagline: { en: "Trust God's direction rather than your own understanding.", pt: "Confie na direção de Deus, não em seu próprio entendimento.", es: "Confía en la dirección de Dios, no en tu propio entendimiento.", ru: "Доверяй Богу, а не своему разумению.", fr: "Fais confiance à la direction de Dieu plutôt qu'à ton propre entendement." } },
    { book: 19, chapter: 121, verse: 2, tagline: { en: "Our help comes from the Creator of heaven and earth.", pt: "Nosso socorro vem do Criador do céu e da terra.", es: "Nuestra ayuda viene del Creador del cielo y la tierra.", ru: "Наша помощь от Творца неба и земли.", fr: "Notre secours vient du Créateur du ciel et de la terre." } },
    { book: 23, chapter: 40, verse: 31, tagline: { en: "Those who wait on the Lord receive renewed strength.", pt: "Os que esperam no Senhor renovam as suas forças.", es: "Los que esperan en el Señor renuevan sus fuerzas.", ru: "Уповающие на Господа обновляются в силах.", fr: "Ceux qui espèrent en l'Éternel renouvellent leurs forces." } },
    { book: 19, chapter: 34, verse: 18, tagline: { en: "God is especially close to the broken-hearted.", pt: "Deus está especialmente perto dos de coração quebrantado.", es: "Dios está especialmente cerca de los quebrantados de corazón.", ru: "Бог особенно близок к сокрушённым сердцем.", fr: "Dieu est particulièrement proche de ceux qui ont le cœur brisé." } },
    { book: 40, chapter: 11, verse: 28, tagline: { en: "Jesus personally invites the weary to find rest in him.", pt: "Jesus convida pessoalmente os cansados a encontrar descanso nele.", es: "Jesús invita personalmente a los cansados a encontrar descanso en él.", ru: "Иисус лично приглашает усталых найти покой в Нём.", fr: "Jésus invite personnellement les fatigués à trouver le repos en lui." } },
    { book: 47, chapter: 5,  verse: 7,  tagline: { en: "We can release anxiety by casting our cares on God.", pt: "Podemos liberar a ansiedade lançando nossas preocupações em Deus.", es: "Podemos liberar la ansiedad echando nuestras cargas sobre Dios.", ru: "Мы можем отпустить тревогу, возложив заботы на Бога.", fr: "Nous pouvons relâcher l'anxiété en confiant nos soucis à Dieu." } },
    { book: 45, chapter: 8,  verse: 38, tagline: { en: "Nothing in all creation can separate us from God's love.", pt: "Nada em toda a criação pode nos separar do amor de Deus.", es: "Nada en toda la creación puede separarnos del amor de Dios.", ru: "Ничто в творении не может отлучить нас от любви Бога.", fr: "Rien dans la création ne peut nous séparer de l'amour de Dieu." } },
    { book: 50, chapter: 4,  verse: 6,  tagline: { en: "Prayer and gratitude replace anxiety with God's peace.", pt: "Oração e gratidão substituem a ansiedade pela paz de Deus.", es: "La oración y la gratitud reemplazan la ansiedad con la paz de Dios.", ru: "Молитва и благодарность заменяют тревогу миром Божьим.", fr: "La prière et la gratitude remplacent l'anxiété par la paix de Dieu." } },
    { book: 23, chapter: 41, verse: 10, tagline: { en: "God promises his presence and strength to those who fear him.", pt: "Deus promete sua presença e força aos que o temem.", es: "Dios promete su presencia y fortaleza a los que le temen.", ru: "Бог обещает Своё присутствие и силу тем, кто боится Его.", fr: "Dieu promet sa présence et sa force à ceux qui le craignent." } },
    { book: 19, chapter: 37, verse: 4,  tagline: { en: "Delight in God, and he shapes our deepest desires.", pt: "Deleite-se em Deus e ele moldará os seus desejos mais profundos.", es: "Deléitate en Dios y él moldeará tus deseos más profundos.", ru: "Угождай Господу, и Он направит твои сокровенные желания.", fr: "Fais de Dieu tes délices, et il façonnera tes désirs profonds." } },
    { book: 60, chapter: 5,  verse: 7,  tagline: { en: "Cast your anxiety on God because he cares for you.", pt: "Lance sobre Deus a sua ansiedade porque ele cuida de você.", es: "Echa sobre Dios tu ansiedad porque él cuida de ti.", ru: "Возложи на Бога тревогу свою, ибо Он печётся о тебе.", fr: "Jette ton anxiété sur Dieu, car il prend soin de toi." } },
    { book: 45, chapter: 12, verse: 12, tagline: { en: "Perseverance in hope and prayer sustains the believer.", pt: "A perseverança na esperança e na oração sustenta o crente.", es: "La perseverancia en la esperanza y la oración sostiene al creyente.", ru: "Постоянство в надежде и молитве поддерживает верующего.", fr: "La persévérance dans l'espérance et la prière soutient le croyant." } },
    { book: 20, chapter: 4,  verse: 23, tagline: { en: "Guard your heart — it is the source of all that you do.", pt: "Guarde o seu coração — é a fonte de tudo o que você faz.", es: "Guarda tu corazón — es la fuente de todo lo que haces.", ru: "Храни своё сердце — оно источник всей твоей жизни.", fr: "Garde ton cœur — il est la source de tout ce que tu fais." } },
    { book: 19, chapter: 91, verse: 2,  tagline: { en: "God is our fortress — we can fully take refuge in him.", pt: "Deus é nossa fortaleza — podemos refugiar-nos plenamente nele.", es: "Dios es nuestra fortaleza — podemos refugiarnos plenamente en él.", ru: "Бог — наша крепость, в Нём мы можем полностью укрыться.", fr: "Dieu est notre forteresse — nous pouvons nous réfugier en lui." } },
    { book: 45, chapter: 15, verse: 13, tagline: { en: "The God of hope fills believers with joy and peace.", pt: "O Deus da esperança enche os crentes de alegria e paz.", es: "El Dios de la esperanza llena a los creyentes de gozo y paz.", ru: "Бог надежды наполняет верующих радостью и миром.", fr: "Le Dieu de l'espérance remplit les croyants de joie et de paix." } },
    { book: 23, chapter: 26, verse: 3,  tagline: { en: "Perfect peace is the gift for those who fix their mind on God.", pt: "A paz perfeita é o presente para os que fixam a mente em Deus.", es: "La paz perfecta es el regalo para los que fijan su mente en Dios.", ru: "Совершенный мир — дар тем, чей разум устремлён к Богу.", fr: "La paix parfaite est le don pour ceux qui fixent leur esprit sur Dieu." } },
    { book: 43, chapter: 16, verse: 33, tagline: { en: "Jesus promises peace even in the midst of life's trouble.", pt: "Jesus promete paz mesmo em meio às tribulações da vida.", es: "Jesús promete paz incluso en medio de las tribulaciones de la vida.", ru: "Иисус обещает мир даже среди жизненных скорбей.", fr: "Jésus promet la paix même au milieu des épreuves." } },
    { book: 49, chapter: 3,  verse: 20, tagline: { en: "God can do far more than we dare to ask or imagine.", pt: "Deus pode fazer muito mais do que ousamos pedir ou imaginar.", es: "Dios puede hacer mucho más de lo que osamos pedir o imaginar.", ru: "Бог может сделать несравненно больше, чем мы просим или думаем.", fr: "Dieu peut faire bien au-delà de ce que nous osons demander ou imaginer." } },
    { book: 59, chapter: 1,  verse: 5,  tagline: { en: "If you lack wisdom, ask God — he gives it generously.", pt: "Se lhe falta sabedoria, peça a Deus — ele dá generosamente.", es: "Si te falta sabiduría, pídela a Dios — él da generosamente.", ru: "Если не хватает мудрости, проси у Бога — Он даёт щедро.", fr: "Si tu manques de sagesse, demande à Dieu — il donne généreusement." } },
    { book: 19, chapter: 145, verse: 18,tagline: { en: "God is near to all who call on him in truth.", pt: "Deus está perto de todos que o invocam na verdade.", es: "Dios está cerca de todos los que lo invocan en verdad.", ru: "Бог близок ко всем, кто призывает Его искренно.", fr: "Dieu est proche de tous ceux qui l'invoquent en vérité." } },
    { book: 40, chapter: 7,  verse: 7,  tagline: { en: "Jesus urges us to ask, seek and knock in persistent prayer.", pt: "Jesus nos urge a pedir, buscar e bater na porta com persistência.", es: "Jesús nos insta a pedir, buscar y llamar con oración persistente.", ru: "Иисус призывает нас просить, искать и стучать в постоянной молитве.", fr: "Jésus nous invite à demander, chercher et frapper avec persévérance." } },
    { book: 45, chapter: 5,  verse: 8,  tagline: { en: "God demonstrated his love for us while we were still sinners.", pt: "Deus demonstrou seu amor por nós quando ainda éramos pecadores.", es: "Dios demostró su amor por nosotros cuando aún éramos pecadores.", ru: "Бог явил Свою любовь к нам, когда мы ещё были грешниками.", fr: "Dieu a montré son amour pour nous alors que nous étions encore pécheurs." } },
    { book: 19, chapter: 16, verse: 11, tagline: { en: "In God's presence is fullness of joy and eternal pleasures.", pt: "Na presença de Deus há plenitude de alegria e prazeres eternos.", es: "En la presencia de Dios hay plenitud de gozo y deleites eternos.", ru: "В присутствии Бога — полнота радости и вечные наслаждения.", fr: "Dans la présence de Dieu se trouvent la joie parfaite et les délices éternels." } },
  ];

  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const entry = DAILY[dayOfYear % DAILY.length];
  const { book, chapter, verse } = entry;
  const tagline = entry.tagline[lang] || entry.tagline.en;

  try {
    const verseText = await getPassageText({
      book,
      chapter,
      verseStart: verse,
      verseEnd: verse,
      lang
    });

    if (!verseText) {
      throw new Error(`Verse of the day returned empty verse text for ${book}:${chapter}:${verse}`);
    }

    const bookName = BOOKS[lang]?.[book - 1] || '';
    res.json({
      verse:       verseText,
      reference:   `${bookName} ${chapter}:${verse}`,
      tagline,
      translation: TRANSLATIONS[lang] || 'BSB'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /debug/build ──────────────────────────────────────
app.get('/debug/build', (_req, res) => {
  res.json(buildInfo());
});

// ── GET /debug/verse ─────────────────────────────────────
app.get('/debug/verse', async (req, res) => {
  const requestedLang = req.query.lang;
  const lang = normalizeLang(requestedLang);
  const book = Number(req.query.book);
  const chapter = Number(req.query.chapter);
  const verseStart = Number(req.query.verseStart ?? req.query.verse);
  const verseEnd = Number(req.query.verseEnd ?? req.query.verse ?? req.query.verseStart);

  if (!Number.isInteger(book) || !Number.isInteger(chapter) || !Number.isInteger(verseStart)) {
    return res.status(400).json({ error: 'book, chapter, and verse are required numeric params.' });
  }

  const bookCode = BOOK_CODES[book - 1];
  if (!bookCode) {
    return res.status(400).json({ error: 'Invalid book index (1-66).' });
  }

  const translation = TRANSLATIONS[lang] || 'BSB';
  const url = `https://bible.helloao.org/api/${translation}/${bookCode}/${chapter}.json`;

  console.log(`[debug/verse] Incoming payload: ${JSON.stringify({ lang: requestedLang, book, chapter, verseStart, verseEnd })}`);
  console.log(`[debug/verse] Normalized lang: ${lang}`);
  console.log(`[debug/verse] Resolved translation: ${translation}`);
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
      url,
      verseTextPreview: previewForLog(text, 120),
      verseTextLength: text.length
    });
  } catch (err) {
    console.error(`[debug/verse] Error: ${err.message}`);
    return res.status(500).json({
      error: err.message,
      requestedLang,
      normalizedLang: lang,
      translation,
      url
    });
  }
});

// ── GET / — health check ──────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: '✝️ Bible Answer API is running' });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`[startup] Build info: ${JSON.stringify(buildInfo())}`);
  console.log('✝️ Debug routes available: /debug/build, /debug/verse');
  console.log(`✝️ Server running on port ${process.env.PORT || 3000}`);
});
