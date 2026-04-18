import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, params?: Record<string, unknown>) =>
    `${key}:${params?.[0] ?? ''}`,
}));

import InvokingSkillsIndicator from '../InvokingSkillsIndicator';

describe('InvokingSkillsIndicator', () => {
  it('renders nothing when skills is undefined', () => {
    const { container } = render(<InvokingSkillsIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when skills is empty', () => {
    const { container } = render(<InvokingSkillsIndicator skills={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per entry with the localized label', () => {
    render(<InvokingSkillsIndicator skills={['brand-guidelines', 'pptx']} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/brand-guidelines/);
    expect(items[1]).toHaveTextContent(/pptx/);
  });
});
