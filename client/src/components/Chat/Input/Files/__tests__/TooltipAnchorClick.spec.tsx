/**
 * TooltipAnchor 가 render 로 넘긴 버튼의 onClick 을 삼키지 않는지 (2026-08-31).
 *
 * 첨부 버튼을 드롭다운에서 "누르면 바로 업로드" 로 바꾸면서 onClick 을
 * TooltipAnchor 의 render prop 안쪽 버튼에 달았다. Ariakit 이 자기 핸들러로
 * 덮어쓰면 클릭이 통째로 죽는데, AttachFileMenu 스펙은 TooltipAnchor 를
 * 모의하므로 그걸 잡지 못한다. 여기서 진짜 컴포넌트로 계약을 고정한다.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipAnchor } from '@librechat/client';

it('render 로 넘긴 버튼의 onClick 이 그대로 호출된다', () => {
  const onClick = jest.fn();
  render(
    <TooltipAnchor
      description="첨부"
      render={<button type="button" aria-label="첨부" onClick={onClick} />}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '첨부' }));

  expect(onClick).toHaveBeenCalledTimes(1);
});

it('disabled 면 클릭이 무시된다', () => {
  const onClick = jest.fn();
  render(
    <TooltipAnchor
      description="첨부"
      disabled
      render={<button type="button" aria-label="첨부" disabled onClick={onClick} />}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '첨부' }));

  expect(onClick).not.toHaveBeenCalled();
});
