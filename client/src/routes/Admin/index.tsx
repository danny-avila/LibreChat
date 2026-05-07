import { Navigate } from 'react-router-dom';
import AdminRoute from '../Layouts/Admin';
import Overview from './Overview';
import Users from './Users';
import UserDetail from './UserDetail';
import Subscriptions from './Subscriptions';
import Usage from './Usage';
import Messages from './Messages';
import Audit from './Audit';

const adminRoutes = {
  path: 'admin/*',
  element: <AdminRoute />,
  children: [
    { index: true, element: <Navigate to="/admin/overview" replace /> },
    { path: 'overview', element: <Overview /> },
    { path: 'users', element: <Users /> },
    { path: 'users/:userId', element: <UserDetail /> },
    { path: 'subscriptions', element: <Subscriptions /> },
    { path: 'subscriptions/:userId', element: <Subscriptions /> },
    { path: 'usage', element: <Usage /> },
    { path: 'usage/users/:userId', element: <Usage /> },
    { path: 'messages', element: <Messages /> },
    { path: 'messages/users/:userId', element: <Messages /> },
    {
      path: 'messages/users/:userId/conversations/:conversationId',
      element: <Messages />,
    },
    { path: 'audit', element: <Audit /> },
    { path: 'audit/:auditId', element: <Audit /> },
    { path: '*', element: <Navigate to="/admin/overview" replace /> },
  ],
};

export default adminRoutes;
