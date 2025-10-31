import { useRef, useState, useEffect } from 'react';
import { Code, Play } from 'lucide-react';
import { useSetRecoilState, useResetRecoilState } from 'recoil';
import { useMediaQuery } from '@librechat/client';
import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import useArtifacts from '~/hooks/Artifacts/useArtifacts';
import MobileArtifacts from './MobileArtifacts';
import DesktopArtifacts from './DesktopArtifacts';
import { useEditorContext } from '~/Providers';
import type { TabOption } from './ArtifactsTypes';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function Artifacts() {
  const localize = useLocalize();
  const { isMutating } = useEditorContext();
  const isMobile = useMediaQuery('(max-width: 868px)');
  const editorRef = useRef<CodeEditorRef>();
  const previewRef = useRef<SandpackPreviewRef>();
  const [isMounted, setIsMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);

  const tabOptions: TabOption[] = [
    {
      value: 'code',
      label: localize('com_ui_code'),
      icon: <Code className="size-4" />,
    },
    {
      value: 'preview',
      label: localize('com_ui_preview'),
      icon: <Play className="size-4" />,
    },
  ];

  const {
    activeTab,
    setActiveTab,
    currentIndex,
    currentArtifact,
    orderedArtifactIds,
    setCurrentArtifactId,
  } = useArtifacts();

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  if (!currentArtifact || !isMounted) {
    return null;
  }

  const handleRefresh = () => {
    setIsRefreshing(true);
    const client = previewRef.current?.getClient();
    if (client) {
      client.dispatch({ type: 'refresh' });
    }
    setTimeout(() => setIsRefreshing(false), 750);
  };

  const handleClose = () => {
    if (isMobile) {
      setArtifactsVisible(false);
    } else {
      resetCurrentArtifactId();
      setArtifactsVisible(false);
    }
  };

  const sharedProps = {
    currentArtifact,
    activeTab,
    setActiveTab,
    currentIndex,
    orderedArtifactIds,
    setCurrentArtifactId,
    editorRef: editorRef as React.MutableRefObject<CodeEditorRef>,
    previewRef: previewRef as React.MutableRefObject<SandpackPreviewRef>,
    isMutating,
    onClose: handleClose,
    onRefresh: handleRefresh,
    isRefreshing,
    tabOptions,
  };

  return isMobile ? <MobileArtifacts {...sharedProps} /> : <DesktopArtifacts {...sharedProps} />;
}
