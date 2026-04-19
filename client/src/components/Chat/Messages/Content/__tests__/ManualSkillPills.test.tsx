import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, params?: Record<string, unknown>) =>
    `${key}:${params?.[0] ?? ''}`,
}));

import ManualSkillPills from '../ManualSkillPills';

describe('ManualSkillPills', () => {
  it('renders nothing when skills is undefined', () => {
    const { container } = render(<ManualSkillPills />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when skills is empty', () => {
    const { container } = render(<ManualSkillPills skills={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one pill per entry', () => {
    render(<ManualSkillPills skills={['brand-guidelines', 'pptx']} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('brand-guidelines');
    expect(items[1]).toHaveTextContent('pptx');
  });

  it('localizes the list aria-label', () => {
    render(<ManualSkillPills skills={['pptx']} />);
    expect(screen.getByRole('list')).toHaveAttribute('aria-label', 'com_ui_skills_manual_invoked:');
  });
});
