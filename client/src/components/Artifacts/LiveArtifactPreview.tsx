import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useArtifactToolCallMutation } from '~/data-provider';
import { buildLiveArtifactDocument, splitMcpToolKey } from '~/utils/liveArtifact';

type ToolRequest = { id: string; name: string; args: Record<string, unknown> };

/**
 * Renders a live HTML artifact in an opaque-origin sandboxed iframe and bridges
 * its `window.librechat.callMcpTool` calls to the server, gated by
 * consent-on-first-call. The injected CSP blocks scriptable network egress
 * (`connect-src 'none'`) and the pixel/font/form/navigation exfil channels, so
 * the bridge is the only intended way data leaves the iframe; every tool call
 * flows through this relay.
 */
export default function LiveArtifactPreview({
  content,
  fileId,
  messageId,
  conversationId,
}: {
  content: string;
  fileId: string;
  messageId?: string;
  conversationId?: string;
}) {
  const localize = useLocalize();
  const callArtifactTool = useArtifactToolCallMutation();

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const portRef = useRef<MessagePort | null>(null);
  const grantsRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<ToolRequest[]>([]);
  const [pending, setPending] = useState<ToolRequest | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const srcDocument = useMemo(() => buildLiveArtifactDocument(content), [content]);

  // React reuses this instance when switching between live artifacts. Reset
  // consent + pending state when the source file changes so a grant approved
  // for one artifact never carries over to another.
  useEffect(() => {
    grantsRef.current.clear();
    queueRef.current = [];
    setPending(null);
  }, [fileId]);

  const dispatch = useCallback(
    async (request: ToolRequest) => {
      try {
        const { result } = await callArtifactTool.mutateAsync({
          file_id: fileId,
          messageId,
          conversationId,
          tool: request.name,
          args: request.args,
        });
        portRef.current?.postMessage({ type: 'tool-result', id: request.id, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tool call failed';
        portRef.current?.postMessage({ type: 'tool-result', id: request.id, error: message });
      }
    },
    [callArtifactTool, conversationId, fileId, messageId],
  );

  const showNextConsent = useCallback(() => {
    setPending(queueRef.current.shift() ?? null);
  }, []);

  const requestTool = useCallback(
    (request: ToolRequest) => {
      if (grantsRef.current.has(request.name)) {
        dispatch(request);
        return;
      }
      queueRef.current.push(request);
      setPending((current) => current ?? queueRef.current.shift() ?? null);
    },
    [dispatch],
  );

  const handleAllow = useCallback(() => {
    if (!pending) {
      return;
    }
    grantsRef.current.add(pending.name);
    dispatch(pending);
    showNextConsent();
  }, [dispatch, pending, showNextConsent]);

  const handleDeny = useCallback(() => {
    if (!pending) {
      return;
    }
    portRef.current?.postMessage({
      type: 'tool-result',
      id: pending.id,
      error: 'Permission denied',
    });
    showNextConsent();
  }, [pending, showNextConsent]);

  const handleLoad = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) {
      return;
    }
    // Close any prior port (e.g. an iframe self-reload fired `load` again) so
    // stale handlers and queued messages from the old document are dropped.
    portRef.current?.close();
    const channel = new MessageChannel();
    portRef.current = channel.port1;
    channel.port1.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (
        data?.type === 'tool-call' &&
        typeof data.id === 'string' &&
        typeof data.name === 'string'
      ) {
        requestTool({ id: data.id, name: data.name, args: data.args ?? {} });
      }
    };
    frame.contentWindow.postMessage({ type: 'librechat:init' }, '*', [channel.port2]);
  }, [requestTool]);

  const handleReload = useCallback(() => {
    portRef.current?.close();
    portRef.current = null;
    setReloadNonce((nonce) => nonce + 1);
  }, []);

  const consentLabels = pending ? splitMcpToolKey(pending.name) : null;

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-2 top-2 z-10">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={handleReload}
          aria-label={localize('com_ui_live_artifact_reload')}
        >
          <RotateCw size={16} aria-hidden="true" />
        </Button>
      </div>

      <iframe
        key={reloadNonce}
        ref={iframeRef}
        onLoad={handleLoad}
        srcDoc={srcDocument}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        title={localize('com_ui_live_artifact_frame_title')}
        className="h-full w-full border-0 bg-white"
      />

      {pending && consentLabels && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={localize('com_ui_live_artifact_consent_title')}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-xl bg-surface-primary p-5 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-text-primary">
              {localize('com_ui_live_artifact_consent_title')}
            </h2>
            <p className="mb-4 text-sm text-text-secondary">
              {localize('com_ui_live_artifact_consent_message', {
                tool: consentLabels.toolName,
                server: consentLabels.serverName,
              })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleDeny}>
                {localize('com_ui_deny')}
              </Button>
              <Button variant="submit" onClick={handleAllow}>
                {localize('com_ui_allow')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
