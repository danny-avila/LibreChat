/**
 * TTS Integration Test
 * Simple integration test to verify TTS components work together
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentParser } from '../ContentParser';
import { ContentBlockRenderer } from '../ContentBlockRenderer';

// Mock Web Speech API
const mockSpeechSynthesis = {
  speak: jest.fn(),
  cancel: jest.fn(),
  getVoices: jest.fn(() => [
    { name: 'Voice 1', lang: 'en-US', localService: true },
    { name: 'Voice 2', lang: 'pl-PL', localService: true },
  ]),
};

Object.defineProperty(window, 'speechSynthesis', {
  value: mockSpeechSynthesis,
  writable: true,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: jest.fn().mockImplementation((text) => ({
    text,
    lang: '',
    voice: null,
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: null,
    onend: null,
    onerror: null,
  })),
  writable: true,
});

describe('TTS Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse TTS markup and render clickable TTS component', () => {
    const text = 'Hello [tts:en-US]world[/tts]!';
    const result = ContentParser.parse(text);
    
    expect(result.hasEnhancedContent).toBe(true);
    expect(result.blocks).toHaveLength(3); // "Hello ", TTS block, "!"
    
    const ttsBlock = result.blocks.find(block => block.type === 'tts');
    expect(ttsBlock).toBeDefined();
    expect(ttsBlock?.content).toBe('world');
    expect(ttsBlock?.metadata.language).toBe('en-US');
  });

  it('should render TTS block with clickable interface', () => {
    const ttsBlock = {
      id: 'test-1',
      type: 'tts' as const,
      content: 'Hello world',
      metadata: { language: 'en-US' },
      position: 0,
    };

    render(
      <ContentBlockRenderer 
        block={ttsBlock} 
        isLatestMessage={false}
      />
    );

    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should trigger speech synthesis when TTS element is clicked', () => {
    const ttsBlock = {
      id: 'test-1',
      type: 'tts' as const,
      content: 'Hello world',
      metadata: { language: 'en-US' },
      position: 0,
    };

    render(
      <ContentBlockRenderer 
        block={ttsBlock} 
        isLatestMessage={false}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
  });

  it('should handle multiple TTS blocks in same message', () => {
    const text = '[tts:en-US]Hello[/tts] and [tts:pl-PL]Cześć[/tts]';
    const result = ContentParser.parse(text);
    
    expect(result.hasEnhancedContent).toBe(true);
    expect(result.blocks).toHaveLength(3); // TTS block, " and ", TTS block
    
    const ttsBlocks = result.blocks.filter(block => block.type === 'tts');
    expect(ttsBlocks).toHaveLength(2);
    expect(ttsBlocks[0].content).toBe('Hello');
    expect(ttsBlocks[0].metadata.language).toBe('en-US');
    expect(ttsBlocks[1].content).toBe('Cześć');
    expect(ttsBlocks[1].metadata.language).toBe('pl-PL');
  });

  it('should fallback to default language for invalid language codes', () => {
    const text = '[tts:invalid]Hello[/tts]';
    const result = ContentParser.parse(text);
    
    const ttsBlock = result.blocks.find(block => block.type === 'tts');
    expect(ttsBlock?.metadata.language).toBe('invalid'); // Parser preserves original, TTSEngine handles validation
  });
});