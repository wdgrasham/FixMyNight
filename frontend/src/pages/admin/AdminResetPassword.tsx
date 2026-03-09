import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { ROUTES } from '../../routes';
import { useAuthStore } from '../../store';

export default function AdminResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }
    api('/api/v1/auth/verify-admin-reset-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(() => {
        setTokenValid(true);
        setValidating(false);
      })
      .catch(() => {
        setValidating(false);
      });
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/\d/.test(password)) {
      setError('Password must contain at least one number.');
      return;
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      setError('Password must contain at least one special character.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const data = await api<{ access_token: string }>('/api/v1/auth/admin-set-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setAuth(data.access_token, 'admin');
      navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'RESET_LINK_EXPIRED') {
          setError('This reset link has expired. Please request a new one.');
        } else if (err.code === 'TOKEN_INVALID') {
          setError('This reset link is invalid. Please request a new one.');
        } else {
          setError('Something went wrong. Please try again.');
        }
      } else {
        setError('Connection error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <p className="text-[#94A3B8]">Verifying reset link...</p>
      </div>
    );
  }

  if (!token || !tokenValid) {
    return (
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
        <div className="relative bg-[#0F172A] flex-1 flex items-start justify-center pt-8 pb-12 -mt-px">
          <div className="relative w-full max-w-sm px-6">
            <div className="rounded-2xl border border-[#1E293B] bg-[#1E293B]/60 backdrop-blur-sm p-8 shadow-xl text-center">
              <h2 className="text-lg font-semibold text-[#F8FAFC] mb-2">Invalid or Expired Link</h2>
              <p className="text-sm text-[#94A3B8] mb-6">
                This reset link is invalid or has expired. Please request a new one.
              </p>
              <Link
                to={ROUTES.ADMIN_FORGOT_PASSWORD}
                className="block w-full text-center bg-[#F59E0B] text-[#0F172A] py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-[#D97706] transition-colors shadow-lg shadow-[#F59E0B]/25"
              >
                Request New Link
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
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
          <p className="mt-3 text-sm text-[#64748B]">Administrator Portal</p>
        </div>
      </div>

      <div className="relative -mt-px bg-white">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto" preserveAspectRatio="none">
          <path d="M0,0 C360,80 1080,80 1440,0 L1440,80 L0,80 Z" fill="#0F172A" />
        </svg>
      </div>

      <div className="relative bg-[#0F172A] flex-1 flex items-start justify-center pt-8 pb-12 -mt-px">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{ backgroundImage: 'radial-gradient(circle, #64748B 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />

        <div className="relative w-full max-w-sm px-6">
          <div className="rounded-2xl border border-[#1E293B] bg-[#1E293B]/60 backdrop-blur-sm p-8 shadow-xl">
            <h2 className="text-lg font-semibold text-[#F8FAFC] mb-1">Reset Your Password</h2>
            <p className="text-sm text-[#94A3B8] mb-6">Choose a new password for your admin account.</p>

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
                  placeholder="Enter new password"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#CBD5E1] mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B] transition-colors"
                  placeholder="Confirm new password"
                  required
                />
              </div>
              <p className="text-xs text-[#64748B]">
                Min 8 characters, at least 1 number and 1 special character.
              </p>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#F59E0B] text-[#0F172A] py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-[#D97706] disabled:opacity-50 transition-colors shadow-lg shadow-[#F59E0B]/25"
              >
                {loading ? 'Setting password...' : 'Set New Password'}
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
