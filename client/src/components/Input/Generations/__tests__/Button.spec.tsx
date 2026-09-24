/* eslint-disable i18next/no-literal-string */
import { RecoilRoot } from 'recoil';
import { render, fireEvent } from '@testing-library/react';
import enTranslation from '~/locales/en/translation.json';
import Button from '../Button';

const renderWithRecoil = (ui: React.ReactElement) => render(<RecoilRoot>{ui}</RecoilRoot>);

describe('Button', () => {
  it('renders with the correct type and children', () => {
    const { getByTestId, getByText } = renderWithRecoil(
      <Button
        type="regenerate"
        onClick={() => {
          ('');
        }}
      >
        {enTranslation.com_ui_regenerate}
      </Button>,
    );
    expect(getByTestId('regenerate-generation-button')).toBeInTheDocument();
    expect(getByText(enTranslation.com_ui_regenerate)).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    const { getByText } = renderWithRecoil(
      <Button type="continue" onClick={handleClick}>
        {enTranslation.com_ui_continue}
      </Button>,
    );
    fireEvent.click(getByText(enTranslation.com_ui_continue));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
