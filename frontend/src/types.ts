export type UserType = "admin" | "normal";
export type ModuleId =
  | "dashboard"
  | "patients"
  | "op"
  | "beds"
  | "er"
  | "billing"
  | "pharmacy"
  | "hrms"
  | "accounts"
  | "reports"
  | "symptom_ai"
  | "employees"
  | "patient_experience";

// A stored module_access entry is either a bare ModuleId (full access to that
// module) or a dotted "module.subitem" string (access to just one sub-item
// within it) -- see SUB_MODULES in lib/constants.ts. Kept as plain string
// rather than a template-literal type since it round-trips through the
// backend's JSON column as an unvalidated string array.
export type ModuleAccessEntry = string;

export interface SubModuleOption {
  value: string;
  label: string;
}

export interface UserTypeOption {
  value: UserType;
  label: string;
  description: string;
}

export interface ModuleOption {
  value: ModuleId;
  label: string;
  description: string;
}

export interface Notice {
  type: "success" | "error" | "warning";
  message: string;
}

export interface User {
  username: string;
  full_name?: string;
  role?: string;
  job_role?: string;
  access_role?: string;
  user_type?: UserType;
  module_access?: ModuleAccessEntry[];
  permissions?: string[];
  employee_id?: string;
  status?: string;
  hospital_id?: number;
  hospital_code?: string;
}

export interface Stats {
  total: number;
  today: number;
  active_admissions: number;
  documents: number;
  readmitted_patients: number;
}

export interface DistributionItem {
  label: string;
  count: number;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface EmployeeAnalytics {
  total: number;
  status_distribution: DistributionItem[];
  department_distribution: DistributionItem[];
  access_role_distribution: DistributionItem[];
}

export interface DashboardAnalytics {
  window_days: number;
  patients_trend: TrendPoint[];
  documents_trend: TrendPoint[];
  gender_distribution: DistributionItem[];
  doc_type_distribution: DistributionItem[];
  admission_status_distribution: DistributionItem[];
  employee?: EmployeeAnalytics;
}

export interface HospitalSummary {
  ip_op_counts: {
    daily_ip: number;
    daily_op: number;
    monthly_ip: number;
    monthly_op: number;
  };
  accidents: {
    daily: number;
    monthly: number;
  };
  revenue: {
    total: number;
    due: number;
    payment_mode_breakdown: DistributionItem[];
    ip_this_month: number;
  };
  pharmacy_summary: {
    monthly_sales: number;
  };
  diagnostics_summary: {
    monthly_income: number;
  };
  referrals: DistributionItem[];
  bed_occupancy: {
    total: number;
    available: number;
    occupied: number;
    maintenance: number;
    occupancy_rate: number;
  };
}

export interface Patient {
  id?: number;
  patient_id: string;
  admission_id?: string;
  name: string;
  middle_name?: string;
  last_name?: string;
  dob?: string;
  age?: number | string | null;
  weight?: number | string | null;
  height?: number | string | null;
  gender?: string;
  pregnant?: boolean | number;
  allergies?: string;
  symptoms?: string;
  phone?: string;
  address?: string;
  blood_group?: string;
  emergency_contact?: string;
  aadhar_number?: string;
  created_at?: string;
  status?: string;
  care_stream?: "OP" | "IP" | "ER";
  active_bed?: string | null;
  active_er_visit_id?: number | null;
  active_er_visit_no?: string | null;
  active_er_status?: string | null;
  er_triage_category?: string | null;
  appointment_status?: string | null;
  appointment_doctor?: string | null;
  appointment_dept?: string | null;
}

export interface Admission {
  id: number;
  admission_date: string;
  discharge_date?: string | null;
  notes?: string;
}

export interface PatientMovement {
  id: number;
  patient_id: string;
  admission_id?: number | null;
  from_department?: string | null;
  to_department: string;
  moved_at: string;
  moved_by?: string | null;
}

export interface JourneyEvent {
  stage: "registration" | "queue" | "consultation" | "billing" | "lab";
  label: string;
  timestamp?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface JourneySummary {
  consultation_billed: number;
  consultation_paid: number;
  lab_billed: number;
  lab_paid: number;
  pharmacy_billed: number;
  pharmacy_paid: number;
  total_billed: number;
  total_paid: number;
  total_due: number;
}

export interface PatientJourney {
  patient: Patient;
  events: JourneyEvent[];
  summary: JourneySummary;
}

export interface Encounter {
  id: number;
  patient_id: string;
  encounter_type: string;
  insurance_provider?: string | null;
  insurance_policy_no?: string | null;
  is_accident?: boolean | number;
  referral_source?: string | null;
  referral_name?: string | null;
  status?: string | null;
  created_by?: string | null;
  arrival_at?: string;
}

export interface BedAllocation {
  id: number;
  admission_id: number;
  patient_id: string;
  ward: string;
  room_no: string;
  bed_no: string;
  status?: string | null;
  allocated_at?: string;
}

export interface MedicationSchedule {
  id: number;
  patient_id: string;
  medicine_name: string;
  dosage?: string | null;
  schedule_time?: string;
  administered?: boolean | number;
  alert_enabled?: boolean | number;
  notes?: string | null;
  created_at?: string;
}

export interface ObservationNote {
  id: number;
  patient_id: string;
  admission_id?: number | null;
  doctor_name?: string | null;
  note: string;
  treatment_plan?: string | null;
  created_at?: string;
}

export interface PharmacySale {
  id: number;
  invoice_id?: string | number | null;
  patient_id?: string | null;
  patient_name?: string | null;
  prescription_ref?: string | null;
  medicine_name: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  sold_at?: string;
}

export interface AuditLog {
  id: number;
  actor_username?: string | null;
  action?: string | null;
  module_name?: string | null;
  entity_key?: string | null;
  payload?: string | null;
  created_at?: string;
}

export interface Appointment {
  id: number;
  patient_id?: string | null;
  patient_name: string;
  patient_phone?: string | null;
  patient_symptoms?: string | null;
  patient_gender?: string | null;
  patient_age?: number | string | null;
  patient_blood_group?: string | null;
  visit_type: string;
  department?: string | null;
  doctor_name?: string | null;
  appointment_date: string;
  token_no: number;
  status: string;
  appointment_kind?: string;
  follow_up_for?: number | null;
  reminder_sent_at?: string | null;
  no_show_marked?: boolean | number;
  notes?: string | null;
  chief_complaint?: string | null;
  symptoms?: string | null;
  symptom_duration?: string | null;
  symptom_severity?: string | null;
  ai_recommendation?: string | null;
  gender_preference?: string | null;
  op_status?: string | null;
  further_action?: string | null;
  further_action_notes?: string | null;
  consultation_fee?: number | string | null;
  payment_mode?: string | null;
  encounter_id?: number | null;
  created_at?: string;
}

export interface DoctorSchedule {
  id: number;
  doctor_name: string;
  department?: string | null;
  schedule_date: string;
  start_time: string;
  end_time: string;
  slot_capacity?: number | null;
  status?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface OpSummary {
  date: string;
  total_appointments: number;
  new_patients?: number;
  follow_ups: number;
  awaiting_doctor?: number;
  active_queue: number;
  in_consultation?: number;
  completed?: number;
  no_shows: number;
  reminders_sent: number;
  available_doctors: number;
  busy_doctors?: number;
  leave_doctors?: number;
  pending_billing?: number;
  pending_investigations?: number;
}

export interface EligibleDoctor {
  id: number;
  doctor_name: string;
  department: string;
  gender: string;
  consultation_fee: number;
  review_fee: number;
  status: string;
  current_workload: number;
  department_matches: boolean;
  gender_matches: boolean;
  is_available: boolean;
  match_score: number;
}

export interface PatientMatchItem {
  patient_id: string;
  name: string;
  middle_name?: string;
  last_name?: string;
  full_name: string;
  phone?: string;
  gender?: string;
  age?: number | string;
  dob?: string;
  blood_group?: string;
  created_at?: string;
  total_op_visits?: number;
}

export interface OpTimelineEvent {
  id: number;
  hospital_id: number;
  appointment_id?: number | null;
  encounter_id?: number | null;
  patient_id: string;
  event_name: string;
  event_description?: string | null;
  actor?: string | null;
  created_at: string;
}

export interface OpPatientHistoryVisit {
  appointment_id: number;
  token_no: number;
  appointment_date: string;
  doctor_name?: string | null;
  department?: string | null;
  status: string;
  chief_complaint?: string;
  symptoms?: string;
  symptom_duration?: string;
  symptom_severity?: string;
  further_action?: string;
  diagnoses?: string[];
  clinical_notes?: { notes?: string; advice?: string; follow_up?: string; created_at?: string }[];
  prescriptions?: { id: number; doctor_username?: string; medicines?: any[]; created_at?: string }[];
  vitals?: any[];
}

export interface Certificate {
  id: number;
  patient_id: string;
  admission_id?: number | null;
  certificate_type: string;
  title: string;
  body: string;
  issued_by?: string | null;
  created_at?: string;
}

export interface ReportsOverview {
  hospital_summary: {
    ip_op_counts: {
      daily_ip: number;
      daily_op: number;
      monthly_ip: number;
      monthly_op: number;
    };
    accidents: {
      daily: number;
      monthly: number;
    };
    revenue: {
      total: number;
      due: number;
      payment_mode_breakdown: DistributionItem[];
    };
    pharmacy_summary: {
      monthly_sales: number;
    };
    diagnostics_summary: {
      monthly_income: number;
    };
    referrals: DistributionItem[];
  };
  billing_summary: {
    total_billed: number;
    total_collected: number;
    total_due: number;
    total_advance: number;
    total_refunded: number;
    payment_mode_breakdown: DistributionItem[];
    collections_by_module: DistributionItem[];
  };
  pharmacy_summary: {
    low_stock_count: number;
    out_of_stock_count: number;
    damaged_stock_count: number;
    sales_total: number;
  };
  lab_summary: {
    total_amount: number;
    total_paid: number;
    total_due: number;
  };
  employee_summary: {
    total: number;
    active: number;
    inactive: number;
  };
  accounts_summary: {
    ledger_income: number;
    ledger_expense: number;
    net_position: number;
    vendor_paid_total: number;
    doctor_paid_total: number;
    doctor_due_total: number;
  };
  doctor_income: DistributionItem[];
  clinic_income: DistributionItem[];
  discount_by_module: DistributionItem[];
  payment_status_breakdown: DistributionItem[];
  alos_summary: {
    average_los_days: number;
    admission_count: number;
  };
  patient_financials: Array<{
    label: string;
    total_billed: number;
    total_due: number;
  }>;
  diagnostics_by_doctor: DistributionItem[];
}

export interface OtSummary {
  theatre_count: number;
  available_theatres: number;
  scheduled_surgeries: number;
  completed_surgeries: number;
  scheduled_hours: number;
  completed_hours: number;
  theatre_utilization: DistributionItem[];
}

export interface DocumentItem {
  id: number;
  doc_type: string;
  created_at: string;
  file_path?: string;
  file_name?: string;
  mime_type?: string;
  has_file_data?: number;
  ocr_text?: string;
  ocr_language?: string;
}

export interface SignupForm {
  username: string;
  password: string;
  full_name: string;
  email: string;
  phone: string;
  user_type: UserType;
  module_access: ModuleAccessEntry[];
  job_role: string;
  department: string;
  address: string;
  emergency_contact: string;
}

export interface PatientForm {
  name: string;
  middle_name: string;
  last_name: string;
  dob: string;
  age: string;
  weight: string;
  height: string;
  gender: string;
  pregnant: boolean;
  allergy1: string;
  allergy2: string;
  allergy3: string;
  symptoms: string;
  phone: string;
  address: string;
  blood_group: string;
  emergency_contact: string;
  aadhar_number: string;
}

export interface NavItem {
  id: string;
  label: string;
  subtitle?: string;
  permission?: string;
  deniedHint?: string;
  group?:
    "overview" | "ai" | "registration" | "operations" | "finance" | "admin";
  module?: ModuleId;
}

export interface Employee {
  username: string;
  employee_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  department?: string;
  address?: string;
  emergency_contact?: string;
  status?: string;
  job_role?: string;
  access_role?: string;
  user_type?: UserType;
  module_access?: ModuleAccessEntry[];
  date_joined?: string;
}

export interface PatientWallet {
  patient_id: string;
  balance: number;
  updated_at?: string;
}

export interface Refund {
  id: number;
  invoice_id: number;
  amount: number;
  reason?: string;
  status?: string;
  created_at?: string;
}
