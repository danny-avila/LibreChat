import 'test/matchMedia.mock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PluginPagination from '../PluginPagination';

describe('PluginPagination', () => {
  const onChangePage = jest.fn();

  beforeEach(() => {
    onChangePage.mockClear();
  });

  it('should render the previous button as enabled when not on the first page', () => {
    render(<PluginPagination currentPage={2} maxPage={5} onChangePage={onChangePage} />);
    const prevButton = screen.getByRole('button', { name: /prev/i });
    expect(prevButton).toBeEnabled();
  });

  it('should call onChangePage with the previous page number when the previous button is clicked', async () => {
    render(<PluginPagination currentPage={2} maxPage={5} onChangePage={onChangePage} />);
    const prevButton = screen.getByRole('button', { name: /prev/i });
    await userEvent.click(prevButton);
    expect(onChangePage).toHaveBeenCalledWith(1);
  });

  it('should call onChangePage with the next page number when the next button is clicked', async () => {
    render(<PluginPagination currentPage={2} maxPage={5} onChangePage={onChangePage} />);
    const nextButton = screen.getByRole('button', { name: /next/i });
    await userEvent.click(nextButton);
    expect(onChangePage).toHaveBeenCalledWith(3);
  });

  it('should render the page numbers', () => {
    render(<PluginPagination currentPage={2} maxPage={5} onChangePage={onChangePage} />);
    const pageNumbers = screen.getAllByRole('button', { name: /\d+/ });
    expect(pageNumbers).toHaveLength(5);
    expect(pageNumbers[0]).toHaveTextContent('1');
    expect(pageNumbers[1]).toHaveTextContent('2');
    expect(pageNumbers[2]).toHaveTextContent('3');
    expect(pageNumbers[3]).toHaveTextContent('4');
    expect(pageNumbers[4]).toHaveTextContent('5');
  });

  it('should call onChangePage with the correct page number when a page number button is clicked', async () => {
    render(<PluginPagination currentPage={2} maxPage={5} onChangePage={onChangePage} />);
    const pageNumbers = screen.getAllByRole('button', { name: /\d+/ });
    await userEvent.click(pageNumbers[3]);
    expect(onChangePage).toHaveBeenCalledWith(4);
  });
});
