import React from 'react';
import { render, act } from '@testing-library/react';
import type { editor } from 'monaco-editor';
import type { Artifact } from '~/common';
import { ArtifactCodeEditor } from './ArtifactCodeEditor';

interface MutationVars {
  updated: string;
  messageId: string;
  index: number;
  original?: string;
}

interface MutationHandlers {
  onMutate?: (vars: MutationVars) => void;
  onSuccess?: (data: unknown, vars: MutationVars) => void;
  onError?: (error?: unknown) => void;
}

const mockEditorProps: { onChange?: (value: string | undefined) => void } = {};
const mockMutationHandlers: MutationHandlers = {};

// Calling mutate replays onMutate synchronously so currentUpdateRef reflects the
// in-flight content, matching how react-query drives the real mutation lifecycle.
const mockMutate = jest.fn((vars: MutationVars) => {
  mockMutationHandlers.onMutate?.(vars);
});

jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: (props: { onChange?: (value: string | undefined) => void }) => {
    mockEditorProps.onChange = props.onChange;
    return null;
  },
}));

jest.mock('~/Providers/EditorContext', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useMutationState: () => {
      const [isMutating, setIsMutating] = ReactModule.useState(false);
      return { isMutating, setIsMutating };
    },
    useCodeState: () => {
      const [currentCode, setCurrentCode] = ReactModule.useState('');
      return { currentCode, setCurrentCode };
    },
  };
});

jest.mock('~/Providers', () => ({
  useArtifactsContext: () => ({ isSubmitting: false }),
}));

jest.mock('~/data-provider', () => ({
  useEditArtifact: (handlers: MutationHandlers) => {
    mockMutationHandlers.onMutate = handlers.onMutate;
    mockMutationHandlers.onSuccess = handlers.onSuccess;
    mockMutationHandlers.onError = handlers.onError;
    return { mutate: mockMutate };
  },
}));

const ORIGINAL = 'ORIGINAL';

const artifact: Artifact = {
  id: 'artifact-1',
  lastUpdateTime: 0,
  index: 0,
  messageId: 'msg-1',
  content: ORIGINAL,
  type: 'text/plain',
};

const otherArtifact: Artifact = {
  id: 'artifact-2',
  lastUpdateTime: 0,
  index: 0,
  messageId: 'msg-2',
  content: 'ORIGINAL-B',
  type: 'text/plain',
};

const renderEditor = (initial: Artifact = artifact) => {
  const monacoRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null> = { current: null };
  const utils = render(<ArtifactCodeEditor artifact={initial} monacoRef={monacoRef} />);
  const rerenderWith = (next: Artifact) =>
    utils.rerender(<ArtifactCodeEditor artifact={next} monacoRef={monacoRef} />);
  return { ...utils, rerenderWith };
};

const fireEdit = (value: string) => {
  act(() => {
    mockEditorProps.onChange?.(value);
    jest.advanceTimersByTime(500);
  });
};

describe('ArtifactCodeEditor retry guard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockEditorProps.onChange = undefined;
    mockMutationHandlers.onMutate = undefined;
    mockMutationHandlers.onSuccess = undefined;
    mockMutationHandlers.onError = undefined;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('does not re-run a mutation for content that just failed', () => {
    renderEditor();

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenLastCalledWith(expect.objectContaining({ updated: 'EDITED' }));

    act(() => {
      mockMutationHandlers.onError?.({ status: 400 });
    });

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('blocks the retry for a real AxiosError 400 (production error shape)', () => {
    renderEditor();

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);

    act(() => {
      mockMutationHandlers.onError?.({ isAxiosError: true, response: { status: 400 } });
    });

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('blocks the synchronous pending re-run of content that just failed', () => {
    renderEditor();

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);

    act(() => {
      mockMutationHandlers.onError?.({ status: 400 });
    });

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('clears the guard on success so the same content can run again', () => {
    renderEditor();

    fireEdit('EDITED');
    act(() => {
      mockMutationHandlers.onError?.({ status: 400 });
    });
    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);

    fireEdit('DIFFERENT');
    expect(mockMutate).toHaveBeenCalledTimes(2);

    act(() => {
      mockMutationHandlers.onSuccess?.(undefined, {
        updated: 'DIFFERENT',
        messageId: 'msg-1',
        index: 0,
      });
    });
    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(3);
    expect(mockMutate).toHaveBeenLastCalledWith(expect.objectContaining({ updated: 'EDITED' }));
  });

  it('clears the guard when the artifact changes', () => {
    const { rerenderWith } = renderEditor();

    fireEdit('EDITED');
    act(() => {
      mockMutationHandlers.onError?.({ status: 400 });
    });
    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);

    act(() => {
      rerenderWith(otherArtifact);
    });
    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(2);
    expect(mockMutate).toHaveBeenLastCalledWith(expect.objectContaining({ updated: 'EDITED' }));
  });

  it('re-runs identical content after a non-400 client error (transient, not deterministic)', () => {
    renderEditor();

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);

    act(() => {
      mockMutationHandlers.onError?.({ status: 429 });
    });

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(2);
    expect(mockMutate).toHaveBeenLastCalledWith(expect.objectContaining({ updated: 'EDITED' }));
  });

  it('re-runs identical content after a 5xx error (transient, not deterministic)', () => {
    renderEditor();

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);

    act(() => {
      mockMutationHandlers.onError?.({ status: 503 });
    });

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(2);
    expect(mockMutate).toHaveBeenLastCalledWith(expect.objectContaining({ updated: 'EDITED' }));
  });

  it('re-runs identical content after an error with no status (network blip)', () => {
    renderEditor();

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(1);

    act(() => {
      mockMutationHandlers.onError?.(new Error('Network Error'));
    });

    fireEdit('EDITED');
    expect(mockMutate).toHaveBeenCalledTimes(2);
  });
});
