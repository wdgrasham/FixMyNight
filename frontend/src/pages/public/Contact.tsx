import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';
import { Mail, Phone } from 'lucide-react';

export default function Contact() {
  return (
    <div className="py-12 sm:py-16">
      <div className="max-w-3xl mx-auto px-6">
        <div className="mb-10">
          <p className="text-sm font-semibold tracking-wide text-[#F59E0B] uppercase mb-3">Support</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">Contact Us</h1>
          <p className="mt-2 text-[#64748B]">We'd love to hear from you</p>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 md:p-10 shadow-sm">
            <p className="text-[#334155] leading-relaxed mb-8">
              Have questions about FixMyDay.ai tools or the FixMyNight after-hours
              answering service? Reach out and we'll get back to you promptly.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mb-5">Get in Touch</h2>
            <div className="space-y-4">
              <a
                href="mailto:fixmyday@use.startmail.com"
                className="flex items-center gap-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 transition-all hover:border-[#F59E0B]/40 hover:shadow-md"
              >
                <div className="inline-flex items-center justify-center rounded-lg bg-[#0F172A] p-2.5 text-[#F59E0B]">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">Email</p>
                  <p className="text-sm text-[#F59E0B]">fixmyday@use.startmail.com</p>
                </div>
              </a>

              <a
                href="tel:+13466916723"
                className="flex items-center gap-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 transition-all hover:border-[#F59E0B]/40 hover:shadow-md"
              >
                <div className="inline-flex items-center justify-center rounded-lg bg-[#0F172A] p-2.5 text-[#F59E0B]">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">Phone</p>
                  <p className="text-sm text-[#F59E0B]">(346) 691-6723</p>
                </div>
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 md:p-10 shadow-sm">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-4">SMS Support</h2>
            <p className="text-[#334155] leading-relaxed mb-4">
              If you're a FixMyNight technician or business owner receiving text
              messages from our service:
            </p>
            <ul className="space-y-2 text-[#334155]">
              <li className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#F59E0B] flex-shrink-0" />
                Reply <strong>HELP</strong> to any message for assistance
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#F59E0B] flex-shrink-0" />
                Reply <strong>STOP</strong> to opt out of messages
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#F59E0B] flex-shrink-0" />
                Email us at <a href="mailto:fixmyday@use.startmail.com" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">fixmyday@use.startmail.com</a> for account questions
              </li>
            </ul>
          </div>

          <div className="text-sm text-[#94A3B8] pt-4">
            <p>
              See also: <Link to={ROUTES.PRIVACY} className="font-medium text-[#F59E0B] hover:text-[#D97706]">Privacy Policy</Link> | <Link to={ROUTES.TERMS} className="font-medium text-[#F59E0B] hover:text-[#D97706]">Terms &amp; Conditions</Link> | <Link to={ROUTES.LEGAL} className="font-medium text-[#F59E0B] hover:text-[#D97706]">Legal Information</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
