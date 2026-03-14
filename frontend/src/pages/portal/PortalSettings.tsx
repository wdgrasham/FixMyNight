import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api';
import type { Client, PortalSettingsPayload, BusinessHoursSchedule } from '../../types';
import { defaultSchedule, industryLabel } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import TimePicker from '../../components/TimePicker';
import PhoneInput from '../../components/PhoneInput';
import SaveIndicator from '../../components/SaveIndicator';
import BusinessHoursEditor from '../../components/BusinessHoursEditor';

const VAPI_REBUILD_TRIGGERS = new Set([
  'emergency_fee', 'emergency_enabled', 'callback_expected_time',
  'business_hours_start', 'business_hours_end', 'business_days',
  'business_hours_schedule',
  'sleep_window_start', 'sleep_window_end', 'business_hours_emergency_dispatch',
]);

export default function PortalSettings() {
  const { clientId } = useParams<{ clientId: string }>();
  const [settings, setSettings] = useState<Client | null>(null);
  const [originalSettings, setOriginalSettings] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [vapiNotice, setVapiNotice] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<Client>(`/api/v1/portal/${clientId}/settings`);
        setSettings(data);
        setOriginalSettings(data);
      } catch {
        setError('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId]);

  const update = (field: keyof PortalSettingsPayload, value: unknown) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value } as Client);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaveStatus('saving');
    setSaveError('');
    setVapiNotice(false);

    const payload: PortalSettingsPayload = {
      callback_expected_time: settings.callback_expected_time,
      summary_send_time: settings.summary_send_time,
      sleep_window_start: settings.sleep_window_start,
      sleep_window_end: settings.sleep_window_end,
      business_hours_start: settings.business_hours_start,
      business_hours_end: settings.business_hours_end,
      business_days: settings.business_days,
      business_hours_schedule: settings.business_hours_schedule || undefined,
      business_hours_emergency_dispatch: settings.business_hours_emergency_dispatch,
      emergency_fee: settings.emergency_fee,
      emergency_enabled: settings.emergency_enabled,
      contact_email: settings.contact_email,
      admin_sms_numbers: settings.admin_sms_numbers,
    };

    try {
      await api(`/api/v1/portal/${clientId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      // PATCH returns {"status": "updated"}, not the full settings object.
      // Keep local state as-is (it already has the correct values) and
      // update originalSettings to match so the Vapi trigger check works.
      setOriginalSettings({ ...settings });
      setSaveStatus('saved');

      // Check if any Vapi rebuild trigger actually changed
      if (originalSettings) {
        const triggerChanged = [...VAPI_REBUILD_TRIGGERS].some((f) => {
          const key = f as keyof Client;
          return JSON.stringify((payload as unknown as Record<string, unknown>)[f]) !== JSON.stringify((originalSettings as unknown as Record<string, unknown>)[key]);
        });
        if (triggerChanged) {
          setVapiNotice(true);
          setTimeout(() => setVapiNotice(false), 8000);
        }
      }

      if (savedTimeout.current) clearTimeout(savedTimeout.current);
      savedTimeout.current = setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      const message = err instanceof Error ? err.message : 'Failed to save settings.';
      setSaveError(message);
    }
  };

  const updateSchedule = (schedule: BusinessHoursSchedule) => {
    if (!settings) return;
    setSettings({ ...settings, business_hours_schedule: schedule } as Client);
  };

  const updateAdminSms = (idx: number, value: string) => {
    if (!settings) return;
    const nums = [...settings.admin_sms_numbers];
    nums[idx] = value;
    update('admin_sms_numbers', nums);
  };

  const addAdminSms = () => {
    if (!settings) return;
    update('admin_sms_numbers', [...settings.admin_sms_numbers, '']);
  };

  const removeAdminSms = (idx: number) => {
    if (!settings || settings.admin_sms_numbers.length <= 1) return;
    update('admin_sms_numbers', settings.admin_sms_numbers.filter((_, i) => i !== idx));
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!settings) return null;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <div className="flex items-center gap-3">
          <SaveIndicator status={saveStatus} />
          <button onClick={handleSave} className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-light">
            Save Changes
          </button>
        </div>
      </div>

      {saveError && (
        <ErrorBanner message={saveError} onDismiss={() => { setSaveError(''); setSaveStatus('idle'); }} />
      )}

      {vapiNotice && (
        <div className="mb-4 p-3 bg-brand-50 border border-brand-100 rounded-md text-sm text-[#F59E0B]">
          The AI agent's script is being updated to reflect this change. This takes a few seconds.
        </div>
      )}

      {!settings.emergency_enabled && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          Emergency dispatch is OFF. The AI agent will log all calls for morning follow-up only. No live transfers will be attempted.
        </div>
      )}

      <div className="space-y-6">
        {/* Business Info (read-only) */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Business Info</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Business</dt>
              <dd className="text-gray-900 font-medium">{settings.business_name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Industry</dt>
              <dd className="text-gray-900">{industryLabel((settings as unknown as Record<string, unknown>).industry as string)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Agent Name</dt>
              <dd className="text-gray-900">{settings.agent_name}</dd>
            </div>
          </dl>
        </section>

        {/* Callback Timing */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Callback Timing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Morning Summary Time</label>
              <TimePicker value={settings.summary_send_time} onChange={(v) => update('summary_send_time', v)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Callback Time</label>
              <TimePicker value={settings.callback_expected_time} onChange={(v) => update('callback_expected_time', v)} />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">Changes take effect on the next cron run or call.</p>
        </section>

        {/* Business Hours */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Business Hours</h2>
          <div className="space-y-4">
            <BusinessHoursEditor
              schedule={settings.business_hours_schedule || defaultSchedule()}
              onChange={updateSchedule}
            />
            <label className="flex items-center gap-3 cursor-pointer mt-3">
              <input
                type="checkbox"
                checked={settings.business_hours_emergency_dispatch}
                onChange={(e) => update('business_hours_emergency_dispatch', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#F59E0B] focus:ring-[#F59E0B]"
              />
              <span className="text-sm font-medium text-gray-700">Emergency Dispatch During Business Hours</span>
            </label>
          </div>
        </section>

        {/* Sleep Window */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Sleep Window</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.sleep_window_start}
                onChange={(e) => {
                  if (!settings) return;
                  if (e.target.checked) {
                    setSettings({ ...settings, sleep_window_start: '22:00', sleep_window_end: '08:00' } as Client);
                  } else {
                    setSettings({ ...settings, sleep_window_start: null, sleep_window_end: null } as Client);
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-[#F59E0B] focus:ring-[#F59E0B]"
              />
              <span className="text-sm font-medium text-gray-700">Enable Sleep Window</span>
            </label>
            {settings.sleep_window_start && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sleep Start</label>
                  <TimePicker value={settings.sleep_window_start} onChange={(v) => update('sleep_window_start', v)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sleep End</label>
                  <TimePicker value={settings.sleep_window_end || ''} onChange={(v) => update('sleep_window_end', v)} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Emergency Settings */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Emergency Settings</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.emergency_enabled}
                onChange={(e) => update('emergency_enabled', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#F59E0B] focus:ring-[#F59E0B]"
              />
              <span className="text-sm font-medium text-gray-700">Emergency Dispatch</span>
            </label>
            {settings.emergency_enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Fee</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings.emergency_fee ?? ''}
                    onChange={(e) => update('emergency_fee', e.target.value ? Number(e.target.value) : null)}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Notifications</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
              <input
                type="email"
                value={settings.contact_email}
                onChange={(e) => update('contact_email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Fallback SMS Numbers</label>
              <p className="text-xs text-gray-500 mb-2">Phone numbers that receive an SMS alert if an emergency call transfer to the on-call technician fails. Usually the business owner's mobile number.</p>
              {settings.admin_sms_numbers.map((num, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <PhoneInput value={num} onChange={(v) => updateAdminSms(idx, v)} className="flex-1" />
                  {settings.admin_sms_numbers.length > 1 && (
                    <button type="button" onClick={() => removeAdminSms(idx)} className="text-red-500 text-sm hover:text-red-700">&times;</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addAdminSms} className="text-sm text-[#F59E0B] hover:text-[#D97706]">+ Add number</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
