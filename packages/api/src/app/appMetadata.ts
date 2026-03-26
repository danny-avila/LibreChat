import { defaultAppTitle, defaultAppDescription } from 'librechat-data-provider';

interface AppMetadata {
  title: string;
  description: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getAppMetadata(): AppMetadata {
  return {
    title: process.env.APP_TITLE || defaultAppTitle,
    description: process.env.APP_DESCRIPTION || defaultAppDescription,
  };
}

export function transformIndexHtml(html: string, metadata: AppMetadata): string {
  let result = html;

  if (metadata.title !== defaultAppTitle) {
    const safeTitle = escapeHtml(metadata.title);
    result = result.replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`);
  }

  if (metadata.description !== defaultAppDescription) {
    const safeDescription = escapeHtml(metadata.description);
    result = result.replace(
      /(<meta name="description" content=")[^"]*(")/,
      `$1${safeDescription}$2`,
    );
  }

  return result;
}

export function transformManifest(
  manifest: Record<string, unknown>,
  metadata: AppMetadata,
): Record<string, unknown> {
  return {
    ...manifest,
    name: metadata.title,
    short_name: metadata.title,
    description: metadata.description,
  };
}
