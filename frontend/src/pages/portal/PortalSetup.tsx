import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { ROUTES } from '../../routes';
import { useAuthStore } from '../../store';
import type { TokenResponse } from '../../types';

export default function PortalSetup() {
  const [searchParams] = useSearchParams();
  const magicToken = searchParams.get('token');
  const isReset = searchParams.get('reset') === 'true';
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const [businessName, setBusinessName] = useState('');

  useEffect(() => {
    if (!magicToken) return;
    api<{ client_id: string; business_name: string }>('/api/v1/auth/verify-setup-token', {
      method: 'POST',
      body: JSON.stringify({ token: magicToken }),
    })
      .then((data) => setBusinessName(data.business_name))
      .catch(() => {});
  }, [magicToken]);

  const messageScreen = (msg: string) => (
    <div className="min-h-screen flex flex-col">
      <div className="relative bg-white flex-1 flex items-end justify-center pb-12 pt-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{ backgroundImage: 'radial-gradient(circle, #CBD5E1 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="relative flex flex-col items-center">
          <Link to={ROUTES.FIXMYNIGHT_PRODUCT}>
            <img src="/FixMyNightLogo.png" alt="FixMyNight" className="h-16 object-contain" />
          </Link>
        </div>
      </div>
      <div className="relative -mt-px bg-white">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto" preserveAspectRatio="none">
          <path d="M0,0 C360,80 1080,80 1440,0 L1440,80 L0,80 Z" fill="#0F172A" />
        </svg>
      </div>
      <div className="relative bg-[#0F172A] flex-1 flex items-start justify-center pt-12 pb-12 -mt-px">
        <p className="text-[#94A3B8] text-sm text-center max-w-xs px-6">{msg}</p>
      </div>
    </div>
  );

  if (!magicToken) {
    return messageScreen('Invalid setup link. Please contact your FixMyNight administrator for a new link.');
  }

  if (expired) {
    return messageScreen('This link has expired. Contact your FixMyNight administrator for a new link.');
  }

  const validatePassword = (): string | null => {
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/\d/.test(password)) return 'Password must contain at least 1 number.';
    if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must contain at least 1 special character.';
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validatePassword();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const data = await api<TokenResponse & { client_id?: string }>('/api/v1/auth/portal-set-password', {
        method: 'POST',
        body: JSON.stringify({ token: magicToken, password }),
      });
      setAuth(data.access_token, 'portal', data.client_id);
      navigate(ROUTES.PORTAL_DASHBOARD(data.client_id!));
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'MAGIC_LINK_EXPIRED' || err.code === 'TOKEN_INVALID')) {
        setExpired(true);
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top half — white with logo + welcome */}
      <div className="relative bg-white flex-1 flex items-end justify-center pb-12 pt-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{ backgroundImage: 'radial-gradient(circle, #CBD5E1 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="relative flex flex-col items-center text-center px-6">
          <Link to={ROUTES.FIXMYNIGHT_PRODUCT}>
            <img src="/FixMyNightLogo.png" alt="FixMyNight" className="h-16 object-contain" />
          </Link>
          {businessName ? (
            <>
              <h1 className="mt-5 text-xl font-bold text-[#0F172A]">
                {isReset ? `Reset Your Password` : `Welcome to ${businessName}'s FixMyNight Portal`}
              </h1>
              <p className="mt-2 text-sm text-[#64748B] max-w-sm">
                {isReset
                  ? 'Enter a new password for your FixMyNight portal.'
                  : 'Create a password to access your after-hours call dashboard, manage your on-call team, and view call history.'}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-[#64748B]">{isReset ? 'Reset Password' : 'Portal Setup'}</p>
          )}
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
            <h2 className="text-lg font-semibold text-[#F8FAFC] mb-1">{isReset ? 'New Password' : 'Set Your Password'}</h2>
            <p className="text-sm text-[#94A3B8] mb-6">{isReset ? 'Enter your new password below.' : 'Choose a secure password for your account.'}</p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#CBD5E1] mb-1.5">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B] transition-colors"
                  placeholder="Enter password"
                  required
                  autoFocus
                />
                <p className="mt-1 text-xs text-[#64748B]">Min 8 characters, 1 number, 1 special character.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#CBD5E1] mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B] transition-colors"
                  placeholder="Confirm password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#F59E0B] text-[#0F172A] py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-[#D97706] disabled:opacity-50 transition-colors shadow-lg shadow-[#F59E0B]/25"
              >
                {loading ? 'Setting up...' : 'Set Password'}
              </button>
            </form>
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
