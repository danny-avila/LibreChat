import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/extend-expect';
import type { MCPCustomUserVarValue } from 'librechat-data-provider';
import CustomUserVarSelect from '../CustomUserVarSelect';

interface HarnessProps {
  values: MCPCustomUserVarValue[];
  multiple?: boolean;
  initialValue?: string;
  onChange?: (value: string) => void;
}

const labelText = 'Region';

function Harness({ values, multiple, initialValue = '', onChange }: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <>
      <span id="region-label">{labelText}</span>
      <CustomUserVarSelect
        id="region"
        labelId="region-label"
        values={values}
        multiple={multiple}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        placeholder="Select Region"
      />
    </>
  );
}

describe('CustomUserVarSelect', () => {
  it('shows the placeholder until a value is selected', () => {
    render(<Harness values={['eu-west-1', 'us-east-1']} />);
    expect(screen.getByLabelText('Region')).toHaveTextContent('Select Region');
  });

  it('selects a single value and reports it unchanged', async () => {
    const onChange = jest.fn();
    render(<Harness values={['eu-west-1', 'us-east-1']} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Region'));
    await userEvent.click(await screen.findByText('us-east-1'));

    expect(onChange).toHaveBeenCalledWith('us-east-1');
    expect(screen.getByLabelText('Region')).toHaveTextContent('us-east-1');
  });

  it('displays the label of an object value while storing its value', async () => {
    const onChange = jest.fn();
    render(
      <Harness
        values={['eu-west-1', { value: 'us-east-1', label: 'US East (N. Virginia)' }]}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByLabelText('Region'));
    await userEvent.click(await screen.findByText('US East (N. Virginia)'));

    expect(onChange).toHaveBeenCalledWith('us-east-1');
    expect(screen.getByLabelText('Region')).toHaveTextContent('US East (N. Virginia)');
  });

  it('preselects an existing single value', () => {
    render(<Harness values={['eu-west-1', 'us-east-1']} initialValue="eu-west-1" />);
    expect(screen.getByLabelText('Region')).toHaveTextContent('eu-west-1');
  });

  it('joins several selections with a comma when multiple is set', async () => {
    const onChange = jest.fn();
    render(<Harness values={['read', 'write', 'admin']} multiple onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Region'));
    await userEvent.click(await screen.findByText('read'));
    await userEvent.click(await screen.findByText('write'));

    expect(onChange).toHaveBeenLastCalledWith('read,write');
    expect(screen.getByLabelText('Region')).toHaveTextContent('read, write');
  });

  it('preselects every stored selection of a multiple field', () => {
    render(<Harness values={['read', 'write', 'admin']} multiple initialValue="read,admin" />);
    expect(screen.getByLabelText('Region')).toHaveTextContent('read, admin');
  });
});
