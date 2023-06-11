import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import DialogTemplate from './DialogTemplate';
import { Dialog } from '@radix-ui/react-dialog';

describe('DialogTemplate', () => {
  let mockSelectHandler;

  beforeEach(() => {
    mockSelectHandler = jest.fn();
  });

  it('renders correctly with all props', () => {
    const { getByText } = render(
      <Dialog open onOpenChange={() => {}}>
        <DialogTemplate
          title="Test Dialog"
          description="Test Description"
          main={<div>Main Content</div>}
          buttons={<button>Button</button>}
          leftButtons={<button>Left Button</button>}
          selection={{ selectHandler: mockSelectHandler, selectText: "Select" }}
        />
      </Dialog>
    );

    expect(getByText('Test Dialog')).toBeInTheDocument();
    expect(getByText('Test Description')).toBeInTheDocument();
    expect(getByText('Main Content')).toBeInTheDocument();
    expect(getByText('Button')).toBeInTheDocument();
    expect(getByText('Left Button')).toBeInTheDocument();
    expect(getByText('Cancel')).toBeInTheDocument();
    expect(getByText('Select')).toBeInTheDocument();
  });

  it('renders correctly without optional props', () => {
    const { getByText, queryByText } = render(
      <Dialog open onOpenChange={() => {}}>
        <DialogTemplate
          title="Test Dialog"
        />
      </Dialog>
    );

    expect(getByText('Test Dialog')).toBeInTheDocument();
    expect(queryByText('Test Description')).not.toBeInTheDocument();
    expect(queryByText('Main Content')).not.toBeInTheDocument();
    expect(queryByText('Button')).not.toBeInTheDocument();
    expect(queryByText('Left Button')).not.toBeInTheDocument();
    expect(getByText('Cancel')).toBeInTheDocument();
    expect(queryByText('Select')).not.toBeInTheDocument();
  });

  it('calls selectHandler when the select button is clicked', () => {
    const { getByText } = render(
      <Dialog open onOpenChange={() => {}}>
        <DialogTemplate
          title="Test Dialog"
          selection={{ selectHandler: mockSelectHandler, selectText: "Select" }}
        />
      </Dialog>
    );

    fireEvent.click(getByText('Select'));

    expect(mockSelectHandler).toHaveBeenCalled();
  });
});
