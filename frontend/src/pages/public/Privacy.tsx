import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';

export default function Privacy() {
  return (
    <div className="py-12 sm:py-16">
      <div className="max-w-3xl mx-auto px-6">
        <div className="mb-10">
          <p className="text-sm font-semibold tracking-wide text-[#F59E0B] uppercase mb-3">Legal</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">Privacy Policy</h1>
          <p className="mt-2 text-sm text-[#94A3B8]">Last updated: March 4, 2026</p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 md:p-10 shadow-sm">
          <div className="prose prose-sm max-w-none text-[#334155] space-y-6">
            <p>
              FixMyDay.ai ("we," "us," or "our") operates the FixMyDay.ai website and the
              FixMyNight after-hours answering service. This Privacy Policy describes how we
              collect, use, and protect your personal information when you use our services.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">1. Information We Collect</h2>
            <p>We may collect the following types of personal information:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Contact information:</strong> Name, phone number, email address</li>
              <li><strong>Business information:</strong> Business name, service address, industry</li>
              <li><strong>Call data:</strong> Inbound caller phone number, call recordings, call transcripts, caller-reported issue details</li>
              <li><strong>SMS data:</strong> Mobile phone number, SMS messages sent and received, opt-in status, message timestamps</li>
              <li><strong>Account data:</strong> Login credentials, portal activity, technician on-call status</li>
              <li><strong>Usage data:</strong> Browser type, IP address, pages visited, access timestamps</li>
            </ul>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">2. How We Collect Information</h2>
            <p>We collect information through:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Client onboarding forms submitted by business administrators</li>
              <li>Inbound phone calls handled by our AI voice agent</li>
              <li>SMS text messages sent to and from our service phone numbers</li>
              <li>The FixMyNight client portal</li>
              <li>Direct communication with our team</li>
            </ul>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide after-hours call answering and emergency dispatch services</li>
              <li>Send SMS messages for on-call management (ON/OFF/STATUS commands), technician verification, emergency dispatch alerts, on-call status reminders, and morning summary notifications</li>
              <li>Generate morning call summary reports delivered via email and SMS</li>
              <li>Operate and maintain the FixMyNight client portal</li>
              <li>Communicate service-related updates to clients and technicians</li>
              <li>Improve and maintain the quality of our services</li>
            </ul>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">4. SMS/Text Messaging Data</h2>
            <div className="rounded-xl bg-[#0F172A] p-5 text-[#CBD5E1]">
              <p className="font-medium text-[#F8FAFC] mb-2">Mobile Information Sharing Disclosure</p>
              <p>
                No mobile information will be shared with third parties or affiliates for
                marketing or promotional purposes. All categories described in this policy
                exclude text messaging originator opt-in data and consent; this information
                will not be shared with any third parties.
              </p>
            </div>
            <p>
              We collect mobile phone numbers from business clients and their designated
              technicians for the purpose of delivering service-related SMS communications.
              Mobile phone numbers and SMS opt-in consent data are used solely to deliver
              the FixMyNight service and are never sold, shared, rented, or otherwise
              distributed to third parties for marketing or promotional purposes.
            </p>
            <p>
              We may share your mobile phone number with our SMS service provider (Twilio)
              solely for the purpose of delivering text messages on our behalf. Our SMS
              service provider is contractually prohibited from using your phone number for
              any purpose other than delivering our messages.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">5. SMS Opt-In and Opt-Out</h2>
            <p>
              Technicians are enrolled in SMS communications when a business administrator
              adds them to the FixMyNight system. A verification SMS is sent to confirm the
              technician's phone number. By responding to any message from our system,
              technicians consent to receive ongoing service-related text messages.
            </p>
            <p>You can opt out of SMS messages at any time:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Reply <strong>STOP</strong> to any message to unsubscribe immediately</li>
              <li>Reply <strong>HELP</strong> for assistance or contact us at the information below</li>
              <li>Contact your business administrator to have your number removed from the system</li>
            </ul>
            <p>
              After opting out, you will receive a single confirmation message and no further
              messages will be sent unless you re-enroll. Message frequency varies based on
              service activity. Message and data rates may apply.
            </p>

            <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-6 mt-8">
              <h3 className="text-lg font-bold text-[#0F172A] mb-3">SMS Consent &amp; Communications</h3>
              <p className="text-[#334155] leading-relaxed">
                When a business subscribes to FixMyNight and adds technicians to the system,
                each technician receives a verification SMS. By texting ON, technicians consent
                to receive on-call alerts, emergency dispatch notifications, and shift reminders.
                Business owners consent to receive fallback alerts and morning summaries during
                account setup. Message frequency varies. Message and data rates may apply.
                Text <strong>STOP</strong> to opt out at any time. Text <strong>HELP</strong> for
                assistance. For support, contact{' '}
                <a href="mailto:fixmyday@use.startmail.com" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">fixmyday@use.startmail.com</a>.
              </p>
            </div>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">6. Data Sharing and Third Parties</h2>
            <p>We do not sell your personal information. We may share information with:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Service providers:</strong> Twilio (SMS and voice), Vapi (AI voice agent), SendGrid (email delivery), and cloud hosting providers — solely to operate our services</li>
              <li><strong>Your employer/client:</strong> Call data and technician activity are shared with the business client who subscribes to FixMyNight</li>
              <li><strong>Legal obligations:</strong> When required by law, subpoena, or court order</li>
            </ul>
            <p>
              We do not share personal information with third parties for their own marketing
              purposes.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">7. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your personal
              information, including encryption of data in transit (TLS/SSL), secure cloud
              infrastructure, access controls, and regular security reviews. While no system
              is completely secure, we take reasonable steps to protect your data from
              unauthorized access, disclosure, alteration, or destruction.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">8. Data Retention</h2>
            <p>
              We retain personal information for as long as necessary to provide our services
              and fulfill the purposes described in this policy. Call records and SMS logs are
              retained for up to 12 months. Account data is retained for the duration of the
              client's subscription plus 30 days. You may request deletion of your data by
              contacting us at the information below.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">9. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Request access to the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your personal information</li>
              <li>Opt out of SMS communications at any time by replying STOP</li>
            </ul>
            <p>
              To exercise these rights, contact us using the information below. We will
              respond to requests within 30 days.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on
              this page with an updated "Last updated" date. Continued use of our services
              after changes are posted constitutes acceptance of the updated policy. For
              material changes, we will notify active clients via email.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or our data practices, contact us:
            </p>
            <ul className="list-none space-y-1">
              <li><strong>Business:</strong> FixMyDay.ai</li>
              <li><strong>Email:</strong> <a href="mailto:fixmyday@use.startmail.com" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">fixmyday@use.startmail.com</a></li>
              <li><strong>Phone:</strong> <a href="tel:+13466916723" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">(346) 691-6723</a></li>
              <li><strong>Website:</strong> <a href="https://fixmyday.ai" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">https://fixmyday.ai</a></li>
            </ul>

            <div className="mt-8 pt-6 border-t border-[#E2E8F0] text-sm text-[#94A3B8]">
              <p>
                See also: <Link to={ROUTES.TERMS} className="font-medium text-[#F59E0B] hover:text-[#D97706]">Terms &amp; Conditions</Link> | <Link to={ROUTES.LEGAL} className="font-medium text-[#F59E0B] hover:text-[#D97706]">Legal Information</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
