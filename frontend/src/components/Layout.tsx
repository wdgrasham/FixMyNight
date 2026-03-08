import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';
import { ROUTES } from '../routes';

interface Props {
  variant: 'admin' | 'portal';
}

export default function Layout({ variant }: Props) {
  const { clientId, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    clearAuth();
    if (variant === 'admin') {
      navigate(ROUTES.ADMIN_LOGIN);
    } else {
      navigate(ROUTES.PORTAL_LOGIN(clientId || ''));
    }
  };

  const navLinks = variant === 'admin'
    ? [
        { to: ROUTES.ADMIN_DASHBOARD, label: 'Dashboard' },
        { to: ROUTES.ADMIN_CLIENTS, label: 'Clients' },
      ]
    : clientId
      ? [
          { to: ROUTES.PORTAL_DASHBOARD(clientId), label: 'Dashboard' },
          { to: ROUTES.PORTAL_CALLS(clientId), label: 'Calls' },
          { to: ROUTES.PORTAL_SETTINGS(clientId), label: 'Settings' },
          { to: ROUTES.PORTAL_TEAM(clientId), label: 'Team' },
        ]
      : [];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <nav className="bg-[#0F172A] border-b border-[#1E293B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 items-center">
            <div className="flex items-center gap-6">
              <Link
                to={variant === 'admin' ? ROUTES.ADMIN_DASHBOARD : ROUTES.PORTAL_DASHBOARD(clientId!)}
                className="flex items-center gap-2.5"
              >
                <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M70 10C55 10 42 18 35 30C28 42 28 58 35 70C42 82 55 90 70 90C58 85 50 73 50 60C50 40 62 22 70 10Z" fill="#F59E0B" />
                </svg>
                <span className="font-semibold text-[#F8FAFC] tracking-tight">
                  FixMy<span className="text-[#F59E0B]">Night</span>
                </span>
              </Link>
              {/* Desktop nav */}
              <div className="hidden sm:flex items-center gap-4">
                {navLinks.map((link) => (
                  <Link key={link.to} to={link.to} className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleLogout}
                className="hidden sm:block text-sm text-[#64748B] hover:text-[#F8FAFC] transition-colors"
              >
                Log out
              </button>
              {/* Mobile hamburger */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="sm:hidden p-1 text-[#94A3B8] hover:text-[#F8FAFC]"
                aria-label="Menu"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="sm:hidden border-t border-[#1E293B] bg-[#0F172A]">
            <div className="px-4 py-2 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className="block py-2 text-sm text-[#94A3B8] hover:text-[#F8FAFC]"
                >
                  {link.label}
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="block w-full text-left py-2 text-sm text-[#64748B] hover:text-[#F8FAFC]"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      {/* Curved divider into footer */}
      <div className="relative -mt-px bg-[#F8FAFC]">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto" preserveAspectRatio="none">
          <path d="M0,0 C360,60 1080,60 1440,0 L1440,60 L0,60 Z" fill="#0B1120" />
        </svg>
      </div>

      <footer className="bg-[#0B1120] py-8 -mt-px">
        <div className="mx-auto max-w-7xl px-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M70 10C55 10 42 18 35 30C28 42 28 58 35 70C42 82 55 90 70 90C58 85 50 73 50 60C50 40 62 22 70 10Z" fill="#F59E0B" />
            </svg>
            <span className="text-sm text-[#64748B]">&copy; 2026 FixMyDay.ai</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to={ROUTES.PRIVACY} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Privacy</Link>
            <Link to={ROUTES.TERMS} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Terms</Link>
            <Link to={ROUTES.CONTACT} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
