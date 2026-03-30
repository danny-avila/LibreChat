import { Navigate } from 'react-router-dom';
import DashboardRoute from './Layouts/Dashboard';

const dashboardRoutes = {
  path: 'd/*',
  element: <DashboardRoute />,
  children: [
    {
      path: 'prompts/*',
      element: <Navigate to="/prompts/new" replace={true} />,
    },
    {
      path: '*',
      element: <Navigate to="/c/new" replace={true} />,
    },
  ],
};

export default dashboardRoutes;
