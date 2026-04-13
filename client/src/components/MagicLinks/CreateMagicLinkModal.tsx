import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { Button, Input, Label, OGDialog, OGDialogContent, OGDialogTitle } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useCreateMagicLinkMutation } from '~/data-provider';

interface CreateMagicLinkModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateMagicLinkModal({ open, onClose }: CreateMagicLinkModalProps) {
  const localize = useLocalize();
  const [email, setEmail] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { mutate, isLoading, error } = useCreateMagicLinkMutation({
    onSuccess: (data) => setGeneratedUrl(data.url),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate({ email });
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(window.location.origin + generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setEmail('');
    setGeneratedUrl(null);
    setCopied(false);
    onClose();
  };

  return (
    <OGDialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <OGDialogContent className="max-w-md">
        <OGDialogTitle>{localize('com_ui_magic_link_generate')}</OGDialogTitle>
        {generatedUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{localize('com_ui_magic_link_generated')}</p>
            <div className="flex items-center gap-2 rounded border border-border-light bg-surface-secondary p-2">
              <code className="flex-1 truncate text-xs">{window.location.origin + generatedUrl}</code>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                aria-label={localize('com_ui_magic_link_copy')}
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-text-secondary">{localize('com_ui_magic_link_account_created_on_first_use')}</p>
            <Button onClick={handleClose} className="w-full">
              <X className="mr-2 h-4 w-4" />
              {localize('com_ui_close')}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="magic-link-email">{localize('com_ui_magic_link_email_label')}</Label>
              <Input
                id="magic-link-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={localize('com_ui_magic_link_email_placeholder')}
                required
                autoFocus
              />
            </div>
            {error && (
              <p className="text-sm text-red-500">
                {(error as { message?: string }).message ?? localize('com_ui_magic_link_generate_failed')}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                {localize('com_ui_cancel')}
              </Button>
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? localize('com_ui_magic_link_generating') : localize('com_ui_magic_link_generate')}
              </Button>
            </div>
          </form>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}
