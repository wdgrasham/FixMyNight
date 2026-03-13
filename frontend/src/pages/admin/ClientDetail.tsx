import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { ROUTES } from '../../routes';
import type { Client, Technician } from '../../types';
import { DAY_KEYS, DAY_LABELS, defaultSchedule, industryLabel, INDUSTRY_LABELS } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import StatusBadge from '../../components/StatusBadge';
import ConfirmModal from '../../components/ConfirmModal';
import PhoneInput, { formatPhoneDisplay } from '../../components/PhoneInput';
import TimePicker, { formatTimeDisplay } from '../../components/TimePicker';
import SaveIndicator from '../../components/SaveIndicator';
import BusinessHoursEditor from '../../components/BusinessHoursEditor';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState('');

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [vapiNotice, setVapiNotice] = useState(false);

  // Cost stats
  const [costStats, setCostStats] = useState<{
    current_month: { label: string; total_calls: number; total_minutes: number; total_cost: number };
    previous_month: { label: string; total_calls: number; total_minutes: number; total_cost: number };
  } | null>(null);

  // New tech form
  const [newTechName, setNewTechName] = useState('');
  const [newTechPhone, setNewTechPhone] = useState('');
  const [techError, setTechError] = useState('');
  const [editingTechId, setEditingTechId] = useState<string | null>(null);
  const [editTechName, setEditTechName] = useState('');
  const [editTechPhone, setEditTechPhone] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [clientData, techData, costData] = await Promise.all([
        api<Client>(`/api/v1/admin/clients/${id}`),
        api<Technician[]>(`/api/v1/admin/clients/${id}/technicians`),
        api<typeof costStats>(`/api/v1/admin/clients/${id}/cost-stats`).catch(() => null),
      ]);
      setClient(clientData);
      setTechs(techData);
      setEditData(clientData);
      if (costData) setCostStats(costData);
    } catch {
      setError('Failed to load client data.');
    } finally {
      setLoading(false);
    }
  };

  const VAPI_REBUILD_TRIGGERS = new Set([
    'emergency_fee', 'emergency_enabled', 'callback_expected_time',
    'business_hours_start', 'business_hours_end', 'business_days',
    'business_hours_schedule',
    'sleep_window_start', 'sleep_window_end', 'business_hours_emergency_dispatch',
    'business_name', 'industry', 'agent_name',
  ]);

  const handleSave = async () => {
    setSaveStatus('saving');
    setVapiNotice(false);
    try {
      // Compute actually changed fields
      const changedFields: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(editData)) {
        if (client && JSON.stringify(val) !== JSON.stringify((client as unknown as Record<string, unknown>)[key])) {
          changedFields[key] = val;
        }
      }
      const updated = await api<Client>(`/api/v1/admin/clients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(changedFields),
      });
      setClient(updated);
      setEditData(updated);
      setSaveStatus('saved');
      setEditing(false);
      if (Object.keys(changedFields).some((f) => VAPI_REBUILD_TRIGGERS.has(f)) && client?.vapi_assistant_id) {
        setVapiNotice(true);
        setTimeout(() => setVapiNotice(false), 5000);
      }
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    }
  };

  const handleDeactivate = async () => {
    try {
      await api(`/api/v1/admin/clients/${id}`, { method: 'DELETE' });
      navigate(ROUTES.ADMIN_CLIENTS);
    } catch {
      setError('Failed to deactivate client.');
    }
    setShowDeactivate(false);
  };

  const handleSendMagicLink = async () => {
    setMagicLinkError('');
    try {
      await api('/api/v1/auth/portal-magic-link', {
        method: 'POST',
        body: JSON.stringify({ client_id: id }),
      });
      setMagicLinkSent(true);
      setTimeout(() => setMagicLinkSent(false), 5000);
    } catch (err) {
      setMagicLinkError(err instanceof ApiError ? err.message : 'Failed to send portal link.');
    }
  };

  const handleAddTech = async () => {
    if (!newTechName.trim() || !newTechPhone.trim()) {
      setTechError('Name and phone are required.');
      return;
    }
    setTechError('');
    try {
      const tech = await api<Technician>(`/api/v1/admin/clients/${id}/technicians`, {
        method: 'POST',
        body: JSON.stringify({ name: newTechName.trim(), phone: newTechPhone }),
      });
      setTechs((prev) => [...prev, tech]);
      setNewTechName('');
      setNewTechPhone('');
    } catch (err) {
      setTechError(err instanceof ApiError ? err.message : 'Failed to add technician.');
    }
  };

  const handleDeactivateTech = async (techId: string) => {
    try {
      await api(`/api/v1/admin/clients/${id}/technicians/${techId}`, { method: 'DELETE' });
      setTechs((prev) => prev.map((t) => t.id === techId ? { ...t, is_active: false, on_call: false } : t));
    } catch {
      setTechError('Failed to deactivate technician.');
    }
  };

  const handleReactivateTech = async (techId: string) => {
    setTechError('');
    try {
      const updated = await api<Technician>(`/api/v1/admin/clients/${id}/technicians/${techId}/reactivate`, { method: 'POST' });
      setTechs((prev) => prev.map((t) => t.id === techId ? updated : t));
    } catch {
      setTechError('Failed to reactivate technician.');
    }
  };

  const startEditTech = (tech: Technician) => {
    setEditingTechId(tech.id);
    setEditTechName(tech.name);
    setEditTechPhone(tech.phone);
  };

  const handleSaveTech = async () => {
    if (!editingTechId) return;
    setTechError('');
    try {
      const updated = await api<Technician>(`/api/v1/admin/clients/${id}/technicians/${editingTechId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editTechName.trim(), phone: editTechPhone }),
      });
      setTechs((prev) => prev.map((t) => t.id === editingTechId ? updated : t));
      setEditingTechId(null);
    } catch (err) {
      setTechError(err instanceof ApiError ? err.message : 'Failed to update technician.');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error && !client) return <ErrorBanner message={error} />;
  if (!client) return <ErrorBanner message="Client not found." />;

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{client.business_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={client.status} />
            {client.twilio_number && (
              <span className="text-sm text-gray-500">{formatPhoneDisplay(client.twilio_number)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator status={saveStatus} />
          <button
            onClick={handleSendMagicLink}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50"
          >
            {magicLinkSent ? 'Link Sent!' : 'Send Portal Link'}
          </button>
          <button
            onClick={() => setShowDeactivate(true)}
            className="bg-white border border-red-300 text-red-600 px-4 py-2 rounded-md text-sm font-medium hover:bg-red-50"
          >
            Deactivate
          </button>
        </div>
      </div>

      {magicLinkError && <ErrorBanner message={magicLinkError} onDismiss={() => setMagicLinkError('')} />}

      {vapiNotice && (
        <div className="mb-4 bg-brand-50 border border-brand-100 rounded-md p-3">
          <p className="text-sm text-[#F59E0B]">{client.agent_name}'s script is being updated. This may take a few seconds.</p>
        </div>
      )}

      {/* Edit controls */}
      <div className="flex items-center justify-end gap-2 mb-4">
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-sm text-[#F59E0B] hover:text-[#D97706] font-medium">Edit Client</button>
        ) : (
          <>
            <button onClick={() => { setEditing(false); setEditData(client); }} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={handleSave} className="text-sm bg-[#F59E0B] text-[#0F172A] px-4 py-1.5 rounded-md font-medium hover:bg-[#D97706]">Save Changes</button>
          </>
        )}
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Client Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Client Info</h2>
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                <input type="text" value={editData.business_name || ''} onChange={(e) => setEditData({ ...editData, business_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
                <input type="text" value={editData.owner_name || ''} onChange={(e) => setEditData({ ...editData, owner_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Phone</label>
                <PhoneInput value={editData.owner_phone || ''} onChange={(v) => setEditData({ ...editData, owner_phone: v })} className="w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                <input type="email" value={editData.contact_email || ''} onChange={(e) => setEditData({ ...editData, contact_email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]" />
              </div>
              <dl className="space-y-3 text-sm pt-2 border-t border-gray-100">
                <div><dt className="text-gray-500">Timezone</dt><dd className="text-gray-900">{({ 'America/New_York': 'Eastern (ET)', 'America/Chicago': 'Central (CT)', 'America/Denver': 'Mountain (MT)', 'America/Los_Angeles': 'Pacific (PT)', 'America/Phoenix': 'Arizona (no DST)', 'America/Anchorage': 'Alaska (AKT)', 'Pacific/Honolulu': 'Hawaii (HT)' } as Record<string, string>)[client.timezone] || client.timezone}</dd></div>
                <div><dt className="text-gray-500">Industry</dt><dd className="text-gray-900">{industryLabel(client.industry)}</dd></div>
                <div><dt className="text-gray-500">Agent Name</dt><dd className="text-gray-900">{client.agent_name}</dd></div>
                <div><dt className="text-gray-500">Emergency Dispatch</dt><dd className="text-gray-900">{client.emergency_enabled ? `ON${client.emergency_fee ? ` ($${client.emergency_fee} fee)` : ''}` : 'OFF'}</dd></div>
                <div>
                  <dt className="text-gray-500">Business Hours</dt>
                  <dd className="text-gray-900">
                    {client.business_hours_schedule ? (
                      <div className="space-y-0.5 mt-1">
                        {DAY_KEYS.map((day) => {
                          const cfg = client.business_hours_schedule![day];
                          return (
                            <div key={day} className="text-xs">
                              <span className="inline-block w-16 font-medium">{DAY_LABELS[day].slice(0, 3)}</span>
                              {cfg.enabled ? `${formatTimeDisplay(cfg.start || '')} – ${formatTimeDisplay(cfg.end || '')}` : <span className="text-gray-400">Closed</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>{formatTimeDisplay(client.business_hours_start)} – {formatTimeDisplay(client.business_hours_end)}</>
                    )}
                  </dd>
                </div>
                {client.sleep_window_start && (
                  <div><dt className="text-gray-500">Sleep Window</dt><dd className="text-gray-900">{formatTimeDisplay(client.sleep_window_start)} – {formatTimeDisplay(client.sleep_window_end || '')}</dd></div>
                )}
                <div><dt className="text-gray-500">Summary Time</dt><dd className="text-gray-900">{formatTimeDisplay(client.summary_send_time)}</dd></div>
                <div><dt className="text-gray-500">Callback Time</dt><dd className="text-gray-900">{formatTimeDisplay(client.callback_expected_time)}</dd></div>
                {client.vapi_assistant_id && (
                  <div><dt className="text-gray-500">Vapi Assistant</dt><dd className="text-gray-900 font-mono text-xs">{client.vapi_assistant_id}</dd></div>
                )}
              </dl>
            </div>
          ) : (
            <dl className="space-y-3 text-sm">
              <div><dt className="text-gray-500">Business Name</dt><dd className="text-gray-900">{client.business_name}</dd></div>
              <div><dt className="text-gray-500">Owner</dt><dd className="text-gray-900">{client.owner_name}</dd></div>
              <div><dt className="text-gray-500">Phone</dt><dd className="text-gray-900">{formatPhoneDisplay(client.owner_phone)}</dd></div>
              <div><dt className="text-gray-500">Email</dt><dd className="text-gray-900">{client.contact_email}</dd></div>
              <div><dt className="text-gray-500">Timezone</dt><dd className="text-gray-900">{({ 'America/New_York': 'Eastern (ET)', 'America/Chicago': 'Central (CT)', 'America/Denver': 'Mountain (MT)', 'America/Los_Angeles': 'Pacific (PT)', 'America/Phoenix': 'Arizona (no DST)', 'America/Anchorage': 'Alaska (AKT)', 'Pacific/Honolulu': 'Hawaii (HT)' } as Record<string, string>)[client.timezone] || client.timezone}</dd></div>
              <div><dt className="text-gray-500">Industry</dt><dd className="text-gray-900">{industryLabel(client.industry)}</dd></div>
              <div><dt className="text-gray-500">Agent Name</dt><dd className="text-gray-900">{client.agent_name}</dd></div>
              <div><dt className="text-gray-500">Emergency Dispatch</dt><dd className="text-gray-900">{client.emergency_enabled ? `ON${client.emergency_fee ? ` ($${client.emergency_fee} fee)` : ''}` : 'OFF'}</dd></div>
              <div>
                <dt className="text-gray-500">Business Hours</dt>
                <dd className="text-gray-900">
                  {client.business_hours_schedule ? (
                    <div className="space-y-0.5 mt-1">
                      {DAY_KEYS.map((day) => {
                        const cfg = client.business_hours_schedule![day];
                        return (
                          <div key={day} className="text-xs">
                            <span className="inline-block w-16 font-medium">{DAY_LABELS[day].slice(0, 3)}</span>
                            {cfg.enabled ? `${formatTimeDisplay(cfg.start || '')} – ${formatTimeDisplay(cfg.end || '')}` : <span className="text-gray-400">Closed</span>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>{formatTimeDisplay(client.business_hours_start)} – {formatTimeDisplay(client.business_hours_end)}</>
                  )}
                </dd>
              </div>
              {client.sleep_window_start && (
                <div><dt className="text-gray-500">Sleep Window</dt><dd className="text-gray-900">{formatTimeDisplay(client.sleep_window_start)} – {formatTimeDisplay(client.sleep_window_end || '')}</dd></div>
              )}
              <div><dt className="text-gray-500">Summary Time</dt><dd className="text-gray-900">{formatTimeDisplay(client.summary_send_time)}</dd></div>
              <div><dt className="text-gray-500">Callback Time</dt><dd className="text-gray-900">{formatTimeDisplay(client.callback_expected_time)}</dd></div>
              {client.vapi_assistant_id && (
                <div><dt className="text-gray-500">Vapi Assistant</dt><dd className="text-gray-900 font-mono text-xs">{client.vapi_assistant_id}</dd></div>
              )}
            </dl>
          )}
        </div>

        {/* Right: Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Settings</h2>

          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <select value={editData.industry || 'general'} onChange={(e) => setEditData({ ...editData, industry: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]">
                    {Object.keys(INDUSTRY_LABELS).map((ind) => (
                      <option key={ind} value={ind}>{INDUSTRY_LABELS[ind]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
                  <input type="text" value={editData.agent_name || ''} onChange={(e) => setEditData({ ...editData, agent_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]" placeholder="Sarah" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                <select value={editData.timezone || 'America/Chicago'} onChange={(e) => setEditData({ ...editData, timezone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]">
                  {[
                    { label: 'Eastern (ET)', value: 'America/New_York' },
                    { label: 'Central (CT)', value: 'America/Chicago' },
                    { label: 'Mountain (MT)', value: 'America/Denver' },
                    { label: 'Pacific (PT)', value: 'America/Los_Angeles' },
                    { label: 'Arizona (no DST)', value: 'America/Phoenix' },
                    { label: 'Alaska (AKT)', value: 'America/Anchorage' },
                    { label: 'Hawaii (HT)', value: 'Pacific/Honolulu' },
                  ].map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Dispatch</label>
                <input type="checkbox" checked={editData.emergency_enabled ?? false} onChange={(e) => setEditData({ ...editData, emergency_enabled: e.target.checked })} className="h-4 w-4 text-[#F59E0B] focus:ring-[#F59E0B]" />
              </div>
              {editData.emergency_enabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Fee</label>
                  <input type="number" step="0.01" value={editData.emergency_fee ?? ''} onChange={(e) => setEditData({ ...editData, emergency_fee: e.target.value ? Number(e.target.value) : null })} className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business Hours</label>
                <BusinessHoursEditor
                  schedule={editData.business_hours_schedule || defaultSchedule()}
                  onChange={(s) => setEditData({ ...editData, business_hours_schedule: s })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Hours Emergency Dispatch</label>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={editData.business_hours_emergency_dispatch ?? true} onChange={(e) => setEditData({ ...editData, business_hours_emergency_dispatch: e.target.checked })} className="h-4 w-4 text-[#F59E0B] focus:ring-[#F59E0B]" />
                  <span className="text-sm text-gray-500">Allow transfers during business hours</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sleep Start</label>
                  <TimePicker value={editData.sleep_window_start || ''} onChange={(v) => setEditData({ ...editData, sleep_window_start: v })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sleep End</label>
                  <TimePicker value={editData.sleep_window_end || ''} onChange={(v) => setEditData({ ...editData, sleep_window_end: v })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Summary Time</label>
                  <TimePicker value={editData.summary_send_time || ''} onChange={(v) => setEditData({ ...editData, summary_send_time: v })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Callback Time</label>
                  <TimePicker value={editData.callback_expected_time || ''} onChange={(v) => setEditData({ ...editData, callback_expected_time: v })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Fallback SMS Numbers</label>
                <p className="text-xs text-gray-500 mb-2">Phone numbers that receive an SMS alert if an emergency call transfer to the on-call technician fails. Usually the business owner's mobile number.</p>
                {(editData.admin_sms_numbers || []).map((num, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <PhoneInput value={num} onChange={(v) => { const nums = [...(editData.admin_sms_numbers || [])]; nums[i] = v; setEditData({ ...editData, admin_sms_numbers: nums }); }} className="flex-1" />
                    <button type="button" onClick={() => { const nums = (editData.admin_sms_numbers || []).filter((_, idx) => idx !== i); setEditData({ ...editData, admin_sms_numbers: nums }); }} className="text-sm text-red-500 hover:text-red-700">Remove</button>
                  </div>
                ))}
                <button type="button" onClick={() => setEditData({ ...editData, admin_sms_numbers: [...(editData.admin_sms_numbers || []), ''] })} className="text-sm text-[#F59E0B] hover:text-[#D97706]">+ Add number</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Click "Edit Client" above to modify settings.</p>
          )}
        </div>
      </div>

      {/* Cost Stats */}
      {costStats && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Vapi Usage & Cost</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[costStats.current_month, costStats.previous_month].map((month) => (
              <div key={month.label}>
                <h3 className="text-sm font-medium text-gray-700 mb-3">{month.label}</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-semibold text-gray-900">{month.total_calls}</p>
                    <p className="text-xs text-gray-500 mt-1">Calls</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-semibold text-gray-900">{month.total_minutes}</p>
                    <p className="text-xs text-gray-500 mt-1">Minutes</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-semibold text-gray-900">${month.total_cost.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">Vapi Cost</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Technicians */}
      <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">On-Call Team</h2>

        {techError && <ErrorBanner message={techError} onDismiss={() => setTechError('')} />}

        {/* Active Technicians */}
        <table className="min-w-full divide-y divide-gray-200 mb-4">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verified</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">On-Call</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Owner row — permanent, cannot be deleted */}
            <tr className="bg-amber-50/30">
              <td className="px-4 py-3 text-sm text-gray-900 font-medium">{client.owner_name} <span className="text-xs text-amber-600 font-normal">(Owner)</span></td>
              <td className="px-4 py-3 text-sm text-gray-700">{formatPhoneDisplay(client.owner_phone)}</td>
              <td className="px-4 py-3 text-sm"><span className="text-green-600">—</span></td>
              <td className="px-4 py-3 text-sm">
                {techs.find((t) => t.phone === client.owner_phone && t.on_call)
                  ? <span className="text-green-600 font-medium">On Call</span>
                  : <span className="text-gray-400">—</span>}
              </td>
              <td className="px-4 py-3 text-sm text-gray-400">—</td>
            </tr>
            {techs.filter((t) => t.is_active && t.phone !== client.owner_phone).map((tech) => (
              <tr key={tech.id}>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {editingTechId === tech.id ? <input type="text" value={editTechName} onChange={(e) => setEditTechName(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /> : tech.name}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {editingTechId === tech.id ? <PhoneInput value={editTechPhone} onChange={setEditTechPhone} className="w-full" /> : formatPhoneDisplay(tech.phone)}
                </td>
                <td className="px-4 py-3 text-sm">{tech.phone_verified ? <span className="text-green-600">Verified</span> : <span className="text-amber-500">Unverified</span>}</td>
                <td className="px-4 py-3 text-sm">{tech.on_call ? <span className="text-green-600 font-medium">On Call</span> : <span className="text-gray-400">—</span>}</td>
                <td className="px-4 py-3">
                  {editingTechId === tech.id ? (
                    <div className="flex gap-2">
                      <button onClick={handleSaveTech} className="text-sm text-[#F59E0B] hover:text-[#D97706]">Save</button>
                      <button onClick={() => setEditingTechId(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => startEditTech(tech)} className="text-sm text-[#F59E0B] hover:text-[#D97706]">Edit</button>
                      <button onClick={() => handleDeactivateTech(tech.id)} className="text-sm text-red-600 hover:text-red-700">Deactivate</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {techs.filter((t) => t.is_active && t.phone !== client.owner_phone).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-3 text-sm text-gray-400 text-center italic">No additional team members.</td></tr>
            )}
          </tbody>
        </table>

        {/* Add Tech Form */}
        <div className="flex items-end gap-3 pt-3 border-t border-gray-200">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={newTechName} onChange={(e) => setNewTechName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]" placeholder="Team member name" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <PhoneInput value={newTechPhone} onChange={setNewTechPhone} className="w-full" />
          </div>
          <button onClick={handleAddTech} className="bg-[#F59E0B] text-[#0F172A] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#D97706]">Add</button>
        </div>

        {/* Inactive Technicians (collapsible) */}
        {techs.some((t) => !t.is_active) && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <span className={`inline-block transition-transform ${showInactive ? 'rotate-90' : ''}`}>&#9654;</span>
              Inactive Team Members ({techs.filter((t) => !t.is_active).length})
            </button>
            {showInactive && (
              <table className="min-w-full divide-y divide-gray-200 mt-3">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Phone</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {techs.filter((t) => !t.is_active).map((tech) => (
                    <tr key={tech.id} className="opacity-60">
                      <td className="px-4 py-2 text-sm text-gray-500">{tech.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{formatPhoneDisplay(tech.phone)}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => handleReactivateTech(tech.id)} className="text-sm text-[#F59E0B] hover:text-[#D97706]">Reactivate</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {showDeactivate && (
        <ConfirmModal
          title="Deactivate Client"
          message={`Are you sure you want to deactivate ${client.business_name}? Their Twilio number will stop routing calls. This can be reversed.`}
          confirmLabel="Deactivate"
          onConfirm={handleDeactivate}
          onCancel={() => setShowDeactivate(false)}
        />
      )}
    </div>
  );
}
