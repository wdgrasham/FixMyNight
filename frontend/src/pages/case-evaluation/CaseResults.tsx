import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Mail, Scale, ExternalLink, ArrowLeft, CheckCircle, Pencil, Check, X } from 'lucide-react';
import { ROUTES } from '../../routes';

const API_BASE = 'https://casereview-api-production.up.railway.app';

interface CaseSession {
  session_id: string;
  analysis_status: 'pending' | 'processing' | 'completed' | 'failed';
  case_strength?: 'Strong' | 'Medium' | 'Weak';
  area_of_law?: string;
  key_facts?: string[];
  next_steps?: string[];
  summary?: string;
  edits_remaining?: number;
}

const strengthColors: Record<string, { bg: string; text: string; border: string }> = {
  Strong: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  Medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  Weak:   { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
};

export default function CaseResults() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [session, setSession] = useState<CaseSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Email state
  const [email, setEmail] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Inline editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef(Date.now());
  const POLL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;

    // Timeout after 5 minutes of polling
    if (Date.now() - pollStartRef.current > POLL_TIMEOUT) {
      stopPolling();
      setError('This is taking longer than expected. Your payment was received — please check back shortly or contact support.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/case/session/${sessionId}`);

      // 403 = payment not yet confirmed by webhook — keep polling
      if (res.status === 403) return;

      if (!res.ok) throw new Error(`Failed to load results (${res.status})`);
      const data: CaseSession = await res.json();
      setSession(data);

      if (data.analysis_status === 'completed' || data.analysis_status === 'failed') {
        stopPolling();
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
      setLoading(false);
      stopPolling();
    }
  }, [sessionId, stopPolling]);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided.');
      setLoading(false);
      return;
    }

    pollStartRef.current = Date.now();
    fetchSession();
    pollRef.current = setInterval(fetchSession, 3000);

    return () => { stopPolling(); };
  }, [sessionId, fetchSession, stopPolling]);

  const handleSendEmail = async () => {
    if (!email.trim() || !sessionId || emailSending) return;
    setEmailSending(true);
    setEmailError(null);
    try {
      const res = await fetch(`${API_BASE}/api/case/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, email: email.trim() }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || 'Failed to send email');
      }
      setEmailSent(true);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setEmailSending(false);
    }
  };

  const handleSaveEdit = async (index: number) => {
    if (!sessionId || !session?.key_facts) return;
    const updated = [...session.key_facts];
    updated[index] = editValue.trim();

    try {
      const res = await fetch(`${API_BASE}/api/case/update-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, key_facts: updated }),
      });
      if (!res.ok) throw new Error('Failed to save edit');
      const data = await res.json();
      setSession((prev) => prev ? {
        ...prev,
        key_facts: data.key_facts ?? updated,
        edits_remaining: data.edits_remaining ?? (prev.edits_remaining != null ? prev.edits_remaining - 1 : 0),
      } : prev);
    } catch {
      // Revert silently — the API may reject if edits exhausted
    }
    setEditingIndex(null);
  };

  const canEdit = session?.edits_remaining == null || session.edits_remaining > 0;

  // No session ID
  if (!sessionId) {
    return (
      <div className="py-20 text-center">
        <p className="text-[#64748B]">No session found.</p>
        <Link to={ROUTES.CASE_EVALUATION} className="mt-4 inline-block text-sm font-medium text-[#F59E0B] hover:text-[#D97706]">
          &larr; Start a new evaluation
        </Link>
      </div>
    );
  }

  // Loading / polling
  if (loading || (session && session.analysis_status !== 'completed' && session.analysis_status !== 'failed')) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <div className="rounded-2xl bg-[#F59E0B]/10 p-5 mb-6">
          <Scale className="h-10 w-10 text-[#F59E0B]" />
        </div>
        <div className="flex items-center gap-3 mb-4">
          <svg className="animate-spin h-6 w-6 text-[#F59E0B]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-lg font-medium text-[#0F172A]">
            {session ? 'Analyzing your case…' : 'Confirming payment…'}
          </span>
        </div>
        <p className="text-sm text-[#94A3B8]">
          {session ? 'This usually takes 1–2 minutes.' : 'Waiting for payment confirmation, then analysis will begin.'}
        </p>
      </div>
    );
  }

  // Error
  if (error || session?.analysis_status === 'failed') {
    return (
      <div className="py-20 text-center max-w-md mx-auto px-6">
        <p className="text-red-600 font-medium mb-2">Something went wrong</p>
        <p className="text-sm text-[#64748B] mb-6">{error || 'Analysis failed. Please contact support for a refund.'}</p>
        <Link to={ROUTES.CASE_EVALUATION} className="text-sm font-medium text-[#F59E0B] hover:text-[#D97706]">
          &larr; Try again
        </Link>
      </div>
    );
  }

  if (!session) return null;

  const strength = session.case_strength || 'Medium';
  const colors = strengthColors[strength] || strengthColors.Medium;

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-6">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
            Your Case Evaluation
          </h1>
          <p className="mt-2 text-sm text-[#94A3B8]">
            AI-generated analysis &mdash; not legal advice
          </p>
        </div>

        <div className="space-y-6">
          {/* Attorney callout */}
          <div className="rounded-lg border border-[#D1FAE5] bg-[#ECFDF5] p-5">
            <p className="text-sm text-[#065F46] leading-relaxed">
              <span className="font-semibold">Take this report to your attorney.</span> Your facts are organized, your case strength is assessed, and your next steps are clear. This saves time in both free consultations and paid sessions.
            </p>
          </div>

          {/* Case Strength Badge */}
          <div className={`rounded-lg border ${colors.border} ${colors.bg} p-6 text-center`}>
            <p className="text-sm font-medium text-[#64748B] mb-2">Case Strength Assessment</p>
            <span className={`inline-block text-3xl font-bold ${colors.text}`}>
              {strength}
            </span>
          </div>

          {/* Area of Law */}
          {session.area_of_law && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <p className="text-sm font-medium text-[#64748B] mb-1">Area of Law</p>
              <p className="text-lg font-semibold text-[#0F172A]">{session.area_of_law}</p>
            </div>
          )}

          {/* Summary */}
          {session.summary && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <p className="text-sm font-medium text-[#64748B] mb-2">Summary</p>
              <p className="text-sm text-[#334155] leading-relaxed">{session.summary}</p>
            </div>
          )}

          {/* Key Facts */}
          {session.key_facts && session.key_facts.length > 0 && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-[#64748B]">Key Facts Summary</p>
                {canEdit && (
                  <span className="text-xs text-[#94A3B8]">
                    Click a fact to edit ({session.edits_remaining ?? 2} edit{(session.edits_remaining ?? 2) !== 1 ? 's' : ''} remaining)
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                {session.key_facts.map((fact, i) => (
                  <li key={i}>
                    {editingIndex === i ? (
                      <div className="flex items-start gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 rounded border border-[#CBD5E1] px-3 py-1.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(i);
                            if (e.key === 'Escape') setEditingIndex(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(i)}
                          className="text-green-600 hover:text-green-700 p-1"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingIndex(null)}
                          className="text-[#94A3B8] hover:text-red-500 p-1"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`flex items-start gap-2.5 group ${canEdit ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (canEdit) {
                            setEditingIndex(i);
                            setEditValue(fact);
                          }
                        }}
                      >
                        <CheckCircle className="h-4 w-4 text-[#F59E0B] shrink-0 mt-0.5" />
                        <span className="text-sm text-[#334155] flex-1">{fact}</span>
                        {canEdit && (
                          <Pencil className="h-3.5 w-3.5 text-[#CBD5E1] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Steps */}
          {session.next_steps && session.next_steps.length > 0 && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <p className="text-sm font-medium text-[#64748B] mb-3">Recommended Next Steps</p>
              <ol className="space-y-2">
                {session.next_steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[#F59E0B]/10 text-xs font-semibold text-[#D97706] shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-[#334155]">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Actions: Email + Download */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-5 space-y-4">
            <p className="text-sm font-medium text-[#64748B]">Get Your Results</p>

            {/* Email */}
            {emailSent ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                PDF sent! Check your inbox.
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email for PDF"
                  className="flex-1 rounded-lg border border-[#CBD5E1] px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                />
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={!email.trim() || emailSending}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    email.trim() && !emailSending
                      ? 'bg-[#F59E0B] text-[#0F172A] hover:bg-[#D97706]'
                      : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
                  }`}
                >
                  <Mail className="h-4 w-4" />
                  {emailSending ? 'Sending…' : 'Send'}
                </button>
              </div>
            )}
            {emailError && <p className="text-sm text-red-600">{emailError}</p>}

            {/* Download + Find Lawyers */}
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={`${API_BASE}/api/case/download-pdf/${sessionId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] px-4 py-2.5 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm font-medium text-[#94A3B8] cursor-not-allowed"
              >
                <ExternalLink className="h-4 w-4" />
                Find Lawyers Near You (Coming Soon)
              </button>
            </div>
          </div>

          {/* Privacy notice */}
          <div className="text-center space-y-4">
            <p className="text-xs text-[#94A3B8]">
              Your data is automatically deleted after 24 hours. This analysis is not legal advice.
            </p>
            <Link
              to={ROUTES.LANDING}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#F59E0B] hover:text-[#D97706] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to FixMyDay.ai
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
