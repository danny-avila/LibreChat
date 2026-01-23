import { useContext } from 'react';
import { ThemeContext } from '@librechat/client';

interface ClickHouseIconProps {
  className?: string;
  alt?: string;
}

export default function ClickHouseIcon({ className, alt = 'ClickHouse' }: ClickHouseIconProps) {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === 'dark';

  return (
    <img
      src={isDark ? '/assets/clickhouse-dark.svg' : '/assets/clickhouse-light.svg'}
      className={className}
      alt={alt}
    />
  );
}
