import { useState, useEffect, useCallback, Fragment } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api';
import type { Call, CallsListResponse } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import CallTypeBadge from '../../components/CallTypeBadge';
import TimeWindowBadge from '../../components/TimeWindowBadge';
import PlayButton from '../../components/PlayButton';
import { formatPhoneDisplay } from '../../components/PhoneInput';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const CALL_TYPES = ['', 'emergency', 'routine', 'message', 'wrong_number', 'hangup', 'unknown'];
const TRANSFER_STATUSES = ['', 'transferred', 'not_transferred'];
const PAGE_SIZE = 20;

export default function PortalCalls() {
  const { clientId } = useParams<{ clientId: string }>();
  const [calls, setCalls] = useState<Call[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [callType, setCallType] = useState('');
  const [transferStatus, setTransferStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Only include date filters when both From and To are set
  const dateRangeComplete = dateFrom && dateTo;
  const activeDateFrom = dateRangeComplete ? dateFrom : '';
  const activeDateTo = dateRangeComplete ? dateTo : '';

  const fetchCalls = useCallback(async (newOffset = 0) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(newOffset));
      if (callType) params.set('call_type', callType);
      if (transferStatus === 'transferred') params.set('transfer_attempted', 'true');
      if (transferStatus === 'not_transferred') params.set('transfer_attempted', 'false');
      if (activeDateFrom) params.set('date_from', activeDateFrom);
      if (activeDateTo) params.set('date_to', activeDateTo);

      const data = await api<CallsListResponse>(`/api/v1/portal/${clientId}/calls?${params}`);
      setCalls(data.calls);
      setTotal(data.total);
      setOffset(newOffset);
    } catch {
      setError('Failed to load calls.');
    } finally {
      setLoading(false);
    }
  }, [clientId, callType, transferStatus, activeDateFrom, activeDateTo]);

  useEffect(() => {
    fetchCalls(0);
  }, [fetchCalls]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Call History</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Call Type</label>
            <select value={callType} onChange={(e) => { setError(''); setCallType(e.target.value); }} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand">
              <option value="">All Types</option>
              {CALL_TYPES.filter(Boolean).map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Transfer</label>
            <select value={transferStatus} onChange={(e) => { setError(''); setTransferStatus(e.target.value); }} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand">
              <option value="">All</option>
              {TRANSFER_STATUSES.filter(Boolean).map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {loading ? (
        <LoadingSpinner />
      ) : calls.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          No calls found matching your filters.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Caller</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Window</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transfer</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Recording</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Urgent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {calls.map((call) => (
                  <Fragment key={call.id}>
                    <tr
                      onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {new Date(call.created_at).toLocaleDateString()}{' '}
                        {new Date(call.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-gray-900">{call.caller_name || 'Unknown'}</div>
                        {call.caller_phone && <div className="text-xs text-gray-500">{formatPhoneDisplay(call.caller_phone)}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">
                        {call.issue_summary || '—'}
                      </td>
                      <td className="px-4 py-3"><CallTypeBadge type={call.call_type} /></td>
                      <td className="px-4 py-3"><TimeWindowBadge window={call.time_window} /></td>
                      <td className="px-4 py-3 text-sm">
                        {call.transfer_attempted
                          ? call.transfer_success
                            ? <span className="text-green-600">Success</span>
                            : <span className="text-red-600">Failed</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {call.recording_url ? <PlayButton url={call.recording_url} /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {call.flagged_urgent && <span className="text-red-500">Urgent</span>}
                      </td>
                    </tr>
                    {expandedId === call.id && (
                      <tr key={`${call.id}-detail`}>
                        <td colSpan={8} className="px-4 py-4 bg-gray-50">
                          <div className="text-sm space-y-2">
                            <div>
                              <span className="font-medium text-gray-700">Full Summary: </span>
                              <span className="text-gray-600">{call.issue_summary || 'No summary available.'}</span>
                            </div>
                            {call.duration_seconds != null && (
                              <div>
                                <span className="font-medium text-gray-700">Duration: </span>
                                <span className="text-gray-600">{formatDuration(call.duration_seconds)}</span>
                              </div>
                            )}
                            {call.fee_offered && (
                              <div>
                                <span className="font-medium text-gray-700">Fee: </span>
                                <span className="text-gray-600">
                                  ${call.fee_amount ?? 0} — {call.fee_approved === true ? 'Approved' : call.fee_approved === false ? 'Declined' : 'Pending'}
                                </span>
                              </div>
                            )}
                            {call.transfer_attempted && (
                              <div>
                                <span className="font-medium text-gray-700">Transfer: </span>
                                <span className="text-gray-600">
                                  {call.transferred_to_tech_name || 'Unknown tech'}
                                  {call.transfer_success ? ' — Connected' : ' — Failed'}
                                </span>
                              </div>
                            )}
                            {call.morning_summary_sent_at && (
                              <div>
                                <span className="font-medium text-gray-700">Summary sent: </span>
                                <span className="text-gray-600">{new Date(call.morning_summary_sent_at).toLocaleString()}</span>
                              </div>
                            )}
                            {call.recording_url && (
                              <div>
                                <span className="font-medium text-gray-700">Recording: </span>
                                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                <audio
                                  controls
                                  preload="metadata"
                                  src={call.recording_url}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-1 w-full max-w-md"
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">{total} total calls</p>
              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => fetchCalls(offset - PAGE_SIZE)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => fetchCalls(offset + PAGE_SIZE)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
