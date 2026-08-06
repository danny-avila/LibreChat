import { useState } from 'react';
import { Rocket } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import PublishAppDialog from './PublishAppDialog';
import type { Artifact } from '~/common';

interface Props {
  artifact: Artifact;
  conversationId?: string;
  messageId?: string;
}

export default function PublishArtifactButton({ artifact, conversationId, messageId }: Props) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);

  const publishableTypes = [
    'application/vnd.react',
    'application/vnd.ant.react',
    'text/html',
    'application/vnd.code-html',
  ];
  if (!artifact.type || !publishableTypes.includes(artifact.type)) {
    return null;
  }

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9"
        onClick={() => setOpen(true)}
        aria-label={localize('com_ui_artifact_app_publish')}
        title={localize('com_ui_artifact_app_publish')}
      >
        <Rocket size={16} aria-hidden="true" />
      </Button>
      <PublishAppDialog
        open={open}
        onOpenChange={setOpen}
        artifact={artifact}
        conversationId={conversationId}
        messageId={messageId}
      />
    </>
  );
}
