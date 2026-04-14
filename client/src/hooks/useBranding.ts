interface BrandingConfig {
  appName: string;
  appSubtitle: string;
  logoPath: string;
  logoAlt: string;
  welcomeHeading: string;
}

const defaultBranding: BrandingConfig = {
  appName: 'AreebGPT',
  appSubtitle: 'By Areeb Technology',
  logoPath: '/assets/areeb-logo.png',
  logoAlt: 'AreebGPT Logo',
  welcomeHeading: 'Welcome back',
};

export default function useBranding(): BrandingConfig {
  return defaultBranding;
}
