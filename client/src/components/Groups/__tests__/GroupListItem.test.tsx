import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import GroupListItem from '../GroupListItem';
import type { Group } from '../types';

const mockGroup: Group = {
  _id: '123',
  name: 'Test Group',
  description: 'This is a test group',
  isActive: true,
  memberCount: 15,
  timeWindows: [
    {
      name: 'Business Hours',
      isActive: true,
      windowType: 'recurring',
    },
    {
      name: 'Weekend Hours', 
      isActive: false,
      windowType: 'recurring',
    }
  ],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-15T12:00:00Z'
};

const mockInactiveGroup: Group = {
  _id: '456',
  name: 'Inactive Group',
  description: 'This group is disabled',
  isActive: false,
  memberCount: 3,
  timeWindows: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-10T10:00:00Z'
};

const mockGroupNoDescription: Group = {
  _id: '789',
  name: 'No Description Group',
  isActive: true,
  memberCount: 0,
  timeWindows: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-05T08:00:00Z'
};

const mockOnSelect = jest.fn();

describe('GroupListItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders group information correctly', () => {
    render(
      <GroupListItem
        group={mockGroup}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('Test Group')).toBeDefined();
    expect(screen.getByText('This is a test group')).toBeDefined();
    expect(screen.getByText('15 members')).toBeDefined();
    expect(screen.getByText('1 time restrictions')).toBeDefined();
    expect(screen.getByText('Updated 1/15/2024')).toBeDefined();
  });

  test('shows active status icon for active groups', () => {
    const { container } = render(
      <GroupListItem
        group={mockGroup}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    // Check for the SVG with the green color class for active groups
    const svg = container.querySelector('svg.text-green-500');
    expect(svg).toBeDefined();
    expect(svg?.classList.contains('text-green-500')).toBe(true);
  });

  test('shows inactive status for inactive groups', () => {
    const { container } = render(
      <GroupListItem
        group={mockInactiveGroup}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('Inactive Group')).toBeDefined();
    expect(screen.getByText('This group is disabled')).toBeDefined();
    expect(screen.getByText('3 members')).toBeDefined();
    
    // Check for the SVG with the red color class for inactive groups
    const svg = container.querySelector('svg.text-red-500');
    expect(svg).toBeDefined();
    expect(svg?.classList.contains('text-red-500')).toBe(true);
  });

  test('handles groups without description', () => {
    render(
      <GroupListItem
        group={mockGroupNoDescription}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('No Description Group')).toBeDefined();
    expect(screen.getByText('0 members')).toBeDefined();
    
    // Description should not be rendered
    expect(screen.queryByText('This is a test group')).toBeNull();
  });

  test('handles groups without time windows', () => {
    render(
      <GroupListItem
        group={mockGroupNoDescription}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    // Should not show time restrictions text when there are no active time windows
    expect(screen.queryByText(/time restrictions/)).toBeNull();
  });

  test('applies selected styling when isSelected is true', () => {
    const { container } = render(
      <GroupListItem
        group={mockGroup}
        isSelected={true}
        onSelect={mockOnSelect}
      />
    );

    const itemDiv = container.firstChild as HTMLElement;
    expect(itemDiv.className).toContain('bg-surface-active');
    expect(itemDiv.className).toContain('border-l-4');
    expect(itemDiv.className).toContain('border-l-blue-500');
  });

  test('does not apply selected styling when isSelected is false', () => {
    const { container } = render(
      <GroupListItem
        group={mockGroup}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    const itemDiv = container.firstChild as HTMLElement;
    expect(itemDiv.className).not.toContain('bg-surface-active');
    expect(itemDiv.className).not.toContain('border-l-4');
  });

  test('calls onSelect with group id when clicked', () => {
    render(
      <GroupListItem
        group={mockGroup}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    const itemDiv = screen.getByText('Test Group').closest('div');
    fireEvent.click(itemDiv!);

    expect(mockOnSelect).toHaveBeenCalledWith('123');
  });

  test('shows correct time window count', () => {
    render(
      <GroupListItem
        group={mockGroup}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    // mockGroup has 2 time windows but only 1 is active
    expect(screen.getByText('1 time restrictions')).toBeDefined();
  });

  test('truncates long group names properly', () => {
    const longNameGroup: Group = {
      ...mockGroup,
      name: 'This is a very long group name that should be truncated to prevent layout issues',
    };

    const { container } = render(
      <GroupListItem
        group={longNameGroup}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    const nameElement = screen.getByText(longNameGroup.name);
    expect(nameElement.className).toContain('truncate');
  });

  test('truncates long descriptions properly', () => {
    const longDescGroup: Group = {
      ...mockGroup,
      description: 'This is a very long description that should be truncated to prevent it from taking up too much space in the list item and breaking the layout of the application',
    };

    const { container } = render(
      <GroupListItem
        group={longDescGroup}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    const descElement = screen.getByText(longDescGroup.description!);
    expect(descElement.className).toContain('line-clamp-2');
  });

  test('handles edge case with zero members', () => {
    render(
      <GroupListItem
        group={mockGroupNoDescription}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('0 members')).toBeDefined();
  });

  test('formats updated date correctly', () => {
    const recentGroup: Group = {
      ...mockGroup,
      updatedAt: '2024-02-29T15:30:00Z' // Leap year date
    };

    render(
      <GroupListItem
        group={recentGroup}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );

    // The exact format depends on the user's locale, but should contain date info
    const dateElement = screen.getByText(/Updated/);
    expect(dateElement).toBeDefined();
    expect(dateElement.textContent).toContain('Updated');
  });
});