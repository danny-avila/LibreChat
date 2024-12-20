import { useMemo, useState, useEffect, useRef } from 'react';
import { Constants } from 'librechat-data-provider';
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil';
import { useChatContext } from '~/Providers';
import { getKey, needsPreview } from '~/utils/artifacts';
import { getLatestText } from '~/utils';
import store from '~/store';

export default function useArtifacts() {
  const [activeTab, setActiveTab] = useState('preview');
  const { isSubmitting, latestMessage, conversation } = useChatContext();

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
      prevConversationIdRef.current = conversation?.conversationId ?? null;
      lastRunMessageIdRef.current = null;
      lastContentRef.current = null;
      hasEnclosedArtifactRef.current = false;
    };
    if (
      conversation &&
      conversation.conversationId !== prevConversationIdRef.current &&
      prevConversationIdRef.current != null
    ) {
      resetState();
    } else if (conversation && conversation.conversationId === Constants.NEW_CONVO) {
      resetState();
    }
    prevConversationIdRef.current = conversation?.conversationId ?? null;
  }, [conversation, resetArtifacts, resetCurrentArtifactId]);

  useEffect(() => {
    if (orderedArtifactIds.length > 0) {
      const latestArtifactId = orderedArtifactIds[orderedArtifactIds.length - 1];
      setCurrentArtifactId(latestArtifactId);
    }
  }, [setCurrentArtifactId, orderedArtifactIds]);

  useEffect(() => {
    if (isSubmitting && orderedArtifactIds.length > 0 && latestMessage) {
      const latestArtifactId = orderedArtifactIds[orderedArtifactIds.length - 1];
      const latestArtifact = artifacts?.[latestArtifactId];

      if (latestArtifact?.content !== lastContentRef.current) {
        setCurrentArtifactId(latestArtifactId);
        lastContentRef.current = latestArtifact?.content ?? null;

        const latestMessageText = getLatestText(latestMessage);
        const hasEnclosedArtifact = /:::artifact[\s\S]*?(```|:::)\s*$/.test(
          latestMessageText.trim(),
        );

        if (hasEnclosedArtifact && !hasEnclosedArtifactRef.current) {
          setActiveTab(needsPreview(latestArtifact?.type) ? 'preview' : 'code');
          hasEnclosedArtifactRef.current = true;
          hasAutoSwitchedToCodeRef.current = false;
        } else if (!hasEnclosedArtifactRef.current && !hasAutoSwitchedToCodeRef.current) {
          const artifactStartContent = latestArtifact?.content?.slice(0, 50) ?? '';
          if (artifactStartContent.length > 0 && latestMessageText.includes(artifactStartContent)) {
            setActiveTab('code');
            hasAutoSwitchedToCodeRef.current = true;
          }
        }
      }
    }
  }, [setCurrentArtifactId, isSubmitting, orderedArtifactIds, artifacts, latestMessage]);

  useEffect(() => {
    if (latestMessage?.messageId !== lastRunMessageIdRef.current) {
      lastRunMessageIdRef.current = latestMessage?.messageId ?? null;
      hasEnclosedArtifactRef.current = false;
      hasAutoSwitchedToCodeRef.current = false;
    }
  }, [latestMessage]);

  const currentArtifact = currentArtifactId != null ? artifacts?.[currentArtifactId] : null;

  // Prevent non-previewable artifacts from using the preview tab
  useEffect(() => {
    if(!needsPreview(currentArtifact?.type) && activeTab == "preview") {
      setActiveTab("code");
    }
  }, [currentArtifact])


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
    isSubmitting,
    cycleArtifact,
    currentArtifact,
    orderedArtifactIds,
  };
}
