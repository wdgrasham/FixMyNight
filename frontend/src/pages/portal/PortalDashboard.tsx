import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { ROUTES } from '../../routes';
import type { DashboardData } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import CallTypeBadge from '../../components/CallTypeBadge';
import PlayButton from '../../components/PlayButton';
import { formatPhoneDisplay } from '../../components/PhoneInput';
import { formatTimeDisplay } from '../../components/TimePicker';

export default function PortalDashboard() {
  const { clientId } = useParams<{ clientId: string }>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const d = await api<DashboardData>(`/api/v1/portal/${clientId}/dashboard`);
        setData(d);
      } catch {
        setError('Failed to load dashboard.');
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const { on_call_tech, twilio_number, recent_calls, settings_summary, stats_7d } = data;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* On-Call Status */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">On-Call Status</h2>
          {on_call_tech ? (
            <div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-green-500 inline-block" />
                <span className="text-sm font-medium text-gray-900">{on_call_tech.name} — On Call</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Since {new Date(on_call_tech.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-gray-300 inline-block" />
              <span className="text-sm text-gray-500">No technician on-call</span>
            </div>
          )}
          {twilio_number && (
            <p className="text-xs text-gray-500 mt-3">
              Text ON/OFF to {formatPhoneDisplay(twilio_number)}
            </p>
          )}
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Last 7 Days</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-2xl font-semibold text-gray-900">{stats_7d.total_calls}</p>
              <p className="text-xs text-gray-500">Total Calls</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-red-600">{stats_7d.emergencies}</p>
              <p className="text-xs text-gray-500">Emergencies</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{stats_7d.transfers_completed}</p>
              <p className="text-xs text-gray-500">Transfers</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">
                {stats_7d.transfer_success_rate > 0 ? `${Math.round(stats_7d.transfer_success_rate)}%` : '—'}
              </p>
              <p className="text-xs text-gray-500">Success Rate</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent Calls */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Calls</h2>
            <Link to={ROUTES.PORTAL_CALLS(clientId!)} className="text-xs text-[#F59E0B] hover:text-[#D97706]">View All &rarr;</Link>
          </div>
          {recent_calls.length === 0 ? (
            <p className="text-sm text-gray-500">No recent calls.</p>
          ) : (
            <div className="space-y-2">
              {recent_calls.slice(0, 5).map((call) => (
                <div key={call.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {call.flagged_urgent || call.call_type === 'emergency' ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 flex-shrink-0" />
                    ) : (
                      <span className="text-gray-300 flex-shrink-0">—</span>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{call.caller_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500 truncate">{call.issue_summary || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {call.recording_url && <PlayButton url={call.recording_url} compact />}
                    <CallTypeBadge type={call.call_type} />
                    <span className="text-xs text-gray-400">
                      {new Date(call.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Settings</h2>
            <Link to={ROUTES.PORTAL_SETTINGS(clientId!)} className="text-xs text-[#F59E0B] hover:text-[#D97706]">Edit Settings &rarr;</Link>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Morning summary</dt>
              <dd className="text-gray-900">{formatTimeDisplay(settings_summary.summary_send_time)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Callback promise</dt>
              <dd className="text-gray-900">{formatTimeDisplay(settings_summary.callback_expected_time)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Emergency dispatch</dt>
              <dd className="text-gray-900">
                {settings_summary.emergency_enabled
                  ? `On${settings_summary.emergency_fee ? ` ($${settings_summary.emergency_fee} fee)` : ''}`
                  : 'Off'}
              </dd>
            </div>
            {settings_summary.sleep_window_start && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Sleep window</dt>
                <dd className="text-gray-900">{formatTimeDisplay(settings_summary.sleep_window_start)} – {formatTimeDisplay(settings_summary.sleep_window_end || '')}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
