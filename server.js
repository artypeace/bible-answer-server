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
  ru: 'rus_syn',
  fr: 'lsg'
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
{"book":50,"chapter":4,"verse":6,"context":"1-2 предложения кто написал и когда","application":"2-3 тёплых предложения связывающих стих с ситуацией","prayer":"одна короткая молитва"}`,

  fr: `Tu es un compagnon spirituel bienveillant et sage. L'utilisateur partage un sentiment ou une question du cœur. Trouve UN verset biblique qui parle à sa situation. Tu DOIS répondre avec SEULEMENT un objet JSON pur. Sans markdown, sans backticks, sans explication. Exactement dans ce format:
{"book":50,"chapter":4,"verse":6,"context":"1-2 phrases qui a écrit et quand","application":"2-3 phrases chaleureuses reliant le verset à la situation","prayer":"une courte prière"}`
};

// ── Рекурсивное извлечение текста из контента стиха ──────
// bible.helloao.org возвращает сложные объекты: {type:"wj",content:[...]},
// {type:"note",...} и т.д. — нужно рекурсивно обойти всё дерево.
function extractVerseText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(extractVerseText).filter(Boolean).join(' ');
  }
  if (typeof content === 'object') {
    // Пропускаем сноски и перекрёстные ссылки — они не часть текста стиха
    if (content.type === 'footnote' || content.type === 'cross_reference') return '';
    if (content.content) return extractVerseText(content.content);
    if (content.text)    return content.text;
  }
  return '';
}

// ── Вспомогательная функция получения стиха ───────────────
async function getVerse(book, chapter, verse, lang) {
  const translation = TRANSLATIONS[lang] || 'BSB';
  const bookCode    = BOOK_CODES[book - 1];
  const url = `https://bible.helloao.org/api/${translation}/${bookCode}/${chapter}.json`;

  console.log(`[getVerse] book=${book} bookCode=${bookCode} chapter=${chapter} verse=${verse} lang=${lang} translation=${translation}`);
  console.log(`[getVerse] URL: ${url}`);

  const res  = await fetch(url);
  const data = await res.json();

  const verseObj = data.chapter?.content?.find(
    item => item.type === 'verse' && item.number === verse
  );

  if (!verseObj) {
    const available = data.chapter?.content
      ?.filter(c => c.type === 'verse')
      .map(c => c.number)
      .slice(0, 10);
    console.warn(`[getVerse] Verse ${verse} not found. Available verse numbers:`, available);
    return '';
  }

  const text = extractVerseText(verseObj.content).replace(/\s+/g, ' ').trim();
  console.log(`[getVerse] Extracted: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);
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

  // 30 popular verses — one per day, cycles monthly
  const DAILY = [
    { book: 43, chapter: 3,  verse: 16, tagline: { en: "God's greatest act of love for humanity.", pt: "O maior ato de amor de Deus pela humanidade.", es: "El mayor acto de amor de Dios por la humanidad.", ru: "Величайший акт любви Бога к человечеству." } },
    { book: 19, chapter: 23, verse: 1,  tagline: { en: "God is our faithful shepherd in every season.", pt: "Deus é nosso fiel pastor em toda estação.", es: "Dios es nuestro fiel pastor en toda estación.", ru: "Бог — наш верный пастырь в любое время." } },
    { book: 50, chapter: 4,  verse: 13, tagline: { en: "Christ gives us strength beyond our own limits.", pt: "Cristo nos dá força além dos nossos próprios limites.", es: "Cristo nos da fortaleza más allá de nuestros límites.", ru: "Христос даёт нам силу, превосходящую наши возможности." } },
    { book: 24, chapter: 29, verse: 11, tagline: { en: "God's plans for you are full of hope and purpose.", pt: "Os planos de Deus para você são cheios de esperança.", es: "Los planes de Dios para ti están llenos de esperanza.", ru: "Планы Бога о тебе полны надежды и смысла." } },
    { book: 40, chapter: 6,  verse: 34, tagline: { en: "Lay down tomorrow's worries — today is enough.", pt: "Deixe as preocupações de amanhã — hoje é suficiente.", es: "Deja las preocupaciones de mañana — hoy es suficiente.", ru: "Оставь заботы о завтрашнем дне — сегодняшнего достаточно." } },
    { book: 19, chapter: 46, verse: 1,  tagline: { en: "God is our refuge and strength in times of trouble.", pt: "Deus é nosso refúgio e força nos tempos de tribulação.", es: "Dios es nuestro refugio y fortaleza en tiempos de angustia.", ru: "Бог — наше прибежище и сила в трудные времена." } },
    { book: 45, chapter: 8,  verse: 28, tagline: { en: "All things — even hard ones — work for good in God's hands.", pt: "Todas as coisas cooperam para o bem nas mãos de Deus.", es: "Todas las cosas cooperan para bien en las manos de Dios.", ru: "Все — даже трудное — обращается ко благу в руках Бога." } },
    { book: 20, chapter: 3,  verse: 5,  tagline: { en: "Trust God's direction rather than your own understanding.", pt: "Confie na direção de Deus, não em seu próprio entendimento.", es: "Confía en la dirección de Dios, no en tu propio entendimiento.", ru: "Доверяй Богу, а не своему разумению." } },
    { book: 19, chapter: 121, verse: 2, tagline: { en: "Our help comes from the Creator of heaven and earth.", pt: "Nosso socorro vem do Criador do céu e da terra.", es: "Nuestra ayuda viene del Creador del cielo y la tierra.", ru: "Наша помощь от Творца неба и земли." } },
    { book: 23, chapter: 40, verse: 31, tagline: { en: "Those who wait on the Lord receive renewed strength.", pt: "Os que esperam no Senhor renovam as suas forças.", es: "Los que esperan en el Señor renuevan sus fuerzas.", ru: "Уповающие на Господа обновляются в силах." } },
    { book: 19, chapter: 34, verse: 18, tagline: { en: "God is especially close to the broken-hearted.", pt: "Deus está especialmente perto dos de coração quebrantado.", es: "Dios está especialmente cerca de los quebrantados de corazón.", ru: "Бог особенно близок к сокрушённым сердцем." } },
    { book: 40, chapter: 11, verse: 28, tagline: { en: "Jesus personally invites the weary to find rest in him.", pt: "Jesus convida pessoalmente os cansados a encontrar descanso nele.", es: "Jesús invita personalmente a los cansados a encontrar descanso en él.", ru: "Иисус лично приглашает усталых найти покой в Нём." } },
    { book: 47, chapter: 5,  verse: 7,  tagline: { en: "We can release anxiety by casting our cares on God.", pt: "Podemos liberar a ansiedade lançando nossas preocupações em Deus.", es: "Podemos liberar la ansiedad echando nuestras cargas sobre Dios.", ru: "Мы можем отпустить тревогу, возложив заботы на Бога." } },
    { book: 45, chapter: 8,  verse: 38, tagline: { en: "Nothing in all creation can separate us from God's love.", pt: "Nada em toda a criação pode nos separar do amor de Deus.", es: "Nada en toda la creación puede separarnos del amor de Dios.", ru: "Ничто в творении не может отлучить нас от любви Бога." } },
    { book: 50, chapter: 4,  verse: 6,  tagline: { en: "Prayer and gratitude replace anxiety with God's peace.", pt: "Oração e gratidão substituem a ansiedade pela paz de Deus.", es: "La oración y la gratitud reemplazan la ansiedad con la paz de Dios.", ru: "Молитва и благодарность заменяют тревогу миром Божьим." } },
    { book: 23, chapter: 41, verse: 10, tagline: { en: "God promises his presence and strength to those who fear him.", pt: "Deus promete sua presença e força aos que o temem.", es: "Dios promete su presencia y fortaleza a los que le temen.", ru: "Бог обещает Своё присутствие и силу тем, кто боится Его." } },
    { book: 19, chapter: 37, verse: 4,  tagline: { en: "Delight in God, and he shapes our deepest desires.", pt: "Deleite-se em Deus e ele moldará os seus desejos mais profundos.", es: "Deléitate en Dios y él moldeará tus deseos más profundos.", ru: "Угождай Господу, и Он направит твои сокровенные желания." } },
    { book: 60, chapter: 5,  verse: 7,  tagline: { en: "Cast your anxiety on God because he cares for you.", pt: "Lance sobre Deus a sua ansiedade porque ele cuida de você.", es: "Echa sobre Dios tu ansiedad porque él cuida de ti.", ru: "Возложи на Бога тревогу свою, ибо Он печётся о тебе." } },
    { book: 45, chapter: 12, verse: 12, tagline: { en: "Perseverance in hope and prayer sustains the believer.", pt: "A perseverança na esperança e na oração sustenta o crente.", es: "La perseverancia en la esperanza y la oración sostiene al creyente.", ru: "Постоянство в надежде и молитве поддерживает верующего." } },
    { book: 20, chapter: 4,  verse: 23, tagline: { en: "Guard your heart — it is the source of all that you do.", pt: "Guarde o seu coração — é a fonte de tudo o que você faz.", es: "Guarda tu corazón — es la fuente de todo lo que haces.", ru: "Храни своё сердце — оно источник всей твоей жизни." } },
    { book: 19, chapter: 91, verse: 2,  tagline: { en: "God is our fortress — we can fully take refuge in him.", pt: "Deus é nossa fortaleza — podemos refugiar-nos plenamente nele.", es: "Dios es nuestra fortaleza — podemos refugiarnos plenamente en él.", ru: "Бог — наша крепость, в Нём мы можем полностью укрыться." } },
    { book: 45, chapter: 15, verse: 13, tagline: { en: "The God of hope fills believers with joy and peace.", pt: "O Deus da esperança enche os crentes de alegria e paz.", es: "El Dios de la esperanza llena a los creyentes de gozo y paz.", ru: "Бог надежды наполняет верующих радостью и миром." } },
    { book: 23, chapter: 26, verse: 3,  tagline: { en: "Perfect peace is the gift for those who fix their mind on God.", pt: "A paz perfeita é o presente para os que fixam a mente em Deus.", es: "La paz perfecta es el regalo para los que fijan su mente en Dios.", ru: "Совершенный мир — дар тем, чей разум устремлён к Богу." } },
    { book: 43, chapter: 16, verse: 33, tagline: { en: "Jesus promises peace even in the midst of life's trouble.", pt: "Jesus promete paz mesmo em meio às tribulações da vida.", es: "Jesús promete paz incluso en medio de las tribulaciones de la vida.", ru: "Иисус обещает мир даже среди жизненных скорбей." } },
    { book: 49, chapter: 3,  verse: 20, tagline: { en: "God can do far more than we dare to ask or imagine.", pt: "Deus pode fazer muito mais do que ousamos pedir ou imaginar.", es: "Dios puede hacer mucho más de lo que osamos pedir o imaginar.", ru: "Бог может сделать несравненно больше, чем мы просим или думаем." } },
    { book: 59, chapter: 1,  verse: 5,  tagline: { en: "If you lack wisdom, ask God — he gives it generously.", pt: "Se lhe falta sabedoria, peça a Deus — ele dá generosamente.", es: "Si te falta sabiduría, pídela a Dios — él da generosamente.", ru: "Если не хватает мудрости, проси у Бога — Он даёт щедро." } },
    { book: 19, chapter: 145, verse: 18,tagline: { en: "God is near to all who call on him in truth.", pt: "Deus está perto de todos que o invocam na verdade.", es: "Dios está cerca de todos los que lo invocan en verdad.", ru: "Бог близок ко всем, кто призывает Его искренно." } },
    { book: 40, chapter: 7,  verse: 7,  tagline: { en: "Jesus urges us to ask, seek and knock in persistent prayer.", pt: "Jesus nos urge a pedir, buscar e bater na porta com persistência.", es: "Jesús nos insta a pedir, buscar y llamar con oración persistente.", ru: "Иисус призывает нас просить, искать и стучать в постоянной молитве." } },
    { book: 45, chapter: 5,  verse: 8,  tagline: { en: "God demonstrated his love for us while we were still sinners.", pt: "Deus demonstrou seu amor por nós quando ainda éramos pecadores.", es: "Dios demostró su amor por nosotros cuando aún éramos pecadores.", ru: "Бог явил Свою любовь к нам, когда мы ещё были грешниками." } },
    { book: 19, chapter: 16, verse: 11, tagline: { en: "In God's presence is fullness of joy and eternal pleasures.", pt: "Na presença de Deus há plenitude de alegria e prazeres eternos.", es: "En la presencia de Dios hay plenitud de gozo y deleites eternos.", ru: "В присутствии Бога — полнота радости и вечные наслаждения." } },
  ];

  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const entry = DAILY[dayOfYear % DAILY.length];
  const { book, chapter, verse } = entry;
  const tagline = entry.tagline[lang] || entry.tagline.en;

  try {
    const verseText = await getVerse(book, chapter, verse, lang);
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

// ── GET / — health check ──────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: '✝️ Bible Answer API is running' });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`✝️ Server running on port ${process.env.PORT || 3000}`);
});