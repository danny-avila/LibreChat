import {
  splitThinkTaggedContent,
  splitThinkPartContent,
  stripThinkTags,
} from '../splitThinkTaggedContent';

describe('splitThinkTaggedContent', () => {
  it('returns original text when there are no think tags', () => {
    expect(splitThinkTaggedContent('Just a reply')).toEqual({
      thinking: '',
      text: 'Just a reply',
    });
  });

  it('treats an open tag without a close as mid-stream thinking', () => {
    expect(splitThinkTaggedContent('<think>still reasoning')).toEqual({
      thinking: 'still reasoning',
      text: '',
    });
  });

  it('splits closed tags from the trailing response', () => {
    expect(splitThinkTaggedContent('<think>reasoning...</think>\n\nActual response')).toEqual({
      thinking: 'reasoning...',
      text: 'Actual response',
    });
  });

  it('is case-insensitive for think tags', () => {
    expect(splitThinkTaggedContent('<THINK>Check this</THINK>\nAnswer')).toEqual({
      thinking: 'Check this',
      text: 'Answer',
    });
    expect(splitThinkTaggedContent('<Think>Check this</Think>\nAnswer')).toEqual({
      thinking: 'Check this',
      text: 'Answer',
    });
  });

  it('joins multiple closed think blocks and concatenates surrounding text', () => {
    expect(splitThinkTaggedContent('<think>a</think> one <think>b</think> two')).toEqual({
      thinking: 'a\nb',
      text: 'one  two',
    });
  });

  it('keeps text before an unclosed final think block empty of that inner content', () => {
    expect(splitThinkTaggedContent('intro <think>partial')).toEqual({
      thinking: 'partial',
      text: 'intro',
    });
  });

  it('splits on a closing tag even when the open tag is missing', () => {
    expect(splitThinkTaggedContent('legacy reasoning</think>\n\nAnswer')).toEqual({
      thinking: 'legacy reasoning',
      text: 'Answer',
    });
  });

  it('returns empty sides for empty input', () => {
    expect(splitThinkTaggedContent('')).toEqual({ thinking: '', text: '' });
  });
});

describe('splitThinkPartContent', () => {
  it('keeps untagged THINK parts as thinking', () => {
    expect(splitThinkPartContent('Native reasoning_content')).toEqual({
      thinking: 'Native reasoning_content',
      text: '',
    });
  });

  it('does not leave post-</think> response in the thinking body', () => {
    expect(splitThinkPartContent('<think>plan</think>\n\nThe answer is 4')).toEqual({
      thinking: 'plan',
      text: 'The answer is 4',
    });
  });

  it('keeps mid-stream open-only content in thinking', () => {
    expect(splitThinkPartContent('<think>\nCheck assumptions')).toEqual({
      thinking: 'Check assumptions',
      text: '',
    });
  });
});

describe('stripThinkTags', () => {
  it('strips wrapping think tags from a complete THINK part', () => {
    expect(stripThinkTags('<think>\nCheck assumptions\n</think>')).toBe('Check assumptions');
  });

  it('drops trailing response text that the end-anchored strip used to keep', () => {
    expect(stripThinkTags('<think>hidden</think>\n\nVisible reply')).toBe('hidden');
  });

  it('leaves native reasoning text unchanged', () => {
    expect(stripThinkTags('Thinking Process:\n\n1. Analyze the request')).toBe(
      'Thinking Process:\n\n1. Analyze the request',
    );
  });
});
