import { renderHook, act } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import React from 'react';
import type { TAttachment } from 'librechat-data-provider';
import { useUIResources } from '../useUIResources';
import { Tools } from 'librechat-data-provider';
import type { UIResource } from '~/common';

// Mock data
const mockUIResource1: UIResource = {
  uri: 'resource1',
  mimeType: 'text/html',
  text: 'Resource 1 content',
};

const mockUIResource2: UIResource = {
  uri: 'resource2',
  mimeType: 'text/html',
  text: 'Resource 2 content',
};

const mockUIResource3: UIResource = {
  uri: 'resource3',
  mimeType: 'application/json',
  text: 'Resource 3 content',
};

const mockAttachmentWithUIResources: TAttachment = {
  type: Tools.ui_resources,
  [Tools.ui_resources]: [mockUIResource1, mockUIResource2],
};

const mockAttachmentWithMultipleUIResources: TAttachment = {
  type: Tools.ui_resources,
  [Tools.ui_resources]: [mockUIResource3],
};

const mockAttachmentNonUIResource: TAttachment = {
  type: 'other' as any,
  content: 'Some other content',
};

// Wrapper component for Recoil
const RecoilWrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

describe('useUIResources', () => {
  it('initializes with empty state', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    expect(result.current.uiResources).toBeNull();
  });

  it('stores UI resources from attachments correctly', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    act(() => {
      result.current.storeUIResourcesFromAttachments([mockAttachmentWithUIResources]);
    });

    expect(result.current.uiResources).toEqual({
      resource1: mockUIResource1,
      resource2: mockUIResource2,
    });
  });

  it('filters out non-UI resource attachments', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    act(() => {
      result.current.storeUIResourcesFromAttachments([
        mockAttachmentWithUIResources,
        mockAttachmentNonUIResource,
      ]);
    });

    expect(result.current.uiResources).toEqual({
      resource1: mockUIResource1,
      resource2: mockUIResource2,
    });
  });

  it('handles multiple attachments with UI resources', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    act(() => {
      result.current.storeUIResourcesFromAttachments([
        mockAttachmentWithUIResources,
        mockAttachmentWithMultipleUIResources,
      ]);
    });

    expect(result.current.uiResources).toEqual({
      resource1: mockUIResource1,
      resource2: mockUIResource2,
      resource3: mockUIResource3,
    });
  });

  it('appends new UI resources to existing state', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    // First, store some UI resources
    act(() => {
      result.current.storeUIResourcesFromAttachments([mockAttachmentWithUIResources]);
    });

    expect(result.current.uiResources).toEqual({
      resource1: mockUIResource1,
      resource2: mockUIResource2,
    });

    // Then, add more UI resources
    act(() => {
      result.current.storeUIResourcesFromAttachments([mockAttachmentWithMultipleUIResources]);
    });

    expect(result.current.uiResources).toEqual({
      resource1: mockUIResource1,
      resource2: mockUIResource2,
      resource3: mockUIResource3,
    });
  });

  it('overwrites UI resources with same URI', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    const updatedResource1: UIResource = {
      uri: 'resource1',
      mimeType: 'text/plain',
      text: 'Updated Resource 1 content',
    };

    const attachmentWithUpdatedResource: TAttachment = {
      type: Tools.ui_resources,
      [Tools.ui_resources]: [updatedResource1],
    };

    // First, store original UI resources
    act(() => {
      result.current.storeUIResourcesFromAttachments([mockAttachmentWithUIResources]);
    });

    // Then, update with same URI
    act(() => {
      result.current.storeUIResourcesFromAttachments([attachmentWithUpdatedResource]);
    });

    expect(result.current.uiResources).toEqual({
      resource1: updatedResource1, // Should be updated
      resource2: mockUIResource2, // Should remain unchanged
    });
  });

  it('handles undefined attachments gracefully', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    act(() => {
      result.current.storeUIResourcesFromAttachments(undefined);
    });

    expect(result.current.uiResources).toBeNull();
  });

  it('handles empty attachments array', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    act(() => {
      result.current.storeUIResourcesFromAttachments([]);
    });

    expect(result.current.uiResources).toBeNull();
  });

  it('handles attachments with no UI resources', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    act(() => {
      result.current.storeUIResourcesFromAttachments([mockAttachmentNonUIResource]);
    });

    expect(result.current.uiResources).toBeNull();
  });

  it('handles UI resources with missing URI', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    const resourceWithoutURI: UIResource = {
      uri: '',
      mimeType: 'text/html',
      text: 'Resource without URI',
    };

    const attachmentWithInvalidResource: TAttachment = {
      type: Tools.ui_resources,
      [Tools.ui_resources]: [mockUIResource1, resourceWithoutURI, mockUIResource2],
    };

    act(() => {
      result.current.storeUIResourcesFromAttachments([attachmentWithInvalidResource]);
    });

    // Should only store resources with valid URIs
    expect(result.current.uiResources).toEqual({
      resource1: mockUIResource1,
      resource2: mockUIResource2,
    });
  });

  it('retrieves UI resource by ID correctly', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    act(() => {
      result.current.storeUIResourcesFromAttachments([mockAttachmentWithUIResources]);
    });

    const resource = result.current.getUIResourceById('resource1');
    expect(resource).toEqual(mockUIResource1);
  });

  it('returns undefined for non-existent resource ID', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    act(() => {
      result.current.storeUIResourcesFromAttachments([mockAttachmentWithUIResources]);
    });

    const resource = result.current.getUIResourceById('non-existent');
    expect(resource).toBeUndefined();
  });

  it('returns undefined when getting resource from empty state', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    const resource = result.current.getUIResourceById('resource1');
    expect(resource).toBeUndefined();
  });

  it('clears UI resources correctly', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    // First, store some UI resources
    act(() => {
      result.current.storeUIResourcesFromAttachments([mockAttachmentWithUIResources]);
    });

    expect(result.current.uiResources).toEqual({
      resource1: mockUIResource1,
      resource2: mockUIResource2,
    });

    // Then, clear them
    act(() => {
      result.current.clearUIResources();
    });

    expect(result.current.uiResources).toBeNull();
  });

  it('maintains function referential equality on re-renders', () => {
    const { result, rerender } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    const initialFunctions = {
      storeUIResourcesFromAttachments: result.current.storeUIResourcesFromAttachments,
      getUIResourceById: result.current.getUIResourceById,
      clearUIResources: result.current.clearUIResources,
    };

    rerender();

    // Functions should maintain referential equality due to useCallback
    expect(result.current.storeUIResourcesFromAttachments).toBe(
      initialFunctions.storeUIResourcesFromAttachments,
    );
    expect(result.current.getUIResourceById).toBe(initialFunctions.getUIResourceById);
    expect(result.current.clearUIResources).toBe(initialFunctions.clearUIResources);
  });

  it('updates getUIResourceById when state changes', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    // Initially no resource
    expect(result.current.getUIResourceById('resource1')).toBeUndefined();

    // Add resource
    act(() => {
      result.current.storeUIResourcesFromAttachments([mockAttachmentWithUIResources]);
    });

    // Now resource should be available
    expect(result.current.getUIResourceById('resource1')).toEqual(mockUIResource1);

    // Clear resources
    act(() => {
      result.current.clearUIResources();
    });

    // Resource should no longer be available
    expect(result.current.getUIResourceById('resource1')).toBeUndefined();
  });

  it('handles complex nested UI resources structure', () => {
    const { result } = renderHook(() => useUIResources(), {
      wrapper: RecoilWrapper,
    });

    // Create an attachment with nested array structure
    const complexAttachment: TAttachment = {
      type: Tools.ui_resources,
      [Tools.ui_resources]: [mockUIResource1, mockUIResource2, mockUIResource3],
    };

    act(() => {
      result.current.storeUIResourcesFromAttachments([complexAttachment]);
    });

    expect(result.current.uiResources).toEqual({
      resource1: mockUIResource1,
      resource2: mockUIResource2,
      resource3: mockUIResource3,
    });

    // Verify all resources are accessible
    expect(result.current.getUIResourceById('resource1')).toEqual(mockUIResource1);
    expect(result.current.getUIResourceById('resource2')).toEqual(mockUIResource2);
    expect(result.current.getUIResourceById('resource3')).toEqual(mockUIResource3);
  });
});
