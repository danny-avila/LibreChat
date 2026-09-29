import { render, screen } from '@testing-library/react';
import PrismWordmark from '../PrismWordmark';

/**
 * 워드마크는 사이드바·헤더에서 같은 표기여야 하고, 그라디언트 때문에 `Prism`
 * 이 별도 span 으로 쪼개져 있다. 스크린리더가 "BKL" 과 "Prism" 을 따로 읽지
 * 않도록 aria-label 로 한 덩어리를 만들어 둔 상태라, 그 구조가 깨지면
 * 접근성만 조용히 나빠지고 화면상으로는 티가 안 난다.
 */
describe('PrismWordmark', () => {
  it('보조기술에는 "BKL Prism" 한 덩어리로 노출된다', () => {
    render(<PrismWordmark />);
    expect(screen.getByLabelText('BKL Prism')).toBeInTheDocument();
  });

  it('화면에는 BKL 과 Prism 이 이어져 보인다', () => {
    const { container } = render(<PrismWordmark />);
    expect(container.textContent).toBe('BKL Prism');
  });

  it('Prism 에만 스펙트럼 그라디언트가 붙는다', () => {
    const { container } = render(<PrismWordmark />);
    const gradient = container.querySelector('.prism-spectrum-text');
    expect(gradient?.textContent).toBe('Prism');
    // BKL 까지 색이 먹으면 브랜드 정의(BKL=본문색)와 어긋난다.
    expect(container.textContent?.startsWith('BKL ')).toBe(true);
  });

  it('전달한 className 을 유지한다 — 사이드바가 truncate 를 얹는다', () => {
    render(<PrismWordmark className="truncate" />);
    expect(screen.getByLabelText('BKL Prism')).toHaveClass('truncate');
  });
});
