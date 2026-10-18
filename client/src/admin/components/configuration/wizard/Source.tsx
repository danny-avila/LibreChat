import { useRef } from 'react';
import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { Icon, Tabs } from '~/admin/ui';

/** Lines shown above a YAML syntax error. */
const CONTEXT_LINES = 2;

/** The lines around a YAML syntax error with a caret under the column, like a compiler message. */
export function SyntaxFrame({ text, mark }: t.ImportSyntaxFrameProps) {
  const localize = useLocalize();
  const lines = text.split('\n');
  const first = Math.max(1, mark.line - CONTEXT_LINES);
  const shown = lines.slice(first - 1, mark.line);
  const width = String(mark.line).length;
  const gutter = (n: number | string) => `${String(n).padStart(width, ' ')} | `;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-(--cui-color-text-danger)">
        {localize('com_admin_config_review_import_syntax_at', mark)}
      </span>
      <pre className="m-0 overflow-x-auto rounded bg-(--cui-color-background-muted) px-2 py-1 font-mono text-xs leading-snug text-(--cui-color-text-default)">
        {shown.map((line, i) => `${gutter(first + i)}${line}`).join('\n')}
        {`\n${' '.repeat(width)} | ${' '.repeat(Math.max(0, mark.column - 1))}^`}
      </pre>
    </div>
  );
}

/** Step 1: upload a file or paste YAML. */
export function Source({
  activeTab,
  onTabChange,
  yamlText,
  onTextChange,
  fileName,
  onFile,
}: t.ImportSourceProps) {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasContent = yamlText.trim().length > 0;

  return (
    <>
      <p className="m-0 text-sm text-(--cui-color-text-muted)">
        {localize('com_admin_config_review_import_desc')}
      </p>
      <Tabs
        value={activeTab}
        onValueChange={(tab) => {
          if (tab === 'paste' && fileInputRef.current) fileInputRef.current.value = '';
          onTabChange(tab === 'paste' ? 'paste' : 'upload');
        }}
      >
        <Tabs.TriggersList>
          <Tabs.Trigger value="upload">{localize('com_admin_config_import_upload')}</Tabs.Trigger>
          <Tabs.Trigger value="paste">{localize('com_admin_config_import_paste')}</Tabs.Trigger>
        </Tabs.TriggersList>

        <Tabs.Content value="upload" tabIndex={-1}>
          <div className="flex flex-col gap-3 pt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(file);
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-(--cui-color-stroke-default) bg-transparent px-4 py-8 text-sm text-(--cui-color-text-muted) transition-colors hover:border-(--cui-color-accent) hover:text-(--cui-color-text-default)"
            >
              <span aria-hidden="true">
                <Icon name="upload" size="sm" />
              </span>
              {fileName ?? localize('com_admin_config_import_choose_file')}
            </button>
            {fileName && hasContent && (
              <div className="flex items-center gap-2 text-sm text-(--cui-color-text-default)">
                <span aria-hidden="true">
                  <Icon name="check" size="xs" />
                </span>
                <span>{fileName}</span>
                <span className="text-(--cui-color-text-muted)">
                  {localize('com_admin_config_review_import_lines', {
                    count: yamlText.split('\n').length,
                  })}
                </span>
              </div>
            )}
          </div>
        </Tabs.Content>

        <Tabs.Content value="paste" tabIndex={-1}>
          <div className="pt-3">
            <textarea
              value={yamlText}
              onChange={(event) => onTextChange(event.target.value)}
              aria-label={localize('com_admin_config_import_paste')}
              placeholder={localize('com_admin_config_import_paste_placeholder')}
              rows={12}
              className="config-input config-input-mono w-full resize-y"
              spellCheck={false}
            />
          </div>
        </Tabs.Content>
      </Tabs>
    </>
  );
}
