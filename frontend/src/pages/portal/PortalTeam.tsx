import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../api';
import type { Technician, Client } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import ConfirmModal from '../../components/ConfirmModal';
import PhoneInput, { formatPhoneDisplay } from '../../components/PhoneInput';

export default function PortalTeam() {
  const { clientId } = useParams<{ clientId: string }>();
  const [techs, setTechs] = useState<Technician[]>([]);
  const [owner, setOwner] = useState<{ name: string; phone: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New tech
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Deactivate
  const [deactivateTarget, setDeactivateTarget] = useState<Technician | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [techData, clientData] = await Promise.all([
          api<Technician[]>(`/api/v1/portal/${clientId}/technicians`),
          api<Client>(`/api/v1/portal/${clientId}/settings`),
        ]);
        setTechs(techData);
        setOwner({ name: clientData.owner_name, phone: clientData.owner_phone });
      } catch {
        setError('Failed to load team.');
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId]);

  const handleAdd = async () => {
    if (!newName.trim() || !newPhone.trim()) {
      setAddError('Name and phone are required.');
      return;
    }
    setAddError('');
    setAddSuccess('');
    try {
      const tech = await api<Technician>(`/api/v1/portal/${clientId}/technicians`, {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), phone: newPhone }),
      });
      setTechs((prev) => [...prev, tech]);
      setAddSuccess(`A verification SMS has been sent to ${formatPhoneDisplay(newPhone)}. Once they reply, they'll be able to receive emergency transfers.`);
      setNewName('');
      setNewPhone('');
      setTimeout(() => setAddSuccess(''), 8000);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Failed to add technician.');
    }
  };

  const startEdit = (tech: Technician) => {
    setEditingId(tech.id);
    setEditName(tech.name);
    setEditPhone(tech.phone);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      const updated = await api<Technician>(`/api/v1/portal/${clientId}/technicians/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim(), phone: editPhone }),
      });
      setTechs((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
      setEditingId(null);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Failed to update technician.');
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await api(`/api/v1/portal/${clientId}/technicians/${deactivateTarget.id}`, { method: 'DELETE' });
      setTechs((prev) => prev.map((t) => (t.id === deactivateTarget.id ? { ...t, is_active: false, on_call: false } : t)));
    } catch {
      setError('Failed to deactivate technician.');
    }
    setDeactivateTarget(null);
  };

  if (loading) return <LoadingSpinner />;
  if (error && techs.length === 0) return <ErrorBanner message={error} />;

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Team</h1>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verified</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">On-Call</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Owner row — permanent, cannot be deleted */}
            {owner && (
              <tr className="bg-amber-50/30">
                <td className="px-4 py-3 text-sm text-gray-900 font-medium">{owner.name} <span className="text-xs text-amber-600 font-normal">(Owner)</span></td>
                <td className="px-4 py-3 text-sm text-gray-700">{formatPhoneDisplay(owner.phone)}</td>
                <td className="px-4 py-3 text-sm"><span className="text-green-600">—</span></td>
                <td className="px-4 py-3 text-sm"><span className="text-green-600">—</span></td>
                <td className="px-4 py-3 text-sm">
                  {techs.find((t) => t.phone === owner.phone && t.on_call)
                    ? <span className="text-green-600 font-medium">On Call</span>
                    : <span className="text-gray-400">Available</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">—</td>
              </tr>
            )}
            {techs.filter((t) => !owner || t.phone !== owner.phone).map((tech) => (
              <tr key={tech.id} className={!tech.is_active ? 'opacity-50' : ''}>
                {editingId === tech.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                    </td>
                    <td className="px-4 py-3">
                      <PhoneInput value={editPhone} onChange={setEditPhone} className="w-full" />
                    </td>
                    <td colSpan={3} />
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={handleSaveEdit} className="text-sm text-[#F59E0B] hover:text-[#D97706]">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-sm text-gray-900">{tech.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatPhoneDisplay(tech.phone)}</td>
                    <td className="px-4 py-3 text-sm">{tech.is_active ? <span className="text-green-600">Active</span> : <span className="text-gray-400">Inactive</span>}</td>
                    <td className="px-4 py-3 text-sm">{tech.phone_verified ? <span className="text-green-600">Verified</span> : <span className="text-amber-500">Unverified</span>}</td>
                    <td className="px-4 py-3 text-sm">{tech.on_call ? <span className="text-green-600 font-medium">On Call</span> : <span className="text-gray-400">Available</span>}</td>
                    <td className="px-4 py-3">
                      {tech.is_active && (
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(tech)} className="text-sm text-[#F59E0B] hover:text-[#D97706]">Edit</button>
                          <button onClick={() => setDeactivateTarget(tech)} className="text-sm text-red-600 hover:text-red-700">Deactivate</button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {techs.filter((t) => !owner || t.phone !== owner.phone).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-3 text-center text-sm text-gray-400 italic">No additional team members.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Tech Form */}
      <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Add Team Member</h2>
        {addError && <ErrorBanner message={addError} onDismiss={() => setAddError('')} />}
        {addSuccess && (
          <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">{addSuccess}</div>
        )}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <PhoneInput value={newPhone} onChange={setNewPhone} className="w-full" />
          </div>
          <button onClick={handleAdd} className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-light">Add</button>
        </div>
      </div>

      {deactivateTarget && (
        <ConfirmModal
          title="Deactivate Team Member"
          message={`Deactivating ${deactivateTarget.name} will remove them from on-call rotation. They will not receive transfers.`}
          confirmLabel="Deactivate"
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}
