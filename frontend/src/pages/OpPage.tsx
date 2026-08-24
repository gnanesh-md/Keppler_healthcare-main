import { useEffect, useMemo, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import StatCard from "../components/StatCard";
import {
  Button,
  Input,
  Select,
  Table,
  TableCell,
  TableHead,
  TableRow,
  Textarea,
} from "../components/ui";
import { apiFetch, reportError } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { openRazorpayCheckout } from "../lib/razorpay";
import type { Appointment, DoctorSchedule, Notice, OpSummary, OpTimelineEvent, EligibleDoctor } from "../types";
import PrescriptionUploadModal from "../components/PrescriptionUploadModal";
import {
  FiActivity,
  FiClock,
  FiUserCheck,
  FiCalendar,
  FiCheckCircle,
  FiAlertCircle,
  FiUsers,
  FiCpu,
  FiPlus,
  FiSearch,
  FiArrowRight,
  FiEye,
  FiHeart,
  FiFileText,
  FiRefreshCw,
} from "react-icons/fi";

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  canEdit: boolean;
  onNavigate?: (page: string, extraData?: any) => void;
};

type Department = {
  id: number;
  department_name?: string;
};

type ScheduleForm = {
  id: string;
  doctor_name: string;
  department: string;
  schedule_date: string;
  start_time: string;
  end_time: string;
  slot_capacity: string;
  status: string;
  notes: string;
};

type AppointmentForm = {
  id: string;
  patient_id: string;
  patient_name: string;
  visit_type: string;
  department: string;
  doctor_name: string;
  appointment_date: string;
  status: string;
  appointment_kind: string;
  follow_up_for: string;
  consultation_fee: string;
  payment_mode: string;
  notes: string;
  chief_complaint?: string;
  symptoms?: string;
  symptom_duration?: string;
  symptom_severity?: string;
  gender_preference?: string;
};

const EMPTY_SUMMARY: OpSummary = {
  date: "",
  total_appointments: 0,
  new_patients: 0,
  follow_ups: 0,
  awaiting_doctor: 0,
  active_queue: 0,
  in_consultation: 0,
  completed: 0,
  no_shows: 0,
  reminders_sent: 0,
  available_doctors: 0,
  busy_doctors: 0,
  leave_doctors: 0,
  pending_billing: 0,
  pending_investigations: 0,
};

const DEFAULT_SCHEDULE_FORM: ScheduleForm = {
  id: "",
  doctor_name: "",
  department: "",
  schedule_date: "",
  start_time: "09:00",
  end_time: "17:00",
  slot_capacity: "12",
  status: "available",
  notes: "",
};

const DEFAULT_APPOINTMENT_FORM: AppointmentForm = {
  id: "",
  patient_id: "",
  patient_name: "",
  visit_type: "OP",
  department: "",
  doctor_name: "",
  appointment_date: "",
  status: "scheduled",
  appointment_kind: "new",
  follow_up_for: "",
  consultation_fee: "0",
  payment_mode: "cash",
  notes: "",
  chief_complaint: "",
  symptoms: "",
  symptom_duration: "",
  symptom_severity: "moderate",
  gender_preference: "",
};

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export default function OpPage({ setNotice, canEdit, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "queue" | "encounters" | "doctors">("overview");
  const [summary, setSummary] = useState<OpSummary>(EMPTY_SUMMARY);
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allDoctors, setAllDoctors] = useState<EligibleDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(DEFAULT_SCHEDULE_FORM);
  const [appointmentForm, setAppointmentForm] = useState<AppointmentForm>(DEFAULT_APPOINTMENT_FORM);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [isRazorpayReady, setIsRazorpayReady] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [selectedDoctor, setSelectedDoctor] = useState("");

  // Modals state
  const [uploadPrescriptionPatient, setUploadPrescriptionPatient] = useState<{ id: string; name: string } | null>(null);
  const [timelineAppointment, setTimelineAppointment] = useState<Appointment | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<OpTimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [vitalsAppointment, setVitalsAppointment] = useState<Appointment | null>(null);
  const [vitalsForm, setVitalsForm] = useState({
    bp: "",
    pulse: "",
    temperature: "",
    spo2: "",
    respiratory_rate: "",
    weight: "",
    blood_glucose: "",
    notes: "",
  });
  const [savingVitals, setSavingVitals] = useState(false);

  const loadOpDesk = async (date = selectedDate, doctorName = selectedDoctor) => {
    setLoading(true);
    try {
      const doctorQuery = doctorName ? `&doctor_name=${encodeURIComponent(doctorName)}` : "";
      const [summaryData, scheduleData, appointmentData, doctorsData] = await Promise.all([
        apiFetch<OpSummary>(`/api/op/summary?date=${date}`),
        apiFetch<{ schedules?: DoctorSchedule[] }>(`/api/op/doctor-schedules?date=${date}${doctorQuery}`),
        apiFetch<{ appointments?: Appointment[] }>(`/api/appointments?date=${date}&visit_type=OP${doctorQuery}`),
        apiFetch<{ doctors?: EligibleDoctor[] }>(`/api/op/doctors/eligible`),
      ]);
      setSummary({ ...EMPTY_SUMMARY, ...summaryData });
      setSchedules(scheduleData.schedules || []);
      setAppointments(appointmentData.appointments || []);
      setAllDoctors(doctorsData.doctors || []);
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to load OP desk.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOpDesk(selectedDate, selectedDoctor);
  }, [selectedDate, selectedDoctor]);

  useEffect(() => {
    apiFetch<{ departments?: Department[] }>("/api/registration/departments")
      .then((data) => setDepartments(data.departments || []))
      .catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    apiFetch<{ configured?: boolean }>("/api/payments/razorpay/config")
      .then((data) => setIsRazorpayReady(data.configured !== false))
      .catch(() => setIsRazorpayReady(true));
  }, []);

  const doctorNames = useMemo(() => {
    const names = new Set<string>();
    schedules.forEach((item) => names.add(item.doctor_name));
    appointments.forEach((item) => {
      if (item.doctor_name) names.add(item.doctor_name);
    });
    allDoctors.forEach((d) => names.add(d.doctor_name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [schedules, appointments, allDoctors]);

  const handleOpenTimeline = async (appointment: Appointment) => {
    setTimelineAppointment(appointment);
    setLoadingTimeline(true);
    try {
      const res = await apiFetch<{ timeline: OpTimelineEvent[] }>(`/api/op/visits/${appointment.id}/timeline`);
      setTimelineEvents(res.timeline || []);
    } catch {
      setTimelineEvents([]);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleOpenVitals = (appointment: Appointment) => {
    setVitalsAppointment(appointment);
    setVitalsForm({
      bp: "",
      pulse: "",
      temperature: "",
      spo2: "",
      respiratory_rate: "",
      weight: "",
      blood_glucose: "",
      notes: "",
    });
  };

  const handleSaveVitals = async () => {
    if (!vitalsAppointment) return;
    setSavingVitals(true);
    try {
      await apiFetch(`/api/op/visits/${vitalsAppointment.id}/vitals`, {
        method: "POST",
        body: JSON.stringify(vitalsForm),
      });
      setNotice({ type: "success", message: `Vitals recorded for OP #${vitalsAppointment.token_no} (${vitalsAppointment.patient_name})` });
      setVitalsAppointment(null);
      await loadOpDesk();
    } catch (error) {
      reportError(setNotice, error as { message?: string }, "Unable to save vitals.");
    } finally {
      setSavingVitals(false);
    }
  };

  const quickUpdateStatus = async (appointment: Appointment, nextStatus: string) => {
    try {
      await apiFetch(`/api/op/visits/${appointment.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice({
        type: "success",
        message: `OP #${appointment.token_no} transitioned to ${nextStatus.replace("_", " ")}.`,
      });
      await loadOpDesk();
    } catch (error) {
      reportError(setNotice, error as { message?: string }, "Status update failed.");
    }
  };

  const handleReassignDoctor = async (appointmentId: number, doctorName: string) => {
    try {
      await apiFetch(`/api/op/visits/${appointmentId}/assign`, {
        method: "POST",
        body: JSON.stringify({ doctor_name: doctorName }),
      });
      setNotice({ type: "success", message: `Assigned to ${doctorName}.` });
      await loadOpDesk();
    } catch (error) {
      reportError(setNotice, error as { message?: string }, "Doctor reassignment failed.");
    }
  };

  const filteredAppointments = useMemo(() => {
    if (!searchTerm.trim()) return appointments;
    const term = searchTerm.toLowerCase();
    return appointments.filter(
      (a) =>
        a.patient_name.toLowerCase().includes(term) ||
        (a.patient_id || "").toLowerCase().includes(term) ||
        (a.doctor_name || "").toLowerCase().includes(term) ||
        (a.chief_complaint || "").toLowerCase().includes(term) ||
        String(a.token_no).includes(term)
    );
  }, [appointments, searchTerm]);

  const queueList = useMemo(() => {
    return filteredAppointments.filter((a) => a.status !== "completed" && a.status !== "cancelled");
  }, [filteredAppointments]);

  return (
    <section className="module-page" style={{ maxWidth: "1250px", margin: "0 auto" }}>
      {/* Header & Date/Doctor Quick Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0, color: "#0f172a", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FiActivity style={{ color: "#059669" }} />
            Outpatient (OP) Command Center
          </h2>
          <p style={{ fontSize: "0.825rem", color: "#64748b", margin: "2px 0 0" }}>
            Real-time OP queue orchestration, doctor workload, patient encounters & vital tracking
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ width: "150px", fontSize: "0.85rem" }}
          />
          <Select
            value={selectedDoctor}
            onChange={(e) => setSelectedDoctor(e.target.value)}
            style={{ width: "170px", fontSize: "0.85rem" }}
          >
            <option value="">All Doctors</option>
            {doctorNames.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Button variant="secondary" size="sm" onClick={() => void loadOpDesk()}>
            <FiRefreshCw />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate?.("appointment-in")}
            style={{ background: "#059669" }}
          >
            <FiPlus style={{ marginRight: "4px" }} /> New OP Visit
          </Button>
        </div>
      </div>

      {/* Modern Tab Bar */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid #e2e8f0", marginBottom: "1.25rem", paddingBottom: "0.5rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            background: activeTab === "overview" ? "#059669" : "transparent",
            color: activeTab === "overview" ? "#ffffff" : "#475569",
            transition: "all 0.15s ease",
          }}
        >
          📊 Dashboard & KPIs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("queue")}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            background: activeTab === "queue" ? "#059669" : "transparent",
            color: activeTab === "queue" ? "#ffffff" : "#475569",
            position: "relative",
          }}
        >
          🚶 Live OP Queue ({queueList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("encounters")}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            background: activeTab === "encounters" ? "#059669" : "transparent",
            color: activeTab === "encounters" ? "#ffffff" : "#475569",
          }}
        >
          📋 OP Encounters & Timeline
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("doctors")}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            background: activeTab === "doctors" ? "#059669" : "transparent",
            color: activeTab === "doctors" ? "#ffffff" : "#475569",
          }}
        >
          🩺 Doctor Directory ({allDoctors.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & KPIS */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {/* Stat Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.85rem" }}>
            <StatCard label="Total OP Visits Today" value={summary.total_appointments} />
            <StatCard label="New Patients (UMR)" value={summary.new_patients ?? 0} />
            <StatCard label="Revisits / Follow-ups" value={summary.follow_ups} />
            <StatCard label="Active Queue (Waiting)" value={summary.active_queue} />
            <StatCard label="In Consultation" value={summary.in_consultation ?? 0} />
            <StatCard label="Completed Visits" value={summary.completed ?? 0} />
            <StatCard label="Available Doctors" value={summary.available_doctors} />
          </div>

          {/* Quick Queue & Workload Split */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {/* Quick Live Queue Snapshot */}
            <div className="panel" style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>Live OP Queue Snapshot</h4>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab("queue")}>
                  View Full Queue <FiArrowRight style={{ marginLeft: "4px" }} />
                </Button>
              </div>
              {queueList.length === 0 ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>No active patients waiting in queue today.</p>
              ) : (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {queueList.slice(0, 5).map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "0.6rem 0.85rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <div>
                        <strong style={{ color: "#059669", marginRight: "0.5rem" }}>OP #{a.token_no}</strong>
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>{a.patient_name}</span>
                        <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#64748b" }}>
                          UMR: {a.patient_id} · Dr: {a.doctor_name || "Unassigned"}
                        </span>
                      </div>
                      <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600, background: a.status === "in_consultation" ? "#fef3c7" : "#e0e7ff", color: a.status === "in_consultation" ? "#92400e" : "#3730a3" }}>
                        {a.status.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Doctor Availability & Workload */}
            <div className="panel" style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>Doctor Workload & Status</h4>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab("doctors")}>
                  Manage Doctors <FiArrowRight style={{ marginLeft: "4px" }} />
                </Button>
              </div>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {allDoctors.slice(0, 5).map((doc) => (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "0.6rem 0.85rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <div>
                      <strong style={{ color: "#0f172a" }}>{doc.doctor_name}</strong>
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#64748b" }}>
                        {doc.department} · {doc.gender}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "0.75rem", color: "#475569" }}>{doc.current_workload} waiting</span>
                      <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600, background: doc.is_available ? "#dcfce7" : "#fee2e2", color: doc.is_available ? "#166534" : "#991b1b" }}>
                        {doc.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE OP QUEUE & TRIAGE */}
      {activeTab === "queue" && (
        <div className="panel" style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>Active OP Queue</h3>
              <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "2px 0 0" }}>Manage patient consultations, vitals capture, and status progression</p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Input
                placeholder="Search patient, UMR, or doctor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: "240px", fontSize: "0.85rem" }}
              />
            </div>
          </div>

          <Table className="module-table module-table-op">
            <TableHead>
              <TableCell>Token #</TableCell>
              <TableCell>Patient & UMR</TableCell>
              <TableCell>Gender / Age</TableCell>
              <TableCell>Chief Complaint & Symptoms</TableCell>
              <TableCell>Assigned Doctor</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableHead>
            {queueList.length === 0 ? (
              <TableRow>
                <TableCell>-</TableCell>
                <TableCell>No active patients in queue</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
              </TableRow>
            ) : (
              queueList.map((appointment) => (
                <TableRow key={appointment.id}>
                  <TableCell>
                    <span style={{ fontWeight: 800, color: "#059669", fontSize: "1rem" }}>
                      #{appointment.token_no}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <strong style={{ color: "#0f172a" }}>{appointment.patient_name}</strong>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>UMR: {appointment.patient_id}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span style={{ fontSize: "0.85rem" }}>
                      {appointment.patient_gender || "Other"} {appointment.patient_age ? `(${appointment.patient_age}y)` : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div style={{ maxWidth: "250px" }}>
                      <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.85rem" }}>
                        {appointment.chief_complaint || "Routine Consultation"}
                      </div>
                      {appointment.symptoms && (
                        <div style={{ fontSize: "0.75rem", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {appointment.symptoms}
                        </div>
                      )}
                      {appointment.symptom_duration && (
                        <span style={{ fontSize: "0.7rem", background: "#f1f5f9", padding: "0.1rem 0.35rem", borderRadius: "3px", color: "#475569" }}>
                          Dur: {appointment.symptom_duration}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <strong style={{ fontSize: "0.875rem", color: "#0f172a" }}>{appointment.doctor_name || "Unassigned"}</strong>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{appointment.department || "General"}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span style={{
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "999px",
                      fontWeight: 600,
                      background:
                        appointment.status === "in_consultation" ? "#fef3c7"
                        : appointment.status === "checked_in" ? "#dbeafe"
                        : "#f1f5f9",
                      color:
                        appointment.status === "in_consultation" ? "#92400e"
                        : appointment.status === "checked_in" ? "#1e40af"
                        : "#475569",
                    }}>
                      {appointment.status.replace("_", " ")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {/* Vitals Button */}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleOpenVitals(appointment)}
                        title="Record Vitals"
                      >
                        <FiHeart style={{ marginRight: "3px", color: "#e11d48" }} /> Vitals
                      </Button>

                      {/* Advance Status Button */}
                      {appointment.status === "scheduled" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          style={{ background: "#2563eb" }}
                          onClick={() => void quickUpdateStatus(appointment, "checked_in")}
                        >
                          Check In
                        </Button>
                      )}
                      {appointment.status === "checked_in" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          style={{ background: "#d97706" }}
                          onClick={() => void quickUpdateStatus(appointment, "in_consultation")}
                        >
                          Start Consult
                        </Button>
                      )}
                      {appointment.status === "in_consultation" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          style={{ background: "#059669" }}
                          onClick={() => void quickUpdateStatus(appointment, "completed")}
                        >
                          Complete
                        </Button>
                      )}

                      {/* Open Timeline */}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleOpenTimeline(appointment)}
                        title="View OP Journey Timeline"
                      >
                        <FiClock />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </Table>
        </div>
      )}

      {/* TAB 3: OP ENCOUNTERS & TIMELINE */}
      {activeTab === "encounters" && (
        <div className="panel" style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>OP Encounters Log</h3>
              <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "2px 0 0" }}>All Outpatient encounters recorded for {selectedDate}</p>
            </div>
            <Input
              placeholder="Filter encounters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: "240px", fontSize: "0.85rem" }}
            />
          </div>

          <Table className="module-table module-table-op">
            <TableHead>
              <TableCell>OP Token</TableCell>
              <TableCell>Patient Name (UMR)</TableCell>
              <TableCell>Doctor</TableCell>
              <TableCell>Department</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Further Action</TableCell>
              <TableCell>Timeline</TableCell>
            </TableHead>
            {filteredAppointments.length === 0 ? (
              <TableRow>
                <TableCell>-</TableCell>
                <TableCell>No encounters recorded</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
              </TableRow>
            ) : (
              filteredAppointments.map((app) => (
                <TableRow key={app.id}>
                  <TableCell><strong style={{ color: "#059669" }}>#{app.token_no}</strong></TableCell>
                  <TableCell>
                    <strong>{app.patient_name}</strong>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>UMR: {app.patient_id}</div>
                  </TableCell>
                  <TableCell>{app.doctor_name || "-"}</TableCell>
                  <TableCell>{app.department || "General"}</TableCell>
                  <TableCell>
                    <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600, background: app.status === "completed" ? "#dcfce7" : "#f1f5f9", color: app.status === "completed" ? "#166534" : "#475569" }}>
                      {app.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span style={{ fontSize: "0.8rem", color: "#0284c7", fontWeight: 600 }}>
                      {(app.further_action || "none").toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleOpenTimeline(app)}
                    >
                      <FiEye style={{ marginRight: "4px" }} /> View Timeline
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </Table>
        </div>
      )}

      {/* TAB 4: DOCTOR DIRECTORY & SCHEDULES */}
      {activeTab === "doctors" && (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          <div className="panel" style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>Doctor Roster & Availability</h3>
                <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "2px 0 0" }}>Gender balance, consultation fees, and real-time workload</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
              {allDoctors.map((doc) => (
                <div key={doc.id} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem", background: "#f8fafc" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{doc.doctor_name}</strong>
                    <span style={{
                      fontSize: "0.75rem",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "999px",
                      fontWeight: 600,
                      background: doc.is_available ? "#dcfce7" : "#fee2e2",
                      color: doc.is_available ? "#166534" : "#991b1b",
                    }}>
                      {doc.status}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.825rem", color: "#475569", marginBottom: "0.5rem" }}>
                    <div><strong>Specialty:</strong> {doc.department}</div>
                    <div><strong>Gender:</strong> {doc.gender}</div>
                    <div><strong>Consultation Fee:</strong> ₹{doc.consultation_fee} (Review: ₹{doc.review_fee})</div>
                    <div><strong>Current Queue:</strong> {doc.current_workload} waiting</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RECORD VITALS */}
      {vitalsAppointment && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem",
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "520px",
            padding: "1.5rem",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                  Record Patient Vitals
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                  OP #{vitalsAppointment.token_no} · {vitalsAppointment.patient_name} (UMR: {vitalsAppointment.patient_id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVitalsAppointment(null)}
                style={{ background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#94a3b8" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>Blood Pressure (e.g. 120/80)</label>
                <Input
                  value={vitalsForm.bp}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, bp: e.target.value }))}
                  placeholder="120/80 mmHg"
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>Heart Rate / Pulse (bpm)</label>
                <Input
                  value={vitalsForm.pulse}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, pulse: e.target.value }))}
                  placeholder="72 bpm"
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>Temperature (°F)</label>
                <Input
                  value={vitalsForm.temperature}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, temperature: e.target.value }))}
                  placeholder="98.6 °F"
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>Oxygen Saturation (SpO2 %)</label>
                <Input
                  value={vitalsForm.spo2}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, spo2: e.target.value }))}
                  placeholder="98 %"
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>Respiratory Rate (/min)</label>
                <Input
                  value={vitalsForm.respiratory_rate}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, respiratory_rate: e.target.value }))}
                  placeholder="16 /min"
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>Weight (kg)</label>
                <Input
                  value={vitalsForm.weight}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, weight: e.target.value }))}
                  placeholder="65 kg"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>Blood Glucose (mg/dL)</label>
                <Input
                  value={vitalsForm.blood_glucose}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, blood_glucose: e.target.value }))}
                  placeholder="e.g. 110 mg/dL"
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <Button type="button" variant="secondary" onClick={() => setVitalsAppointment(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                style={{ background: "#059669" }}
                onClick={() => void handleSaveVitals()}
                disabled={savingVitals}
              >
                {savingVitals ? "Saving..." : "Save Vitals & Log Event"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: OP TIMELINE VIEWER */}
      {timelineAppointment && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem",
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "600px",
            padding: "1.5rem",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                  OP Journey Timeline
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                  OP #{timelineAppointment.token_no} · {timelineAppointment.patient_name} (UMR: {timelineAppointment.patient_id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTimelineAppointment(null)}
                style={{ background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#94a3b8" }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", paddingRight: "0.5rem" }}>
              {loadingTimeline ? (
                <p style={{ fontSize: "0.85rem", color: "#64748b" }}>Loading timeline events...</p>
              ) : timelineEvents.length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: "#64748b" }}>No events logged yet for this visit.</p>
              ) : (
                <div style={{ position: "relative", borderLeft: "2px solid #e2e8f0", marginLeft: "1rem", paddingLeft: "1.25rem" }}>
                  {timelineEvents.map((evt, idx) => (
                    <div key={evt.id || idx} style={{ marginBottom: "1.25rem", position: "relative" }}>
                      {/* Timeline Node Dot */}
                      <div style={{
                        position: "absolute",
                        left: "-1.75rem",
                        top: "0.2rem",
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        background: "#059669",
                        border: "2px solid #ffffff",
                        boxShadow: "0 0 0 2px #a7f3d0",
                      }} />
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <strong style={{ fontSize: "0.9rem", color: "#0f172a" }}>{evt.event_name}</strong>
                        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{formatDateTime(evt.created_at)}</span>
                      </div>
                      <p style={{ margin: "4px 0 2px", fontSize: "0.825rem", color: "#475569" }}>
                        {evt.event_description}
                      </p>
                      {evt.actor && (
                        <span style={{ fontSize: "0.7rem", color: "#64748b", background: "#f1f5f9", padding: "0.1rem 0.4rem", borderRadius: "3px" }}>
                          Actor: {evt.actor}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem", borderTop: "1px solid #f1f5f9", paddingTop: "0.75rem" }}>
              <Button type="button" variant="secondary" onClick={() => setTimelineAppointment(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {uploadPrescriptionPatient && (
        <PrescriptionUploadModal
          patientId={uploadPrescriptionPatient.id}
          patientName={uploadPrescriptionPatient.name}
          setNotice={setNotice}
          onClose={() => setUploadPrescriptionPatient(null)}
        />
      )}
    </section>
  );
}
