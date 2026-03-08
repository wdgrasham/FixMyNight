import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';
import { Scale } from 'lucide-react';

export default function CaseEvaluation() {
  return (
    <div className="py-16 sm:py-24">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <div className="flex justify-center mb-6">
          <div className="rounded-2xl bg-[#F59E0B]/10 p-4">
            <Scale className="h-12 w-12 text-[#F59E0B]" />
          </div>
        </div>
        <p className="text-sm font-semibold tracking-wide text-[#F59E0B] uppercase mb-3">Coming Soon</p>
        <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">Do I Have a Case?</h1>
        <p className="mt-4 text-lg text-[#64748B]">
          AI-powered legal case evaluation — coming soon
        </p>
        <p className="mt-6 text-sm text-[#94A3B8] max-w-md mx-auto">
          Get a quick, confidential assessment of your legal situation powered by AI analysis. We're building this tool to help you understand your options before consulting with an attorney.
        </p>
        <div className="mt-10">
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
