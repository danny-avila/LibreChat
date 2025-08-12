import { useMemo, useState, useEffect, useRef } from 'react';
import { Constants } from 'librechat-data-provider';
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil';
import { logger } from '~/utils';
import { useArtifactsContext } from '~/Providers';
import { getKey } from '~/utils/artifacts';
import store from '~/store';

export default function useArtifacts() {
  const [activeTab, setActiveTab] = useState('preview');
  const { isSubmitting, latestMessageId, latestMessageText, conversationId } =
    useArtifactsContext();

  const artifacts = useRecoilValue(store.artifactsState);
  const resetArtifacts = useResetRecoilState(store.artifactsState);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const [currentArtifactId, setCurrentArtifactId] = useRecoilState(store.currentArtifactId);

  const orderedArtifactIds = useMemo(() => {
    return Object.keys(artifacts ?? {}).sort(
      (a, b) => (artifacts?.[a]?.lastUpdateTime ?? 0) - (artifacts?.[b]?.lastUpdateTime ?? 0),
    );
  }, [artifacts]);

  const lastContentRef = useRef<string | null>(null);
  const hasEnclosedArtifactRef = useRef<boolean>(false);
  const hasAutoSwitchedToCodeRef = useRef<boolean>(false);
  const lastRunMessageIdRef = useRef<string | null>(null);
  const prevConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const resetState = () => {
      resetArtifacts();
      resetCurrentArtifactId();
      prevConversationIdRef.current = conversationId;
      lastRunMessageIdRef.current = null;
      lastContentRef.current = null;
      hasEnclosedArtifactRef.current = false;
    };
    if (conversationId !== prevConversationIdRef.current && prevConversationIdRef.current != null) {
      resetState();
    } else if (conversationId === Constants.NEW_CONVO) {
      resetState();
    }
    prevConversationIdRef.current = conversationId;
    /** Resets artifacts when unmounting */
    return () => {
      logger.log('artifacts_visibility', 'Unmounting artifacts');
      resetState();
    };
  }, [conversationId, resetArtifacts, resetCurrentArtifactId]);

  useEffect(() => {
    if (orderedArtifactIds.length > 0) {
      const latestArtifactId = orderedArtifactIds[orderedArtifactIds.length - 1];
      setCurrentArtifactId(latestArtifactId);
    }
  }, [setCurrentArtifactId, orderedArtifactIds]);

  useEffect(() => {
    if (!isSubmitting) {
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
    if (latestArtifact?.content === lastContentRef.current) {
      return;
    }

    setCurrentArtifactId(latestArtifactId);
    lastContentRef.current = latestArtifact?.content ?? null;

    const hasEnclosedArtifact =
      /:::artifact(?:\{[^}]*\})?(?:\s|\n)*(?:```[\s\S]*?```(?:\s|\n)*)?:::/m.test(
        latestMessageText.trim(),
      );

    if (hasEnclosedArtifact && !hasEnclosedArtifactRef.current) {
      setActiveTab('preview');
      hasEnclosedArtifactRef.current = true;
      hasAutoSwitchedToCodeRef.current = false;
    } else if (!hasEnclosedArtifactRef.current && !hasAutoSwitchedToCodeRef.current) {
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

  useEffect(() => {
    if (latestMessageId !== lastRunMessageIdRef.current) {
      lastRunMessageIdRef.current = latestMessageId;
      hasEnclosedArtifactRef.current = false;
      hasAutoSwitchedToCodeRef.current = false;
    }
  }, [latestMessageId]);

  const currentArtifact = currentArtifactId != null ? artifacts?.[currentArtifactId] : null;

  const currentIndex = orderedArtifactIds.indexOf(currentArtifactId ?? '');
  const cycleArtifact = (direction: 'next' | 'prev') => {
    let newIndex: number;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % orderedArtifactIds.length;
    } else {
      newIndex = (currentIndex - 1 + orderedArtifactIds.length) % orderedArtifactIds.length;
    }
    setCurrentArtifactId(orderedArtifactIds[newIndex]);
  };

  const isMermaid = useMemo(() => {
    if (currentArtifact?.type == null) {
      return false;
    }
    const key = getKey(currentArtifact.type, currentArtifact.language);
    return key.includes('mermaid');
  }, [currentArtifact?.type, currentArtifact?.language]);

  return {
    activeTab,
    isMermaid,
    setActiveTab,
    currentIndex,
    cycleArtifact,
    currentArtifact,
    orderedArtifactIds,
  };
}
