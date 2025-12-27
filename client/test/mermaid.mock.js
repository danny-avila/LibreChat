// Mock for mermaid package to make tests pass
export default {
  initialize: jest.fn(),
  render: jest.fn().mockResolvedValue({ svg: '<svg></svg>' }),
  parse: jest.fn().mockResolvedValue(true),
  mermaidAPI: {
    initialize: jest.fn(),
    render: jest.fn().mockResolvedValue({ svg: '<svg></svg>' }),
  },
};
