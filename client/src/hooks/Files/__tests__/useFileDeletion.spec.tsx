import React, { useState } from 'react';
import { FileSources, EToolResources } from 'librechat-data-provider';
import { render, screen, act, renderHook } from '@testing-library/react';
import type { ExtendedFile } from '~/common';
import FileRow from '~/components/Chat/Input/Files/FileRow';
import useFileDeletion from '../useFileDeletion';

const mockMutateAsync = jest.fn();

jest.mock('~/data-provider', () => ({
  useDeleteFilesMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  logger: { log: jest.fn() },
  getCachedPreview: () => undefined,
  deletePreview: jest.fn(),
}));

jest.mock('../useSetFilesToDelete', () => ({
  __esModule: true,
  default: () => jest.fn(),
}));

jest.mock('~/components/Chat/Input/Files/FileContainer', () => {
  return function MockFileContainer({
    file,
    onDelete,
  }: {
    file: ExtendedFile;
    onDelete: () => void;
  }) {
    return <button data-testid={`del-${file.file_id}`} onClick={onDelete} />;
  };
});

jest.mock('~/components/Chat/Input/Files/Image', () => {
  return function MockImage() {
    return null;
  };
});

/** Mirrors the shape `utils/forms.tsx` builds for agent Context/File Search panels */
const makeFile = (file_id: string): ExtendedFile =>
  ({
    file_id,
    type: 'application/pdf',
    filepath: `/uploads/${file_id}.pdf`,
    filename: `${file_id}.pdf`,
    size: 1024,
    progress: 1,
    source: FileSources.local,
  }) as ExtendedFile;

/** Mirrors FileContext.tsx, which mounts FileRow only while `fileCount > 0` */
function ConditionalPanel({ initial }: { initial: ExtendedFile[] }) {
  const [files, setFiles] = useState(new Map(initial.map((f) => [f.file_id, f])));
  return (
    <>
      {files.size > 0 && (
        <FileRow
          files={files}
          setFiles={setFiles}
          agent_id="agent-123"
          tool_resource={EToolResources.context}
        />
      )}
    </>
  );
}

describe('useFileDeletion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockMutateAsync.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  const clickDelete = (file_id: string) => {
    act(() => {
      screen.getByTestId(`del-${file_id}`).click();
    });
    act(() => {
      jest.advanceTimersByTime(3000);
    });
  };

  it('sends the unlink request when removing the last file from an agent panel', () => {
    render(<ConditionalPanel initial={[makeFile('only-file')]} />);

    clickDelete('only-file');

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      files: [expect.objectContaining({ file_id: 'only-file' })],
      agent_id: 'agent-123',
      tool_resource: EToolResources.context,
    });
  });

  it('sends the unlink request when removing a non-last file from an agent panel', () => {
    render(<ConditionalPanel initial={[makeFile('file-a'), makeFile('file-b')]} />);

    clickDelete('file-a');

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: 'agent-123', tool_resource: EToolResources.context }),
    );
  });

  it('does not delete a file that was attached from existing storage', () => {
    const { result } = renderHook(() => useFileDeletion({ mutateAsync: mockMutateAsync }));

    act(() => {
      result.current.deleteFile({
        file: { ...makeFile('stored-file'), attached: true } as ExtendedFile,
      });
    });
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
