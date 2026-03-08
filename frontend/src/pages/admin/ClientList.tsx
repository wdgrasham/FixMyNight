import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { ROUTES } from '../../routes';
import type { Client } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import StatusBadge from '../../components/StatusBadge';
import { formatPhoneDisplay } from '../../components/PhoneInput';

type ClientListItem = Client & { on_call_tech?: string | null; calls_24h?: number; calls_7d?: number };

export default function ClientList() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Twilio Number</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">24h</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">7d</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">On-Call</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                  No clients yet. <Link to={ROUTES.ADMIN_CLIENT_NEW} className="text-[#F59E0B] underline">Create one</Link>.
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={ROUTES.ADMIN_CLIENT_DETAIL(client.id)} className="text-sm font-medium text-[#F59E0B] hover:text-[#D97706]">
                      {client.business_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{client.owner_name}</td>
                  <td className="px-4 py-3"><StatusBadge status={client.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {client.twilio_number ? formatPhoneDisplay(client.twilio_number) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{client.calls_24h ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{client.calls_7d ?? 0}</td>
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
