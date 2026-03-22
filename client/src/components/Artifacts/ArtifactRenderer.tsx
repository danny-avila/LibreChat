import React, {
  memo,
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from 'react';
import type { ArtifactFiles } from '~/common';
import { sharedFiles } from '~/utils/artifacts';
import { buildArtifactHtml } from '~/utils/artifacts/artifact-builder';
import { buildImportMap } from '~/utils/artifacts/core';
import {
  buildRuntimeFileMap,
  extractNpmImports,
  normalizeArtifactPath,
  resolveArtifactKind,
} from '~/utils/artifacts/helpers';

export interface ArtifactPreviewHandle {
  refresh: () => void;
}

interface ArtifactPreviewProps {
  files: ArtifactFiles;
  fileKey: string;
  template?: string; // compat (unused)
  previewRef?: React.Ref<ArtifactPreviewHandle>; // compat
  sharedProps?: unknown; // compat (unused)
  currentCode?: string;
  startupConfig?: unknown; // compat (unused)
  className?: string;
}

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const getDark = () => document.documentElement.classList.contains('dark');
    setIsDark(getDark());

    const observer = new MutationObserver(() => setIsDark(getDark()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value as T);
  else (ref as React.MutableRefObject<T | null>).current = value;
}

function collectNpmImportsFromFileMap(fileMap: Record<string, string>) {
  const npmImports = new Set<string>();
  Object.values(fileMap).forEach((code) => {
    extractNpmImports(code).forEach((pkg) => npmImports.add(pkg));
  });
  return npmImports;
}

export const ArtifactPreview = memo(
  forwardRef<ArtifactPreviewHandle, ArtifactPreviewProps>(function ArtifactPreview(
    { files, fileKey, currentCode, className, previewRef,
      // compat, intentionally unused:
      template, sharedProps, startupConfig,
    },
    forwardedRef
  ) {
    const isDarkMode = useDarkMode();
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [progress, setProgress] = useState('Initializing environment...');
    const [error, setError] = useState('');

    const initializedRef = useRef(false);
    const lastFileKeyRef = useRef<string | null>(null);
    const [refreshTick, setRefreshTick] = useState(0);

    const lastActivityRef = useRef<number>(Date.now());
    const runIdRef = useRef<number>(0);

    // keep old heuristic

    const normalizedKey = useMemo(
      () => (fileKey.startsWith('/') ? fileKey : `/${fileKey}`),
      [fileKey]
    );

    const fileMap = useMemo(() => {
      const map: Record<string, string> = {};
      Object.entries(files).forEach(([path, fileObj]) => {
        const content = typeof fileObj === 'string' ? fileObj : fileObj?.code ?? fileObj?.content;
        if (content) map[path.startsWith('/') ? path : `/${path}`] = content;
      });
      return map;
    }, [files]);

    const mainCode = useMemo(
      () => currentCode ?? fileMap[normalizedKey] ?? '',
      [currentCode, fileMap, normalizedKey]
    );

    const artifactKind = useMemo(
      () => resolveArtifactKind(normalizedKey, mainCode),
      [normalizedKey, mainCode]
    );

    const isReact = artifactKind === 'react';

    const handle: ArtifactPreviewHandle = {
      refresh: () => {
        initializedRef.current = false;
        setError('');
        setStatus('loading');
        setProgress('Refreshing preview...');
        setRefreshTick((t) => t + 1);
      },
    };

    useImperativeHandle(forwardedRef, () => handle, []);
    useEffect(() => {
      assignRef(previewRef, handle);
      return () => assignRef(previewRef, null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewRef]);

    // Single authoritative message handler
    useEffect(() => {
      const onMsg = (e: MessageEvent) => {
        if (e.source !== iframeRef.current?.contentWindow) return;
        if (e.origin !== 'null') return;
        const d = e.data;
        if (!d || typeof d !== 'object') return;

        // stale run guard
        if (typeof (d as any).runId === 'number' && (d as any).runId !== runIdRef.current) {
          return;
        }

        lastActivityRef.current = Date.now();

        if ((d as any).type === 'progress') {
          setStatus('loading');
          if (typeof (d as any).message === 'string') setProgress((d as any).message);
          return;
        }

        if ((d as any).type === 'artifact-ready') {
          setStatus('ready');
          return;
        }

        if ((d as any).type === 'artifact-error') {
          setStatus('error');
          setError(String((d as any).error || 'Unknown render error'));
          return;
        }

        if ((d as any).type === 'external-link') {
          const href = String((d as any).href || '');
          try {
            const url = new URL(href, window.location.origin);
            if (url.protocol === 'http:' || url.protocol === 'https:') {
              window.open(url.toString(), '_blank', 'noopener,noreferrer');
            }
          } catch {
            // ignore invalid URL
          }
        }
      };

      window.addEventListener('message', onMsg);
      return () => window.removeEventListener('message', onMsg);
    }, []);

    // Render/re-render effect
    useEffect(() => {
      const timer = setTimeout(() => {
        setStatus('loading');
        setError('');
        setProgress('Preparing files...');
        lastActivityRef.current = Date.now();

        const normalizedKey = normalizeArtifactPath(fileKey);

        const fileMap = buildRuntimeFileMap({
          files,
          sharedFiles,
          includeShared: isReact,
        });

        // apply editor override
        if (typeof currentCode === 'string') {
          fileMap[normalizedKey] = currentCode;
        }

        const mainCode = fileMap[normalizedKey] ?? '';

        const html = buildArtifactHtml({
          fileName: normalizedKey,
          code: mainCode,
          files: fileMap,
          isDarkMode,
        });

        const shouldReset =
          !initializedRef.current || !isReact || lastFileKeyRef.current !== normalizedKey;

        const iframe = iframeRef.current;
        if (!iframe) return;

        // new run id for each send cycle
        runIdRef.current += 1;
        const runId = runIdRef.current;

        const sendRenderMessage = () => {
          if (!isReact) return;

          setProgress('Building dependency map...');
          const npmImports = collectNpmImportsFromFileMap(fileMap);
          const npmImportMap = buildImportMap(npmImports);

          lastActivityRef.current = Date.now();
          setProgress('Sending render request...');

          iframe.contentWindow?.postMessage(
            {
              type: 'render',
              payload: {
                runId,
                entryKey: normalizedKey,
                files: fileMap,
                npmImportMap,
                isDarkMode,
              },
            },
            '*'
          );
        };

        if (shouldReset) {
          iframe.onload = () => {
            // for non-react docs, child renderer should emit artifact-ready itself
            if (isReact) sendRenderMessage();
          };
          iframe.srcdoc = html;
          initializedRef.current = isReact;
          lastFileKeyRef.current = normalizedKey;
        } else {
          // react hot update path without full iframe reset
          sendRenderMessage();
        }
      }, 120);

      return () => clearTimeout(timer);
    }, [fileMap, normalizedKey, mainCode, isDarkMode, isReact, refreshTick]);

    // Stall timeout (dynamic): only fail if no activity for 15s
    useEffect(() => {
      if (status !== 'loading') return;

      const id = setInterval(() => {
        const idleMs = Date.now() - lastActivityRef.current;
        if (idleMs > 15000) {
          setStatus('error');
          setError('Rendering stalled while loading dependencies (no progress for 15s).');
          clearInterval(id);
        }
      }, 1000);

      return () => clearInterval(id);
    }, [status]);

    return (
      <div className={`relative h-full w-full bg-white dark:bg-gray-950 ${className ?? ''}`}>
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm">
            <div className="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <span className="animate-pulse text-xs font-medium text-gray-500">
              {progress || 'Initializing environment...'}
            </span>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white p-6 dark:bg-gray-950">
            <div className="max-h-full w-full max-w-md overflow-auto rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900/30 dark:bg-red-900/10">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-red-800 dark:text-red-400">
                <span>⚠️</span> Render Error
              </h3>
              <pre className="break-all whitespace-pre-wrap font-mono text-[10px] text-red-700 dark:text-red-300">
                {error}
              </pre>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          title="Artifact Preview"
          className={`h-full w-full border-none transition-opacity duration-300 ${status === 'loading' ? 'opacity-0' : 'opacity-100'
            }`}
          sandbox="allow-scripts"
        />
      </div>
    );
  })
);

export default ArtifactPreview;
