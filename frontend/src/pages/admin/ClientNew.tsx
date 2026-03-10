import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { ROUTES } from '../../routes';
import type { Client, ClientCreatePayload, BusinessHoursSchedule } from '../../types';
import { defaultSchedule } from '../../types';
import PhoneInput from '../../components/PhoneInput';
import TimePicker from '../../components/TimePicker';
import ErrorBanner from '../../components/ErrorBanner';
import BusinessHoursEditor from '../../components/BusinessHoursEditor';

const INDUSTRIES = [
  'HVAC', 'Plumbing', 'Electrical', 'Locksmith', 'Pest Control',
  'Roofing', 'Appliance Repair', 'General Contractor', 'Property Management', 'Other',
];

const INDUSTRY_EXAMPLES: Record<string, { emergency: string; routine: string }> = {
  HVAC: { emergency: 'AC not working, no heat, furnace failure, refrigerant leak', routine: 'Scheduling maintenance, filter replacement, thermostat help, requesting a quote' },
  Plumbing: { emergency: 'Burst pipe, sewage backup, flooding, no water, water heater leaking, overflowing toilet', routine: 'Dripping faucet, slow drain, scheduling repair, requesting a quote' },
  Electrical: { emergency: 'Sparking outlet, burning smell from panel, power outage in part of house, exposed wires, breaker won\'t reset', routine: 'Light fixture install, outlet not working, scheduling inspection, requesting a quote' },
  Locksmith: { emergency: 'Locked out of house, locked out of car, broken lock, break-in damage, lost all keys, child or pet locked in car', routine: 'Rekey locks, install new deadbolt, make spare keys, lock upgrade' },
  'Pest Control': { emergency: 'Wasp nest near entry, snake inside, rodent infestation', routine: 'Quarterly treatment, ant problem, termite inspection' },
  Roofing: { emergency: 'Active roof leak, storm damage, tree on roof', routine: 'Inspection request, gutter cleaning, quote for replacement' },
  'Appliance Repair': { emergency: 'Gas leak from appliance, flooding from washer/dishwasher', routine: 'Refrigerator not cooling, dryer not heating, oven repair quote' },
  'General Contractor': { emergency: 'Structural damage, roof collapse, storm damage, flooding from construction defect, broken window/door leaving home unsecured', routine: 'Renovation quote, repair estimate, inspection, project follow-up' },
  'Property Management': { emergency: 'Tenant lockout, major leak, no heat/AC, fire alarm', routine: 'Maintenance request, lease question, noise complaint' },
};

const US_TIMEZONES = [
  { label: 'Eastern (ET)', value: 'America/New_York' },
  { label: 'Central (CT)', value: 'America/Chicago' },
  { label: 'Mountain (MT)', value: 'America/Denver' },
  { label: 'Pacific (PT)', value: 'America/Los_Angeles' },
  { label: 'Arizona (no DST)', value: 'America/Phoenix' },
  { label: 'Alaska (AKT)', value: 'America/Anchorage' },
  { label: 'Hawaii (HT)', value: 'Pacific/Honolulu' },
];

interface TechEntry { name: string; phone: string }

type ProvisionStep = 'phone' | 'record' | 'assistant' | 'activate' | 'verify';
const STEP_LABELS: Record<ProvisionStep, string> = {
  phone: 'Provisioning phone number...',
  record: 'Creating client record...',
  assistant: 'Creating AI assistant...',
  activate: 'Activating client...',
  verify: 'Sending technician verifications...',
};

export default function ClientNew() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [provisionStep, setProvisionStep] = useState<ProvisionStep | null>(null);
  const [provisionError, setProvisionError] = useState('');

  // Section 0: Industry
  const [industry, setIndustry] = useState('HVAC');
  const [otherIndustry, setOtherIndustry] = useState('');
  const [agentName, setAgentName] = useState('Sarah');

  // Section 1: Business Info
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');

  // Section 2: Emergency Config
  const [emergencyEnabled, setEmergencyEnabled] = useState(false);
  const [emergencyFee, setEmergencyFee] = useState('');
  const [adminSmsNumbers, setAdminSmsNumbers] = useState<string[]>(['']);

  // Section 3: Business Hours
  const [schedule, setSchedule] = useState<BusinessHoursSchedule>(defaultSchedule());
  const [bizHoursDispatch, setBizHoursDispatch] = useState(true);

  // Section 4: Sleep Window
  const [sleepEnabled, setSleepEnabled] = useState(false);
  const [sleepStart, setSleepStart] = useState('22:00');
  const [sleepEnd, setSleepEnd] = useState('08:00');

  // Section 5: Notification Timing
  const [summaryTime, setSummaryTime] = useState('07:30');
  const [callbackTime, setCallbackTime] = useState('09:00');

  // Section 6: Technicians
  const [techs, setTechs] = useState<TechEntry[]>([{ name: '', phone: '' }]);

  const updateTech = (idx: number, field: keyof TechEntry, value: string) => {
    setTechs((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  };

  const addTech = () => {
    if (techs.length < 5) setTechs((prev) => [...prev, { name: '', phone: '' }]);
  };

  const removeTech = (idx: number) => {
    if (techs.length > 1) setTechs((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateAdminSms = (idx: number, value: string) => {
    setAdminSmsNumbers((prev) => prev.map((n, i) => (i === idx ? value : n)));
  };

  const addAdminSms = () => {
    setAdminSmsNumbers((prev) => [...prev, '']);
  };

  const removeAdminSms = (idx: number) => {
    if (adminSmsNumbers.length > 1) setAdminSmsNumbers((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = (): string | null => {
    if (!businessName.trim()) return 'Business name is required.';
    if (!ownerName.trim()) return 'Owner name is required.';
    if (!ownerPhone.trim()) return 'Owner phone is required.';
    if (!contactEmail.trim() || !contactEmail.includes('@')) return 'Valid email is required.';
    const enabledDays = Object.values(schedule).filter((d) => d.enabled);
    if (enabledDays.length === 0) return 'Select at least one business day.';
    if (emergencyEnabled && emergencyFee && (isNaN(Number(emergencyFee)) || Number(emergencyFee) < 0)) {
      return 'Emergency fee must be a positive number.';
    }
    const validTechs = techs.filter((t) => t.name.trim() && t.phone.trim());
    if (validTechs.length === 0) return 'At least one technician is required.';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setProvisionError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    // Simulate provisioning steps for UI
    const steps: ProvisionStep[] = ['phone', 'record', 'assistant', 'activate', 'verify'];
    let stepIdx = 0;
    const stepInterval = setInterval(() => {
      if (stepIdx < steps.length) {
        setProvisionStep(steps[stepIdx]);
        stepIdx++;
      }
    }, 800);

    try {
      // Use owner phone as first admin SMS if blank
      const smsNumbers = adminSmsNumbers.filter((n) => n.trim());
      if (smsNumbers.length === 0 && ownerPhone) smsNumbers.push(ownerPhone);

      // Derive legacy fields from schedule for backward compat
      const isoMap: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
      const enabledEntries = Object.entries(schedule).filter(([, v]) => v.enabled);
      const businessDays = enabledEntries.map(([k]) => isoMap[k]).sort();
      const firstEnabled = enabledEntries[0]?.[1];

      const payload: ClientCreatePayload = {
        business_name: businessName.trim(),
        owner_name: ownerName.trim(),
        owner_phone: ownerPhone,
        contact_email: contactEmail.trim(),
        timezone,
        industry: industry === 'Other' ? 'general' : industry.toLowerCase().replace(/ /g, '_'),
        agent_name: agentName.trim() || 'Sarah',
        emergency_enabled: emergencyEnabled,
        emergency_fee: emergencyEnabled && emergencyFee ? Number(emergencyFee) : null,
        admin_sms_numbers: smsNumbers,
        business_hours_start: firstEnabled?.start || '08:00',
        business_hours_end: firstEnabled?.end || '18:00',
        business_days: businessDays,
        business_hours_schedule: schedule,
        business_hours_emergency_dispatch: bizHoursDispatch,
        sleep_window_start: sleepEnabled ? sleepStart : null,
        sleep_window_end: sleepEnabled ? sleepEnd : null,
        summary_send_time: summaryTime,
        callback_expected_time: callbackTime,
        technicians: techs.filter((t) => t.name.trim() && t.phone.trim()),
      };

      const client = await api<Client>('/api/v1/admin/clients', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      clearInterval(stepInterval);
      navigate(ROUTES.ADMIN_CLIENT_DETAIL(client.id));
    } catch (err) {
      clearInterval(stepInterval);
      setSubmitting(false);
      setProvisionStep(null);
      if (err instanceof ApiError) {
        setProvisionError(err.message);
      } else {
        setProvisionError('An unexpected error occurred. Contact support.');
      }
    }
  };

  const industryKey = industry === 'Other' ? null : industry;
  const examples = industryKey ? INDUSTRY_EXAMPLES[industryKey] : null;

  // Provisioning progress UI
  if (submitting) {
    const steps: ProvisionStep[] = ['phone', 'record', 'assistant', 'activate', 'verify'];
    const currentIdx = provisionStep ? steps.indexOf(provisionStep) : -1;

    return (
      <div className="max-w-lg mx-auto mt-12">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Setting up {businessName}...</h1>
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-3">
          {steps.map((step, idx) => {
            let icon = '⬜';
            if (idx < currentIdx) icon = '✅';
            else if (idx === currentIdx) icon = provisionError ? '❌' : '⏳';
            return (
              <div key={step} className="flex items-center gap-3 text-sm">
                <span>{icon}</span>
                <span className={idx <= currentIdx ? 'text-gray-900' : 'text-gray-400'}>
                  {STEP_LABELS[step]}
                </span>
              </div>
            );
          })}
        </div>
        {provisionError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-700">{provisionError}</p>
            <button
              onClick={() => { setSubmitting(false); setProvisionStep(null); setProvisionError(''); }}
              className="mt-2 text-sm text-[#F59E0B] underline"
            >
              Go back and try again
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">New Client</h1>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 0: Industry */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Industry</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
            {industry === 'Other' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Describe Industry</label>
                <input
                  type="text"
                  value={otherIndustry}
                  onChange={(e) => setOtherIndustry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="e.g. Pool maintenance"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Sarah"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <p className="mt-1 text-xs text-gray-500">The name the AI agent uses when answering calls.</p>
            </div>
            {examples && (
              <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700 space-y-1">
                <p><strong>{agentName || 'Sarah'}</strong> will recognize these as <span className="text-red-600 font-medium">emergencies</span>: {examples.emergency}</p>
                <p><strong>{agentName || 'Sarah'}</strong> will treat these as <span className="text-[#F59E0B] font-medium">routine</span>: {examples.routine}</p>
              </div>
            )}
          </div>
        </section>

        {/* Section 1: Business Info */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Business Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Name *</label>
              <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name *</label>
              <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner Phone *</label>
              <PhoneInput value={ownerPhone} onChange={setOwnerPhone} className="w-full" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email *</label>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone *</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                {US_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Section 2: Emergency Config */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Emergency Configuration</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={emergencyEnabled} onChange={(e) => setEmergencyEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#F59E0B] focus:ring-[#F59E0B]" />
              <span className="text-sm font-medium text-gray-700">Enable Emergency Dispatch</span>
            </label>
            <p className="text-xs text-gray-500 -mt-2">When OFF, the AI logs all calls for morning summary only — no live transfers.</p>

            {emergencyEnabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Fee</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500">$</span>
                  <input type="number" step="0.01" min="0" value={emergencyFee} onChange={(e) => setEmergencyFee(e.target.value)} placeholder="0.00" className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <p className="mt-1 text-xs text-gray-500">Leave blank for no fee.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Fallback SMS Numbers</label>
              <p className="text-xs text-gray-500 mb-2">Phone numbers that receive an SMS alert if an emergency call transfer to the on-call technician fails. Usually the business owner's mobile number.</p>
              {adminSmsNumbers.map((num, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <PhoneInput value={num} onChange={(v) => updateAdminSms(idx, v)} className="flex-1" />
                  {adminSmsNumbers.length > 1 && (
                    <button type="button" onClick={() => removeAdminSms(idx)} className="text-red-500 text-sm hover:text-red-700">&times;</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addAdminSms} className="text-sm text-[#F59E0B] hover:text-[#D97706]">+ Add number</button>
            </div>
          </div>
        </section>

        {/* Section 3: Business Hours */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Business Hours</h2>
          <div className="space-y-4">
            <BusinessHoursEditor schedule={schedule} onChange={setSchedule} />
            <label className="flex items-center gap-3 cursor-pointer mt-3">
              <input type="checkbox" checked={bizHoursDispatch} onChange={(e) => setBizHoursDispatch(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#F59E0B] focus:ring-[#F59E0B]" />
              <span className="text-sm font-medium text-gray-700">Emergency Dispatch During Business Hours</span>
            </label>
          </div>
        </section>

        {/* Section 4: Sleep Window */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Sleep Window</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={sleepEnabled} onChange={(e) => setSleepEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#F59E0B] focus:ring-[#F59E0B]" />
              <span className="text-sm font-medium text-gray-700">Enable Sleep Window</span>
            </label>
            <p className="text-xs text-gray-500">Sleep window prevents live emergency transfers during late night hours. Emergencies are still logged and flagged urgent for your morning summary.</p>

            {sleepEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sleep Start</label>
                  <TimePicker value={sleepStart} onChange={setSleepStart} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sleep End</label>
                  <TimePicker value={sleepEnd} onChange={setSleepEnd} required />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 5: Notification Timing */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Notification Timing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Morning Summary Time</label>
              <TimePicker value={summaryTime} onChange={setSummaryTime} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Callback Time</label>
              <TimePicker value={callbackTime} onChange={setCallbackTime} required />
              <p className="mt-1 text-xs text-gray-500">The AI agent will tell callers: "Our team will call you back at [time]."</p>
            </div>
          </div>
          {summaryTime > callbackTime && (
            <p className="mt-2 text-xs text-amber-600">Warning: Summary time is after callback time. You may not see the summary before callbacks are expected.</p>
          )}
        </section>

        {/* Section 6: Technicians */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Technicians</h2>
          <div className="space-y-3">
            {techs.map((tech, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Name"
                    value={tech.name}
                    onChange={(e) => updateTech(idx, 'name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div className="flex-1">
                  <PhoneInput value={tech.phone} onChange={(v) => updateTech(idx, 'phone', v)} className="w-full" />
                </div>
                {techs.length > 1 && (
                  <button type="button" onClick={() => removeTech(idx)} className="text-red-500 text-sm hover:text-red-700">&times;</button>
                )}
              </div>
            ))}
            {techs.length < 5 && (
              <button type="button" onClick={addTech} className="text-sm text-[#F59E0B] hover:text-[#D97706]">+ Add technician</button>
            )}
            <p className="text-xs text-gray-500">Each technician will receive a welcome SMS confirming their number. They manage on-call status by texting ON or OFF to the business number.</p>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="bg-brand text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-brand-light disabled:opacity-50"
          >
            Create Client
          </button>
        </div>
      </form>
    </div>
  );
}
