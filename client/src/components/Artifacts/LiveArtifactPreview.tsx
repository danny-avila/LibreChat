import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@librechat/client';
import { buildLiveArtifactDocument, splitMcpToolKey } from '~/utils/liveArtifact';
import { useArtifactToolCallMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

type ToolRequest = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** The port that issued this request; results go back only here. */
  port: MessagePort;
};

/** Per-render secret embedded in the shim; gates the bridge-port handshake. */
const makeHandshakeToken = (): string => {
  const c = globalThis.crypto;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  const bytes = new Uint8Array(16);
  c?.getRandomValues?.(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

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

  // Fresh token + document per content render — only the shim we injected knows
  // the token, so a navigated/attacker doc can't claim the bridge. (A reload
  // remounts the iframe and re-handshakes with the same token, which is fine.)
  const { token, srcDocument } = useMemo(() => {
    const handshakeToken = makeHandshakeToken();
    return {
      token: handshakeToken,
      srcDocument: buildLiveArtifactDocument(content, handshakeToken),
    };
  }, [content]);

  // React reuses this instance when switching between live artifacts, and the
  // same fileId can be reused across turns with new content. Reset consent +
  // pending state on fileId OR content change so a grant approved for one
  // version never carries over to a different one.
  useEffect(() => {
    grantsRef.current.clear();
    queueRef.current = [];
    setPending(null);
  }, [fileId, content]);

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
        request.port.postMessage({ type: 'tool-result', id: request.id, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tool call failed';
        request.port.postMessage({ type: 'tool-result', id: request.id, error: message });
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
    pending.port.postMessage({ type: 'tool-result', id: pending.id, error: 'Permission denied' });
    showNextConsent();
  }, [pending, showNextConsent]);

  // Token handshake: only transfer the bridge port to the iframe document that
  // proves it knows our per-render token (i.e. ran our injected shim), and only
  // honor tool calls once that document acks over the port. A self-navigated
  // page can't produce the token, so it can never drive the bridge.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) {
        return;
      }
      if (event.data?.type !== 'librechat:ready' || event.data.token !== token) {
        return;
      }
      portRef.current?.close();
      const channel = new MessageChannel();
      portRef.current = channel.port1;
      let verified = false;
      channel.port1.onmessage = (e: MessageEvent) => {
        const data = e.data;
        if (data?.type === 'librechat:ack' && data.token === token) {
          verified = true;
          return;
        }
        if (!verified) {
          return;
        }
        if (
          data?.type === 'tool-call' &&
          typeof data.id === 'string' &&
          typeof data.name === 'string'
        ) {
          requestTool({ id: data.id, name: data.name, args: data.args ?? {}, port: channel.port1 });
        }
      };
      frame.contentWindow.postMessage({ type: 'librechat:init', token }, '*', [channel.port2]);
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      portRef.current?.close();
      portRef.current = null;
    };
  }, [token, requestTool]);

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
        key={`${fileId}:${reloadNonce}`}
        ref={iframeRef}
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
