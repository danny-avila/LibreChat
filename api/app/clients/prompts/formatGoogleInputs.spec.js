const formatGoogleInputs = require('./formatGoogleInputs');

describe('formatGoogleInputs', () => {
  it('formats message correctly', () => {
    const input = {
      messages: [
        {
          content: 'hi',
          author: 'user',
        },
      ],
      context: 'context',
      examples: [
        {
          input: {
            author: 'user',
            content: 'user input',
          },
          output: {
            author: 'bot',
            content: 'bot output',
          },
        },
      ],
      parameters: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 1024,
      },
    };

    const expectedOutput = {
      struct_val: {
        messages: {
          list_val: [
            {
              struct_val: {
                content: {
                  string_val: ['hi'],
                },
                author: {
                  string_val: ['user'],
                },
              },
            },
          ],
        },
        context: {
          string_val: ['context'],
        },
        examples: {
          list_val: [
            {
              struct_val: {
                input: {
                  struct_val: {
                    author: {
                      string_val: ['user'],
                    },
                    content: {
                      string_val: ['user input'],
                    },
                  },
                },
                output: {
                  struct_val: {
                    author: {
                      string_val: ['bot'],
                    },
                    content: {
                      string_val: ['bot output'],
                    },
                  },
                },
              },
            },
          ],
        },
        parameters: {
          struct_val: {
            temperature: {
              float_val: 0.2,
            },
            topP: {
              float_val: 0.8,
            },
            topK: {
              int_val: 40,
            },
            maxOutputTokens: {
              int_val: 1024,
            },
          },
        },
      },
    };

    const result = formatGoogleInputs(input);
    expect(JSON.stringify(result)).toEqual(JSON.stringify(expectedOutput));
  });

  it('formats real payload parts', () => {
    const input = {
      instances: [
        {
          context: 'context',
          examples: [
            {
              input: {
                author: 'user',
                content: 'user input',
              },
              output: {
                author: 'bot',
                content: 'user output',
              },
            },
          ],
          messages: [
            {
              author: 'user',
              content: 'hi',
            },
          ],
        },
      ],
      parameters: {
        candidateCount: 1,
        maxOutputTokens: 1024,
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
      },
    };
    const expectedOutput = {
      struct_val: {
        instances: {
          list_val: [
            {
              struct_val: {
                context: { string_val: ['context'] },
                examples: {
                  list_val: [
                    {
                      struct_val: {
                        input: {
                          struct_val: {
                            author: { string_val: ['user'] },
                            content: { string_val: ['user input'] },
                          },
                        },
                        output: {
                          struct_val: {
                            author: { string_val: ['bot'] },
                            content: { string_val: ['user output'] },
                          },
                        },
                      },
                    },
                  ],
                },
                messages: {
                  list_val: [
                    {
                      struct_val: {
                        author: { string_val: ['user'] },
                        content: { string_val: ['hi'] },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
        parameters: {
          struct_val: {
            candidateCount: { int_val: 1 },
            maxOutputTokens: { int_val: 1024 },
            temperature: { float_val: 0.2 },
            topP: { float_val: 0.8 },
            topK: { int_val: 40 },
          },
        },
      },
    };

    const result = formatGoogleInputs(input);
    expect(JSON.stringify(result)).toEqual(JSON.stringify(expectedOutput));
  });

  it('helps create valid payload parts', () => {
    const instances = {
      context: 'context',
      examples: [
        {
          input: {
            author: 'user',
            content: 'user input',
          },
          output: {
            author: 'bot',
            content: 'user output',
          },
        },
      ],
      messages: [
        {
          author: 'user',
          content: 'hi',
        },
      ],
    };

    const expectedInstances = {
      struct_val: {
        context: { string_val: ['context'] },
        examples: {
          list_val: [
            {
              struct_val: {
                input: {
                  struct_val: {
                    author: { string_val: ['user'] },
                    content: { string_val: ['user input'] },
                  },
                },
                output: {
                  struct_val: {
                    author: { string_val: ['bot'] },
                    content: { string_val: ['user output'] },
                  },
                },
              },
            },
          ],
        },
        messages: {
          list_val: [
            {
              struct_val: {
                author: { string_val: ['user'] },
                content: { string_val: ['hi'] },
              },
            },
          ],
        },
      },
    };

    const parameters = {
      candidateCount: 1,
      maxOutputTokens: 1024,
      temperature: 0.2,
      topP: 0.8,
      topK: 40,
    };
    const expectedParameters = {
      struct_val: {
        candidateCount: { int_val: 1 },
        maxOutputTokens: { int_val: 1024 },
        temperature: { float_val: 0.2 },
        topP: { float_val: 0.8 },
        topK: { int_val: 40 },
      },
    };

    const instancesResult = formatGoogleInputs(instances);
    const parametersResult = formatGoogleInputs(parameters);
    expect(JSON.stringify(instancesResult)).toEqual(JSON.stringify(expectedInstances));
    expect(JSON.stringify(parametersResult)).toEqual(JSON.stringify(expectedParameters));
  });
});
