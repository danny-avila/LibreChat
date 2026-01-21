import { Navigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

/**
 * ProtectedAdminRoute - Route wrapper that ensures only admin users can access
 * 
 * This component checks if the authenticated user has admin role.
 * If not, it redirects to the home page.
 * 
 * Requirements: 11.1, 11.2
 */
interface ProtectedAdminRouteProps {
  children: React.ReactNode;
}

export default function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const { user, isAuthenticated } = useAuthContext();

  // Wait for authentication to be determined
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Wait for user data to load
  if (!user) {
    return null; // Show nothing while loading
  }

  // Check if user has admin role
  const isAdmin = user?.role === SystemRoles.ADMIN;
  if (!isAdmin) {
    return <Navigate to="/c/new" replace />;
  }

  // User is authenticated and has admin role, render the protected content
  return <>{children}</>;
}
