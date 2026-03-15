import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { ROUTES } from '../../routes';
import type { Client } from '../../types';
import { industryLabel } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import StatusBadge from '../../components/StatusBadge';
import { formatPhoneDisplay } from '../../components/PhoneInput';

type ClientListItem = Client & {
  on_call_tech?: string | null;
  calls_24h?: number;
  calls_7d?: number;
  cost_mtd?: number;
  calls_mtd?: number;
  plan_call_limit?: number | null;
  subscription_tier?: string | null;
};

type Filter = 'active' | 'all' | 'inactive';

export default function ClientList() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('active');

  useEffect(() => {
    (async () => {
      try {
        const data = await api<ClientListItem[]>('/api/v1/admin/clients');
        setClients(data);
      } catch {
        setError('Failed to load clients.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
        <Link
          to={ROUTES.ADMIN_CLIENT_NEW}
          className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-light"
        >
          New Client
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {(['active', 'all', 'inactive'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md ${
              filter === f
                ? 'bg-[#F59E0B] text-[#0F172A]'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f === 'active' ? `Active (${clients.filter((c) => c.status === 'active' || c.status === 'pending_setup').length})` : f === 'inactive' ? `Inactive (${clients.filter((c) => c.status === 'inactive' || c.status === 'failed').length})` : `All (${clients.length})`}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Industry</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Twilio Number</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">24h</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">7d</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost (MTD)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usage</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">On-Call</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.filter((c) => {
              if (filter === 'active') return c.status === 'active' || c.status === 'pending_setup' || c.status === 'pending';
              if (filter === 'inactive') return c.status === 'inactive' || c.status === 'failed';
              return true;
            }).length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-500">
                  {filter === 'active' ? <>No active clients. <Link to={ROUTES.ADMIN_CLIENT_NEW} className="text-[#F59E0B] underline">Create one</Link>.</> : 'No clients in this category.'}
                </td>
              </tr>
            ) : (
              clients.filter((c) => {
                if (filter === 'active') return c.status === 'active' || c.status === 'pending_setup' || c.status === 'pending';
                if (filter === 'inactive') return c.status === 'inactive' || c.status === 'failed';
                return true;
              }).map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={ROUTES.ADMIN_CLIENT_DETAIL(client.id)} className="text-sm font-medium text-[#F59E0B] hover:text-[#D97706]">
                      {client.business_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{client.owner_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{industryLabel(client.industry)}</td>
                  <td className="px-4 py-3"><StatusBadge status={client.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {client.twilio_number ? formatPhoneDisplay(client.twilio_number) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{client.calls_24h ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{client.calls_7d ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">${(client.cost_mtd ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm">
                    {client.plan_call_limit ? (() => {
                      const used = client.calls_mtd ?? 0;
                      const limit = client.plan_call_limit;
                      const pct = Math.round((used / limit) * 100);
                      const color = pct > 100 ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-gray-700';
                      return (
                        <span className={color}>
                          {used}/{limit}
                          {pct > 100 && <span className="text-xs ml-0.5">!</span>}
                        </span>
                      );
                    })() : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {client.on_call_tech
                      ? <span className="text-green-600">{client.on_call_tech}</span>
                      : <span className="text-gray-400">None</span>}
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <Link to={ROUTES.ADMIN_CLIENT_DETAIL(client.id)} className="text-sm text-[#F59E0B] hover:text-[#D97706]">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
