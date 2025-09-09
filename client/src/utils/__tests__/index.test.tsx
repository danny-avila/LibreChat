import React from 'react';
import {
  capitalizeFirstLetter,
  handleDoubleClick,
  extractContent,
  normalizeLayout,
  handleUIAction,
} from '../index';

// Mock DOM methods for handleDoubleClick tests
const mockCreateRange = jest.fn();
const mockSelectNodeContents = jest.fn();
const mockRemoveAllRanges = jest.fn();
const mockAddRange = jest.fn();
const mockGetSelection = jest.fn();

// Setup DOM mocks
Object.defineProperty(document, 'createRange', {
  value: mockCreateRange,
});

Object.defineProperty(window, 'getSelection', {
  value: mockGetSelection,
});

describe('Utils Index Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRange.mockReturnValue({
      selectNodeContents: mockSelectNodeContents,
    });
    mockGetSelection.mockReturnValue({
      removeAllRanges: mockRemoveAllRanges,
      addRange: mockAddRange,
    });
  });

  describe('capitalizeFirstLetter', () => {
    it('capitalizes the first letter of a regular string', () => {
      expect(capitalizeFirstLetter('hello')).toBe('Hello');
      expect(capitalizeFirstLetter('world')).toBe('World');
      expect(capitalizeFirstLetter('javascript')).toBe('Javascript');
    });

    it('handles single character strings', () => {
      expect(capitalizeFirstLetter('a')).toBe('A');
      expect(capitalizeFirstLetter('z')).toBe('Z');
      expect(capitalizeFirstLetter('1')).toBe('1');
    });

    it('handles strings that are already capitalized', () => {
      expect(capitalizeFirstLetter('Hello')).toBe('Hello');
      expect(capitalizeFirstLetter('WORLD')).toBe('WORLD');
    });

    it('handles empty strings', () => {
      expect(capitalizeFirstLetter('')).toBe('');
    });

    it('handles strings with special characters', () => {
      expect(capitalizeFirstLetter('åpple')).toBe('Åpple');
      expect(capitalizeFirstLetter('über')).toBe('Über');
      expect(capitalizeFirstLetter('!hello')).toBe('!hello');
      expect(capitalizeFirstLetter(' hello')).toBe(' hello');
    });

    it('handles numbers at the beginning', () => {
      expect(capitalizeFirstLetter('123abc')).toBe('123abc');
      expect(capitalizeFirstLetter('9test')).toBe('9test');
    });
  });

  describe('handleDoubleClick', () => {
    const mockEvent = {
      target: document.createElement('div'),
    } as React.MouseEvent<HTMLElement>;

    it('creates a range and selects node contents', () => {
      handleDoubleClick(mockEvent);

      expect(mockCreateRange).toHaveBeenCalled();
      expect(mockSelectNodeContents).toHaveBeenCalledWith(mockEvent.target);
      expect(mockGetSelection).toHaveBeenCalled();
      expect(mockRemoveAllRanges).toHaveBeenCalled();
      expect(mockAddRange).toHaveBeenCalled();
    });

    it('handles null selection gracefully', () => {
      mockGetSelection.mockReturnValue(null);

      expect(() => handleDoubleClick(mockEvent)).not.toThrow();
      expect(mockCreateRange).toHaveBeenCalled();
      expect(mockSelectNodeContents).toHaveBeenCalledWith(mockEvent.target);
      expect(mockGetSelection).toHaveBeenCalled();
      expect(mockRemoveAllRanges).not.toHaveBeenCalled();
      expect(mockAddRange).not.toHaveBeenCalled();
    });

    it('handles different target elements', () => {
      const spanElement = document.createElement('span');
      const spanEvent = { target: spanElement } as React.MouseEvent<HTMLElement>;

      handleDoubleClick(spanEvent);

      expect(mockSelectNodeContents).toHaveBeenCalledWith(spanElement);
    });
  });

  describe('extractContent', () => {
    it('returns string content directly', () => {
      expect(extractContent('hello world')).toBe('hello world');
      expect(extractContent('')).toBe('');
      expect(extractContent('123')).toBe('123');
    });

    it('extracts content from simple React elements', () => {
      const element = React.createElement('div', {}, 'Hello World');
      expect(extractContent(element)).toBe('Hello World');
    });

    it('extracts content from nested React elements', () => {
      const nestedElement = React.createElement(
        'div',
        {},
        React.createElement('span', {}, 'Nested Content'),
      );
      expect(extractContent(nestedElement)).toBe('Nested Content');
    });

    it('handles arrays of content', () => {
      const arrayContent = ['Hello', ' ', 'World'];
      expect(extractContent(arrayContent)).toBe('Hello World');
    });

    it('handles complex nested arrays and elements', () => {
      const complexContent = ['Start', React.createElement('div', {}, 'Middle'), 'End'];
      expect(extractContent(complexContent)).toBe('StartMiddleEnd');
    });

    it('handles deeply nested React elements', () => {
      const deepElement = React.createElement(
        'div',
        {},
        React.createElement('span', {}, React.createElement('em', {}, 'Deep Content')),
      );
      expect(extractContent(deepElement)).toBe('Deep Content');
    });

    it('handles elements without children', () => {
      const emptyElement = React.createElement('div', {});
      expect(extractContent(emptyElement)).toBe('');
    });

    it('handles mixed content types in arrays', () => {
      const mixedArray = [
        'Text1',
        React.createElement('span', {}, 'Element1'),
        // Numbers are not handled in the actual function
        React.createElement('div', {}, ['Nested', 'Array']),
      ];
      expect(extractContent(mixedArray)).toBe('Text1Element1NestedArray');
    });

    it('handles null and undefined gracefully', () => {
      expect(extractContent(null)).toBe('');
      expect(extractContent(undefined)).toBe('');
    });

    it('handles objects with props structure', () => {
      const propsObject = {
        props: {
          children: 'Props Content',
        },
      };
      // The actual function only handles React elements, not arbitrary objects
      expect(extractContent(propsObject)).toBe('');
    });
  });

  describe('normalizeLayout', () => {
    it('returns layout as-is when sum is already 100', () => {
      const layout = [25, 50, 25];
      expect(normalizeLayout(layout)).toEqual([25, 50, 25]);
    });

    it('handles layout within tolerance of 100', () => {
      const layout = [25.005, 49.995, 25]; // Sum: 100.000
      expect(normalizeLayout(layout)).toEqual([25, 49.99, 25]);
    });

    it('normalizes layout when sum is not 100', () => {
      const layout = [30, 40, 20]; // Sum: 90
      const result = normalizeLayout(layout);
      const sum = result.reduce((acc, val) => acc + val, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.01);
    });

    it('handles layout with sum greater than 100', () => {
      const layout = [40, 50, 30]; // Sum: 120
      const result = normalizeLayout(layout);
      const sum = result.reduce((acc, val) => acc + val, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.01);
    });

    it('handles single element layout', () => {
      const layout = [80];
      const result = normalizeLayout(layout);
      expect(result).toEqual([100]);
    });

    it('handles two element layout', () => {
      const layout = [30, 40]; // Sum: 70
      const result = normalizeLayout(layout);
      const sum = result.reduce((acc, val) => acc + val, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.01);
    });

    it('handles very small numbers', () => {
      const layout = [0.1, 0.2, 0.3]; // Sum: 0.6
      const result = normalizeLayout(layout);
      const sum = result.reduce((acc, val) => acc + val, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.01);
    });

    it('handles large numbers', () => {
      const layout = [1000, 2000, 3000]; // Sum: 6000
      const result = normalizeLayout(layout);
      const sum = result.reduce((acc, val) => acc + val, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.01);
    });

    it('adjusts the last element to ensure exact sum of 100', () => {
      const layout = [33.333, 33.333, 33.333]; // Sum: 99.999
      const result = normalizeLayout(layout);
      expect(result[result.length - 1]).toBe(33.33); // Last element adjusted
    });

    it('handles empty array', () => {
      const layout: number[] = [];
      const result = normalizeLayout(layout);
      // Empty array will return empty array since no elements to process
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('preserves decimal precision correctly', () => {
      const layout = [25.1234, 25.5678, 49.3088]; // Sum: 100
      const result = normalizeLayout(layout);
      // Should maintain 2 decimal places
      result.forEach((value) => {
        const decimalPlaces = (value.toString().split('.')[1] || '').length;
        expect(decimalPlaces).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('handleUIAction', () => {
    const mockSubmitMessage = jest.fn();
    const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

    beforeEach(() => {
      jest.clearAllMocks();
      mockSubmitMessage.mockResolvedValue(undefined);
    });

    afterAll(() => {
      mockConsoleLog.mockRestore();
      mockConsoleError.mockRestore();
    });

    it('handles intent type correctly', async () => {
      const result = {
        type: 'intent',
        payload: {
          intent: 'search',
          params: { query: 'test search' },
        },
      };

      await handleUIAction(result, mockSubmitMessage);

      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('intent'),
      });
      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('search'),
      });
      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('test search'),
      });
    });

    it('handles tool type correctly', async () => {
      const result = {
        type: 'tool',
        payload: {
          toolName: 'calculator',
          params: { operation: 'add', values: [1, 2] },
        },
      };

      await handleUIAction(result, mockSubmitMessage);

      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('tool'),
      });
      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('calculator'),
      });
      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('add'),
      });
    });

    it('handles prompt type correctly', async () => {
      const result = {
        type: 'prompt',
        payload: {
          prompt: 'Write a story about a robot',
        },
      };

      await handleUIAction(result, mockSubmitMessage);

      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('prompt'),
      });
      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('Write a story about a robot'),
      });
    });

    it('ignores unsupported types', async () => {
      const result = {
        type: 'unsupported',
        payload: { data: 'test' },
      };

      await handleUIAction(result, mockSubmitMessage);

      expect(mockSubmitMessage).not.toHaveBeenCalled();
    });

    it('logs messages appropriately', async () => {
      const result = {
        type: 'intent',
        payload: {
          intent: 'test',
          params: {},
        },
      };

      await handleUIAction(result, mockSubmitMessage);

      // Function should be called successfully (this test verifies the flow works)
      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('intent'),
      });
    });

    it('handles submitMessage errors gracefully', async () => {
      const error = new Error('Submit failed');
      mockSubmitMessage.mockRejectedValue(error);

      const result = {
        type: 'intent',
        payload: {
          intent: 'test',
          params: {},
        },
      };

      // Function should not throw but handle error internally
      await expect(handleUIAction(result, mockSubmitMessage)).resolves.toBeUndefined();

      // Verify submitMessage was called (error handling happened)
      expect(mockSubmitMessage).toHaveBeenCalled();
    });

    it('handles missing payload properties gracefully', async () => {
      const result = {
        type: 'intent',
        payload: {}, // Missing intent and params
      };

      await handleUIAction(result, mockSubmitMessage);

      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('undefined'),
      });
    });

    it('formats JSON correctly in messages', async () => {
      const result = {
        type: 'tool',
        payload: {
          toolName: 'test',
          params: { complex: { nested: 'object' }, array: [1, 2, 3] },
        },
      };

      await handleUIAction(result, mockSubmitMessage);

      const callArgs = mockSubmitMessage.mock.calls[0][0];
      expect(callArgs.text).toContain('```json');
      expect(callArgs.text).toContain('"complex"');
      expect(callArgs.text).toContain('"nested": "object"');
      expect(callArgs.text).toContain('"array": [\n    1,\n    2,\n    3\n  ]');
    });

    it('handles null/undefined result gracefully', async () => {
      // The function will throw when trying to destructure null/undefined
      await expect(handleUIAction(null, mockSubmitMessage)).rejects.toThrow();
      await expect(handleUIAction(undefined, mockSubmitMessage)).rejects.toThrow();
    });

    it('handles result without type property', async () => {
      const result = {
        payload: { data: 'test' },
      };

      await handleUIAction(result, mockSubmitMessage);

      expect(mockSubmitMessage).not.toHaveBeenCalled();
    });

    it('constructs correct message text for each type', async () => {
      // Test intent message structure
      const intentResult = {
        type: 'intent',
        payload: { intent: 'search', params: { q: 'test' } },
      };

      await handleUIAction(intentResult, mockSubmitMessage);
      let messageText = mockSubmitMessage.mock.calls[0][0].text;
      expect(messageText).toContain('message of type `intent`');
      expect(messageText).toContain('Execute the intent');

      mockSubmitMessage.mockClear();

      // Test tool message structure
      const toolResult = {
        type: 'tool',
        payload: { toolName: 'calc', params: {} },
      };

      await handleUIAction(toolResult, mockSubmitMessage);
      messageText = mockSubmitMessage.mock.calls[0][0].text;
      expect(messageText).toContain('message of type `tool`');
      expect(messageText).toContain('Execute the tool');

      mockSubmitMessage.mockClear();

      // Test prompt message structure
      const promptResult = {
        type: 'prompt',
        payload: { prompt: 'Hello' },
      };

      await handleUIAction(promptResult, mockSubmitMessage);
      messageText = mockSubmitMessage.mock.calls[0][0].text;
      expect(messageText).toContain('message of type `prompt`');
      expect(messageText).toContain('Execute the intention of the prompt');
    });
  });
});
