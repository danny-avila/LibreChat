import type { FiltersConfig } from 'librechat-data-provider';
import type { SerializedSharedFile } from './protection';
import { ContentFilterError } from '../middleware/contentFilter';
import {
  CONTENT_TRAVERSAL_MAX_NODES,
  ContentTraversalLimitError,
} from '../protection/adapters/nested';
import { UninspectableFileError } from '../protection/files';
import { assertSharedFileMetadataAllowed } from './protection';

const BLOCK_PATTERN = {
  id: 'private',
  label: 'private value',
  regex: 'PRIVATE-[A-Z]+',
};

function capturePolicyError(
  run: () => void,
): ContentFilterError | ContentTraversalLimitError | UninspectableFileError {
  try {
    run();
  } catch (error) {
    if (
      error instanceof ContentFilterError ||
      error instanceof ContentTraversalLimitError ||
      error instanceof UninspectableFileError
    ) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected content policy to reject the shared metadata');
}

describe('shared file metadata protection', () => {
  const attachmentFilters: FiltersConfig = {
    messages: {
      pii: {
        fields: ['attachment_reference'],
        starterPatterns: [],
        customPatterns: [BLOCK_PATTERN],
      },
    },
  };
  const fileUriFilters: FiltersConfig = {
    files: {
      pii: {
        fields: ['uri'],
        starterPatterns: [],
        customPatterns: [BLOCK_PATTERN],
      },
    },
  };
  const fileContentFilters: FiltersConfig = {
    files: {
      pii: {
        fields: ['content'],
        starterPatterns: [],
        customPatterns: [BLOCK_PATTERN],
      },
    },
  };
  const contentPartFilters: FiltersConfig = {
    messages: {
      pii: {
        fields: ['content_part'],
        starterPatterns: [],
        customPatterns: [BLOCK_PATTERN],
      },
    },
  };
  const skillNameFilters: FiltersConfig = {
    skills: {
      pii: {
        fields: ['name'],
        starterPatterns: [],
        customPatterns: [BLOCK_PATTERN],
      },
    },
  };
  const toolOutputFilters: FiltersConfig = {
    toolArguments: {
      pii: {
        fields: ['output'],
        starterPatterns: [],
        customPatterns: [BLOCK_PATTERN],
      },
    },
  };

  it.each([
    ['files', { files: [{ filename: 'PRIVATE-SENTINEL.pdf' }] }],
    ['attachments', { attachments: [{ filename: 'PRIVATE-SENTINEL.pdf' }] }],
    [
      'steer files',
      {
        content: [
          {
            type: 'steer',
            files: [{ filename: 'PRIVATE-SENTINEL.pdf' }],
          },
        ],
      },
    ],
  ])('checks serialized %s under message attachment-reference policy', (_label, message) => {
    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: attachmentFilters,
        messages: [message],
        shareId: 'share-123',
      }),
    );

    expect(error).toBeInstanceOf(ContentFilterError);
    expect(error.body).toMatchObject({
      error: 'content_filter_block',
      source: 'message',
      field: 'attachment_reference',
    });
    expect(JSON.stringify(error.body)).not.toContain('PRIVATE-SENTINEL');
  });

  it.each([
    [
      'iconURL',
      attachmentFilters,
      { iconURL: 'https://example.test/PRIVATE-SENTINEL' },
      'message',
      'attachment_reference',
    ],
    [
      'finish_reason',
      contentPartFilters,
      { finish_reason: 'PRIVATE-SENTINEL' },
      'message',
      'content_part',
    ],
    ['manualSkills', skillNameFilters, { manualSkills: ['PRIVATE-SENTINEL'] }, 'skill', 'name'],
    [
      'alwaysAppliedSkills',
      skillNameFilters,
      { alwaysAppliedSkills: ['PRIVATE-SENTINEL'] },
      'skill',
      'name',
    ],
  ])(
    'checks serialized public %s metadata at the response boundary',
    (_label, filters, metadata, source, field) => {
      const error = capturePolicyError(() =>
        assertSharedFileMetadataAllowed({
          filters,
          messages: [{ isCreatedByUser: true, ...metadata }],
          shareId: 'share-123',
        }),
      );

      expect(error).toBeInstanceOf(ContentFilterError);
      expect(error.body).toMatchObject({
        error: 'content_filter_block',
        source,
        field,
      });
      expect(JSON.stringify(error.body)).not.toContain('PRIVATE-SENTINEL');
    },
  );

  it('rechecks unmarked legacy shared metadata conservatively', () => {
    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: attachmentFilters,
        messages: [{ iconURL: 'https://example.test/PRIVATE-SENTINEL' }],
        shareId: 'share-123',
      }),
    );

    expect(error.body).toMatchObject({
      source: 'message',
      field: 'attachment_reference',
    });
  });

  it('treats legacy model metadata conservatively but honors explicit server provenance', () => {
    const legacyError = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: attachmentFilters,
        messages: [
          {
            isCreatedByUser: false,
            iconURL: 'https://example.test/PRIVATE-SENTINEL',
          },
        ],
        shareId: 'share-123',
      }),
    );
    expect(legacyError.body).toMatchObject({
      source: 'message',
      field: 'attachment_reference',
    });

    expect(() =>
      assertSharedFileMetadataAllowed({
        filters: attachmentFilters,
        messages: [
          {
            isCreatedByUser: false,
            isUserSubmitted: false,
            iconURL: 'https://example.test/PRIVATE-SENTINEL',
          },
        ],
        shareId: 'share-123',
      }),
    ).not.toThrow();

    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: attachmentFilters,
        messages: [
          {
            isCreatedByUser: false,
            userSubmittedPaths: ['/iconURL'],
            iconURL: 'https://example.test/PRIVATE-SENTINEL',
          },
        ],
        shareId: 'share-123',
      }),
    );
    expect(error.body).toMatchObject({
      source: 'message',
      field: 'attachment_reference',
    });
  });

  it('keeps shared response metadata protection default-off', () => {
    expect(() =>
      assertSharedFileMetadataAllowed({
        messages: [
          {
            iconURL: 'https://example.test/PRIVATE-SENTINEL',
            finish_reason: 'PRIVATE-SENTINEL',
            manualSkills: ['PRIVATE-SENTINEL'],
            alwaysAppliedSkills: ['PRIVATE-SENTINEL'],
          },
        ],
        shareId: 'share-123',
      }),
    ).not.toThrow();
  });

  it.each([
    ['uri', 'message', attachmentFilters, 'message', 'attachment_reference'],
    ['filepath', 'message', attachmentFilters, 'message', 'attachment_reference'],
    ['url', 'message', attachmentFilters, 'message', 'attachment_reference'],
    ['preview', 'message', attachmentFilters, 'message', 'attachment_reference'],
    ['uri', 'file', fileUriFilters, 'file', 'uri'],
    ['filepath', 'file', fileUriFilters, 'file', 'uri'],
    ['url', 'file', fileUriFilters, 'file', 'uri'],
    ['preview', 'file', fileUriFilters, 'file', 'uri'],
  ])(
    'checks serialized %s aliases under the configured %s policy',
    (key, _policy, filters, source, field) => {
      const error = capturePolicyError(() =>
        assertSharedFileMetadataAllowed({
          filters,
          messages: [
            {
              files: [
                {
                  filename: 'safe-report.pdf',
                  [key]: 'https://example.test/PRIVATE-SENTINEL',
                },
              ],
            },
          ],
          shareId: 'share-123',
        }),
      );

      expect(error).toBeInstanceOf(ContentFilterError);
      expect(error.body).toMatchObject({
        error: 'content_filter_block',
        source,
        field,
      });
      expect(JSON.stringify(error.body)).not.toContain('PRIVATE-SENTINEL');
    },
  );

  it.each([
    ['message', attachmentFilters, 'message', 'attachment_reference'],
    ['file', fileUriFilters, 'file', 'uri'],
  ])(
    'checks bounded percent-decoded locators under the configured %s policy',
    (_label, filters, source, field) => {
      const error = capturePolicyError(() =>
        assertSharedFileMetadataAllowed({
          filters,
          messages: [
            {
              files: [{ url: 'https://example.test/PRIVATE%2DSENTINEL' }],
            },
          ],
          shareId: 'share-123',
        }),
      );

      expect(error).toBeInstanceOf(ContentFilterError);
      expect(error.body).toMatchObject({
        error: 'content_filter_block',
        source,
        field,
      });
    },
  );

  it('preserves file field granularity for serialized names', () => {
    const filters: FiltersConfig = {
      files: {
        pii: {
          fields: ['name'],
          starterPatterns: [],
          customPatterns: [BLOCK_PATTERN],
          uninspectable: 'block',
        },
      },
    };
    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters,
        messages: [{ files: [{ file_id: 'file-1', filename: 'PRIVATE-SENTINEL.pdf' }] }],
        shareId: 'share-123',
      }),
    );

    expect(error).toBeInstanceOf(ContentFilterError);
    expect(error.body).toMatchObject({
      error: 'content_filter_block',
      source: 'file',
      field: 'name',
    });
    expect(JSON.stringify(error.body)).not.toContain('PRIVATE-SENTINEL');
  });

  it.each([
    [
      'file locator',
      fileUriFilters,
      {
        files: [{ url: { nested: 'PRIVATE-SENTINEL' } as never }],
      },
      'file',
      'uri',
    ],
    [
      'user attachment',
      attachmentFilters,
      {
        isCreatedByUser: true,
        attachments: [{ filename: { nested: 'PRIVATE-SENTINEL' } as never }],
      },
      'message',
      'attachment_reference',
    ],
    [
      'tool attachment',
      toolOutputFilters,
      {
        isCreatedByUser: false,
        attachments: [
          {
            toolCallId: 'call-search',
            content: { nested: 'PRIVATE-SENTINEL' } as never,
          },
        ],
      },
      'tool_argument',
      'output',
    ],
  ])(
    'traverses malformed standard %s metadata under its semantic provenance',
    (_label, filters, message, source, field) => {
      const error = capturePolicyError(() =>
        assertSharedFileMetadataAllowed({
          filters,
          messages: [message],
          shareId: 'share-123',
        }),
      );

      expect(error).toBeInstanceOf(ContentFilterError);
      expect(error.body).toMatchObject({
        error: 'content_filter_block',
        source,
        field,
      });
      expect(JSON.stringify(error.body)).not.toContain('PRIVATE-SENTINEL');
    },
  );

  it.each([
    [
      'web-search result',
      {
        type: 'web_search',
        toolCallId: 'call-search',
        web_search: {
          results: [{ title: 'PRIVATE-SENTINEL', link: 'https://example.test/safe' }],
        },
      },
    ],
    [
      'generated UI resource',
      {
        type: 'ui_resources',
        toolCallId: 'call-ui',
        ui_resources: {
          components: [{ type: 'chart', props: { label: 'PRIVATE-SENTINEL' } }],
        },
      },
    ],
  ])('checks a nested serialized %s as tool output', (_label, attachment) => {
    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: toolOutputFilters,
        messages: [{ isCreatedByUser: false, attachments: [attachment] }],
        shareId: 'share-123',
      }),
    );

    expect(error).toBeInstanceOf(ContentFilterError);
    expect(error.body).toMatchObject({
      error: 'content_filter_block',
      source: 'tool_argument',
      field: 'output',
    });
    expect(JSON.stringify(error.body)).not.toContain('PRIVATE-SENTINEL');
  });

  it.each([
    ['user-created message', { isCreatedByUser: true }],
    ['user-submitted message', { isUserSubmitted: true }],
    ['marked attachment path', { isCreatedByUser: false, userSubmittedPaths: ['/attachments/0'] }],
  ])('does not let a %s self-label nested metadata as tool output', (_label, provenance) => {
    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: attachmentFilters,
        messages: [
          {
            ...provenance,
            attachments: [
              {
                type: 'web_search',
                toolCallId: 'forged-tool-call',
                web_search: { results: [{ title: 'PRIVATE-SENTINEL' }] },
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    );

    expect(error).toBeInstanceOf(ContentFilterError);
    expect(error.body).toMatchObject({
      source: 'message',
      field: 'attachment_reference',
    });
  });

  it('keeps model tool payloads out of attachment-reference policy', () => {
    expect(() =>
      assertSharedFileMetadataAllowed({
        filters: attachmentFilters,
        messages: [
          {
            isCreatedByUser: false,
            attachments: [
              {
                type: 'web_search',
                toolCallId: 'call-search',
                web_search: { results: [{ title: 'PRIVATE-SENTINEL' }] },
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    ).not.toThrow();
  });

  it('inspects nested dynamic URLs under their semantic payload policy', () => {
    const toolError = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: toolOutputFilters,
        messages: [
          {
            isCreatedByUser: false,
            attachments: [
              {
                type: 'web_search',
                toolCallId: 'call-search',
                web_search: {
                  results: [{ url: 'https://example.test/PRIVATE-SENTINEL' }],
                },
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    );
    const attachmentError = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: attachmentFilters,
        messages: [
          {
            isCreatedByUser: true,
            attachments: [
              {
                reference: {
                  url: 'https://example.test/PRIVATE-SENTINEL',
                },
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    );

    expect(toolError.body).toMatchObject({
      source: 'tool_argument',
      field: 'output',
    });
    expect(attachmentError.body).toMatchObject({
      source: 'message',
      field: 'attachment_reference',
    });
  });

  it('checks raw encoded payloads and still fails closed when they cannot be decoded', () => {
    const attachment = {
      type: 'web_search',
      toolCallId: 'call-search',
      web_search: {
        results: [{ data: 'data:application/pdf;base64,PRIVATE-SENTINEL' }],
      },
    };

    const rawError = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: toolOutputFilters,
        messages: [{ isCreatedByUser: false, attachments: [attachment] }],
        shareId: 'share-123',
      }),
    );
    expect(rawError).toBeInstanceOf(ContentFilterError);
    expect(rawError.body).toMatchObject({
      source: 'tool_argument',
      field: 'output',
    });

    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: {
          files: {
            pii: {
              fields: ['content'],
              starterPatterns: [],
              uninspectable: 'block',
            },
          },
        },
        messages: [{ isCreatedByUser: false, attachments: [attachment] }],
        shareId: 'share-123',
      }),
    );
    expect(error).toBeInstanceOf(UninspectableFileError);
    expect(error.body).toMatchObject({
      source: 'file',
      field: 'content',
    });
  });

  it.each([
    [
      'file content',
      fileContentFilters,
      {
        files: [
          {
            content: `data:text/plain;base64,${Buffer.from('PRIVATE-SENTINEL').toString('base64')}`,
          },
        ],
      },
      'file',
      'content',
    ],
    [
      'tool output',
      toolOutputFilters,
      {
        isCreatedByUser: false,
        attachments: [
          {
            toolCallId: 'call-search',
            result: {
              data: `data:application/json;base64,${Buffer.from(
                '{"label":"PRIVATE-SENTINEL"}',
              ).toString('base64')}`,
            },
          },
        ],
      },
      'tool_argument',
      'output',
    ],
    [
      'user attachment',
      attachmentFilters,
      {
        isCreatedByUser: true,
        attachments: [
          {
            result: {
              data: 'data:text/plain,PRIVATE%2DSENTINEL',
            },
          },
        ],
      },
      'message',
      'attachment_reference',
    ],
  ])(
    'checks bounded decoded textual data URI payloads as %s',
    (_label, filters, message, source, field) => {
      const error = capturePolicyError(() =>
        assertSharedFileMetadataAllowed({
          filters,
          messages: [message],
          shareId: 'share-123',
        }),
      );

      expect(error).toBeInstanceOf(ContentFilterError);
      expect(error.body).toMatchObject({
        error: 'content_filter_block',
        source,
        field,
      });
      expect(JSON.stringify(error.body)).not.toContain('PRIVATE-SENTINEL');
    },
  );

  it('checks bounded decoded bare base64 payloads', () => {
    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: fileContentFilters,
        messages: [
          {
            files: [
              {
                type: 'base64',
                file_data: Buffer.from('PRIVATE-SENTINEL').toString('base64'),
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    );

    expect(error).toBeInstanceOf(ContentFilterError);
    expect(error.body).toMatchObject({
      source: 'file',
      field: 'content',
    });
  });

  it('treats a bounded textual data URI as inspectable under strict file policy', () => {
    const value = `data:text/plain;base64,${Buffer.from('safe content').toString('base64')}`;
    const file = { content: value };
    const filters: FiltersConfig = {
      files: {
        pii: {
          fields: ['content'],
          starterPatterns: [],
          customPatterns: [],
          uninspectable: 'block',
        },
      },
    };

    expect(() =>
      assertSharedFileMetadataAllowed({
        filters,
        messages: [{ files: [file] }],
        shareId: 'share-123',
      }),
    ).not.toThrow();
    expect(file.content).toBe(value);
    expect(filters.files?.pii?.uninspectable).toBe('block');
  });

  it.each([
    ['malformed percent encoding', 'data:text/plain,SAFE%ZZ'],
    ['malformed base64', 'data:text/plain;base64,%%%'],
    [
      'oversized base64',
      `data:text/plain;base64,${Buffer.alloc(256 * 1024 + 1, 0x41).toString('base64')}`,
    ],
    ['non-textual data', 'data:application/octet-stream;base64,QUJD'],
  ])('applies files.pii.uninspectable to %s', (_label, content) => {
    const strictFilters: FiltersConfig = {
      files: {
        pii: {
          fields: ['content'],
          starterPatterns: [],
          customPatterns: [],
          uninspectable: 'block',
        },
      },
    };
    const compatibilityFilters: FiltersConfig = {
      files: {
        pii: {
          fields: ['content'],
          starterPatterns: [],
          customPatterns: [],
          uninspectable: 'allow',
        },
      },
    };
    const messages = [{ files: [{ content }] }];

    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: strictFilters,
        messages,
        shareId: 'share-123',
      }),
    );
    expect(error).toBeInstanceOf(UninspectableFileError);
    expect(error.body).toMatchObject({
      error: 'content_filter_uninspectable',
      source: 'file',
      field: 'content',
    });

    expect(() =>
      assertSharedFileMetadataAllowed({
        filters: compatibilityFilters,
        messages,
        shareId: 'share-123',
      }),
    ).not.toThrow();
  });

  it('keeps encoded and cyclic serialized metadata default-off', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() =>
      assertSharedFileMetadataAllowed({
        messages: [
          {
            files: [
              {
                content: `data:text/plain;base64,${Buffer.alloc(256 * 1024 + 1, 0x41).toString(
                  'base64',
                )}`,
                url: cycle as never,
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    ).not.toThrow();
  });

  it('does not traverse deep dynamic metadata for an inactive target policy', () => {
    let payload: Record<string, unknown> = { label: 'PRIVATE-SENTINEL' };
    for (let index = 0; index < 30; index++) {
      payload = { nested: payload };
    }

    expect(() =>
      assertSharedFileMetadataAllowed({
        filters: {
          messages: {
            pii: {
              fields: ['content_part'],
              starterPatterns: [],
              customPatterns: [BLOCK_PATTERN],
            },
          },
        },
        messages: [
          {
            isCreatedByUser: false,
            attachments: [
              {
                type: 'web_search',
                toolCallId: 'call-search',
                web_search: payload,
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    ).not.toThrow();
  });

  it('does not enumerate wide file metadata for an inactive target policy', () => {
    const file = Object.fromEntries(
      Array.from({ length: CONTENT_TRAVERSAL_MAX_NODES }, (_, index) => [
        `dynamic_${index}`,
        'safe',
      ]),
    ) as SerializedSharedFile;
    let overflowValueRead = false;
    Object.defineProperty(file, 'overflow_value', {
      enumerable: true,
      get() {
        overflowValueRead = true;
        return 'PRIVATE-OVERFLOW';
      },
    });

    expect(() =>
      assertSharedFileMetadataAllowed({
        filters: contentPartFilters,
        messages: [{ isCreatedByUser: false, attachments: [file] }],
        shareId: 'share-123',
      }),
    ).not.toThrow();
    expect(overflowValueRead).toBe(false);
  });

  it('handles cycles while inspecting malformed standard metadata', () => {
    const malformedUrl: Record<string, unknown> = {
      label: 'PRIVATE-SENTINEL',
    };
    malformedUrl.self = malformedUrl;

    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: fileUriFilters,
        messages: [{ files: [{ url: malformedUrl as never }] }],
        shareId: 'share-123',
      }),
    );
    expect(error).toBeInstanceOf(ContentFilterError);
    expect(error.body).toMatchObject({
      source: 'file',
      field: 'uri',
    });

    const safeCycle: Record<string, unknown> = { label: 'safe' };
    safeCycle.self = safeCycle;
    expect(() =>
      assertSharedFileMetadataAllowed({
        filters: fileUriFilters,
        messages: [{ files: [{ url: safeCycle as never }] }],
        shareId: 'share-123',
      }),
    ).not.toThrow();
  });

  it('fails closed with the malformed standard field provenance at the depth limit', () => {
    let malformedUrl: Record<string, unknown> = { label: 'safe' };
    for (let index = 0; index < 30; index++) {
      malformedUrl = { nested: malformedUrl };
    }

    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: fileUriFilters,
        messages: [{ files: [{ url: malformedUrl as never }] }],
        shareId: 'share-123',
      }),
    );
    expect(error).toBeInstanceOf(ContentTraversalLimitError);
    expect(error.body).toMatchObject({
      error: 'content_filter_uninspectable',
      source: 'file',
      field: 'uri',
    });
  });

  it('does not read serialized metadata beyond the traversal budget', () => {
    const file = Object.fromEntries(
      Array.from({ length: CONTENT_TRAVERSAL_MAX_NODES }, (_, index) => [
        `dynamic_${index}`,
        'safe',
      ]),
    ) as SerializedSharedFile;
    let overflowValueRead = false;
    Object.defineProperty(file, 'overflow_value', {
      enumerable: true,
      get() {
        overflowValueRead = true;
        return 'PRIVATE-OVERFLOW';
      },
    });

    expect(() =>
      assertSharedFileMetadataAllowed({
        filters: fileContentFilters,
        messages: [{ files: [file] }],
        shareId: 'share-123',
      }),
    ).toThrow(ContentTraversalLimitError);
    expect(overflowValueRead).toBe(false);
  });

  it('checks arbitrary nested attachment metadata as an attachment reference', () => {
    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters: attachmentFilters,
        messages: [
          {
            attachments: [
              {
                filename: 'safe-result.json',
                citation: { display: { label: 'PRIVATE-SENTINEL' } },
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    );

    expect(error).toBeInstanceOf(ContentFilterError);
    expect(error.body).toMatchObject({
      source: 'message',
      field: 'attachment_reference',
    });
  });

  it('checks arbitrary nested serialized file payloads as file content', () => {
    const filters: FiltersConfig = {
      files: {
        pii: {
          fields: ['content'],
          starterPatterns: [],
          customPatterns: [BLOCK_PATTERN],
        },
      },
    };
    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters,
        messages: [
          {
            files: [
              {
                filename: 'safe-generated.json',
                generated: { payload: { label: 'PRIVATE-SENTINEL' } },
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    );

    expect(error).toBeInstanceOf(ContentFilterError);
    expect(error.body).toMatchObject({
      source: 'file',
      field: 'content',
    });
  });

  it('does not classify nested model tool output as user message content', () => {
    const filters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['content_part'],
          starterPatterns: [],
          customPatterns: [BLOCK_PATTERN],
        },
      },
    };

    expect(() =>
      assertSharedFileMetadataAllowed({
        filters,
        messages: [
          {
            isCreatedByUser: false,
            attachments: [
              {
                type: 'web_search',
                toolCallId: 'call-search',
                web_search: { results: [{ title: 'PRIVATE-SENTINEL' }] },
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    ).not.toThrow();
  });

  it('permits absent bytes behind a server-issued shared-file locator', () => {
    const filters: FiltersConfig = {
      files: {
        pii: {
          fields: ['content'],
          starterPatterns: [],
          customPatterns: [],
          uninspectable: 'block',
        },
      },
    };

    expect(() =>
      assertSharedFileMetadataAllowed({
        filters,
        messages: [
          {
            files: [
              {
                file_id: 'file-1',
                filename: 'safe-report.pdf',
                uri: '/api/share/share-123/files/file-1',
                filepath: '/api/share/share-123/files/file-1',
                url: '/api/share/share-123/files/file-1',
                preview: '/api/share/share-123/files/file-1',
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    ).not.toThrow();
    expect(filters.files?.pii?.uninspectable).toBe('block');
  });

  it.each([
    ['file_data', { file_data: 'data:application/pdf;base64,PRIVATE-SENTINEL' }],
    ['data URI content', { content: 'data:application/pdf;base64,PRIVATE-SENTINEL' }],
    ['nested data', { type: 'document', data: 'PRIVATE-SENTINEL' }],
    ['remote URL alias', { url: 'https://example.test/PRIVATE-SENTINEL' }],
    ['remote preview alias', { preview: 'https://example.test/PRIVATE-SENTINEL' }],
  ])('retains fail-close for serialized opaque %s payloads', (_label, payload) => {
    const filters: FiltersConfig = {
      files: {
        pii: {
          fields: ['content'],
          starterPatterns: [],
          customPatterns: [],
          uninspectable: 'block',
        },
      },
    };
    const error = capturePolicyError(() =>
      assertSharedFileMetadataAllowed({
        filters,
        messages: [
          {
            attachments: [
              {
                file_id: 'file-1',
                filename: 'safe-report.pdf',
                filepath: '/api/share/share-123/files/file-1',
                ...payload,
              },
            ],
          },
        ],
        shareId: 'share-123',
      }),
    );

    expect(error).toBeInstanceOf(UninspectableFileError);
    expect(error.body).toEqual({
      error: 'content_filter_uninspectable',
      message: 'Submitted file content could not be inspected before processing.',
      source: 'file',
      field: 'content',
    });
    expect(JSON.stringify(error.body)).not.toContain('PRIVATE-SENTINEL');
  });
});
