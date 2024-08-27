
import { cn } from '~/utils/';
import { useMediaQuery } from '~/hooks';

export default function Balance() {
  const isSmallScreen = useMediaQuery('(max-width: 767px)');

  console.log('balance');

  return (
    <div>
      余额管理页面
    </div>
  );
}
