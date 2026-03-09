export interface DaySchedule {
  enabled: boolean;
  start: string | null;
  end: string | null;
}

export type BusinessHoursSchedule = {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
};

export const DAY_KEYS: (keyof BusinessHoursSchedule)[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

export const DAY_LABELS: Record<keyof BusinessHoursSchedule, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

export function defaultSchedule(): BusinessHoursSchedule {
  return {
    monday:    { enabled: true,  start: '08:00', end: '18:00' },
    tuesday:   { enabled: true,  start: '08:00', end: '18:00' },
    wednesday: { enabled: true,  start: '08:00', end: '18:00' },
    thursday:  { enabled: true,  start: '08:00', end: '18:00' },
    friday:    { enabled: true,  start: '08:00', end: '18:00' },
    saturday:  { enabled: false, start: null, end: null },
    sunday:    { enabled: false, start: null, end: null },
  };
}

export interface Client {
  id: string;
  business_name: string;
  owner_name: string;
  owner_phone: string;
  contact_email: string;
  timezone: string;
  industry: string;
  agent_name: string;
  emergency_enabled: boolean;
  emergency_fee: number | null;
  admin_sms_numbers: string[];
  business_hours_start: string;
  business_hours_end: string;
  business_days: number[];
  business_hours_schedule: BusinessHoursSchedule | null;
  business_hours_emergency_dispatch: boolean;
  sleep_window_start: string | null;
  sleep_window_end: string | null;
  summary_send_time: string;
  callback_expected_time: string;
  twilio_number: string | null;
  vapi_assistant_id: string | null;
  vapi_phone_number_id: string | null;
  status: 'pending' | 'active' | 'inactive' | 'failed';
  portal_password_set: boolean;
  portal_last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface Technician {
  id: string;
  client_id: string;
  name: string;
  phone: string;
  is_active: boolean;
  phone_verified: boolean;
  on_call: boolean;
  on_call_start: string | null;
  on_call_end: string | null;
  created_at: string;
}

export interface Call {
  id: string;
  client_id: string;
  vapi_call_id: string | null;
  caller_name: string | null;
  caller_phone: string | null;
  issue_summary: string | null;
  call_type: 'emergency' | 'routine' | 'message' | 'wrong_number' | 'hangup' | 'unknown';
  time_window: 'business_hours' | 'evening' | 'sleep';
  is_emergency: boolean;
  fee_offered: boolean;
  fee_amount: number | null;
  fee_approved: boolean | null;
  transfer_attempted: boolean;
  transfer_success: boolean | null;
  transferred_to_tech_id: string | null;
  transferred_to_tech_name: string | null;
  flagged_urgent: boolean;
  duration_seconds: number | null;
  recording_url: string | null;
  morning_summary_sent_at: string | null;
  created_at: string;
}

export interface UsageStatus {
  calls_used: number;
  calls_included: number;
  overage_calls: number;
  usage_percent: number;
  subscription_tier: string | null;
  overage_rate: string;
}

export interface DashboardData {
  on_call_tech: {
    name: string;
    since: string;
  } | null;
  twilio_number: string | null;
  recent_calls: Call[];
  settings_summary: {
    summary_send_time: string;
    callback_expected_time: string;
    emergency_enabled: boolean;
    emergency_fee: number | null;
    sleep_window_start: string | null;
    sleep_window_end: string | null;
  };
  stats_7d: {
    total_calls: number;
    emergencies: number;
    transfers_completed: number;
    transfer_success_rate: number;
  };
  usage_status: UsageStatus | null;
}

export interface CallsListResponse {
  calls: Call[];
  total: number;
  limit: number;
  offset: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface ClientCreatePayload {
  business_name: string;
  owner_name: string;
  owner_phone: string;
  contact_email: string;
  timezone: string;
  industry: string;
  agent_name: string;
  emergency_enabled: boolean;
  emergency_fee?: number | null;
  admin_sms_numbers: string[];
  business_hours_start: string;
  business_hours_end: string;
  business_days: number[];
  business_hours_schedule?: BusinessHoursSchedule;
  business_hours_emergency_dispatch: boolean;
  sleep_window_start?: string | null;
  sleep_window_end?: string | null;
  summary_send_time: string;
  callback_expected_time: string;
  technicians: { name: string; phone: string }[];
}

export interface PortalSettingsPayload {
  callback_expected_time?: string;
  summary_send_time?: string;
  sleep_window_start?: string | null;
  sleep_window_end?: string | null;
  business_hours_start?: string;
  business_hours_end?: string;
  business_days?: number[];
  business_hours_schedule?: BusinessHoursSchedule;
  business_hours_emergency_dispatch?: boolean;
  emergency_fee?: number | null;
  emergency_enabled?: boolean;
  contact_email?: string;
  admin_sms_numbers?: string[];
}
