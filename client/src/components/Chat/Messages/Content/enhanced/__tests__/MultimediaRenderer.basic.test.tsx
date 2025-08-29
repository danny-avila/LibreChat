/**
 * Basic MultimediaRenderer Tests
 * 
 * Simple tests to verify core functionality works
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MultimediaRenderer } from '../MultimediaRenderer';
import type { ContentBlock } from '../types';

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
});
window.IntersectionObserver = mockIntersectionObserver;

describe('MultimediaRenderer Basic Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render invalid URL error for malformed URLs', () => {
    const block: ContentBlock = {
      id: 'test-1',
      type: 'image',
      content: 'not-a-valid-url',
      metadata: {},
      position: 0,
    };

    render(<MultimediaRenderer block={block} />);
    
    expect(screen.getByText('Invalid URL')).toBeInTheDocument();
    expect(screen.getByText(/not valid or not allowed for security reasons/)).toBeInTheDocument();
  });

  it('should render loading placeholder initially for valid URLs', () => {
    const block: ContentBlock = {
      id: 'test-2',
      type: 'image',
      content: 'https://example.com/image.jpg',
      metadata: {},
      position: 0,
    };

    render(<MultimediaRenderer block={block} />);
    
    expect(screen.getByText('Loading image...')).toBeInTheDocument();
  });

  it('should render for different media types', () => {
    const imageBlock: ContentBlock = {
      id: 'test-3',
      type: 'image',
      content: 'https://example.com/image.jpg',
      metadata: {},
      position: 0,
    };

    const videoBlock: ContentBlock = {
      id: 'test-4',
      type: 'video',
      content: 'https://example.com/video.mp4',
      metadata: {},
      position: 0,
    };

    const audioBlock: ContentBlock = {
      id: 'test-5',
      type: 'audio',
      content: 'https://example.com/audio.mp3',
      metadata: {},
      position: 0,
    };

    const { rerender } = render(<MultimediaRenderer block={imageBlock} />);
    expect(screen.getByText('Loading image...')).toBeInTheDocument();

    rerender(<MultimediaRenderer block={videoBlock} />);
    expect(screen.getByText('Loading video...')).toBeInTheDocument();

    rerender(<MultimediaRenderer block={audioBlock} />);
    expect(screen.getByText('Loading audio...')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const block: ContentBlock = {
      id: 'test-6',
      type: 'image',
      content: 'https://example.com/image.jpg',
      metadata: {},
      position: 0,
    };

    const { container } = render(<MultimediaRenderer block={block} className="custom-class" />);
    
    expect(container.firstChild).toHaveClass('multimedia-renderer');
    expect(container.firstChild).toHaveClass('custom-class');
  });
});