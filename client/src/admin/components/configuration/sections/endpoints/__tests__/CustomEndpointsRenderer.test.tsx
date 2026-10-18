import { configSchema } from 'librechat-data-provider';
import { render, fireEvent } from '@testing-library/react';
import type * as t from '~/admin/types';
import { CustomEndpointsRenderer } from '../CustomEndpointsRenderer';
import { extractSchemaTree } from '~/admin/api/config';

jest.mock('~/admin/hooks/useLocalize', () => ({
  default: () => (key: string) => key,
  useLocalize: () => (key: string) => key,
}));

const tree = extractSchemaTree(configSchema as t.ZodSchemaLike);
const endpoints = tree.find((field) => field.key === 'endpoints');

describe('CustomEndpointsRenderer', () => {
  it('leaves a cleared name editable when the layer beneath defines no endpoints', () => {
    const { container } = render(
      <CustomEndpointsRenderer
        fields={endpoints?.children ?? []}
        parentPath="endpoints"
        parentValue={{ custom: [{ name: '', baseURL: 'https://x.example/v1', apiKey: 'k' }] }}
        getValue={(_path, fallback) => fallback}
        onChange={jest.fn()}
      />,
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-entry-card] button[aria-expanded]',
    );
    if (!toggle) throw new Error('no entry card');
    fireEvent.click(toggle);
    const name = container.querySelector<HTMLInputElement>('#endpoints-custom-0-name');
    expect(name).not.toBeNull();
    expect(name).not.toBeDisabled();
  });
});
