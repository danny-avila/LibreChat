import { render, screen } from '@testing-library/react';
import type * as t from '~/admin/types';
import { UnknownSettings } from '../UnknownSettings';

jest.mock('~/admin/hooks', () => ({ useLocalize: () => (key: string) => key }));

const known: t.SchemaField[] = [
  {
    path: 'balance.enabled',
    key: 'enabled',
    type: 'boolean',
    isOptional: true,
    isNullable: false,
    isArray: false,
    isObject: false,
    depth: 1,
  },
];

describe('UnknownSettings', () => {
  it('lists settings the schema does not know, read-only', () => {
    render(
      <UnknownSettings fields={known} value={{ enabled: true, newerFlag: 'on' }} path="balance" />,
    );
    expect(screen.getByText('com_admin_config_unknown_settings')).toBeInTheDocument();
    expect(screen.getByText('newerFlag')).toBeInTheDocument();
    expect(screen.queryByText('enabled')).not.toBeInTheDocument();
  });

  it('masks secrets inside unknown values', () => {
    const { container } = render(
      <UnknownSettings
        fields={known}
        value={{ newerProvider: { apiKey: 'sk-live-should-not-show', baseURL: 'https://x' } }}
        path="balance"
      />,
    );
    expect(container.textContent).not.toContain('sk-live-should-not-show');
    expect(container.textContent).toContain('••••••••');
    expect(container.textContent).toContain('https://x');
  });

  it('masks a secret stored directly under an unknown secret key', () => {
    const { container } = render(
      <UnknownSettings fields={known} value={{ apiKey: 'sk-top-secret' }} path="balance" />,
    );
    expect(container.textContent).not.toContain('sk-top-secret');
  });

  it('renders nothing when every key is known', () => {
    const { container } = render(
      <UnknownSettings fields={known} value={{ enabled: false }} path="balance" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
