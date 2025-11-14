import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import {
  Login,
  VerifyEmail,
  Registration,
  ResetPassword,
  ApiErrorWatcher,
  TwoFactorScreen,
  RequestPasswordReset,
} from '~/components/Auth';
import { MarketplaceProvider } from '~/components/Agents/MarketplaceContext';
import AgentMarketplace from '~/components/Agents/Marketplace';
import { OAuthSuccess, OAuthError } from '~/components/OAuth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import RouteErrorBoundary from './RouteErrorBoundary';
import StartupLayout from './Layouts/Startup';
import LoginLayout from './Layouts/Login';
import StaticFilesLayout from './Layouts/StaticFiles'
import dashboardRoutes from './Dashboard';
import ShareRoute from './ShareRoute';
import ChatRoute from './ChatRoute';
import Search from './Search';
import Root from './Root';
import { HelpAndFAQ, PrivacyPolicy, TermsAndServices, Plans, Landing } from '~/components/Static';
import SubscriptionSuccess from '~/components/Subscription/Success';
import SubscriptionCancel from '~/components/Subscription/Cancel';
import Subscription from '~/components/Nav/SettingsTabs/Account/Subscription';
import Product from '~/components/Nav/SettingsTabs/Account/Product';
import ProductSuccess from '~/components/Product/Success'
import ProducCancel from '~/components/Product/Cancel'

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);

const baseEl = document.querySelector('base');
const baseHref = baseEl?.getAttribute('href') || '/';

export const router = createBrowserRouter(
  [
    {
      path: 'share/:shareId',
      element: <ShareRoute />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'oauth',
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'success',
          element: <OAuthSuccess />,
        },
        {
          path: 'error',
          element: <OAuthError />,
        },
      ],
    },
    {
      path: '/',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'register',
          element: <Registration />,
        },
        {
          path: 'forgot-password',
          element: <RequestPasswordReset />,
        },
        {
          path: 'reset-password',
          element: <ResetPassword />,
        },
      ],
    },
    {
      path: 'verify',
      element: <VerifyEmail />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'faq',
      element: <StaticFilesLayout />,
      children: [
        { path: '', element:  <HelpAndFAQ /> },
      ],
      errorElement: <RouteErrorBoundary />,
    },    
    {
      path: 'privacy',
      element: <StaticFilesLayout />,
      children: [
        { path: '', element:  <PrivacyPolicy /> },
      ],
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'terms',
      element: <StaticFilesLayout />,
      children: [
        { path: '', element:  <TermsAndServices /> },
      ],
      errorElement: <RouteErrorBoundary />,
    },    
    {
      path: 'landing',
      element: <StaticFilesLayout />,
      children: [
        { path: '', element:  <Landing /> },
      ],
      errorElement: <RouteErrorBoundary />,
    },   
    {
      path: 'plans',
      element: <StaticFilesLayout />,
      children: [
        { path: '', element:  <Plans /> },
      ],
      errorElement: <RouteErrorBoundary />,
    },           
    {
      element: <AuthLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: '/',
          element: <LoginLayout />,
          children: [
            {
              path: 'login',
              element: <Login />,
            },
            {
              path: 'login/2fa',
              element: <TwoFactorScreen />,
            },
          ],
        },
        dashboardRoutes,
        {
          path: '/',
          element: <Root />,
          children: [
            {
              index: true,
              element: <Navigate to="/c/new" replace={true} />,
            },
            {
              path: 'c/:conversationId?',
              element: <ChatRoute />,
            },
            {
              path: 'search',
              element: <Search />,
            },
            {
              path: 'agents',
              element: (
                <MarketplaceProvider>
                  <AgentMarketplace />
                </MarketplaceProvider>
              ),
            },
            {
              path: 'agents/:category',
              element: (
                <MarketplaceProvider>
                  <AgentMarketplace />
                </MarketplaceProvider>
              ),
            },
            {
              path: 'plans',
              element: <Plans />,
            },
            {
              path: 'product',
              element: <Product />,
            },            
            {
              path: 'account/product/success',
              element: <ProductSuccess />,
            },
            {
              path: 'account/product/canceled',
              element: <ProducCancel />,
            },            
            {
              path: 'account/subscription',
              element: <Subscription />,
            },
            {
              path: 'account/subscription/success',
              element: <SubscriptionSuccess />,
            },
            {
              path: 'account/subscription/canceled',
              element: <SubscriptionCancel />,
            },
          ],
        },
      ],
    },
  ],
  { basename: baseHref },
);
