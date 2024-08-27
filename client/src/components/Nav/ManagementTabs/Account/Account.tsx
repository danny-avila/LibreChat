
import { cn } from '~/utils/';
import { useMediaQuery } from '~/hooks';

export default function Account() {
  const isSmallScreen = useMediaQuery('(max-width: 767px)');

  console.log('account');
  return (
    <div>
      用户管理页面
    </div>
  );
}
