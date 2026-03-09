import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { ROUTES } from '../../routes';
import { useAuthStore } from '../../store';
import type { TokenResponse } from '../../types';

function parseJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

export default function PortalEntry() {
  const navigate = useNavigate();
  const { token, role, clientId, setAuth, loginMessage, clearMessage } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already authenticated as portal user, redirect to dashboard
  useEffect(() => {
    if (token && role === 'portal' && clientId) {
      navigate(ROUTES.PORTAL_DASHBOARD(clientId), { replace: true });
    }
  }, [token, role, clientId, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    clearMessage();
    setLoading(true);

    try {
      const data = await api<TokenResponse>('/api/v1/auth/portal-login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const payload = parseJwtPayload(data.access_token);
      const resolvedClientId = payload.client_id as string;
      setAuth(data.access_token, 'portal', resolvedClientId);
      navigate(ROUTES.PORTAL_DASHBOARD(resolvedClientId), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError('Too many attempts. Please wait 15 minutes.');
        } else {
          setError('Invalid email or password.');
        }
      } else {
        setError('Connection error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Don't render form if already authenticated (will redirect)
  if (token && role === 'portal' && clientId) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top half — white with logo */}
      <div className="relative bg-white flex-1 flex items-end justify-center pb-12 pt-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{ backgroundImage: 'radial-gradient(circle, #CBD5E1 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="relative flex flex-col items-center">
          <Link to={ROUTES.FIXMYNIGHT_PRODUCT}>
            <img src="/FixMyNightLogo.png" alt="FixMyNight" className="h-16 object-contain" />
          </Link>
          <p className="mt-3 text-sm text-[#64748B]">Client Portal</p>
        </div>
      </div>

      {/* Curved divider */}
      <div className="relative -mt-px bg-white">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto" preserveAspectRatio="none">
          <path d="M0,0 C360,80 1080,80 1440,0 L1440,80 L0,80 Z" fill="#0F172A" />
        </svg>
      </div>

      {/* Bottom half — dark navy with form */}
      <div className="relative bg-[#0F172A] flex-1 flex items-start justify-center pt-8 pb-12 -mt-px">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{ backgroundImage: 'radial-gradient(circle, #64748B 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />

        <div className="relative w-full max-w-sm px-6">
          <div className="rounded-2xl border border-[#1E293B] bg-[#1E293B]/60 backdrop-blur-sm p-8 shadow-xl">
            <h2 className="text-lg font-semibold text-[#F8FAFC] mb-1">Sign In</h2>
            <p className="text-sm text-[#94A3B8] mb-6">Enter your credentials to access your portal.</p>

            {loginMessage && (
              <div className="mb-4 p-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-sm text-[#F59E0B]">
                {loginMessage}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#CBD5E1] mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B] transition-colors"
                  placeholder="Enter email"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#CBD5E1] mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B] transition-colors"
                  placeholder="Enter password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#F59E0B] text-[#0F172A] py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-[#D97706] disabled:opacity-50 transition-colors shadow-lg shadow-[#F59E0B]/25"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <p className="mt-4 text-xs text-[#64748B] text-center">
              <Link to={ROUTES.PORTAL_FORGOT_PASSWORD} className="text-[#F59E0B] hover:text-[#D97706] transition-colors">
                Forgot password?
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-[#64748B]">
            <Link to={ROUTES.LANDING} className="hover:text-[#94A3B8] transition-colors">FixMyDay.ai</Link>
            {' · '}
            <Link to={ROUTES.PRIVACY} className="hover:text-[#94A3B8] transition-colors">Privacy</Link>
            {' · '}
            <Link to={ROUTES.TERMS} className="hover:text-[#94A3B8] transition-colors">Terms</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
