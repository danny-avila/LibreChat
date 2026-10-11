import { meoChatContext } from './chatContext';

describe('Meo chat context', () => {
  it('sends the newest messages within the broker limits', () => {
    const history = Array.from({ length: 100 }, (_, index) => ({
      role: (index % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      content: `turn-${index}`,
    }));
    const selected = meoChatContext(history);
    expect(selected).toHaveLength(80);
    expect(selected[0].content).toBe('turn-20');
    expect(selected.at(-1)?.content).toBe('turn-99');
    const long = meoChatContext([
      { role: 'user', content: 'old'.repeat(12000) },
      { role: 'assistant', content: 'reply'.repeat(7300) },
      { role: 'user', content: 'new' },
    ]);
    expect(long).toEqual([{ role: 'user', content: 'new' }]);
  });
});
