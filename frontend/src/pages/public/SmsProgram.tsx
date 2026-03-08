import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const serif = "'DM Serif Display', serif";
const border = 'rgba(148, 163, 184, 0.12)';
const amberGlow = 'rgba(245, 158, 11, 0.12)';

export default function SmsProgram() {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F1F5F9] leading-relaxed antialiased">
      {/* ── Top Bar ── */}
      <div
        className="sticky top-0 z-10 backdrop-blur-xl px-8 py-4"
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: `1px solid ${border}`,
        }}
      >
        <div className="max-w-[900px] mx-auto flex items-center justify-between">
          <Link
            to="/"
            className="text-xl no-underline"
            style={{ fontFamily: serif }}
          >
            <span className="text-[#F59E0B]">FixMy</span>
            <span className="text-[#F1F5F9]">Day</span>
            <span className="text-[#F59E0B]">.ai</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              to="/fixmynight"
              className="text-[#94A3B8] text-sm font-medium no-underline hover:text-[#F59E0B] transition-colors"
            >
              FixMyNight
            </Link>
            <Link
              to="/terms"
              className="text-[#94A3B8] text-sm font-medium no-underline hover:text-[#F59E0B] transition-colors"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              className="text-[#94A3B8] text-sm font-medium no-underline hover:text-[#F59E0B] transition-colors"
            >
              Privacy
            </Link>
          </nav>
        </div>
      </div>

      {/* ── Hero ── */}
      <div
        className="max-w-[900px] mx-auto px-8 pt-14 pb-8"
        style={{ borderBottom: `1px solid ${border}` }}
      >
        <span
          className="inline-block text-xs font-semibold uppercase tracking-wider text-[#F59E0B] px-3.5 py-1.5 rounded-full mb-4"
          style={{
            background: amberGlow,
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          SMS Program
        </span>
        <h1
          className="text-4xl font-normal text-white mb-3"
          style={{ fontFamily: serif, lineHeight: 1.25 }}
        >
          SMS/Text Messaging Program
        </h1>
        <p className="text-[#94A3B8] text-lg max-w-xl" style={{ lineHeight: 1.65 }}>
          Complete information about the FixMyNight SMS messaging program,
          including how consent is collected, what messages are sent, and how to
          opt out.
        </p>
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-[900px] mx-auto px-8 pb-16">
        {/* Section 1: Program Details */}
        <Section label="Program Details" title="FixMyNight SMS Program">
          <p className="text-[#94A3B8] text-[0.95rem] mb-4">
            FixMyNight is an after-hours answering service for service
            contractors, operated by FixMyDay.ai (Grasham Farm LLC). The SMS
            program supports on-call technician management and business owner
            notifications.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5">
            <DetailItem label="Brand" value="FixMyDay.ai (Grasham Farm LLC)" />
            <DetailItem
              label="Program Name"
              value="FixMyNight After-Hours Answering Service"
            />
            <DetailItem
              label="Phone Number Type"
              value="10-digit long code (10DLC)"
            />
            <DetailItem
              label="Message Frequency"
              value="Varies based on call volume and service activity"
            />
          </div>

          <InfoCard>
            <h3 className="text-base font-semibold text-white mb-2">
              Message Types
            </h3>
            <p className="text-[#94A3B8] text-sm leading-relaxed mb-3">
              The FixMyNight SMS program sends the following types of messages:
            </p>
            <MessageType
              title="Technician verification"
              desc="initial verification message when a technician is added to the system."
            />
            <MessageType
              title="On-call management"
              desc="responses to ON, OFF, and STATUS keyword commands."
            />
            <MessageType
              title="Emergency dispatch alerts"
              desc="notifications when an emergency caller needs to be connected to the on-call technician."
            />
            <MessageType
              title="On-call status changes"
              desc="notifications when another technician takes over on-call duty."
            />
            <MessageType
              title="Morning summary notifications"
              desc="daily summary of overnight call activity sent to business administrators."
            />
            <MessageType
              title="Service notifications"
              desc="important updates about the FixMyNight service."
              last
            />
          </InfoCard>
        </Section>

        {/* Section 2: How Consent Works */}
        <Section
          label="Consent &amp; Opt-In"
          title="How Users Consent to Receive Messages"
        >
          <p className="text-[#94A3B8] text-[0.95rem] mb-4">
            FixMyNight collects SMS consent through two methods, depending on
            the user type. Both methods are initiated through the FixMyNight
            admin portal, which is a login-protected business management
            dashboard.
          </p>

          {/* Opt-In Method 1: Technicians */}
          <InfoCard accent>
            <h3 className="text-base font-semibold text-white mb-4">
              Opt-In Method 1: Technicians
            </h3>
            <Step num={1} title="Administrator adds technician">
              An authorized business administrator adds the technician's name
              and mobile phone number through the FixMyNight admin portal at{' '}
              <strong className="text-[#F1F5F9]">
                fixmyday.ai/fixmynight/admin
              </strong>{' '}
              (login required).
            </Step>
            <Step num={2} title="Verification SMS is sent">
              The system automatically sends a one-time verification SMS to the
              technician's mobile number, introducing the service and providing
              opt-out instructions.
            </Step>
            <Step num={3} title="Technician opts in via keyword">
              The technician explicitly opts in to on-call notifications by
              texting the keyword{' '}
              <strong className="text-[#F59E0B]">ON</strong> to the business's
              dedicated FixMyNight phone number. No further messages are sent
              until the technician texts ON.
            </Step>
          </InfoCard>

          {/* Admin Portal Screenshot */}
          <div
            className="my-7 rounded-xl overflow-hidden"
            style={{ border: `1px solid ${border}` }}
          >
            <div className="bg-white">
              <img
                src="/admin-technician-screenshot.png"
                alt="FixMyNight admin portal — Technician management interface showing the Add Technician form and technician list with verification status"
                className="w-full block"
              />
            </div>
            <div
              className="bg-[#1E293B] px-5 py-3.5 text-xs text-[#64748B] italic"
              style={{ borderTop: `1px solid ${border}` }}
            >
              FixMyNight admin portal — Technician management screen.
              Administrators add technicians by name and phone number. The
              system tracks verification and on-call status for each technician.
            </div>
          </div>

          {/* Opt-In Method 2: Business Owners */}
          <InfoCard accent>
            <h3 className="text-base font-semibold text-white mb-4">
              Opt-In Method 2: Business Owners
            </h3>
            <Step num={1} title="Account setup">
              Business owners provide their mobile number and consent to receive
              service alerts (emergency fallback notifications and morning call
              summaries) during account setup on the admin portal at{' '}
              <strong className="text-[#F1F5F9]">
                fixmyday.ai/fixmynight/admin
              </strong>{' '}
              (login required).
            </Step>
            <Step num={2} title="Consent acknowledged">
              By providing their phone number during account setup, business
              owners consent to receive service-related SMS messages as
              described in this SMS program disclosure and the FixMyDay.ai Terms
              of Service.
            </Step>
          </InfoCard>
        </Section>

        {/* Section 3: Sample Messages */}
        <Section label="Sample Messages" title="Example SMS Messages">
          <p className="text-[#94A3B8] text-[0.95rem] mb-4">
            Below are examples of the SMS messages sent by the FixMyNight
            program.
          </p>

          <div className="flex flex-col gap-4 my-5">
            <SmsBubble label="Verification SMS (sent when technician is added)">
              You have been added as a technician for Stellar HVAC via
              FixMyNight. Text ON to go on-call. Text STOP to opt out. Text HELP
              for help. Msg &amp; data rates may apply.
            </SmsBubble>
            <SmsBubble label="On-Call Confirmation (after texting ON)">
              You are now on-call for Stellar HVAC. Emergency calls will be
              forwarded to you. Text OFF to go off-call. Text STATUS to check
              your status.
            </SmsBubble>
            <SmsBubble label="Off-Call Confirmation (after texting OFF)">
              You are now off-call for Stellar HVAC. You will not receive
              emergency calls. Text ON to go back on-call.
            </SmsBubble>
            <SmsBubble label="Opt-Out Confirmation (after texting STOP)">
              You have been opted out of FixMyNight messages for Stellar HVAC.
              You will no longer receive on-call alerts. Text ON to
              re-subscribe.
            </SmsBubble>
            <SmsBubble label="Help Response (after texting HELP)">
              FixMyNight by FixMyDay.ai — after-hours answering for service
              contractors. For support, email fixmyday@use.startmail.com or
              visit https://fixmyday.ai. Text STOP to opt out. Msg &amp; data
              rates may apply.
            </SmsBubble>
          </div>
        </Section>

        {/* Section 4: Keywords & Opt-Out */}
        <Section
          label="Keywords &amp; Opt-Out"
          title="SMS Keywords and How to Opt Out"
        >
          <p className="text-[#94A3B8] text-[0.95rem] mb-4">
            You can manage your FixMyNight SMS subscription at any time by
            texting any of the following keywords to your business's FixMyNight
            phone number.
          </p>

          <table className="w-full text-sm my-4" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th
                  className="text-left px-4 py-3 text-[#64748B] text-xs uppercase tracking-wider font-semibold"
                  style={{ borderBottom: `1px solid ${border}` }}
                >
                  Keyword
                </th>
                <th
                  className="text-left px-4 py-3 text-[#64748B] text-xs uppercase tracking-wider font-semibold"
                  style={{ borderBottom: `1px solid ${border}` }}
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              <KeywordRow
                keyword="ON / START / YES"
                action="Opt in to on-call notifications and go on-call"
              />
              <KeywordRow
                keyword="OFF"
                action="Go off-call (stop receiving emergency dispatches)"
              />
              <KeywordRow
                keyword="STATUS"
                action="Check your current on-call status"
              />
              <KeywordRow
                keyword="STOP / CANCEL / UNSUBSCRIBE / END / QUIT"
                action="Opt out of all FixMyNight SMS messages"
              />
              <KeywordRow
                keyword="HELP / INFO"
                action="Receive program information and support contact"
              />
            </tbody>
          </table>

          <InfoCard>
            <p className="text-[#94A3B8] text-sm leading-relaxed mb-0">
              After opting out by texting STOP, you will receive a single
              confirmation message and no further messages will be sent unless
              you re-enroll by texting ON. You may also contact your business
              administrator to have your number removed from the system
              entirely.
            </p>
          </InfoCard>
        </Section>

        {/* Section 5: Required Disclosures */}
        <Section label="Disclosures" title="Required Disclosures">
          <InfoCard>
            <Disclosure title="Message frequency:">
              Message frequency varies based on call volume and service
              activity. Technicians on-call may receive multiple messages per
              shift during high-activity periods.
            </Disclosure>
            <Disclosure title="Message and data rates may apply.">
              Contact your mobile carrier for details about your messaging plan.
            </Disclosure>
            <Disclosure title="Consent:">
              Consent to receive text messages is not a condition of purchase or
              use of any other FixMyDay.ai service. Consent applies only to the
              FixMyNight SMS program as described on this page.
            </Disclosure>
            <Disclosure title="Carriers:">
              Carriers (including but not limited to AT&amp;T, T-Mobile, and
              Verizon) are not liable for delayed or undelivered messages.
            </Disclosure>
            <Disclosure title="Privacy:" last>
              No mobile information will be shared with third parties or
              affiliates for marketing or promotional purposes. See our{' '}
              <Link to="/privacy" className="text-[#F59E0B] no-underline hover:underline">
                Privacy Policy
              </Link>{' '}
              for full details on how we handle your information.
            </Disclosure>
          </InfoCard>
        </Section>

        {/* Section 6: Contact & Related Policies */}
        <Section
          label="Support &amp; Links"
          title="Contact &amp; Related Policies"
          last
        >
          <p className="text-[#94A3B8] text-[0.95rem] mb-4">
            For questions or support regarding the FixMyNight SMS program,
            contact us at{' '}
            <a
              href="mailto:fixmyday@use.startmail.com"
              className="text-[#F59E0B] no-underline hover:underline"
            >
              fixmyday@use.startmail.com
            </a>
            .
          </p>
          <div className="flex flex-wrap gap-6 my-4">
            <Link
              to="/fixmynight"
              className="text-[#F59E0B] text-sm font-medium no-underline border-b border-transparent hover:border-[#F59E0B] transition-colors"
            >
              FixMyNight Product Page
            </Link>
            <Link
              to="/terms"
              className="text-[#F59E0B] text-sm font-medium no-underline border-b border-transparent hover:border-[#F59E0B] transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy"
              className="text-[#F59E0B] text-sm font-medium no-underline border-b border-transparent hover:border-[#F59E0B] transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
        </Section>
      </div>

      {/* ── Footer ── */}
      <div className="max-w-[900px] mx-auto px-8 py-8 text-center text-[#64748B] text-xs">
        &copy; 2025–2026 Grasham Farm LLC, DBA FixMyDay.ai. All rights
        reserved.
        <br />
        <Link to="/" className="text-[#94A3B8] no-underline hover:underline">
          fixmyday.ai
        </Link>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Section({
  label,
  title,
  last,
  children,
}: {
  label: string;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="py-10"
      style={last ? undefined : { borderBottom: `1px solid ${border}` }}
    >
      <div
        className="text-[0.7rem] font-semibold uppercase tracking-widest text-[#F59E0B] mb-3"
        dangerouslySetInnerHTML={{ __html: label }}
      />
      <h2
        className="text-2xl font-normal text-white mb-4"
        style={{ fontFamily: serif }}
        dangerouslySetInnerHTML={{ __html: title }}
      />
      {children}
    </div>
  );
}

function InfoCard({
  accent,
  children,
}: {
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-[#1E293B] rounded-xl p-7 my-5"
      style={{
        border: `1px solid ${border}`,
        borderLeft: accent ? '3px solid #F59E0B' : `1px solid ${border}`,
      }}
    >
      {children}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="bg-[#1E293B] rounded-lg p-5"
      style={{ border: `1px solid ${border}` }}
    >
      <div className="text-[0.7rem] uppercase tracking-wider text-[#64748B] font-semibold mb-1">
        {label}
      </div>
      <div className="text-[#F1F5F9] text-[0.95rem] font-medium">{value}</div>
    </div>
  );
}

function MessageType({
  title,
  desc,
  last,
}: {
  title: string;
  desc: string;
  last?: boolean;
}) {
  return (
    <p
      className={`text-[#94A3B8] text-sm leading-relaxed ${last ? 'mb-0' : 'mb-3'}`}
    >
      <strong className="text-[#F1F5F9]">{title}</strong> — {desc}
    </p>
  );
}

function Step({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-5 my-6 items-start">
      <div
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-[#F59E0B] mt-0.5"
        style={{
          background: amberGlow,
          border: '1px solid rgba(245, 158, 11, 0.3)',
        }}
      >
        {num}
      </div>
      <div>
        <h4 className="text-[0.95rem] font-semibold text-white mb-1">
          {title}
        </h4>
        <p className="text-sm text-[#94A3B8] mb-0 leading-relaxed">
          {children}
        </p>
      </div>
    </div>
  );
}

function SmsBubble({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-[#1E293B] rounded-xl p-5 max-w-[480px]"
      style={{ border: `1px solid ${border}` }}
    >
      <div className="text-[0.7rem] uppercase tracking-wider text-[#F59E0B] font-semibold mb-2">
        {label}
      </div>
      <div
        className="text-[0.88rem] text-[#F1F5F9] leading-relaxed rounded-lg px-4 py-3.5"
        style={{ background: 'rgba(148, 163, 184, 0.08)' }}
      >
        {children}
      </div>
    </div>
  );
}

function KeywordRow({ keyword, action }: { keyword: string; action: string }) {
  return (
    <tr>
      <td
        className="px-4 py-3 text-[#F59E0B] font-semibold"
        style={{ borderBottom: `1px solid ${border}` }}
      >
        {keyword}
      </td>
      <td
        className="px-4 py-3 text-[#94A3B8]"
        style={{ borderBottom: `1px solid ${border}` }}
      >
        {action}
      </td>
    </tr>
  );
}

function Disclosure({
  title,
  last,
  children,
}: {
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p
      className={`text-[#94A3B8] text-sm leading-relaxed ${last ? 'mb-0' : 'mb-3'}`}
    >
      <strong className="text-[#F1F5F9]">{title}</strong> {children}
    </p>
  );
}
