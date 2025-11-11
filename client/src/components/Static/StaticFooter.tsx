import { useMemo, useEffect, memo } from 'react';
import { getConfigDefaults } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';

interface StaticFooterProps {

}

const defaultInterface = getConfigDefaults().interface;

const StaticFooter = memo(
  ({

  }: StaticFooter) => {
    const { data: startupConfig } = useGetStartupConfig();
    const interfaceConfig = useMemo(
      () => startupConfig?.interface ?? defaultInterface,
      [startupConfig],
    );

    useEffect(() => {

    }, []);

    return (
    <footer>
      © 2025 DeclaRAY. All rights reserved. | Clarity for Condo Communities.
    </footer>          
    );
  },
);

StaticFooter.displayName = 'StaticFooter';

export default StaticFooter;
