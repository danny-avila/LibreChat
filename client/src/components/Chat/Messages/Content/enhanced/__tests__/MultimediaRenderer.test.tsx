/**
 * MultimediaRenderer Tests
 * 
 * Tests for multimedia rendering capabilities including URL validation,
 * loading states, error handling, and responsive behavior.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MultimediaRenderer } from '../MultimediaRenderer';
import type { ContentBlock } from '../types';

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null,
});
window.IntersectionObserver = mockIntersectionObserver;

// Mock URL constructor for testing
const originalURL = global.URL;

// Mock process.env for testing
const originalEnv = process.env;

describe('MultimediaRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.URL = originalURL;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('URL Validation', () => {
    it('should render error for invalid URLs', () => {
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

    it('should render error for non-http protocols', () => {
      const block: ContentBlock = {
        id: 'test-2',
        type: 'image',
        content: 'ftp://example.com/image.jpg',
        metadata: {},
        position: 0,
      };

      render(<MultimediaRenderer block={block} />);
      
      expect(screen.getByText('Invalid URL')).toBeInTheDocument();
    });

    it('should allow valid HTTPS URLs', () => {
      const block: ContentBlock = {
        id: 'test-3',
        type: 'image',
        content: 'https://example.com/image.jpg',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger immediate loading
      const mockObserve = jest.fn((callback) => {
        callback([{ isIntersecting: true }]);
      });
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);
      
      expect(screen.queryByText('Invalid URL')).not.toBeInTheDocument();
    });

    it('should block localhost URLs in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const block: ContentBlock = {
        id: 'test-4',
        type: 'image',
        content: 'http://localhost:3000/image.jpg',
        metadata: {},
        position: 0,
      };

      render(<MultimediaRenderer block={block} />);
      
      expect(screen.getByText('Invalid URL')).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });

    it('should allow localhost URLs in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const block: ContentBlock = {
        id: 'test-5',
        type: 'image',
        content: 'http://localhost:3000/image.jpg',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger immediate loading
      const mockObserve = jest.fn((callback) => {
        callback([{ isIntersecting: true }]);
      });
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);
      
      expect(screen.queryByText('Invalid URL')).not.toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Lazy Loading', () => {
    it('should show loading placeholder initially', () => {
      const block: ContentBlock = {
        id: 'test-6',
        type: 'image',
        content: 'https://example.com/image.jpg',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to not trigger loading
      mockIntersectionObserver.mockImplementation(() => ({
        observe: jest.fn(),
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);
      
      expect(screen.getByText('Loading image...')).toBeInTheDocument();
    });

    it('should load content when in view', async () => {
      const block: ContentBlock = {
        id: 'test-7',
        type: 'image',
        content: 'https://example.com/image.jpg',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger loading after a delay
      let observerCallback: any;
      mockIntersectionObserver.mockImplementation((callback) => {
        observerCallback = callback;
        return {
          observe: jest.fn(),
          disconnect: jest.fn(),
        };
      });

      render(<MultimediaRenderer block={block} />);
      
      expect(screen.getByText('Loading image...')).toBeInTheDocument();

      // Trigger intersection
      observerCallback([{ isIntersecting: true }]);

      await waitFor(() => {
        expect(screen.getByAltText('Enhanced content image')).toBeInTheDocument();
      });
    });
  });

  describe('Image Rendering', () => {
    it('should render image with correct attributes', async () => {
      const block: ContentBlock = {
        id: 'test-8',
        type: 'image',
        content: 'https://example.com/test-image.jpg',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger immediate loading
      const mockObserve = jest.fn((callback) => {
        callback([{ isIntersecting: true }]);
      });
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);

      await waitFor(() => {
        const img = screen.getByAltText('Enhanced content image');
        expect(img).toHaveAttribute('src', 'https://example.com/test-image.jpg');
        expect(img).toHaveAttribute('loading', 'lazy');
        expect(img).toHaveClass('multimedia-image');
      });
    });

    it('should handle image load error', async () => {
      const block: ContentBlock = {
        id: 'test-9',
        type: 'image',
        content: 'https://example.com/broken-image.jpg',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger immediate loading
      const mockObserve = jest.fn((callback) => {
        callback([{ isIntersecting: true }]);
      });
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);

      await waitFor(() => {
        const img = screen.getByAltText('Enhanced content image');
        fireEvent.error(img);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to load image')).toBeInTheDocument();
        expect(screen.getByText(/Image failed to load/)).toBeInTheDocument();
        expect(screen.getByText('Open in new tab')).toBeInTheDocument();
      });
    });
  });

  describe('Video Rendering', () => {
    it('should render video with correct attributes', async () => {
      const block: ContentBlock = {
        id: 'test-10',
        type: 'video',
        content: 'https://example.com/test-video.mp4',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger immediate loading
      const mockObserve = jest.fn((callback) => {
        callback([{ isIntersecting: true }]);
      });
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);

      await waitFor(() => {
        const video = screen.getByRole('application'); // video elements have application role
        expect(video).toHaveAttribute('src', 'https://example.com/test-video.mp4');
        expect(video).toHaveAttribute('controls');
        expect(video).toHaveAttribute('preload', 'metadata');
        expect(video).toHaveClass('multimedia-video');
      });
    });

    it('should handle video load error', async () => {
      const block: ContentBlock = {
        id: 'test-11',
        type: 'video',
        content: 'https://example.com/broken-video.mp4',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger immediate loading
      const mockObserve = jest.fn((callback) => {
        callback([{ isIntersecting: true }]);
      });
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);

      await waitFor(() => {
        const video = screen.getByRole('application');
        fireEvent.error(video);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to load video')).toBeInTheDocument();
        expect(screen.getByText(/Video failed to load/)).toBeInTheDocument();
      });
    });
  });

  describe('Audio Rendering', () => {
    it('should render audio with correct attributes', async () => {
      const block: ContentBlock = {
        id: 'test-12',
        type: 'audio',
        content: 'https://example.com/test-audio.mp3',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger immediate loading
      const mockObserve = jest.fn((callback) => {
        callback([{ isIntersecting: true }]);
      });
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);

      await waitFor(() => {
        const audio = screen.getByRole('application'); // audio elements have application role
        expect(audio).toHaveAttribute('src', 'https://example.com/test-audio.mp3');
        expect(audio).toHaveAttribute('controls');
        expect(audio).toHaveAttribute('preload', 'metadata');
        expect(audio).toHaveClass('multimedia-audio');
      });
    });

    it('should handle audio load error', async () => {
      const block: ContentBlock = {
        id: 'test-13',
        type: 'audio',
        content: 'https://example.com/broken-audio.mp3',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger immediate loading
      const mockObserve = jest.fn((callback) => {
        callback([{ isIntersecting: true }]);
      });
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);

      await waitFor(() => {
        const audio = screen.getByRole('application');
        fireEvent.error(audio);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to load audio')).toBeInTheDocument();
        expect(screen.getByText(/Audio failed to load/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Fallback', () => {
    it('should provide clickable link to original content', async () => {
      const block: ContentBlock = {
        id: 'test-14',
        type: 'image',
        content: 'https://example.com/broken-image.jpg',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger immediate loading
      const mockObserve = jest.fn((callback) => {
        callback([{ isIntersecting: true }]);
      });
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);

      await waitFor(() => {
        const img = screen.getByAltText('Enhanced content image');
        fireEvent.error(img);
      });

      await waitFor(() => {
        const link = screen.getByText('Open in new tab');
        expect(link).toHaveAttribute('href', 'https://example.com/broken-image.jpg');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', async () => {
      const block: ContentBlock = {
        id: 'test-15',
        type: 'image',
        content: 'https://example.com/accessible-image.jpg',
        metadata: {},
        position: 0,
      };

      // Mock IntersectionObserver to trigger immediate loading
      const mockObserve = jest.fn((callback) => {
        callback([{ isIntersecting: true }]);
      });
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      render(<MultimediaRenderer block={block} />);

      await waitFor(() => {
        const img = screen.getByAltText('Enhanced content image');
        expect(img).toHaveAttribute('alt', 'Enhanced content image');
      });
    });
  });
});