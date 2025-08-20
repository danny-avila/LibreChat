import '@testing-library/jest-dom/extend-expect';
import { fireEvent, render, screen } from '@testing-library/react';
import VersionItem from '../VersionItem';
import { VersionRecord } from '../VersionPanel';

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn().mockImplementation(() => (key, params) => {
    const translations = {
      com_ui_agent_version_title: params?.versionNumber
        ? `Version ${params.versionNumber}`
        : 'Version',
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

  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn().mockImplementation(() => true);
  });

  test('renders version number and timestamp', () => {
    render(<VersionItem {...defaultProps} />);
    expect(screen.getByText('Version 2')).toBeInTheDocument();
    const date = new Date('2023-01-01T00:00:00Z').toLocaleString();
    expect(screen.getByText(date)).toBeInTheDocument();
  });

  test('active version badge and no restore button when active', () => {
    render(<VersionItem {...defaultProps} isActive={true} />);
    expect(screen.getByText('Active Version')).toBeInTheDocument();
    expect(screen.queryByText('Restore')).not.toBeInTheDocument();
  });

  test('restore button and no active badge when not active', () => {
    render(<VersionItem {...defaultProps} isActive={false} />);
    expect(screen.queryByText('Active Version')).not.toBeInTheDocument();
    expect(screen.getByText('Restore')).toBeInTheDocument();
  });

  test('restore confirmation flow - confirmed', () => {
    render(<VersionItem {...defaultProps} />);
    fireEvent.click(screen.getByText('Restore'));
    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to restore this version?');
    expect(defaultProps.onRestore).toHaveBeenCalledWith(1);
  });

  test('restore confirmation flow - canceled', () => {
    window.confirm = jest.fn().mockImplementation(() => false);
    render(<VersionItem {...defaultProps} />);
    fireEvent.click(screen.getByText('Restore'));
    expect(window.confirm).toHaveBeenCalled();
    expect(defaultProps.onRestore).not.toHaveBeenCalled();
  });

  test('handles invalid timestamp', () => {
    render(
      <VersionItem {...defaultProps} version={{ ...mockVersion, updatedAt: 'invalid-date' }} />,
    );
    expect(screen.getByText('Unknown date')).toBeInTheDocument();
  });

  test('handles missing timestamps', () => {
    render(
      <VersionItem
        {...defaultProps}
        version={{ ...mockVersion, updatedAt: undefined, createdAt: undefined }}
      />,
    );
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
    render(
      <VersionItem
        {...defaultProps}
        version={{
          ...mockVersion,
          updatedAt: undefined,
          createdAt: '2023-01-01T00:00:00Z',
        }}
      />,
    );
    const createdDate = new Date('2023-01-01T00:00:00Z').toLocaleString();
    expect(screen.getByText(createdDate)).toBeInTheDocument();
  });

  test('handles empty version object', () => {
    render(<VersionItem {...defaultProps} version={{}} />);
    expect(screen.getByText('No date')).toBeInTheDocument();
  });
});
