import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Scale, ExternalLink, ArrowLeft, CheckCircle, Pencil, Check, X, AlertTriangle, HelpCircle, FileText, MessageSquare, Info, BookOpen, Mail } from 'lucide-react';
import { ROUTES } from '../../routes';

const API_BASE = 'https://casereview-api-production.up.railway.app';

interface AnalysisResult {
  facts: string[];
  strength: 'Strong' | 'Medium' | 'Weak';
  reasoning: string;
  case_type: string;
  next_steps: string[];
  information_gaps?: string[];
  general_info?: string[];
  legal_concepts?: { term: string; explanation: string }[];
  attorney_questions?: string[];
  relevant_documents?: string[];
}

interface ApiSession {
  session_id: string;
  payment_status: string;
  analysis_status: 'pending' | 'processing' | 'completed' | 'failed';
  analysis_result: AnalysisResult | null;
  update_count: number;
  email_sent: boolean;
  user_email: string | null;
}

export default function CaseResults() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const data: ApiSession = await res.json();
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

  const handleSaveEdit = async (index: number) => {
    if (!sessionId || !session?.analysis_result?.facts) return;
    const updated = [...session.analysis_result.facts];
    updated[index] = editValue.trim();

    try {
      const res = await fetch(`${API_BASE}/api/case/update-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, facts: updated }),
      });
      if (!res.ok) throw new Error('Failed to save edit');
      const data = await res.json();
      setSession((prev) => {
        if (!prev?.analysis_result) return prev;
        return {
          ...prev,
          update_count: data.update_count ?? prev.update_count + 1,
          analysis_result: { ...prev.analysis_result, facts: updated },
        };
      });
    } catch {
      // Revert silently
    }
    setEditingIndex(null);
  };

  const editsRemaining = session ? 2 - session.update_count : 2;
  const canEdit = editsRemaining > 0;

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

  if (!session?.analysis_result) return null;

  const r = session.analysis_result;

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-6">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
            Your Case Information Summary
          </h1>
          <p className="mt-2 text-sm text-[#94A3B8]">
            For informational purposes only &mdash; not legal advice
          </p>
        </div>

        <div className="space-y-6">
          {/* Thank you + attorney tip */}
          <div className="rounded-lg border border-[#D1FAE5] bg-[#ECFDF5] p-5 space-y-2">
            <p className="text-sm text-[#065F46] leading-relaxed">
              <span className="font-semibold">Thank you for your purchase!</span> Your case information has been analyzed and your report is ready.
            </p>
            <p className="text-sm text-[#065F46] leading-relaxed">
              Take this report to your attorney. Your facts are organized and your next steps are clear. This saves time in both free consultations and paid sessions.
            </p>
          </div>

          {/* Disclaimer */}
          <div className="rounded-lg border border-amber-300 bg-[#FFFBEB] px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#D97706] shrink-0 mt-0.5" />
            <p className="text-sm text-[#92400E]">
              <span className="font-semibold">NOT LEGAL ADVICE.</span> This report organizes information you provided for informational purposes only. It does not constitute legal advice or create an attorney-client relationship. Consult a licensed attorney for advice specific to your situation.
            </p>
          </div>

          {/* Likely Area of Law */}
          {r.case_type && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <p className="text-sm font-medium text-[#64748B] mb-1">Likely Area of Law</p>
              <p className="text-lg font-semibold text-[#0F172A]">{r.case_type}</p>
            </div>
          )}

          {/* Established Facts */}
          {r.facts && r.facts.length > 0 && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-[#64748B]">Established Facts</p>
                {canEdit && (
                  <span className="text-xs text-[#94A3B8]">
                    Click to edit ({editsRemaining} edit{editsRemaining !== 1 ? 's' : ''} remaining)
                  </span>
                )}
              </div>
              <p className="text-xs text-[#94A3B8] mb-3 italic">Organized from the information you provided.</p>
              <ul className="space-y-2">
                {r.facts.map((fact, i) => (
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
                        <button type="button" onClick={() => handleSaveEdit(i)} className="text-green-600 hover:text-green-700 p-1">
                          <Check className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setEditingIndex(null)} className="text-[#94A3B8] hover:text-red-500 p-1">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`flex items-start gap-2.5 group ${canEdit ? 'cursor-pointer' : ''}`}
                        onClick={() => { if (canEdit) { setEditingIndex(i); setEditValue(fact); } }}
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

          {/* Information Gaps */}
          {r.information_gaps && r.information_gaps.length > 0 && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <div className="flex items-center gap-2 mb-1">
                <HelpCircle className="h-4 w-4 text-[#F59E0B]" />
                <p className="text-sm font-medium text-[#64748B]">Information Gaps</p>
              </div>
              <p className="text-xs text-[#94A3B8] mb-3 italic">An attorney reviewing your case may ask about the following:</p>
              <ul className="space-y-2">
                {r.information_gaps.map((gap, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-[#D97706] shrink-0 mt-0.5 text-sm font-bold">?</span>
                    <span className="text-sm text-[#334155]">{gap}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Key Legal Concepts */}
          {r.legal_concepts && r.legal_concepts.length > 0 && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-4 w-4 text-[#0F172A]" />
                <p className="text-sm font-medium text-[#64748B]">Key Legal Concepts</p>
              </div>
              <p className="text-xs text-[#94A3B8] mb-4 italic">The following legal concepts may come up when discussing your case with an attorney:</p>
              <div className="space-y-3">
                {r.legal_concepts.map((concept, i) => (
                  <div key={i} className="border-l-2 border-[#F59E0B] pl-3">
                    <p className="text-sm font-semibold text-[#0F172A]">{concept.term}</p>
                    <p className="text-sm text-[#475569] mt-0.5 leading-relaxed">{concept.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* General Information */}
          {r.general_info && r.general_info.length > 0 && (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-5">
              <div className="flex items-center gap-2 mb-1">
                <Info className="h-4 w-4 text-[#64748B]" />
                <p className="text-sm font-medium text-[#64748B]">General Information About This Type of Case</p>
              </div>
              <p className="text-xs text-[#94A3B8] mb-3 italic">General public information, not advice specific to your case.</p>
              <ul className="space-y-2">
                {r.general_info.map((info, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-[#94A3B8] shrink-0 mt-1 text-xs">&#9679;</span>
                    <span className="text-sm text-[#334155]">{info}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Attorney Questions */}
          {r.attorney_questions && r.attorney_questions.length > 0 && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="h-4 w-4 text-[#F59E0B]" />
                <p className="text-sm font-medium text-[#64748B]">Questions to Discuss With an Attorney</p>
              </div>
              <ol className="space-y-2 mt-3">
                {r.attorney_questions.map((q, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[#F59E0B]/10 text-xs font-semibold text-[#D97706] shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-[#334155]">{q}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Relevant Documents */}
          {r.relevant_documents && r.relevant_documents.length > 0 && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-[#64748B]" />
                <p className="text-sm font-medium text-[#64748B]">Documents and Evidence to Gather</p>
              </div>
              <p className="text-xs text-[#94A3B8] mb-3 italic">
                Documents commonly relevant in {r.case_type || 'this type of'} cases:
              </p>
              <ul className="space-y-2">
                {r.relevant_documents.map((doc, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-[#94A3B8] shrink-0 mt-1 text-xs">&#9679;</span>
                    <span className="text-sm text-[#334155]">{doc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Next Steps */}
          {r.next_steps && r.next_steps.length > 0 && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
              <p className="text-sm font-medium text-[#64748B] mb-3">Suggested Next Steps</p>
              <ol className="space-y-2">
                {r.next_steps.map((step, i) => (
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

          {/* Actions: Email confirmation + Download */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-5 space-y-4">
            <p className="text-sm font-medium text-[#64748B]">Get Your Report</p>

            {/* Email confirmation */}
            {session.user_email ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Mail className="h-4 w-4 shrink-0" />
                <span>Your PDF report has been sent to <strong>{session.user_email}</strong>. Check your inbox.</span>
              </div>
            ) : session.email_sent ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Your PDF report has been emailed to you.</span>
              </div>
            ) : null}

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

          {/* Bottom disclaimer + privacy */}
          <div className="rounded-lg border border-amber-200 bg-[#FFFBEB] px-4 py-3">
            <p className="text-xs text-[#92400E]">
              <span className="font-semibold">Reminder:</span> This report is for informational purposes only and does not constitute legal advice. It does not create an attorney-client relationship. Consult a licensed attorney for advice specific to your situation.
            </p>
          </div>

          <div className="text-center space-y-4">
            <p className="text-xs text-[#94A3B8]">
              Your data is automatically deleted after 24 hours.
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
