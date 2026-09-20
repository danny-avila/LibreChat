import { I18nextProvider } from 'react-i18next';
import type { TStartupConfig } from 'librechat-data-provider';
import * as endpointQueries from '~/data-provider/Endpoints/queries';
import * as miscDataProvider from '~/data-provider/Misc/queries';
import { render, screen } from 'test/layout-test-utils';
import AuthLayout from '~/components/Auth/AuthLayout';
import i18n from '~/locales/i18n';

/**
 * The auth layout decides where the consent is stated, and a screen that states
 * it does not also carry the footer bar linking the same two policies. An
 * account is created by the registration form and by a first sign-in through a
 * provider button, so the login screen states it too whenever those buttons are
 * there.
 *
 * `test/setupTests.js` stubs `initReactI18next`, so nothing binds the app's
 * i18next instance to react-i18next the way `locales/i18n` does at runtime;
 * `Trans` reads it from the provider below instead.
 */

const PRIVACY_URL = 'https://example.com/privacy';
const TERMS_URL = 'https://example.com/terms';

const policies = {
  privacyPolicy: { externalUrl: PRIVACY_URL },
  termsOfService: { externalUrl: TERMS_URL },
};

type Options = {
  pathname?: string;
  socialLoginEnabled?: boolean;
  ldapEnabled?: boolean;
  /** What `socialLogins` lists, and whether the listed provider's own flag is
   *  set: a button needs both, not just the global switch. */
  providers?: string[];
  googleLoginEnabled?: boolean;
  /** Partial on purpose: a fixture sets the policies under test, and the field
   *  names are still checked against the real interface config. */
  interfaceConfig?: Partial<NonNullable<TStartupConfig['interface']>>;
};

function setup({
  pathname = 'register',
  socialLoginEnabled = false,
  ldapEnabled = false,
  providers,
  googleLoginEnabled,
  interfaceConfig,
}: Options) {
  const startupConfig = {
    appTitle: 'LibreChat',
    ldap: { enabled: ldapEnabled },
    socialLoginEnabled,
    socialLogins: providers ?? (socialLoginEnabled ? ['google'] : []),
    googleLoginEnabled: googleLoginEnabled ?? socialLoginEnabled,
    serverDomain: 'mock-server',
    interface: interfaceConfig,
  } as unknown as TStartupConfig;

  jest
    .spyOn(endpointQueries, 'useGetStartupConfig')
    //@ts-ignore - the layout reads only the resolved data
    .mockReturnValue({ data: startupConfig, isFetching: false, isError: false });
  jest
    .spyOn(miscDataProvider, 'useGetBannerQuery')
    //@ts-ignore - the banner is not under test
    .mockReturnValue({ data: null, isLoading: false, isError: false });

  return render(
    <I18nextProvider i18n={i18n}>
      <AuthLayout
        startupConfig={startupConfig}
        isFetching={false}
        error={null}
        startupConfigError={null}
        header={'Create your account'}
        pathname={pathname}
      >
        <form aria-label="Registration form" />
      </AuthLayout>
    </I18nextProvider>,
  );
}

const consent = () => screen.queryByText(/By continuing/i);
const footerBar = () => document.querySelector('[role="contentinfo"]');

describe('AuthLayout legal placement', () => {
  /** The registration form states the consent itself, under its own submit
   *  button (Registration.spec covers that); the layout's part is dropping the
   *  footer bar so the same two policies are not linked twice. */
  test('registration drops the footer bar the consent replaces', () => {
    setup({ pathname: 'register', interfaceConfig: policies });

    expect(footerBar()).toBeNull();
    expect(consent()).not.toBeInTheDocument();
  });

  test('the login screen states it when a provider button can create the account', () => {
    setup({ pathname: 'login', socialLoginEnabled: true, interfaceConfig: policies });

    expect(consent()).toBeInTheDocument();
    expect(document.querySelectorAll(`a[href="${PRIVACY_URL}"]`)).toHaveLength(1);
    expect(document.querySelectorAll(`a[href="${TERMS_URL}"]`)).toHaveLength(1);
    expect(footerBar()).toBeNull();
  });

  test('a login screen that creates no accounts keeps the footer bar', () => {
    setup({ pathname: 'login', socialLoginEnabled: false, interfaceConfig: policies });

    expect(consent()).not.toBeInTheDocument();
    expect(footerBar()).not.toBeNull();
  });

  /** `socialLoginEnabled` is only the global switch: a button also needs its
   *  provider listed and that provider's own flag, so the switch alone is not
   *  an account this screen can create. */
  test('the global social switch alone does not make a login screen account-creating', () => {
    setup({
      pathname: 'login',
      socialLoginEnabled: true,
      providers: [],
      interfaceConfig: policies,
    });

    expect(consent()).not.toBeInTheDocument();
    expect(footerBar()).not.toBeNull();
  });

  test('a provider listed but not enabled is not a button either', () => {
    setup({
      pathname: 'login',
      socialLoginEnabled: true,
      providers: ['google'],
      googleLoginEnabled: false,
      interfaceConfig: policies,
    });

    expect(consent()).not.toBeInTheDocument();
    expect(footerBar()).not.toBeNull();
  });

  /** LDAP has no button of its own: a first sign-in through the ordinary login
   *  form creates the account (api/strategies/ldapStrategy.js). */
  test('an LDAP login screen states it without any provider button', () => {
    setup({ pathname: 'login', ldapEnabled: true, interfaceConfig: policies });

    expect(consent()).toBeInTheDocument();
    expect(footerBar()).toBeNull();
  });

  test('the second factor is not where an account is created', () => {
    setup({ pathname: 'login/2fa', socialLoginEnabled: true, interfaceConfig: policies });

    expect(consent()).not.toBeInTheDocument();
  });

  test('a deployment with no policies keeps the footer bar it always had', () => {
    setup({ pathname: 'register', interfaceConfig: undefined });

    expect(consent()).not.toBeInTheDocument();
    expect(footerBar()).not.toBeNull();
  });
});
