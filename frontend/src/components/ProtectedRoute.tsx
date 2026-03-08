import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store';
import { ROUTES } from '../routes';

interface Props {
  role: 'admin' | 'portal';
  children: React.ReactNode;
}

export default function ProtectedRoute({ role, children }: Props) {
  const { token, role: currentRole, clientId } = useAuthStore();

  if (!token || currentRole !== role) {
    if (role === 'admin') {
      return <Navigate to={ROUTES.ADMIN_LOGIN} replace />;
    }
    return <Navigate to={ROUTES.PORTAL_LOGIN(clientId || '')} replace />;
  }

  return <>{children}</>;
}
