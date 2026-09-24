import { selectMemoryWindow } from './window';

const turn = (role: string, id: string) => ({ role, id });

describe('selectMemoryWindow', () => {
  it('keeps every message when the conversation fits the window', () => {
    const messages = [turn('user', 'u1'), turn('assistant', 'a1')];

    expect(selectMemoryWindow(messages, 5)).toEqual(messages);
  });

  it('always ends at the newest message after a tool-heavy turn', () => {
    const messages = [
      turn('user', 'u1'),
      turn('assistant', 'call'),
      turn('tool', 't1'),
      turn('tool', 't2'),
      turn('assistant', 'a1'),
      turn('user', 'u2'),
    ];

    expect(selectMemoryWindow(messages, 5).map((m) => m.id)).toEqual(['u2']);
  });

  it('opens the window on the earliest user turn inside it', () => {
    const messages = [
      turn('user', 'u1'),
      turn('assistant', 'a1'),
      turn('user', 'u2'),
      turn('assistant', 'a2'),
      turn('user', 'u3'),
      turn('assistant', 'a3'),
      turn('user', 'u4'),
    ];

    expect(selectMemoryWindow(messages, 5).map((m) => m.id)).toEqual([
      'u2',
      'a2',
      'u3',
      'a3',
      'u4',
    ]);
  });

  it('falls back to the plain tail when no user turn is inside it', () => {
    const messages = [turn('user', 'u1'), ...['a', 'b', 'c'].map((id) => turn('tool', id))];

    expect(selectMemoryWindow(messages, 2).map((m) => m.id)).toEqual(['b', 'c']);
  });
});
