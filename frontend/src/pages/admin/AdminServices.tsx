import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';

interface ServiceData {
  name: string;
  description: string;
  status: string;
  warning?: boolean;
  critical?: boolean;
  error?: string;
  note?: string;
  dashboard_url?: string;
  // Vapi
  balance?: number;
  spend_this_month?: number;
  spend_last_7d?: number;
  daily_burn_rate?: number;
  calls_this_month?: number;
  raw?: Record<string, unknown>;
  // Twilio
  currency?: string;
  phone_numbers?: number;
  sms_this_month?: number;
  // Stripe
  available_balance?: number;
  pending_balance?: number;
  active_subscriptions?: number;
  mrr?: number;
  revenue_this_month?: number;
  // SendGrid
  emails_sent?: number;
  emails_delivered?: number;
  bounces?: number;
}

interface ServiceStatusResponse {
  checked_at: string;
  services: Record<string, ServiceData>;
}

const SERVICE_ORDER = ['vapi', 'twilio', 'stripe', 'anthropic', 'sendgrid', 'railway'];

const SERVICE_ICONS: Record<string, string> = {
  vapi: 'M12 18.75a6.75 6.75 0 110-13.5 6.75 6.75 0 010 13.5zM12 2.25a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM12 19.5a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zM4.5 12a.75.75 0 01-.75.75H2.25a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75zM19.5 12a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75z',
  twilio: 'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z',
  stripe: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  anthropic: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z',
  sendgrid: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  railway: 'M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0h.375a.375.375 0 01.375.375v2.25a.375.375 0 01-.375.375h-.375',
};

function StatusDot({ status, warning, critical }: { status: string; warning?: boolean; critical?: boolean }) {
  if (status === 'error' || critical) {
    return <span className="inline-block w-3 h-3 rounded-full bg-red-500 ring-2 ring-red-500/30" title="Critical" />;
  }
  if (warning || status === 'warning') {
    return <span className="inline-block w-3 h-3 rounded-full bg-amber-400 ring-2 ring-amber-400/30" title="Warning" />;
  }
  return <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" title="Healthy" />;
}

function formatCurrency(val: number): string {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function ServiceCard({ id, svc }: { id: string; svc: ServiceData }) {
  const iconPath = SERVICE_ICONS[id] || SERVICE_ICONS.railway;

  const renderMetrics = () => {
    switch (id) {
      case 'vapi': {
        if (svc.spend_this_month != null) {
          return (
            <div className="space-y-2">
              <Metric label="Spend This Month" value={formatCurrency(svc.spend_this_month)} />
              <Metric label="Last 7 Days" value={formatCurrency(svc.spend_last_7d ?? 0)} />
              <Metric label="Daily Burn Rate" value={`${formatCurrency(svc.daily_burn_rate ?? 0)}/day`} highlight={svc.warning} />
              <Metric label="Calls This Month" value={String(svc.calls_this_month ?? 0)} />
            </div>
          );
        }
        if (svc.balance != null) {
          return (
            <div className="space-y-2">
              <Metric label="Credit Balance" value={formatCurrency(svc.balance)} highlight={svc.warning} />
            </div>
          );
        }
        return <p className="text-sm text-gray-500">Check dashboard for balance</p>;
      }
      case 'twilio':
        return (
          <div className="space-y-2">
            <Metric label="Balance" value={formatCurrency(svc.balance ?? 0)} highlight={svc.warning} />
            <Metric label="Phone Numbers" value={String(svc.phone_numbers ?? 0)} />
            <Metric label="SMS This Month" value={String(svc.sms_this_month ?? 0)} />
          </div>
        );
      case 'stripe':
        return (
          <div className="space-y-2">
            <Metric label="MRR" value={formatCurrency(svc.mrr ?? 0)} />
            <Metric label="Revenue This Month" value={formatCurrency(svc.revenue_this_month ?? 0)} />
            <Metric label="Active Subscriptions" value={String(svc.active_subscriptions ?? 0)} />
            <Metric label="Available Balance" value={formatCurrency(svc.available_balance ?? 0)} />
          </div>
        );
      case 'anthropic':
        return (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">{svc.note || 'No balance API available'}</p>
          </div>
        );
      case 'sendgrid':
        if (svc.emails_sent != null) {
          return (
            <div className="space-y-2">
              <Metric label="Emails Sent" value={String(svc.emails_sent)} />
              <Metric label="Delivered" value={String(svc.emails_delivered ?? 0)} />
              {(svc.bounces ?? 0) > 0 && <Metric label="Bounces" value={String(svc.bounces)} highlight />}
            </div>
          );
        }
        return (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">{svc.note || 'API key valid'}</p>
          </div>
        );
      case 'railway':
        return (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">{svc.note || 'Check dashboard'}</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`bg-white rounded-lg border p-5 ${
      svc.critical ? 'border-red-300 bg-red-50/30' :
      svc.warning ? 'border-amber-300 bg-amber-50/30' :
      svc.status === 'error' ? 'border-red-300 bg-red-50/30' :
      'border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${
            svc.critical || svc.status === 'error' ? 'bg-red-100' :
            svc.warning ? 'bg-amber-100' :
            'bg-[#0F172A]/5'
          }`}>
            <svg className={`w-5 h-5 ${
              svc.critical || svc.status === 'error' ? 'text-red-600' :
              svc.warning ? 'text-amber-600' :
              'text-[#0F172A]'
            }`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{svc.name}</h3>
            <p className="text-xs text-gray-500">{svc.description}</p>
          </div>
        </div>
        <StatusDot status={svc.status} warning={svc.warning} critical={svc.critical} />
      </div>

      {svc.status === 'error' && svc.error && (
        <div className="mb-3 px-3 py-2 rounded bg-red-50 border border-red-200">
          <p className="text-xs text-red-700 font-medium">Error: {svc.error}</p>
        </div>
      )}

      {renderMetrics()}

      {svc.dashboard_url && (
        <a
          href={svc.dashboard_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-[#F59E0B] hover:text-[#D97706] transition-colors"
        >
          Open dashboard
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      )}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-amber-600' : 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

export default function AdminServices() {
  const [data, setData] = useState<ServiceStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      const res = await api<ServiceStatusResponse>(`/api/v1/admin/service-status${refresh ? '?refresh=true' : ''}`);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load service status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading) return <LoadingSpinner />;

  const services = data?.services || {};
  const hasWarnings = Object.values(services).some(s => s.warning);
  const hasCritical = Object.values(services).some(s => s.critical || s.status === 'error');

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Monitoring</h1>
          <p className="text-sm text-gray-500 mt-1">
            Health and billing status for all external services
          </p>
        </div>
        <div className="flex items-center gap-4">
          {data?.checked_at && (
            <span className="text-xs text-gray-400">
              Last checked: {new Date(data.checked_at).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchStatus(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F172A] text-white rounded-md text-sm font-medium hover:bg-[#1E293B] disabled:opacity-50 transition-colors"
          >
            {refreshing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Refresh
              </>
            )}
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {/* Overall status banner */}
      {hasCritical && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm font-medium text-red-800">
            One or more services need immediate attention. Check the cards below for details.
          </p>
        </div>
      )}
      {!hasCritical && hasWarnings && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-sm font-medium text-amber-800">
            Some services are approaching their warning thresholds. Review and top up soon.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SERVICE_ORDER.map(key => {
          const svc = services[key];
          if (!svc) return null;
          return <ServiceCard key={key} id={key} svc={svc} />;
        })}
      </div>
    </div>
  );
}
