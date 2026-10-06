// Route guard: must be signed in, must have changed a temporary password, and must hold the permission.
// (The server checks every request again - this only keeps people out of screens they cannot use.)
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';

export default function ProtectedRoute({ perm, children }) {
  const { user, can } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.mustChangePassword && loc.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  const ok = !perm || (Array.isArray(perm) ? perm.some(can) : can(perm));
  if (!ok) {
    return (
      <div className="panel"><div className="empty">
        <h2 style={{ marginBottom: 6 }}>No access</h2>
        Your role does not include this page. Use the menu to open the pages available to you.
      </div></div>
    );
  }
  return children;
}
