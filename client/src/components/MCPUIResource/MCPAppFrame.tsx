import React from 'react';
import type { UIResource } from 'librechat-data-provider';
import type { MCPAppFrameState } from '~/hooks/MCP';
import { useLocalize } from '~/hooks';

const OVERLAY_CLASS =
  'absolute inset-0 flex items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-sm text-text-secondary';

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * The bridge iframe for one MCP App view plus its loading and failure overlays. The surface owns the
 * positioned container (and its definite height); this owns everything that must stay identical
 * across surfaces, including the sandbox tokens and the reveal rule.
 */
export function MCPAppFrame({
  frame,
  resource,
  centered = false,
  spinner = false,
}: {
  frame: MCPAppFrameState;
  resource: UIResource;
  centered?: boolean;
  spinner?: boolean;
}) {
  const localize = useLocalize();
  const overlayClass = centered ? `${OVERLAY_CLASS} justify-center` : OVERLAY_CLASS;

  return (
    <>
      {frame.status === 'loading' && (
        <div className={overlayClass} role="status">
          {spinner && <Spinner />}
          {localize('com_ui_loading_interactive_view')}
        </div>
      )}
      {(frame.status === 'timedOut' || frame.status === 'failed') && (
        <div className={overlayClass} role="alert">
          {localize(
            frame.status === 'failed'
              ? 'com_ui_mcp_app_load_error'
              : 'com_ui_mcp_app_failed_to_load',
          )}
        </div>
      )}
      <iframe
        ref={frame.iframeRef}
        data-sandbox-url={frame.sandboxUrl}
        sandbox="allow-scripts allow-forms"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          // visibility, not opacity: a transparent iframe keeps its whole subtree focusable behind
          // the overlay.
          visibility: frame.status === 'ready' ? 'visible' : 'hidden',
        }}
        title={localize('com_ui_mcp_app_frame_title', { 0: resource.toolName ?? '' })}
      />
    </>
  );
}
