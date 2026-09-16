import { useMemo, useState, useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { Constants } from 'librechat-data-provider';
import { useRecoilState, useRecoilValue, useResetRecoilState, useSetRecoilState } from 'recoil';
import { artifactNavigationRequestAtom } from '~/components/ArtifactApps/navigation';
import { getArtifactSourceKey } from '~/utils/artifactCatalog';
import { isCodeOnlyArtifact } from '~/utils/artifacts';
import { useArtifactsContext } from '~/Providers';
import { logger } from '~/utils';
import store from '~/store';

type ArtifactFence = {
  marker: string;
  length: number;
  contentStart: number;
};

const getLineEnd = (text: string, start: number): number => {
  const index = text.indexOf('\n', start);
  return index === -1 ? text.length : index;
};

const getNextLineStart = (text: string, lineEnd: number): number =>
  lineEnd >= text.length ? text.length : lineEnd + 1;

const getFirstContentLineStart = (text: string, start: number): number => {
  let currentIndex = start;

  while (currentIndex < text.length) {
    const lineEnd = getLineEnd(text, currentIndex);
    const line = text.slice(currentIndex, lineEnd);
    if (line.trim().length > 0) {
      return currentIndex;
    }
    currentIndex = getNextLineStart(text, lineEnd);
  }

  return text.length;
};

const getArtifactFence = (text: string, lineStart: number): ArtifactFence | null => {
  const lineEnd = getLineEnd(text, lineStart);
  const line = text.slice(lineStart, lineEnd);
  const match = line.trimStart().match(/^(`{3,}|~{3,})/);

  if (!match) {
    return null;
  }

  return {
    marker: match[1][0],
    length: match[1].length,
    contentStart: getNextLineStart(text, lineEnd),
  };
};

const isClosingArtifactFence = (line: string, openingFence: ArtifactFence): boolean => {
  const closePattern = new RegExp(`^\\${openingFence.marker}{${openingFence.length},}\\s*$`);
  return closePattern.test(line.trim());
};

const isArtifactCloseLine = (line: string): boolean => {
  const trimmed = line.trimStart();
  return trimmed.startsWith(':::') && !trimmed.startsWith(':::artifact');
};

const hasArtifactCloseAfter = (text: string, start: number): boolean => {
  const closeStart = getFirstContentLineStart(text, start);
  if (closeStart >= text.length) {
    return false;
  }

  const closeLineEnd = getLineEnd(text, closeStart);
  return isArtifactCloseLine(text.slice(closeStart, closeLineEnd));
};

const hasUnfencedArtifactClose = (text: string, start: number): boolean => {
  let currentIndex = start;
  let codeFence: ArtifactFence | null = null;

  while (currentIndex < text.length) {
    const lineEnd = getLineEnd(text, currentIndex);
    const line = text.slice(currentIndex, lineEnd);
    const fence = getArtifactFence(text, currentIndex);

    if (isArtifactCloseLine(line) && !codeFence) {
      return true;
    }

    if (fence && !codeFence) {
      codeFence = fence;
    } else if (codeFence && isClosingArtifactFence(line, codeFence)) {
      codeFence = null;
    }

    currentIndex = getNextLineStart(text, lineEnd);
  }

  return false;
};

const hasEnclosedArtifact = (messageText: string): boolean => {
  const text = messageText.trim();
  const artifactPattern = /:::artifact(?:\{[^}]*\})?/g;
  let artifactMatch = artifactPattern.exec(text);

  while (artifactMatch) {
    const openingLineEnd = getLineEnd(text, artifactMatch.index);
    const contentStart = getFirstContentLineStart(text, getNextLineStart(text, openingLineEnd));
    const openingFence = getArtifactFence(text, contentStart);

    if (!openingFence) {
      if (hasUnfencedArtifactClose(text, contentStart)) {
        return true;
      }
      artifactMatch = artifactPattern.exec(text);
      continue;
    }

    let currentIndex = openingFence.contentStart;
    while (currentIndex < text.length) {
      const lineEnd = getLineEnd(text, currentIndex);
      const line = text.slice(currentIndex, lineEnd);

      if (isClosingArtifactFence(line, openingFence)) {
        if (hasArtifactCloseAfter(text, getNextLineStart(text, lineEnd))) {
          return true;
        }
        break;
      }

      currentIndex = getNextLineStart(text, lineEnd);
    }

    artifactMatch = artifactPattern.exec(text);
  }

  return false;
};

export default function useArtifacts() {
  const [activeTab, setActiveTab] = useState('preview');
  const { isSubmitting, latestMessageId, latestMessageText, conversationId } =
    useArtifactsContext();

  const artifacts = useRecoilValue(store.artifactsState);
  const resetArtifacts = useResetRecoilState(store.artifactsState);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const [currentArtifactId, setCurrentArtifactId] = useRecoilState(store.currentArtifactId);
  const artifactNavigationRequest = useAtomValue(artifactNavigationRequestAtom);
  const pendingRequest =
    artifactNavigationRequest?.conversationId === conversationId ? artifactNavigationRequest : null;
  const requestedParams = new URLSearchParams(window.location.search);
  const requestedSourceKey = requestedParams.get('artifact') ?? pendingRequest?.sourceKey ?? null;
  const requestedOriginalId =
    requestedParams.get('artifactId') ?? pendingRequest?.originalArtifactId ?? null;
  const requestedMessageId =
    requestedParams.get('artifactMessageId') ?? pendingRequest?.messageId ?? null;

  const { orderedArtifactIds, latestAutoOpenArtifactId, requestedArtifactId } = useMemo(() => {
    const ids = Object.keys(artifacts ?? {}).sort(
      (a, b) => (artifacts?.[a]?.lastUpdateTime ?? 0) - (artifacts?.[b]?.lastUpdateTime ?? 0),
    );
    let requestedId: string | undefined;
    let messageMatch: string | undefined;
    let sourceMatch: string | undefined;
    if (requestedSourceKey) {
      for (let i = ids.length - 1; i >= 0; i--) {
        const id = ids[i];
        const artifact = artifacts?.[id];
        if (requestedOriginalId && artifact?.id === requestedOriginalId) {
          requestedId = id;
          break;
        }
        if (!messageMatch && requestedMessageId && artifact?.messageId === requestedMessageId) {
          messageMatch = id;
        }
        if (
          !sourceMatch &&
          (artifact?.id === requestedSourceKey ||
            artifact?.messageId === requestedSourceKey ||
            getArtifactSourceKey(artifact) === requestedSourceKey)
        ) {
          sourceMatch = id;
        }
      }
      requestedId = requestedId ?? messageMatch ?? sourceMatch;
    }
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i];
      if (!isCodeOnlyArtifact(artifacts?.[id]?.type)) {
        return {
          orderedArtifactIds: ids,
          latestAutoOpenArtifactId: id,
          requestedArtifactId: requestedId,
        };
      }
    }
    return {
      orderedArtifactIds: ids,
      latestAutoOpenArtifactId: null,
      requestedArtifactId: requestedId,
    };
  }, [artifacts, requestedMessageId, requestedOriginalId, requestedSourceKey]);

  const prevIsSubmittingRef = useRef<boolean>(false);
  const lastContentRef = useRef<string | null>(null);
  const hasEnclosedArtifactRef = useRef<boolean>(false);
  const hasAutoSwitchedToCodeRef = useRef<boolean>(false);
  const lastRunMessageIdRef = useRef<string | null>(null);
  const prevConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const resetState = () => {
      resetArtifacts();
      resetCurrentArtifactId();
      lastRunMessageIdRef.current = null;
      lastContentRef.current = null;
      hasEnclosedArtifactRef.current = false;
      hasAutoSwitchedToCodeRef.current = false;
    };
    if (conversationId !== prevConversationIdRef.current && prevConversationIdRef.current != null) {
      resetState();
    } else if (conversationId === Constants.NEW_CONVO) {
      resetState();
    }
    prevConversationIdRef.current = conversationId;
  }, [conversationId, resetArtifacts, resetCurrentArtifactId]);

  /**
   * Read currentArtifactId in effects without subscribing as a dependency.
   * Adding it to effect deps fires auto-select on every reset, breaking toggle-close.
   */
  const currentArtifactIdRef = useRef(currentArtifactId);
  currentArtifactIdRef.current = currentArtifactId;

  useEffect(() => {
    if (orderedArtifactIds.length === 0) return;
    if (requestedSourceKey) {
      if (!requestedArtifactId) {
        return;
      }
      if (currentArtifactIdRef.current !== requestedArtifactId) {
        setCurrentArtifactId(requestedArtifactId);
      }
      setArtifactsVisible(true);
      return;
    }
    const currentId = currentArtifactIdRef.current;
    if (currentId != null && orderedArtifactIds.includes(currentId)) return;
    if (latestAutoOpenArtifactId == null) {
      if (currentId != null) {
        resetCurrentArtifactId();
      }
      return;
    }
    setCurrentArtifactId(latestAutoOpenArtifactId);
  }, [
    latestAutoOpenArtifactId,
    orderedArtifactIds,
    requestedArtifactId,
    requestedSourceKey,
    resetCurrentArtifactId,
    setArtifactsVisible,
    setCurrentArtifactId,
  ]);

  /**
   * Manage artifact selection and code tab switching for non-enclosed artifacts
   * Runs when artifact content changes
   */
  useEffect(() => {
    // Check if we just finished submitting (transition from true to false)
    const justFinishedSubmitting = prevIsSubmittingRef.current && !isSubmitting;
    prevIsSubmittingRef.current = isSubmitting;

    // Only process during submission OR when just finished
    if (!isSubmitting && !justFinishedSubmitting) {
      return;
    }
    if (orderedArtifactIds.length === 0) {
      return;
    }
    if (latestMessageId == null) {
      return;
    }
    const latestArtifactId = orderedArtifactIds[orderedArtifactIds.length - 1];
    const latestArtifact = artifacts?.[latestArtifactId];
    if (latestArtifact?.content === lastContentRef.current && !justFinishedSubmitting) {
      return;
    }
    lastContentRef.current = latestArtifact?.content ?? null;
    if (isCodeOnlyArtifact(latestArtifact?.type)) {
      return;
    }

    setCurrentArtifactId(latestArtifactId);

    // Only switch to code tab if we haven't detected an enclosed artifact yet
    if (!hasEnclosedArtifactRef.current && !hasAutoSwitchedToCodeRef.current) {
      const artifactStartContent = latestArtifact?.content?.slice(0, 50) ?? '';
      if (artifactStartContent.length > 0 && latestMessageText.includes(artifactStartContent)) {
        setActiveTab('code');
        hasAutoSwitchedToCodeRef.current = true;
      }
    }
  }, [
    artifacts,
    isSubmitting,
    latestMessageId,
    latestMessageText,
    orderedArtifactIds,
    setCurrentArtifactId,
  ]);

  /**
   * Watch for enclosed artifact pattern during message generation
   * Optimized: Exits early if already detected, only checks during streaming
   */
  useEffect(() => {
    if (!isSubmitting || hasEnclosedArtifactRef.current) {
      return;
    }

    if (hasEnclosedArtifact(latestMessageText)) {
      logger.log('artifacts', 'Enclosed artifact detected during generation, switching to preview');
      setActiveTab('preview');
      hasEnclosedArtifactRef.current = true;
      hasAutoSwitchedToCodeRef.current = false;
    }
  }, [isSubmitting, latestMessageText]);

  useEffect(() => {
    if (latestMessageId !== lastRunMessageIdRef.current) {
      lastRunMessageIdRef.current = latestMessageId;
      hasEnclosedArtifactRef.current = false;
      hasAutoSwitchedToCodeRef.current = false;
    }
  }, [latestMessageId]);

  const currentArtifact = currentArtifactId != null ? artifacts?.[currentArtifactId] : null;

  const currentIndex = orderedArtifactIds.indexOf(currentArtifactId ?? '');

  return {
    activeTab,
    setActiveTab,
    currentIndex,
    currentArtifact,
    orderedArtifactIds,
    setCurrentArtifactId,
  };
}
