import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Scale, CheckCircle, AlertTriangle } from 'lucide-react';
import { ROUTES } from '../../routes';
import FileUpload from '../../components/case/FileUpload';
import AudioRecorder, { type AudioClip } from '../../components/case/AudioRecorder';

const API_BASE = 'https://casereview-api-production.up.railway.app';

export default function CaseEvaluation() {
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = description.trim().length > 0 || files.length > 0 || audioClips.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      // Step 1: Create session with FormData
      const formData = new FormData();
      formData.append('case_description', description.trim());
      files.forEach((file) => {
        formData.append('files', file);
      });
      audioClips.forEach((clip, i) => {
        formData.append('files', clip.blob, `recording-${i + 1}.webm`);
      });

      const sessionRes = await fetch(`${API_BASE}/api/case/create-session`, {
        method: 'POST',
        body: formData,
      });

      if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => null);
        console.error('create-session error:', sessionRes.status, errData);
        throw new Error('Something went wrong. Please try again.');
      }

      const { session_id } = await sessionRes.json();

      // Step 2: Create Stripe checkout
      const checkoutRes = await fetch(`${API_BASE}/api/case/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id }),
      });

      if (!checkoutRes.ok) {
        const errData = await checkoutRes.json().catch(() => null);
        console.error('create-checkout error:', checkoutRes.status, errData);
        throw new Error('Something went wrong. Please try again.');
      }

      const { checkout_url } = await checkoutRes.json();

      // Step 3: Redirect to Stripe
      window.location.href = checkout_url;
    } catch (err) {
      console.error('Case evaluation submit error:', err);
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-6">
        {/* Legal disclaimer banner */}
        <div className="mb-8 rounded-lg border border-amber-300 bg-[#FFFBEB] px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[#D97706] shrink-0 mt-0.5" />
          <p className="text-sm text-[#92400E]">
            <span className="font-semibold">IMPORTANT:</span> This is NOT legal advice. For informational purposes only. Consult a licensed attorney for advice specific to your situation.
          </p>
        </div>

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <div className="rounded-2xl bg-[#F59E0B]/10 p-4">
              <Scale className="h-12 w-12 text-[#F59E0B]" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
            Do I Have a Case?
          </h1>
          <p className="mt-3 text-lg text-[#64748B] max-w-2xl mx-auto">
            AI organizes your case facts in minutes — walk into your free consultation prepared, or make every minute of a $500/hour session count. Only $7. Not legal advice.
          </p>
        </div>

        {/* Input form */}
        <div className="space-y-6">
          {/* Text description */}
          <div>
            <label htmlFor="case-description" className="block text-sm font-medium text-[#0F172A] mb-2">
              Describe what happened in your own words
            </label>
            <textarea
              id="case-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
              placeholder="Tell us about your situation — what happened, when, who was involved, and what outcome you're hoping for..."
              rows={8}
              className="w-full rounded-lg border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-transparent resize-y"
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-[#94A3B8]">
                Tip: For longer descriptions, upload a document below.
              </p>
              <span className={`text-xs ${description.length > 4500 ? 'text-[#D97706]' : 'text-[#94A3B8]'}`}>
                {description.length.toLocaleString()} / 5,000
              </span>
            </div>
          </div>

          {/* File upload */}
          <FileUpload files={files} onFilesChange={setFiles} />

          {/* Audio recorder */}
          <AudioRecorder clips={audioClips} onClipsChange={setAudioClips} />

          {/* What you get box */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-6">
            <h3 className="text-sm font-semibold text-[#0F172A] mb-4">What you get for $7</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                'Clear fact summary organized for attorney review',
                'Case strength estimate (Strong / Medium / Weak)',
                'Area of law identified',
                'Practical next steps',
                'PDF report ready to hand to your lawyer',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-[#475569]">{item}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-[#0F172A] font-medium border-t border-[#E2E8F0] pt-4">
              Turn a 30-minute free consultation into a productive strategy session.
            </p>
          </div>

          {/* Why prepare section */}
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-6">
            <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Why prepare before your consultation?</h3>
            <div className="space-y-4">
              <p className="text-sm text-[#475569] leading-relaxed">
                Free 30-minute consultations go fast. Most of that time gets spent just explaining what happened. With your facts already organized, your lawyer can skip straight to strategy.
              </p>
              <p className="text-sm text-[#475569] leading-relaxed">
                At $500/hour, every minute counts. A prepared client gets better advice in less time.
              </p>
              <p className="text-sm text-[#475569] leading-relaxed">
                Lawyers appreciate organized clients — it shows you're serious and helps them evaluate your case faster.
              </p>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={`w-full rounded-lg px-6 py-3.5 text-base font-semibold transition-colors ${
              canSubmit && !submitting
                ? 'bg-[#F59E0B] text-[#0F172A] hover:bg-[#D97706] cursor-pointer'
                : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing…
              </span>
            ) : (
              'Pay $7 & Get Analysis'
            )}
          </button>

          {/* Privacy note */}
          <p className="text-xs text-[#94A3B8] text-center">
            Secure payment via Stripe. Your data is automatically deleted after 24 hours.
          </p>
        </div>

        {/* Back link */}
        <div className="mt-10 text-center">
          <Link
            to={ROUTES.LANDING}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#F59E0B] hover:text-[#D97706] transition-colors"
          >
            &larr; Back to FixMyDay.ai
          </Link>
        </div>
      </div>
    </div>
  );
}
