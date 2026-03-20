const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Переводы ──────────────────────────────────────────────
const TRANSLATIONS = {
  en: 'BSB',
  pt: 'por_bsl',
  es: 'spa_rvg',
  ru: 'rus_syn'
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
  ru: ["Бытие","Исход","Левит","Числа","Второзаконие","Иисус Навин","Судьи","Руфь","1 Царств","2 Царств","3 Царств","4 Царств","1 Паралипоменон","2 Паралипоменон","Ездра","Неемия","Есфирь","Иов","Псалтирь","Притчи","Екклесиаст","Песня песней","Исаия","Иеремия","Плач Иеремии","Иезекииль","Даниил","Осия","Иоиль","Амос","Авдий","Иона","Михей","Наум","Аввакум","Софония","Аггей","Захария","Малахия","Матфея","Марка","Луки","Иоанна","Деяния","Римлянам","1 Коринфянам","2 Коринфянам","Галатам","Ефесянам","Филиппийцам","Колоссянам","1 Фессалоникийцам","2 Фессалоникийцам","1 Тимофею","2 Тимофею","Титу","Филимону","Евреям","Иакова","1 Петра","2 Петра","1 Иоанна","2 Иоанна","3 Иоанна","Иуды","Откровение"]
};

// ── System промпты для Claude ─────────────────────────────
const PROMPTS = {
  en: `You are a kind and wise spiritual companion.
The user shares a feeling or question from the heart.
Find ONE Bible verse that speaks to their situation.

You MUST reply with ONLY a raw JSON object. No markdown, no backticks, no explanation.
Exactly this format:
{"book":50,"chapter":4,"verse":6,"context":"1-2 sentences who wrote it and when","application":"2-3 warm sentences connecting verse to user situation","prayer":"one short prayer"}`,

  pt: `Você é um companheiro espiritual gentil e sábio.
O usuário compartilha um sentimento ou pergunta do coração.
Encontre UM versículo bíblico que fale à situação dele.

Responda com APENAS um objeto JSON puro. Sem markdown, sem crases, sem explicação.
Exatamente neste formato:
{"book":50,"chapter":4,"verse":6,"context":"1-2 frases quem escreveu e quando","application":"2-3 frases calorosas conectando o versículo à situação","prayer":"uma breve oração"}`,

  es: `Eres un compañero espiritual amable y sabio.
El usuario comparte un sentimiento o pregunta del corazón.
Encuentra UN versículo bíblico que hable a su situación.

Debes responder con SOLO un objeto JSON puro. Sin markdown, sin comillas invertidas, sin explicación.
Exactamente en este formato:
{"book":50,"chapter":4,"verse":6,"context":"1-2 frases quién escribió y cuándo","application":"2-3 frases cálidas conectando el versículo con la situación","prayer":"una breve oración"}`,

  ru: `Ты — добрый и мудрый духовный помощник.
Пользователь делится чувством или вопросом от сердца.
Найди ОДИН стих из Библии который говорит о его ситуации.

Отвечай ТОЛЬКО чистым JSON объектом. Без markdown, без обратных кавычек, без объяснений.
Точно в таком формате:
{"book":50,"chapter":4,"verse":6,"context":"1-2 предложения кто написал и когда","application":"2-3 тёплых предложения связывающих стих с ситуацией","prayer":"одна короткая молитва"}`
};

// ── Вспомогательная функция получения стиха ───────────────
async function getVerse(book, chapter, verse, lang) {
  const translation = TRANSLATIONS[lang] || 'BSB';
  const bookCode = BOOK_CODES[book - 1];

  const res = await fetch(
    `https://bible.helloao.org/api/${translation}/${bookCode}/${chapter}.json`
  );
  const data = await res.json();

  const verseObj = data.chapter?.content?.find(
    item => item.type === 'verse' && item.number === verse
  );
  const text = verseObj?.content
    ?.filter(c => typeof c === 'string')
    .join(' ') || '';

  return text;
}

// ── POST /ask ─────────────────────────────────────────────
app.post('/ask', async (req, res) => {
  const { query, lang = 'en' } = req.body;
  if (!query?.trim()) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    // Шаг 1: Claude находит стих
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: PROMPTS[lang] || PROMPTS.en,
        messages: [{ role: 'user', content: query }]
      })
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '';

    // Парсим JSON от Claude
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    if (!parsed) throw new Error('Could not parse Claude response');

    const { book, chapter, verse, context, application, prayer } = parsed;

    // Шаг 2: Берём точный текст стиха
    const verseText = await getVerse(book, chapter, verse, lang);

    // Шаг 3: Собираем ответ
    const bookName = BOOKS[lang]?.[book - 1] || `Book ${book}`;
    res.json({
      reference:   `${bookName} ${chapter}:${verse}`,
      verseText,
      context,
      application,
      prayer,
      translation: TRANSLATIONS[lang] || 'BSB'
    });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /verse-of-day ─────────────────────────────────────
app.get('/verse-of-day', async (req, res) => {
  const { lang = 'en' } = req.query;

  const DAILY = [
    { book: 43, chapter: 3,  verse: 16 },
    { book: 19, chapter: 23, verse: 1  },
    { book: 50, chapter: 4,  verse: 13 },
    { book: 24, chapter: 29, verse: 11 },
    { book: 40, chapter: 6,  verse: 34 },
    { book: 19, chapter: 46, verse: 1  },
    { book: 45, chapter: 8,  verse: 28 },
  ];

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  );
  const { book, chapter, verse } = DAILY[dayOfYear % DAILY.length];

  try {
    const verseText = await getVerse(book, chapter, verse, lang);
    const bookName = BOOKS[lang]?.[book - 1] || '';
    res.json({
      verse:     verseText,
      reference: `${bookName} ${chapter}:${verse}`,
      translation: TRANSLATIONS[lang] || 'BSB'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET / — health check ──────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: '✝️ Bible Answer API is running' });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`✝️ Server running on port ${process.env.PORT || 3000}`);
});