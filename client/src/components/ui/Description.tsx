import { useMemo } from 'react';
import type { ReactElement } from 'react';
import {
  CONFIG_HTML_MEDIA_ATTR,
  CONFIG_HTML_MEDIA_TAGS,
  createConfigHtmlSanitizer,
  createConfigHtmlTextSanitizer,
} from '~/utils/configHtml';

const sanitizeDescription = createConfigHtmlSanitizer({
  allowedTags: CONFIG_HTML_MEDIA_TAGS,
  allowedAttr: CONFIG_HTML_MEDIA_ATTR,
});
const sanitizeDescriptionText = createConfigHtmlTextSanitizer();

export function isHtmlDescription(description?: string | null): boolean {
  return description?.trim().startsWith('<') ?? false;
}

export function getPlainDescription(description?: string | null): string {
  if (!description) {
    return '';
  }

  if (!isHtmlDescription(description)) {
    return description;
  }

  return sanitizeDescriptionText(description);
}

interface DescriptionProps {
  as?: 'div' | 'p';
  'aria-label'?: string;
  className?: string;
  description?: string | null;
  id?: string;
  plainText?: boolean;
}

export default function Description({
  as: Element = 'div',
  className,
  description,
  id,
  plainText = false,
  'aria-label': ariaLabel,
}: DescriptionProps): ReactElement | null {
  const isHtml = isHtmlDescription(description);
  const content = useMemo(() => {
    if (!isHtml) {
      return description ?? '';
    }

    return plainText ? getPlainDescription(description) : sanitizeDescription(description);
  }, [description, isHtml, plainText]);

  if (!description) {
    return null;
  }

  if (plainText || !isHtml) {
    return (
      <Element id={id} className={className} aria-label={ariaLabel}>
        {content}
      </Element>
    );
  }

  return (
    <Element
      id={id}
      className={className}
      aria-label={ariaLabel}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
