import React from 'react';
import { render } from '@testing-library/react';
import { Tools } from 'librechat-data-provider';
import type { TAttachment, TStartupConfig, UIResource } from 'librechat-data-provider';
import type { MCPAppFrameState } from '~/hooks/MCP';
import { MCPAppsPolicyProvider } from '~/Providers/MCPAppsPolicyContext';
import { MCPAppSuppressionContext, MCPAppViews } from '../MCPAppViews';
import { useAppBridge, useMCPAppFrame } from '~/hooks/MCP';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<number, string>) =>
    key === 'com_ui_mcp_app_frame_title' ? `MCP App: ${values?.[0] ?? ''}` : key,
}));

jest.mock('~/hooks/MCP', () => ({
  useAppBridge: jest.fn(),
  useMCPAppFrame: jest.fn(),
}));

const mockUseAppBridge = useAppBridge as jest.MockedFunction<typeof useAppBridge>;
const mockUseMCPAppFrame = useMCPAppFrame as jest.MockedFunction<typeof useMCPAppFrame>;

const enabledConfig = {
  mcpApps: { enabled: true, legacyHtmlEnabled: true },
} as TStartupConfig;

function app(overrides: Partial<UIResource>): UIResource {
  return {
    resourceId: 'shared-resource',
    uri: 'ui://demo/view',
    mimeType: 'text/html;profile=mcp-app',
    toolName: 'show_app',
    serverName: 'demo',
    ...overrides,
  };
}

function makeFrameState(
  resource: UIResource,
  toolArgs?: string | Record<string, unknown>,
  overrides: Partial<MCPAppFrameState> = {},
): MCPAppFrameState {
  const { buildAppToolResult } = jest.requireActual('~/utils/mcpApps');
  return {
    iframeRef: { current: null },
    status: 'ready',
    kind: 'app',
    height: 320,
    attempt: 0,
    canRetry: false,
    sandboxUrl: 'http://sandbox.localhost:3081/api/mcp/sandbox',
    inlineHtml: resource.text,
    toolArgs: typeof toolArgs === 'string' ? undefined : toolArgs,
    toolResult: buildAppToolResult(resource),
    active: true,
    onSizeChanged: jest.fn(),
    onLoaded: jest.fn(),
    onTeardown: jest.fn(),
    onFailed: jest.fn(),
    onRetry: jest.fn(),
    ...overrides,
  };
}

function attachment(
  owner: { toolCallId: string; agentId: string; stepId: string },
  resources: UIResource[],
): TAttachment {
  return {
    type: Tools.ui_resources,
    ...owner,
    [Tools.ui_resources]: resources,
  } as unknown as TAttachment;
}

describe('MCPAppViews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMCPAppFrame.mockImplementation((resource, options) =>
      makeFrameState(resource as UIResource, options.toolArgs),
    );
  });

  it('does not create frame or bridge hooks without both policy and host identity', () => {
    const attachments = [
      attachment({ toolCallId: 'call-1', agentId: 'agent-1', stepId: 'step-1' }, [
        app({ toolArgs: { owner: 'one' } }),
      ]),
    ];

    const { container } = render(
      <MCPAppsPolicyProvider startupConfig={enabledConfig} ready>
        <MCPAppViews attachments={attachments} />
      </MCPAppsPolicyProvider>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(mockUseMCPAppFrame).not.toHaveBeenCalled();
    expect(mockUseAppBridge).not.toHaveBeenCalled();
  });

  it('retains every wrapper occurrence and gives each App only its own input and result', () => {
    const alpha = app({
      toolArgs: { owner: 'alpha' },
      content: [{ type: 'text', text: 'alpha result' }],
      structuredContent: { owner: 'alpha' },
    });
    const beta = app({
      toolArgs: { owner: 'beta' },
      content: [{ type: 'text', text: 'beta result' }],
      structuredContent: { owner: 'beta' },
    });
    const attachments = [
      attachment({ toolCallId: 'call-0', agentId: 'agent-alpha', stepId: 'step-alpha' }, [alpha]),
      attachment({ toolCallId: 'call-0', agentId: 'agent-beta', stepId: 'step-beta' }, [beta]),
    ];

    const { container } = render(
      <MCPAppsPolicyProvider startupConfig={enabledConfig} ready userId="user-1">
        <MCPAppViews attachments={attachments} />
      </MCPAppsPolicyProvider>,
    );

    expect(container.querySelectorAll('iframe[data-sandbox-url]')).toHaveLength(2);
    expect(mockUseAppBridge).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        resource: alpha,
        userId: 'user-1',
        toolArgs: { owner: 'alpha' },
        toolResult: expect.objectContaining({
          content: [{ type: 'text', text: 'alpha result' }],
          structuredContent: { owner: 'alpha' },
        }),
      }),
    );
    expect(mockUseAppBridge).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        resource: beta,
        userId: 'user-1',
        toolArgs: { owner: 'beta' },
        toolResult: expect.objectContaining({
          content: [{ type: 'text', text: 'beta result' }],
          structuredContent: { owner: 'beta' },
        }),
      }),
    );
  });

  it('keeps legitimate same-owner and same-resource occurrences distinct', () => {
    const attachments = [
      attachment({ toolCallId: 'call-0', agentId: 'agent-alpha', stepId: 'step-alpha' }, [
        app({ toolArgs: { occurrence: 'first' }, content: [{ type: 'text', text: 'first' }] }),
        app({ toolArgs: { occurrence: 'second' }, content: [{ type: 'text', text: 'second' }] }),
      ]),
    ];

    const { container } = render(
      <MCPAppsPolicyProvider startupConfig={enabledConfig} ready userId="user-1">
        <MCPAppViews attachments={attachments} />
      </MCPAppsPolicyProvider>,
    );

    expect(container.querySelectorAll('iframe[data-sandbox-url]')).toHaveLength(2);
    expect(mockUseAppBridge.mock.calls.map(([params]) => params.toolArgs)).toEqual([
      { occurrence: 'first' },
      { occurrence: 'second' },
    ]);
    expect(mockUseAppBridge.mock.calls.map(([params]) => params.toolResult?.content)).toEqual([
      [{ type: 'text', text: 'first' }],
      [{ type: 'text', text: 'second' }],
    ]);
  });

  it('preserves an App frame when unrelated wrappers and resources are inserted or reordered', () => {
    const target = app({ resourceId: 'target', toolName: 'target', toolArgs: { target: true } });
    const unrelated = app({
      resourceId: 'unrelated',
      toolName: 'unrelated',
      toolArgs: { unrelated: true },
    });
    const targetAttachment = attachment(
      { toolCallId: 'call-target', agentId: 'agent-a', stepId: 'step-a' },
      [target],
    );
    const unrelatedAttachment = attachment(
      { toolCallId: 'call-other', agentId: 'agent-b', stepId: 'step-b' },
      [unrelated],
    );
    const renderViews = (attachments: TAttachment[]) => (
      <MCPAppsPolicyProvider startupConfig={enabledConfig} ready userId="user-1">
        <MCPAppViews attachments={attachments} />
      </MCPAppsPolicyProvider>
    );
    const view = render(renderViews([targetAttachment]));
    const targetFrame = view.getByTitle('MCP App: target');

    view.rerender(renderViews([unrelatedAttachment, targetAttachment]));
    expect(view.getByTitle('MCP App: target')).toBe(targetFrame);

    const expandedTargetAttachment = attachment(
      { toolCallId: 'call-target', agentId: 'agent-a', stepId: 'step-a' },
      [unrelated, target],
    );
    view.rerender(renderViews([expandedTargetAttachment, unrelatedAttachment]));
    expect(view.getByTitle('MCP App: target')).toBe(targetFrame);

    view.rerender(renderViews([unrelatedAttachment, targetAttachment]));
    expect(view.getByTitle('MCP App: target')).toBe(targetFrame);
  });

  it('suppresses only attachments owned by an ancestor App surface', () => {
    const owned = attachment({ toolCallId: 'call-owned', agentId: 'agent-a', stepId: 'step-a' }, [
      app({ resourceId: 'owned', toolName: 'owned' }),
    ]);
    const nested = attachment({ toolCallId: 'call-nested', agentId: 'agent-b', stepId: 'step-b' }, [
      app({ resourceId: 'nested', toolName: 'nested' }),
    ]);

    const view = render(
      <MCPAppsPolicyProvider startupConfig={enabledConfig} ready userId="user-1">
        <MCPAppSuppressionContext.Provider value={new Set([owned])}>
          <MCPAppViews attachments={[owned, nested]} />
        </MCPAppSuppressionContext.Provider>
      </MCPAppsPolicyProvider>,
    );

    expect(view.queryByTitle('MCP App: owned')).not.toBeInTheDocument();
    expect(view.getByTitle('MCP App: nested')).toBeInTheDocument();
  });

  it.each([
    ['default', 320],
    ['compact', 260],
    ['lower clamp', 80],
  ])('uses the hook-owned %s height without a second surface minimum', (_label, height) => {
    mockUseMCPAppFrame.mockImplementationOnce((resource, options) =>
      makeFrameState(resource as UIResource, options.toolArgs, { height }),
    );
    const attachments = [
      attachment({ toolCallId: 'call-1', agentId: 'agent-1', stepId: 'step-1' }, [
        app({ toolName: 'compact' }),
      ]),
    ];

    const view = render(
      <MCPAppsPolicyProvider startupConfig={enabledConfig} ready userId="user-1">
        <MCPAppViews attachments={attachments} />
      </MCPAppsPolicyProvider>,
    );
    const container = view.getByTitle('MCP App: compact').parentElement;

    expect(container).toHaveStyle({ height: `${height}px` });
    expect(container?.style.minHeight).toBe('');
  });
});
