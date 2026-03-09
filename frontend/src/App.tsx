import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';
import ProtectedRoute from './components/ProtectedRoute';

import Landing from './pages/public/Landing';
import Legal from './pages/public/Legal';
import Privacy from './pages/public/Privacy';
import Terms from './pages/public/Terms';
import FixMyNightProduct from './pages/public/FixMyNightProduct';
import SmsProgram from './pages/public/SmsProgram';
import Contact from './pages/public/Contact';
import CaseEvaluation from './pages/public/CaseEvaluation';

import AdminLogin from './pages/admin/AdminLogin';
import AdminForgotPassword from './pages/admin/AdminForgotPassword';
import AdminResetPassword from './pages/admin/AdminResetPassword';
import AdminDashboard from './pages/admin/AdminDashboard';
import ClientList from './pages/admin/ClientList';
import ClientNew from './pages/admin/ClientNew';
import ClientDetail from './pages/admin/ClientDetail';

import PortalEntry from './pages/portal/PortalEntry';
import PortalSetup from './pages/portal/PortalSetup';
import PortalForgotPassword from './pages/portal/PortalForgotPassword';
import PortalLogin from './pages/portal/PortalLogin';
import PortalDashboard from './pages/portal/PortalDashboard';
import PortalCalls from './pages/portal/PortalCalls';
import PortalSettings from './pages/portal/PortalSettings';
import PortalTeam from './pages/portal/PortalTeam';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page — standalone V0 layout */}
        <Route path="/" element={<Landing />} />

        {/* Public pages with shared nav/footer layout */}
        <Route element={<PublicLayout />}>
          <Route path="/legal" element={<Legal />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/case-evaluation" element={<CaseEvaluation />} />
        </Route>

        {/* FixMyNight product page — standalone layout */}
        <Route path="/fixmynight" element={<FixMyNightProduct />} />

        {/* SMS program page — standalone dark layout for A2P compliance */}
        <Route path="/sms" element={<SmsProgram />} />

        {/* Admin auth */}
        <Route path="/fixmynight/admin" element={<AdminLogin />} />
        <Route path="/fixmynight/admin/forgot-password" element={<AdminForgotPassword />} />
        <Route path="/fixmynight/admin/reset-password" element={<AdminResetPassword />} />

        {/* Admin protected routes */}
        <Route
          element={
            <ProtectedRoute role="admin">
              <Layout variant="admin" />
            </ProtectedRoute>
          }
        >
          <Route path="/fixmynight/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/fixmynight/admin/clients" element={<ClientList />} />
          <Route path="/fixmynight/admin/clients/new" element={<ClientNew />} />
          <Route path="/fixmynight/admin/clients/:id" element={<ClientDetail />} />
        </Route>

        {/* Portal auth */}
        <Route path="/fixmynight/portal" element={<PortalEntry />} />
        <Route path="/fixmynight/portal/setup" element={<PortalSetup />} />
        <Route path="/fixmynight/portal/forgot-password" element={<PortalForgotPassword />} />
        <Route path="/fixmynight/portal/:clientId" element={<PortalLogin />} />

        {/* Portal protected routes */}
        <Route
          element={
            <ProtectedRoute role="portal">
              <Layout variant="portal" />
            </ProtectedRoute>
          }
        >
          <Route path="/fixmynight/portal/:clientId/dashboard" element={<PortalDashboard />} />
          <Route path="/fixmynight/portal/:clientId/calls" element={<PortalCalls />} />
          <Route path="/fixmynight/portal/:clientId/settings" element={<PortalSettings />} />
          <Route path="/fixmynight/portal/:clientId/team" element={<PortalTeam />} />
        </Route>

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
