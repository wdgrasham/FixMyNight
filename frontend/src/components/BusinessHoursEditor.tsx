import TimePicker from './TimePicker';
import type { BusinessHoursSchedule } from '../types';
import { DAY_KEYS, DAY_LABELS } from '../types';

interface Props {
  schedule: BusinessHoursSchedule;
  onChange: (schedule: BusinessHoursSchedule) => void;
}

export default function BusinessHoursEditor({ schedule, onChange }: Props) {
  const updateDay = (day: keyof BusinessHoursSchedule, field: string, value: unknown) => {
    const updated = { ...schedule, [day]: { ...schedule[day], [field]: value } };
    // When enabling a day, set default times if missing
    if (field === 'enabled' && value === true && !schedule[day].start) {
      updated[day] = { enabled: true, start: '08:00', end: '18:00' };
    }
    onChange(updated);
  };

  const copyToAll = (sourceDay: keyof BusinessHoursSchedule) => {
    const src = schedule[sourceDay];
    const updated = { ...schedule };
    for (const day of DAY_KEYS) {
      if (day !== sourceDay) {
        updated[day] = { ...src };
      }
    }
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      {DAY_KEYS.map((day) => {
        const cfg = schedule[day];
        return (
          <div key={day} className="flex items-center gap-3">
            <label className="flex items-center gap-2 w-28 shrink-0">
              <input
                type="checkbox"
                checked={cfg.enabled}
                onChange={(e) => updateDay(day, 'enabled', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#F59E0B] focus:ring-[#F59E0B]"
              />
              <span className="text-sm font-medium text-gray-700">{DAY_LABELS[day]}</span>
            </label>
            {cfg.enabled ? (
              <div className="flex items-center gap-2">
                <TimePicker
                  value={cfg.start || '08:00'}
                  onChange={(v) => updateDay(day, 'start', v)}
                  className="w-28"
                />
                <span className="text-gray-400 text-sm">to</span>
                <TimePicker
                  value={cfg.end || '18:00'}
                  onChange={(v) => updateDay(day, 'end', v)}
                  className="w-28"
                />
                <button
                  type="button"
                  onClick={() => copyToAll(day)}
                  className="text-xs text-[#F59E0B] hover:text-[#D97706] whitespace-nowrap ml-1"
                  title={`Copy ${DAY_LABELS[day]}'s hours to all days`}
                >
                  Copy to all
                </button>
              </div>
            ) : (
              <span className="text-sm text-gray-400 italic">Closed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
