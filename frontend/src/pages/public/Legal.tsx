import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';

export default function Legal() {
  return (
    <div className="py-12 sm:py-16">
      <div className="max-w-3xl mx-auto px-6">
        <div className="mb-10">
          <p className="text-sm font-semibold tracking-wide text-[#F59E0B] uppercase mb-3">Legal</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">Legal Information</h1>
          <p className="mt-2 text-sm text-[#94A3B8]">Last updated: March 4, 2026</p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 md:p-10 shadow-sm">
          <div className="prose prose-sm max-w-none text-[#334155] space-y-6">
            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">Business Information</h2>
            <ul className="list-none space-y-1">
              <li><strong>Business Name:</strong> FixMyDay.ai</li>
              <li><strong>Product:</strong> FixMyNight After-Hours Answering Service</li>
              <li><strong>Website:</strong> <a href="https://fixmyday.ai" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">https://fixmyday.ai</a></li>
              <li><strong>Email:</strong> <a href="mailto:fixmyday@use.startmail.com" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">fixmyday@use.startmail.com</a></li>
              <li><strong>Phone:</strong> <a href="tel:+13466916723" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">(346) 691-6723</a></li>
            </ul>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">Services Overview</h2>
            <p>
              FixMyDay.ai provides AI-powered tools designed to simplify research,
              decision-making, and business operations. Our flagship product, FixMyNight,
              is an AI-powered after-hours answering service built specifically for service
              contractors and trade businesses including HVAC, plumbing, electrical,
              locksmith, garage door, and appliance repair companies.
            </p>
            <p>
              FixMyNight uses an AI voice agent to answer inbound after-hours calls,
              determine caller intent, and take appropriate action — dispatching on-call
              technicians for emergencies, logging routine calls for morning callbacks,
              taking messages, and screening junk calls. The service also provides
              SMS-based on-call management for technicians and automated morning summary
              reports delivered via email and SMS.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">SMS/Text Messaging Program</h2>
            <div className="rounded-xl bg-[#0F172A] p-5 text-[#CBD5E1] space-y-3">
              <p className="font-medium text-[#F8FAFC]">FixMyNight SMS Program Details</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong className="text-[#F8FAFC]">Brand:</strong> FixMyDay.ai</li>
                <li><strong className="text-[#F8FAFC]">Program:</strong> FixMyNight After-Hours Answering Service</li>
                <li><strong className="text-[#F8FAFC]">Phone number type:</strong> 10-digit long code (10DLC)</li>
                <li><strong className="text-[#F8FAFC]">Message types:</strong> Technician verification, on-call management (ON/OFF/STATUS commands), emergency dispatch alerts, on-call status changes, morning summary notifications, and service notifications</li>
                <li><strong className="text-[#F8FAFC]">Message frequency:</strong> Varies based on call volume and service activity</li>
                <li><strong className="text-[#F8FAFC]">Message and data rates may apply.</strong> Contact your mobile carrier for details.</li>
              </ul>

              <div className="border-t border-[#334155] pt-3 mt-3 space-y-2 text-sm">
                <p><strong className="text-[#F8FAFC]">Opt-out:</strong> Reply <strong className="text-[#F59E0B]">STOP</strong> to any message to unsubscribe. You may also reply CANCEL, UNSUBSCRIBE, END, or QUIT to opt out. You will receive a single confirmation message and no further messages will be sent unless you re-enroll.</p>
                <p><strong className="text-[#F8FAFC]">Help:</strong> Reply <strong className="text-[#F59E0B]">HELP</strong> to any message, or contact us at fixmyday@use.startmail.com.</p>
                <p><strong className="text-[#F8FAFC]">Consent:</strong> Consent to receive text messages is not a condition of purchase or use of any other FixMyDay.ai service.</p>
                <p><strong className="text-[#F8FAFC]">Carriers:</strong> Carriers (including but not limited to AT&amp;T, T-Mobile, and Verizon) are not liable for delayed or undelivered messages.</p>
                <p><strong className="text-[#F8FAFC]">Privacy:</strong> No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. See our <Link to={ROUTES.PRIVACY} className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">Privacy Policy</Link> for full details.</p>
              </div>
            </div>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">AI Voice Agent Disclosure</h2>
            <p>
              The FixMyNight AI voice agent is an automated system that answers inbound
              phone calls on behalf of subscribing businesses. The AI agent identifies
              itself as an automated assistant at the start of each call. While designed
              to accurately handle after-hours calls, the AI agent may occasionally
              misinterpret caller intent or fail to capture all details.
            </p>
            <p>
              The AI voice agent does not provide professional, medical, legal, or safety
              advice. For life-threatening emergencies, callers should contact 911 or their
              local emergency services. Call recordings and transcripts may be generated
              and stored for service delivery and quality improvement purposes.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">Third-Party Services</h2>
            <p>
              FixMyDay.ai uses the following third-party service providers to operate
              the FixMyNight service:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Twilio</strong> — SMS messaging and voice call infrastructure</li>
              <li><strong>Vapi</strong> — AI voice agent platform</li>
              <li><strong>SendGrid</strong> — Email delivery for morning summary reports</li>
              <li><strong>Stripe</strong> — Payment processing (if applicable)</li>
              <li><strong>Vercel</strong> — Website hosting</li>
              <li><strong>Railway</strong> — Application and database hosting</li>
            </ul>
            <p>
              These service providers process data solely on our behalf and in accordance
              with their respective privacy policies and our contractual agreements. No
              personal information is shared with third parties for their own marketing
              or promotional purposes.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">Intellectual Property</h2>
            <p>
              All content, trademarks, and intellectual property on the FixMyDay.ai
              website and within the FixMyNight service are the property of FixMyDay.ai
              unless otherwise indicated. You may not reproduce, distribute, or create
              derivative works from any content without prior written permission.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">Disclaimer</h2>
            <p>
              The services provided by FixMyDay.ai are offered "as is" and "as available"
              without warranties of any kind, whether express or implied. We do not warrant
              that the service will be uninterrupted, error-free, or completely secure.
              FixMyDay.ai is not liable for any decisions made or actions taken based on
              information provided by our AI-powered tools or voice agents.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">Governing Law</h2>
            <p>
              These legal terms and any disputes arising from your use of our services
              are governed by the laws of the State of Texas, without regard to conflict
              of law provisions.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">Contact</h2>
            <p>For legal inquiries, contact us:</p>
            <ul className="list-none space-y-1">
              <li><strong>Business:</strong> FixMyDay.ai</li>
              <li><strong>Email:</strong> <a href="mailto:fixmyday@use.startmail.com" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">fixmyday@use.startmail.com</a></li>
              <li><strong>Phone:</strong> <a href="tel:+13466916723" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">(346) 691-6723</a></li>
              <li><strong>Website:</strong> <a href="https://fixmyday.ai" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">https://fixmyday.ai</a></li>
            </ul>

            <div className="mt-8 pt-6 border-t border-[#E2E8F0] text-sm text-[#94A3B8]">
              <p>
                See also: <Link to={ROUTES.PRIVACY} className="font-medium text-[#F59E0B] hover:text-[#D97706]">Privacy Policy</Link> | <Link to={ROUTES.TERMS} className="font-medium text-[#F59E0B] hover:text-[#D97706]">Terms &amp; Conditions</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
