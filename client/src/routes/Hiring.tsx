import { Navigate } from 'react-router-dom';
import HiringLayout from './Layouts/HiringLayout';
import RouteErrorBoundary from './RouteErrorBoundary';
import TeamPage from '~/pages/Hiring/TeamPage';
import TasksPage from '~/pages/Hiring/TasksPage';
import CandidateDetailPage from '~/pages/Hiring/CandidateDetailPage';

const hiringRoutes = {
  path: 'hiring',
  element: <HiringLayout />,
  errorElement: <RouteErrorBoundary />,
  children: [
    {
      index: true,
      element: <Navigate to="/hiring/team" replace />,
    },
    {
      path: 'team',
      element: <TeamPage />,
    },
    {
      path: 'team/:id',
      element: <CandidateDetailPage />,
    },
    {
      path: 'tasks',
      element: <TasksPage />,
    },
  ],
};

export default hiringRoutes;
