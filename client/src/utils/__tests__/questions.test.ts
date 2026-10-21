import { parseQuestions, formatAnswers } from '../questions';

const reply = `Vorläufig: § 22 SGB II.

\`\`\`questions
{"questions": [
  {"question": "Wohnen Sie zur Miete?", "options": ["Ja", "Nein"]},
  {"question": "Welche Unterlagen haben Sie?", "options": ["Bescheid", "Mietvertrag", ""], "multiple": true},
  {"options": ["ohne Frage"]}
]}
\`\`\``;

describe('parseQuestions', () => {
  it('reads the questions block into answerable items', () => {
    const items = parseQuestions(reply);
    expect(items).toEqual([
      {
        id: '1. Wohnen Sie zur Miete?',
        question: 'Wohnen Sie zur Miete?',
        options: [
          { label: 'Ja', value: 'Ja' },
          { label: 'Nein', value: 'Nein' },
        ],
        multiSelect: false,
      },
      {
        id: '2. Welche Unterlagen haben Sie?',
        question: 'Welche Unterlagen haben Sie?',
        options: [
          { label: 'Bescheid', value: 'Bescheid' },
          { label: 'Mietvertrag', value: 'Mietvertrag' },
        ],
        multiSelect: true,
      },
    ]);
  });

  it('ignores a block that is still streaming or malformed', () => {
    expect(parseQuestions(reply.slice(0, -10))).toBeNull();
    expect(parseQuestions('```questions\n{not json}\n```')).toBeNull();
    expect(parseQuestions('no block here')).toBeNull();
  });
});

describe('formatAnswers', () => {
  it('writes one question/answer pair per question', () => {
    expect(formatAnswers({ '1. Miete?': 'Ja', '2. Unterlagen?': 'Bescheid, Mietvertrag' })).toBe(
      '1. Miete?\n→ Ja\n\n2. Unterlagen?\n→ Bescheid, Mietvertrag',
    );
  });
});
