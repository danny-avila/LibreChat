import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import VersionItem from '../VersionItem';
import { VersionRecord } from '../VersionPanel';

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn().mockImplementation(() => (key) => {
    const translations = {
      com_ui_agent_version_title: 'Version',
      com_ui_agent_version_active: 'Active Version',
      com_ui_agent_version_restore: 'Restore',
      com_ui_agent_version_restore_confirm: 'Are you sure you want to restore this version?',
      com_ui_agent_version_unknown_date: 'Unknown date',
      com_ui_agent_version_no_date: 'No date',
    };
    return translations[key] || key;
  }),
}));

describe('VersionItem', () => {
  const mockVersion: VersionRecord = {
    name: 'Test Agent',
    description: 'Test Description',
    instructions: 'Test Instructions',
    updatedAt: '2023-01-01T00:00:00Z',
  };

  const defaultProps = {
    version: mockVersion,
    index: 1,
    isActive: false,
    versionsLength: 3,
    onRestore: jest.fn(),
  };

  test('renders version item with correct version number', () => {
    render(<VersionItem {...defaultProps} />);

    expect(screen.getByText('Version 2')).toBeInTheDocument();
  });

  test('displays active badge when isActive is true', () => {
    render(<VersionItem {...defaultProps} isActive={true} />);

    expect(screen.getByText('Active Version')).toBeInTheDocument();
  });

  test('does not display active badge when isActive is false', () => {
    render(<VersionItem {...defaultProps} isActive={false} />);

    expect(screen.queryByText('Active Version')).not.toBeInTheDocument();
  });

  test('displays restore button when not active', () => {
    render(<VersionItem {...defaultProps} isActive={false} />);

    expect(screen.getByText('Restore')).toBeInTheDocument();
  });

  test('does not display restore button when active', () => {
    render(<VersionItem {...defaultProps} isActive={true} />);

    expect(screen.queryByText('Restore')).not.toBeInTheDocument();
  });

  test('calls onRestore with correct index when restore button is clicked and confirmed', () => {
    window.confirm = jest.fn().mockImplementation(() => true);

    render(<VersionItem {...defaultProps} />);

    fireEvent.click(screen.getByText('Restore'));

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to restore this version?');
    expect(defaultProps.onRestore).toHaveBeenCalledWith(1);
  });

  test('does not call onRestore when confirmation is cancelled', () => {
    window.confirm = jest.fn().mockImplementation(() => false);

    render(<VersionItem {...defaultProps} />);

    fireEvent.click(screen.getByText('Restore'));

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to restore this version?');
    expect(defaultProps.onRestore).not.toHaveBeenCalled();
  });

  test('displays formatted timestamp', () => {
    render(<VersionItem {...defaultProps} />);

    const date = new Date('2023-01-01T00:00:00Z').toLocaleString();
    expect(screen.getByText(date)).toBeInTheDocument();
  });

  describe('edge cases', () => {
    test('displays fallback message for invalid timestamp', () => {
      const versionWithInvalidDate = {
        ...mockVersion,
        updatedAt: 'invalid-date',
      };

      render(<VersionItem {...defaultProps} version={versionWithInvalidDate} />);

      expect(screen.getByText('Unknown date')).toBeInTheDocument();
    });

    test('displays fallback message for missing timestamp', () => {
      const versionWithoutDate = {
        ...mockVersion,
        updatedAt: undefined,
        createdAt: undefined,
      };

      render(<VersionItem {...defaultProps} version={versionWithoutDate} />);

      expect(screen.getByText('No date')).toBeInTheDocument();
    });

    test('prefers updatedAt over createdAt when both exist', () => {
      const versionWithBothDates = {
        ...mockVersion,
        updatedAt: '2023-01-02T00:00:00Z',
        createdAt: '2023-01-01T00:00:00Z',
      };

      render(<VersionItem {...defaultProps} version={versionWithBothDates} />);

      const updatedDate = new Date('2023-01-02T00:00:00Z').toLocaleString();
      expect(screen.getByText(updatedDate)).toBeInTheDocument();
    });

    test('falls back to createdAt when updatedAt is missing', () => {
      const versionWithCreatedOnly = {
        ...mockVersion,
        updatedAt: undefined,
        createdAt: '2023-01-01T00:00:00Z',
      };

      render(<VersionItem {...defaultProps} version={versionWithCreatedOnly} />);

      const createdDate = new Date('2023-01-01T00:00:00Z').toLocaleString();
      expect(screen.getByText(createdDate)).toBeInTheDocument();
    });

    test('handles version with empty object', () => {
      render(<VersionItem {...defaultProps} version={{}} />);

      expect(screen.getByText('No date')).toBeInTheDocument();
    });
  });
});
