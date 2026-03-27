const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAskResponse,
  extractPassageTextFromChapterData,
  normalizeLang
} = require('../lib/answerPipeline');

function makeBooks() {
  const books = Array.from({ length: 66 }, (_, index) => `Book ${index + 1}`);
  books[18] = 'Psalms';
  books[42] = 'John';
  books[49] = 'Philippians';
  return { en: books };
}

function makeBooksWithFrench() {
  const books = makeBooks().en;
  return { en: books, fr: books };
}

test('quick prompt pipeline normalizes numeric-string references before verse lookup', async () => {
  const calls = [];

  const response = await buildAskResponse({
    query: "I'm feeling anxious and can't find peace. What does the Bible say?",
    lang: 'en',
    translation: 'BSB',
    books: makeBooks(),
    selectAnswer: async () => (
      '{"book":"50","chapter":"4","verse":"6","context":" Paul wrote this from prison. ","application":" Bring your worries to God. ","prayer":"Lord, give me peace. "}'
    ),
    fetchPassageText: async selection => {
      calls.push(selection);
      return 'Do not be anxious about anything.';
    },
    logger: { info() {}, warn() {} }
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    book: 50,
    chapter: 4,
    verseStart: 6,
    verseEnd: 6,
    context: 'Paul wrote this from prison.',
    application: 'Bring your worries to God.',
    prayer: 'Lord, give me peace.',
    lang: 'en'
  });
  assert.equal(response.reference, 'Philippians 4:6');
  assert.equal(response.verseText, 'Do not be anxious about anything.');
  assert.equal(response.context, 'Paul wrote this from prison.');
});

test('quick prompt pipeline accepts French language and returns a renderable response', async () => {
  const response = await buildAskResponse({
    query: "Je suis inquiet aujourd'hui. As-tu un verset pour moi ?",
    lang: 'fr',
    translation: 'fra_lsg',
    books: makeBooksWithFrench(),
    selectAnswer: async () => (
      '{"book":50,"chapter":4,"verse":6,"context":"Paul écrit depuis la prison.","application":"Remets tes inquiétudes à Dieu.","prayer":"Seigneur, donne-moi ta paix."}'
    ),
    fetchPassageText: async () => 'Ne vous inquiétez de rien.',
    logger: { info() {}, warn() {} }
  });

  assert.equal(response.reference, 'Philippians 4:6');
  assert.equal(response.verseText, 'Ne vous inquiétez de rien.');
});

test('manual typed prompt accepts fenced JSON and verse ranges', async () => {
  const response = await buildAskResponse({
    query: 'I am exhausted and need morning strength for today.',
    lang: 'en',
    translation: 'BSB',
    books: makeBooks(),
    selectAnswer: async () => `
Here is the JSON:
\`\`\`json
{"book":19,"chapter":"23","verse":"1-2","context":"A psalm of David.","application":"Receive strength for the day.","prayer":"Lead me today."}
\`\`\`
`,
    fetchPassageText: async ({ verseStart, verseEnd }) => {
      assert.equal(verseStart, 1);
      assert.equal(verseEnd, 2);
      return 'The LORD is my shepherd. He makes me lie down in green pastures.';
    },
    logger: { info() {}, warn() {} }
  });

  assert.equal(response.reference, 'Psalms 23:1-2');
  assert.match(response.verseText, /The LORD is my shepherd/);
});

test('empty verse text triggers a retry instead of returning a broken success payload', async () => {
  const attempts = [];

  const response = await buildAskResponse({
    query: 'Please help me trust God today.',
    lang: 'en',
    translation: 'BSB',
    books: makeBooks(),
    selectAnswer: async ({ attempt }) => {
      attempts.push(attempt);
      if (attempt === 1) {
        return '{"book":"50","chapter":"4","verse":"6","context":"First try","application":"First try","prayer":"First try"}';
      }
      return '{"book":43,"chapter":3,"verse":16,"context":"Second try","application":"Second try","prayer":"Second try"}';
    },
    fetchPassageText: async ({ book }) => {
      if (book === 50) return '   ';
      return 'For God so loved the world that He gave His one and only Son.';
    },
    logger: { info() {}, warn() {} }
  });

  assert.deepEqual(attempts, [1, 2]);
  assert.equal(response.reference, 'John 3:16');
  assert.match(response.verseText, /For God so loved the world/);
});

test('fails cleanly when no renderable verse can be produced', async () => {
  await assert.rejects(
    () => buildAskResponse({
      query: 'I need hope.',
      lang: 'en',
      translation: 'BSB',
      books: makeBooks(),
      selectAnswer: async () => 'not valid json',
      fetchPassageText: async () => 'This should never be used',
      logger: { info() {}, warn() {} }
    }),
    /Could not produce a renderable verse response/
  );
});

test('chapter extraction joins verse ranges and ignores non-text content', () => {
  const result = extractPassageTextFromChapterData({
    chapter: {
      content: [
        { type: 'heading', content: ['Psalm title'] },
        {
          type: 'verse',
          number: 6,
          content: [
            'Do not be anxious about anything,',
            { type: 'footnote', content: ['note'] },
            'but in everything, by prayer and petition,'
          ]
        },
        {
          type: 'verse',
          number: '7',
          content: [
            { text: 'And the peace of God,' },
            { text: 'will guard your hearts and your minds in Christ Jesus.' }
          ]
        }
      ]
    }
  }, 6, 7);

  assert.equal(
    result.text,
    'Do not be anxious about anything, but in everything, by prayer and petition, And the peace of God, will guard your hearts and your minds in Christ Jesus.'
  );
  assert.deepEqual(result.missing, []);
});

test('normalizeLang accepts French variants and does not fall back to English', () => {
  assert.equal(normalizeLang('fr'), 'fr');
  assert.equal(normalizeLang('fr-FR'), 'fr');
  assert.equal(normalizeLang('fr_CA'), 'fr');
  assert.equal(normalizeLang('French'), 'fr');
  assert.equal(normalizeLang('français'), 'fr');
});
