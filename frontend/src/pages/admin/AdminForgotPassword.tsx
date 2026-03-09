import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { ROUTES } from '../../routes';

export default function AdminForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api('/api/v1/auth/admin-forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Please wait 15 minutes.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

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
          <p className="mt-3 text-sm text-[#64748B]">Administrator Portal</p>
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
            {sent ? (
              <>
                <h2 className="text-lg font-semibold text-[#F8FAFC] mb-1">Check Your Email</h2>
                <p className="text-sm text-[#94A3B8] mb-6">
                  If that email matches our admin account, we've sent a password reset link. Check your inbox.
                </p>
                <Link
                  to={ROUTES.ADMIN_LOGIN}
                  className="block w-full text-center bg-[#F59E0B] text-[#0F172A] py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-[#D97706] transition-colors shadow-lg shadow-[#F59E0B]/25"
                >
                  Back to Login
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-[#F8FAFC] mb-1">Forgot Password</h2>
                <p className="text-sm text-[#94A3B8] mb-6">
                  Enter the email address associated with the admin account.
                </p>

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
                      placeholder="Enter admin email"
                      required
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#F59E0B] text-[#0F172A] py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-[#D97706] disabled:opacity-50 transition-colors shadow-lg shadow-[#F59E0B]/25"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </form>

                <p className="mt-4 text-xs text-[#64748B] text-center">
                  <Link to={ROUTES.ADMIN_LOGIN} className="text-[#F59E0B] hover:text-[#D97706] transition-colors">
                    Back to login
                  </Link>
                </p>
              </>
            )}
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
