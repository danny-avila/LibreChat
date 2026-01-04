import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { OGDialog, OGDialogTemplate, Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils';

const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

interface RefinementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRefine: (refinementRequest: string) => void;
  isLoading?: boolean;
}

export default function RefinementDialog({
  isOpen,
  onClose,
  onRefine,
  isLoading = false,
}: RefinementDialogProps) {
  const localize = useLocalize();
  const [refinementRequest, setRefinementRequest] = useState('');

  const handleRefine = () => {
    if (refinementRequest.trim()) {
      onRefine(refinementRequest.trim());
    }
  };

  const handleClose = () => {
    setRefinementRequest('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleRefine();
    }
  };

  return (
    <OGDialog open={isOpen} onOpenChange={handleClose}>
      <OGDialogTemplate
        title={
          <div className="flex items-center gap-2 text-red-700">
            <Sparkles className="h-5 w-5 text-red-600" aria-hidden={true} />
            {localize('com_ui_refine_instructions')}
            <span className="ml-2 text-xs font-normal text-red-500">[TESTING - RED HIGHLIGHT]</span>
          </div>
        }
        className="max-w-2xl border-4 border-red-500 bg-red-50"
        main={
          <div className="space-y-4 py-4">
            <div>
              <label
                htmlFor="refinement-request"
                className="text-red-700 mb-2 block font-semibold"
              >
                {localize('com_ui_refinement_request')}
              </label>
              <textarea
                id="refinement-request"
                value={refinementRequest}
                onChange={(e) => setRefinementRequest(e.target.value)}
                onKeyDown={handleKeyDown}
                className={cn(inputClass, 'min-h-[120px] resize-y border-2 border-red-300 bg-white focus:border-red-500')}
                placeholder={localize('com_ui_refinement_request_placeholder')}
                rows={5}
                disabled={isLoading}
                aria-label="Refinement request"
              />
              <p className="mt-2 text-xs text-red-600 font-medium">
                {localize('com_ui_refinement_examples')}
              </p>
            </div>
          </div>
        }
        buttons={
          <>
            <Button
              onClick={handleClose}
              variant="outline"
              disabled={isLoading}
              aria-label="Cancel refinement"
            >
              {localize('com_ui_cancel')}
            </Button>
            <Button
              onClick={handleRefine}
              disabled={!refinementRequest.trim() || isLoading}
              aria-label="Apply refinement"
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white border-2 border-red-700"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  {localize('com_ui_refining')}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden={true} />
                  {localize('com_ui_refine')}
                </>
              )}
            </Button>
          </>
        }
      />
    </OGDialog>
  );
}