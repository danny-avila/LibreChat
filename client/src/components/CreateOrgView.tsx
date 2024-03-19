import { CreateOrganization } from '@clerk/clerk-react';
import { useDarkMode } from '~/hooks/useDarkMode';
import { dark } from '@clerk/themes';

export default function () {
  const isDarkMode = useDarkMode();
  return (
    <div className="grid  h-screen w-screen place-items-center">
      <CreateOrganization
        appearance={{
          baseTheme: isDarkMode ? dark : undefined,
        }}
      />
    </div>
  );
}
