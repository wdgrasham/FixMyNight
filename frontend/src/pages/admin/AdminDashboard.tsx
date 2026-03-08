import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { ROUTES } from '../../routes';
import type { Client } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import StatusBadge from '../../components/StatusBadge';

type DashboardClient = Client & { calls_24h?: number; calls_7d?: number };

export default function AdminDashboard() {
  const [clients, setClients] = useState<DashboardClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api<DashboardClient[]>('/api/v1/admin/clients');
        setClients(data);
      } catch {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;

  const activeClients = clients.filter((c) => c.status === 'active');
  const failedClients = clients.filter((c) => c.status === 'failed');

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Admin Dashboard</h1>

      {failedClients.length > 0 && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm font-medium text-red-800">
            {failedClients.length} client{failedClients.length > 1 ? 's' : ''} with failed provisioning:
          </p>
          <ul className="mt-1 text-sm text-red-700">
            {failedClients.map((c) => (
              <li key={c.id}>
                <Link to={ROUTES.ADMIN_CLIENT_DETAIL(c.id)} className="underline">{c.business_name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Active Clients</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">{activeClients.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Calls (24h)</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">{clients.reduce((sum, c) => sum + (c.calls_24h ?? 0), 0)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Clients</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">{clients.length}</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-gray-900">Clients</h2>
          <Link
            to={ROUTES.ADMIN_CLIENT_NEW}
            className="text-sm font-medium text-[#F59E0B] hover:text-[#D97706]"
          >
            + New Client
          </Link>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">24h</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">7d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No clients yet.</td></tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={ROUTES.ADMIN_CLIENT_DETAIL(client.id)} className="text-sm font-medium text-[#F59E0B] hover:text-[#D97706]">
                        {client.business_name}
                      </Link>
                      <p className="text-xs text-gray-500">{client.owner_name}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={client.status} /></td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{client.calls_24h ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{client.calls_7d ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
