import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './services/AuthContext';
import { ToastProvider } from './components/UI';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import Appointments from './pages/Appointments';
import { NewConsultation, RecordsList, RecordView } from './pages/MedicalRecords';
import Prescriptions from './pages/Prescriptions';
import Laboratory from './pages/Laboratory';
import Medicines from './pages/Medicines';
import Billing from './pages/Billing';
import Reports from './pages/Reports';
import Users from './pages/Users';
import DoctorsStaff from './pages/DoctorsStaff';
import AuditLog from './pages/AuditLog';
import Backups from './pages/Backups';
import Sms from './pages/Sms';
import Vitals from './pages/Vitals';
import { MyAppointments, MyBills, MyLab, MyProfile, MyRecords, PortalHome } from './pages/Portal';

const P = (perm, el) => <ProtectedRoute perm={perm}>{el}</ProtectedRoute>;

// Each person lands on the dashboard that fits their role; patients get the patient portal.
function Home() {
  const { user } = useAuth();
  return user.role === 'patient' ? <PortalHome /> : <Dashboard />;
}

function AppRoutes() {
  const { loading, user } = useAuth();
  if (loading) return <div className="auth"><p className="muted">Loading…</p></div>;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
      <Route path="/change-password" element={user ? <ChangePassword forced /> : <Navigate to="/login" replace />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Home />} />
        <Route path="my/appointments" element={P('portal:self', <MyAppointments />)} />
        <Route path="my/records" element={P('portal:self', <MyRecords />)} />
        <Route path="my/lab" element={P('portal:self', <MyLab />)} />
        <Route path="my/bills" element={P('portal:self', <MyBills />)} />
        <Route path="my/profile" element={P('portal:self', <MyProfile />)} />
        <Route path="vitals" element={P('vitals:write', <Vitals />)} />
        <Route path="patients" element={P('patients:read', <Patients />)} />
        <Route path="patients/:id" element={P('patients:read', <PatientDetail />)} />
        <Route path="appointments" element={P('appointments:read', <Appointments />)} />
        <Route path="records" element={P('records:read', <RecordsList />)} />
        <Route path="records/new" element={P('records:write', <NewConsultation />)} />
        <Route path="records/:id" element={P('records:read', <RecordView />)} />
        <Route path="prescriptions" element={P('prescriptions:read', <Prescriptions />)} />
        <Route path="lab" element={P('lab:read', <Laboratory />)} />
        <Route path="medicines" element={P('medicines:write', <Medicines />)} />
        <Route path="billing" element={P('billing:read', <Billing />)} />
        <Route path="reports" element={P(['reports:read', 'reports:revenue'], <Reports />)} />
        <Route path="users" element={P('users:manage', <Users />)} />
        <Route path="staff" element={P('staff:manage', <DoctorsStaff />)} />
        <Route path="audit" element={P('audit:read', <AuditLog />)} />
        <Route path="backups" element={P('backup:manage', <Backups />)} />
        <Route path="sms" element={P('sms:manage', <Sms />)} />
        <Route path="account" element={<ChangePassword />} />
        <Route path="*" element={<div className="panel"><div className="empty">Page not found.</div></div>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
