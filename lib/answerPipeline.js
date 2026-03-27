function collapseWhitespace(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeLang(raw) {
  if (!raw) return 'en';

  const cleaned = String(raw)
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');

  const base = cleaned.split('-')[0];

  const aliases = {
    en: 'en',
    english: 'en',
    pt: 'pt',
    'pt-br': 'pt',
    portuguese: 'pt',
    portugues: 'pt',
    português: 'pt',
    es: 'es',
    'es-419': 'es',
    spanish: 'es',
    espanol: 'es',
    español: 'es',
    ru: 'ru',
    russian: 'ru',
    fr: 'fr',
    'fr-fr': 'fr',
    'fr-ca': 'fr',
    french: 'fr',
    francais: 'fr',
    français: 'fr'
  };

  return aliases[cleaned] || aliases[base] || 'en';
}

function previewForLog(value, maxLength = 240) {
  const text = typeof value === 'string' ? value.trim() : JSON.stringify(value);
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function extractVerseText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content.map(extractVerseText).filter(Boolean).join(' ');
  }

  if (typeof content === 'object') {
    if (content.type === 'footnote' || content.type === 'cross_reference') return '';
    if (content.content) return extractVerseText(content.content);
    if (content.text) return content.text;
  }

  return '';
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text) {
  if (typeof text !== 'string' || !text.includes('{')) return null;

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (start === -1) {
      if (char === '{') {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseClaudeJson(rawText) {
  if (typeof rawText !== 'string') return null;

  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const direct = tryParseJson(unfenced);
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct;
  }

  const extracted = extractFirstJsonObject(trimmed);
  const parsed = extracted ? tryParseJson(extracted) : null;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed;
  }

  return null;
}

function normalizePositiveInteger(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const match = value.match(/-?\d+/);
    return match ? Math.trunc(Number(match[0])) : null;
  }

  return null;
}

function normalizeBounds(start, end) {
  if (!Number.isInteger(start) || start < 1) return null;

  const resolvedEnd = Number.isInteger(end) && end > 0 ? end : start;
  return {
    start: Math.min(start, resolvedEnd),
    end: Math.max(start, resolvedEnd)
  };
}

function normalizeVerseBounds(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const start = normalizePositiveInteger(
      value.start ?? value.from ?? value.verseStart ?? value.verse ?? value.number
    );
    const end = normalizePositiveInteger(value.end ?? value.to ?? value.verseEnd) ?? start;
    return normalizeBounds(start, end);
  }

  if (Array.isArray(value)) {
    const [rawStart, rawEnd] = value;
    const start = normalizePositiveInteger(rawStart);
    const end = normalizePositiveInteger(rawEnd) ?? start;
    return normalizeBounds(start, end);
  }

  if (typeof value === 'number' || typeof value === 'string') {
    const matches = String(value).match(/\d+/g);
    if (!matches || matches.length === 0) return null;

    const start = Number(matches[0]);
    const end = Number(matches[Math.min(1, matches.length - 1)]);
    return normalizeBounds(start, end);
  }

  return null;
}

function normalizeSelection(parsed, { maxBook = 66 } = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const book = normalizePositiveInteger(parsed.book);
  const chapter = normalizePositiveInteger(parsed.chapter);
  const verses = normalizeVerseBounds(parsed.verse ?? parsed.verses ?? parsed.verseRange);

  if (!Number.isInteger(book) || book < 1 || book > maxBook) return null;
  if (!Number.isInteger(chapter) || chapter < 1) return null;
  if (!verses) return null;

  return {
    book,
    chapter,
    verseStart: verses.start,
    verseEnd: verses.end,
    context: collapseWhitespace(String(parsed.context ?? '')),
    application: collapseWhitespace(String(parsed.application ?? '')),
    prayer: collapseWhitespace(String(parsed.prayer ?? ''))
  };
}

function extractPassageTextFromChapterData(data, verseStart, verseEnd = verseStart) {
  const items = Array.isArray(data?.chapter?.content) ? data.chapter.content : [];
  const verses = items.filter(item => item?.type === 'verse');

  const collected = [];
  const missing = [];

  for (let verseNumber = verseStart; verseNumber <= verseEnd; verseNumber += 1) {
    const verse = verses.find(item => normalizePositiveInteger(item?.number) === verseNumber);
    if (!verse) {
      missing.push(verseNumber);
      continue;
    }

    const text = collapseWhitespace(extractVerseText(verse.content));
    if (text) {
      collected.push(text);
    } else {
      missing.push(verseNumber);
    }
  }

  return {
    text: collapseWhitespace(collected.join(' ')),
    missing
  };
}

function formatVerseSuffix(verseStart, verseEnd) {
  return verseStart === verseEnd ? `${verseStart}` : `${verseStart}-${verseEnd}`;
}

function extractClaudeText(claudeData) {
  if (!Array.isArray(claudeData?.content)) return '';

  return claudeData.content
    .map(block => (typeof block?.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function buildAskResponse({
  query,
  lang = 'en',
  selectAnswer,
  fetchPassageText,
  books,
  translation,
  logger = console
}) {
  if (!query || !query.trim()) {
    throw new Error('Query is required');
  }

  let previousRawText = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const rawText = await selectAnswer({ query, lang, attempt, previousRawText });
    const parsed = parseClaudeJson(rawText);
    const normalized = normalizeSelection(parsed);

    logger.info?.(
      `[answerPipeline] Attempt ${attempt} raw model response: ${previewForLog(rawText)}`
    );
    logger.info?.(
      `[answerPipeline] Attempt ${attempt} normalized parsed values: ${JSON.stringify(normalized)}`
    );

    if (!normalized) {
      previousRawText = rawText;
      continue;
    }

    const verseText = collapseWhitespace(
      await fetchPassageText({ ...normalized, lang })
    );

    if (verseText) {
      const bookName = books?.[lang]?.[normalized.book - 1] || `Book ${normalized.book}`;
      return {
        reference: `${bookName} ${normalized.chapter}:${formatVerseSuffix(normalized.verseStart, normalized.verseEnd)}`,
        verseText,
        context: normalized.context,
        application: normalized.application,
        prayer: normalized.prayer,
        translation
      };
    }

    logger.warn?.(
      `[answerPipeline] Attempt ${attempt} produced empty verse text for selection ${JSON.stringify(normalized)}`
    );
    previousRawText = rawText;
  }

  throw new Error('Could not produce a renderable verse response');
}

module.exports = {
  buildAskResponse,
  collapseWhitespace,
  extractClaudeText,
  extractFirstJsonObject,
  extractPassageTextFromChapterData,
  extractVerseText,
  formatVerseSuffix,
  normalizeLang,
  normalizePositiveInteger,
  normalizeSelection,
  normalizeVerseBounds,
  parseClaudeJson,
  previewForLog
};
