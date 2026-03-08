import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';

export default function Terms() {
  return (
    <div className="py-12 sm:py-16">
      <div className="max-w-3xl mx-auto px-6">
        <div className="mb-10">
          <p className="text-sm font-semibold tracking-wide text-[#F59E0B] uppercase mb-3">Legal</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">Terms &amp; Conditions</h1>
          <p className="mt-2 text-sm text-[#94A3B8]">Last updated: March 4, 2026</p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 md:p-10 shadow-sm">
          <div className="prose prose-sm max-w-none text-[#334155] space-y-6">
            <p>
              These Terms &amp; Conditions ("Terms") govern your use of the FixMyDay.ai
              website and the FixMyNight after-hours answering service operated by
              FixMyDay.ai ("we," "us," or "our"). By using our services, you agree to
              these Terms.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">1. Service Description</h2>
            <p>
              FixMyNight is an AI-powered after-hours answering service for service
              contractors and trade businesses. The service includes an AI voice agent that
              answers inbound calls, determines caller intent, dispatches on-call technicians
              for emergencies, logs routine calls for morning callbacks, takes messages, and
              delivers morning summary reports.
            </p>
            <p>
              The service also includes SMS-based on-call management for technicians,
              a client portal for settings and call history, and automated email/SMS
              notifications.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">2. SMS/Text Messaging Terms</h2>
            <div className="rounded-xl bg-[#0F172A] p-5 text-[#CBD5E1] space-y-3">
              <p className="font-medium text-[#F8FAFC]">FixMyNight SMS Program</p>
              <p>
                By providing a mobile phone number and being enrolled in the FixMyNight system,
                you agree to receive text messages from FixMyDay.ai related to the FixMyNight
                service. The types of SMS messages you may receive include:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong className="text-[#F8FAFC]">Technician verification:</strong> Initial verification message when added to the system</li>
                <li><strong className="text-[#F8FAFC]">On-call management:</strong> Responses to ON, OFF, and STATUS commands</li>
                <li><strong className="text-[#F8FAFC]">Emergency dispatch alerts:</strong> Notifications when an emergency caller needs to be connected to the on-call technician</li>
                <li><strong className="text-[#F8FAFC]">On-call status changes:</strong> Notifications when another technician takes over on-call duty</li>
                <li><strong className="text-[#F8FAFC]">Morning summary notifications:</strong> Daily summary of overnight call activity sent to business administrators</li>
                <li><strong className="text-[#F8FAFC]">Service notifications:</strong> Important updates about the FixMyNight service</li>
              </ul>

              <div className="border-t border-[#334155] pt-3 mt-3 space-y-2 text-sm">
                <p><strong className="text-[#F8FAFC]">Message frequency:</strong> Message frequency varies based on call volume and service activity. Technicians on-call may receive multiple messages per shift during high-activity periods.</p>
                <p><strong className="text-[#F8FAFC]">Message and data rates may apply.</strong> Contact your mobile carrier for details about your messaging plan.</p>
                <p><strong className="text-[#F8FAFC]">Opt-out:</strong> You can cancel SMS messages at any time. Reply <strong className="text-[#F59E0B]">STOP</strong> to any message to unsubscribe. You will receive a single confirmation message. After opting out, no further messages will be sent unless you re-enroll. You may also reply CANCEL, UNSUBSCRIBE, END, or QUIT to opt out.</p>
                <p><strong className="text-[#F8FAFC]">Help:</strong> For help, reply <strong className="text-[#F59E0B]">HELP</strong> to any message, or contact us at fixmyday@use.startmail.com.</p>
                <p><strong className="text-[#F8FAFC]">Consent:</strong> Consent to receive text messages is not a condition of purchase or use of any other FixMyDay.ai service. Consent applies only to the FixMyNight SMS program as described above.</p>
                <p><strong className="text-[#F8FAFC]">Carriers:</strong> Carriers (including but not limited to AT&amp;T, T-Mobile, and Verizon) are not liable for delayed or undelivered messages.</p>
                <p><strong className="text-[#F8FAFC]">Privacy:</strong> See our <Link to={ROUTES.PRIVACY} className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">Privacy Policy</Link> for information about how we handle your mobile information. No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</p>
              </div>
            </div>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">3. User Accounts and Access</h2>
            <p>
              Access to the FixMyNight client portal requires authentication. Business
              administrators are responsible for maintaining the confidentiality of their
              login credentials and for all activity that occurs under their account.
            </p>
            <p>
              Technicians added to the system by a business administrator are responsible
              for their own SMS interactions with the service. By responding to messages
              from the FixMyNight system, technicians consent to receive ongoing
              service-related SMS communications.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the service for any unlawful purpose</li>
              <li>Provide false or misleading information</li>
              <li>Interfere with or disrupt the service or its infrastructure</li>
              <li>Attempt to gain unauthorized access to any part of the service</li>
              <li>Use the service to send unsolicited commercial messages</li>
            </ul>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">5. AI Voice Agent Disclaimer</h2>
            <p>
              The FixMyNight AI voice agent is an automated system. While designed to
              accurately handle after-hours calls, it may occasionally misinterpret caller
              intent or fail to capture all details. The AI agent does not provide
              professional, medical, legal, or safety advice. For life-threatening
              emergencies, callers should contact 911 or their local emergency services.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">6. Service Availability</h2>
            <p>
              We strive to maintain continuous service availability but do not guarantee
              uninterrupted operation. The service may experience downtime due to
              maintenance, updates, or circumstances beyond our control including carrier
              network issues, third-party service outages, or force majeure events.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, FixMyDay.ai shall not be liable for
              any indirect, incidental, special, consequential, or punitive damages arising
              from your use of the service, including but not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Missed or delayed SMS or voice call delivery</li>
              <li>Misinterpretation of caller intent by the AI agent</li>
              <li>Failure to reach an on-call technician</li>
              <li>Service interruptions or downtime</li>
              <li>Actions taken or not taken based on AI-generated call summaries</li>
            </ul>
            <p>
              The service is provided "as is" and "as available" without warranties of any
              kind, whether express or implied.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">8. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless FixMyDay.ai and its officers,
              employees, and agents from any claims, damages, losses, or expenses arising
              from your use of the service or violation of these Terms.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">9. Termination</h2>
            <p>
              Either party may terminate the service at any time. We reserve the right to
              suspend or terminate access to the service for violations of these Terms or
              for non-payment. Upon termination, your right to use the service ceases
              immediately. Call data may be retained for up to 30 days following termination.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">10. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Changes will be posted on this
              page with an updated "Last updated" date. Continued use of the service after
              changes are posted constitutes acceptance of the updated Terms. For material
              changes, we will notify active clients via email.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">11. Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of the
              State of Texas, without regard to conflict of law provisions.
            </p>

            <h2 className="text-lg font-semibold text-[#0F172A] mt-8">12. Contact Us</h2>
            <p>If you have questions about these Terms, contact us:</p>
            <ul className="list-none space-y-1">
              <li><strong>Business:</strong> FixMyDay.ai</li>
              <li><strong>Email:</strong> <a href="mailto:fixmyday@use.startmail.com" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">fixmyday@use.startmail.com</a></li>
              <li><strong>Phone:</strong> <a href="tel:+13466916723" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">(346) 691-6723</a></li>
              <li><strong>Website:</strong> <a href="https://fixmyday.ai" className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706]">https://fixmyday.ai</a></li>
            </ul>

            <div className="mt-8 pt-6 border-t border-[#E2E8F0] text-sm text-[#94A3B8]">
              <p>
                See also: <Link to={ROUTES.PRIVACY} className="font-medium text-[#F59E0B] hover:text-[#D97706]">Privacy Policy</Link> | <Link to={ROUTES.LEGAL} className="font-medium text-[#F59E0B] hover:text-[#D97706]">Legal Information</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
