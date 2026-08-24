import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  FiCalendar,
  FiUserCheck,
  FiActivity,
  FiCpu,
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
  FiZap,
  FiUsers,
  FiArrowRight,
} from "react-icons/fi";
import { Button, Input, Label, Select, Textarea } from "../components/ui";
import { apiFetch, reportError } from "../lib/api";
import { SYMPTOM_API_BASE } from "../lib/constants";
import { updateAppointmentStatus as putAppointmentStatus } from "../lib/appointments";
import { openRazorpayCheckout } from "../lib/razorpay";
import type { Appointment, Notice, Patient, EligibleDoctor } from "../types";
import PatientAutocomplete from "../components/PatientAutocomplete";

import AppointmentQueueCard from "../components/AppointmentQueueCard";
import StatCard from "../components/StatCard";
type RegistrationMode =
  "appointment-in" | "appointment-out" | "consent" | "insurance";

type Props = {
  mode: RegistrationMode;
  selectedPatient: Patient | null;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate?: (page: string, extraData?: any) => void;
  prefillData?: { doctorName?: string; department?: string; patient_id?: string; patient_name?: string } | null;
};

type Department = {
  id: number;
  department_name?: string;
};

type ConsentRecord = {
  id: number;
  patient_id?: string | null;
  patient_name: string;
  consent_type: string;
  signed_by: string;
  relation_to_patient?: string | null;
};

type InsuranceRecord = {
  id: number;
  patient_id?: string | null;
  patient_name: string;
  insurer_name: string;
  policy_number?: string | null;
  member_id?: string | null;
  verification_status: string;
  coverage_notes?: string | null;
};

const DEFAULT_APPOINTMENT_FORM = {
  patient_id: "",
  patient_name: "",
  patient_gender: "Male",
  patient_age: "",
  patient_phone: "",
  visit_type: "OP",
  department: "",
  doctor_name: "",
  appointment_date: "",
  consultation_fee: "0",
  payment_mode: "cash",
  notes: "",
  chief_complaint: "",
  symptoms: "",
  symptom_duration: "",
  symptom_severity: "moderate",
  gender_preference: "",
  ai_recommendation: "",
};

const DEFAULT_CONSENT_FORM = {
  patient_id: "",
  patient_name: "",
  consent_type: "general",
  signed_by: "",
  relation_to_patient: "",
};

const DEFAULT_INSURANCE_FORM = {
  patient_id: "",
  patient_name: "",
  insurer_name: "",
  policy_number: "",
  member_id: "",
  verification_status: "pending",
  coverage_notes: "",
};

function patientFullName(patient: Patient | null) {
  return `${patient?.name || ""} ${patient?.middle_name || ""} ${patient?.last_name || ""}`.trim();
}

export default function RegistrationDeskPage({
  mode,
  selectedPatient,
  setNotice,
  onNavigate,
  prefillData,
}: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [isRazorpayReady, setIsRazorpayReady] = useState(true);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentInput, setDepartmentInput] = useState("");
  const [savingDepartment, setSavingDepartment] = useState(false);

  const [doctorSuggestions, setDoctorSuggestions] = useState<string[]>([]);
  const [doctors, setDoctors] = useState<
    {
      doctor_name?: string | null;
      department?: string | null;
      gender?: string | null;
      consultation_fee?: string | number;
      status?: string | null;
    }[]
  >([]);

  // OP Doctor Matching & Gender Rule State
  const [loadedPatient, setLoadedPatient] = useState<Patient | null>(selectedPatient || null);
  const [eligibleDoctors, setEligibleDoctors] = useState<EligibleDoctor[]>([]);
  const [recommendedDoctor, setRecommendedDoctor] = useState<EligibleDoctor | null>(null);
  const [recommendationAction, setRecommendationAction] = useState<string>("assign");
  const [loadingEligibleDocs, setLoadingEligibleDocs] = useState(false);
  const [registeredOpModalData, setRegisteredOpModalData] = useState<{
    patient_id: string;
    token_no: number;
    patient_name: string;
    doctor_name: string;
    department: string;
    consultation_fee: number;
  } | null>(null);

  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [insuranceChecks, setInsuranceChecks] = useState<InsuranceRecord[]>([]);
  const [savingConsent, setSavingConsent] = useState(false);
  const [savingInsurance, setSavingInsurance] = useState(false);
  const [editingConsentId, setEditingConsentId] = useState<number | null>(null);
  const [editingInsuranceId, setEditingInsuranceId] = useState<number | null>(
    null,
  );

  const [appointmentForm, setAppointmentForm] = useState({
    ...DEFAULT_APPOINTMENT_FORM,
  });
  const [consentForm, setConsentForm] = useState({ ...DEFAULT_CONSENT_FORM });
  const [insuranceForm, setInsuranceForm] = useState({
    ...DEFAULT_INSURANCE_FORM,
  });

  const loadEligibleDoctors = async (dept?: string, patGender?: string) => {
    setLoadingEligibleDocs(true);
    try {
      const pGender = patGender !== undefined && patGender !== "" ? patGender : (loadedPatient?.gender || appointmentForm.patient_gender || selectedPatient?.gender || "Male");
      const d = dept !== undefined ? dept : appointmentForm.department;
      const res = await apiFetch<{
        doctors: EligibleDoctor[];
        recommended_doctor: EligibleDoctor | null;
        recommendation_action: string;
      }>(
        `/api/op/doctors/eligible?department=${encodeURIComponent(d || "")}&patient_gender=${encodeURIComponent(pGender)}`
      );
      setEligibleDoctors(res.doctors || []);
      setRecommendedDoctor(res.recommended_doctor || null);
      setRecommendationAction(res.recommendation_action || "assign");
      if (res.recommended_doctor) {
        setAppointmentForm((prev) => ({
          ...prev,
          department: res.recommended_doctor?.department || prev.department || d || "Medicine",
          doctor_name: res.recommended_doctor?.doctor_name || prev.doctor_name,
          consultation_fee: res.recommended_doctor?.consultation_fee != null ? String(res.recommended_doctor.consultation_fee) : prev.consultation_fee,
        }));
      }
    } catch {
      // fallback
    } finally {
      setLoadingEligibleDocs(false);
    }
  };

  useEffect(() => {
    if (prefillData) {
      setAppointmentForm((prev) => {
        let nextFee = prev.consultation_fee;
        if (doctors.length > 0 && prefillData.doctorName) {
          const doc = doctors.find(
            (d) =>
              (d.doctor_name || "").toLowerCase() ===
              (prefillData.doctorName || "").toLowerCase(),
          );
          if (doc && doc.consultation_fee != null) {
            nextFee = String(doc.consultation_fee);
          }
        }
        return {
          ...prev,
          patient_id: prefillData.patient_id || prev.patient_id,
          patient_name: prefillData.patient_name || prev.patient_name,
          department: prefillData.department || prev.department,
          doctor_name: prefillData.doctorName || prev.doctor_name,
          consultation_fee: nextFee,
        };
      });
    }
  }, [prefillData, doctors]);

  useEffect(() => {
    if (appointmentForm.visit_type === "OP") {
      void loadEligibleDoctors(appointmentForm.department, appointmentForm.patient_gender || selectedPatient?.gender || "Male", appointmentForm.gender_preference);
    }
  }, [appointmentForm.department, appointmentForm.gender_preference, appointmentForm.patient_gender, selectedPatient?.gender, appointmentForm.visit_type]);

  const detectDepartmentFromSymptoms = (text: string): string | null => {
    if (!text || text.trim().length < 2) return null;
    const lower = text.toLowerCase();
    
    if (/\b(chest|heart|palpitat|breathless|cardio|angina|tachycardia|ecg|hypertens|bp\b|pressure)\b/i.test(lower)) {
      return "Cardiology";
    }
    if (/\b(knee|bone|fractur|joint|sprain|ortho|spine|back pain|arthritis|ligament|swollen ankle|shoulder)\b/i.test(lower)) {
      return "Orthopedics";
    }
    if (/\b(skin|rash|itch|acne|dermat|pimples|eczema|fungal|allergy|psoriasis|boil)\b/i.test(lower)) {
      return "Dermatology";
    }
    if (/\b(child|baby|infant|pediatric|toddler|vaccin|immuniz|newborn)\b/i.test(lower)) {
      return "Pediatrics";
    }
    if (/\b(pregnan|prenatal|period|menstrua|gynec|pelvic|ovary|uterus|cramp|delivery)\b/i.test(lower)) {
      return "Gynecology";
    }
    if (/\b(migraine|seizur|fits|nerve|stroke|numb|paralys|neuro|epilepsy|tremor|memory)\b/i.test(lower)) {
      return "Neurology";
    }
    if (/\b(ear|sinus|throat|tonsil|hearing|nose bleed|ent|nasal|hoarse)\b/i.test(lower)) {
      return "ENT";
    }
    if (/\b(fever|cold|cough|weakness|fatigue|infect|body pain|chill|viral|malaise|typhoid|malaria|diabet|headache|vomit|diarrhea|nausea|dizz)\b/i.test(lower)) {
      return "Medicine";
    }
    return null;
  };

  const handleSymptomOrComplaintChange = (field: "chief_complaint" | "symptoms", val: string) => {
    setAppointmentForm((prev) => {
      const next = { ...prev, [field]: val };
      const combined = `${next.chief_complaint || ""} ${next.symptoms || ""}`.trim();
      const detectedDept = detectDepartmentFromSymptoms(combined);
      if (detectedDept && detectedDept !== prev.department) {
        next.department = detectedDept;
        const curGender = loadedPatient?.gender || prev.patient_gender || "Male";
        void loadEligibleDoctors(detectedDept, curGender);
      }
      return next;
    });
  };

  const [symptomsText, setSymptomsText] = useState("");
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageResult, setTriageResult] = useState<{
    urgency?: string;
    reasoning?: string;
  } | null>(null);

  const handleAITriage = async () => {
    setTriageLoading(true);
    try {
      const combined = `${appointmentForm.chief_complaint || ""} ${symptomsText || appointmentForm.symptoms || ""}`.trim();
      const detectedDept = detectDepartmentFromSymptoms(combined) || "Medicine";
      const curGender = loadedPatient?.gender || appointmentForm.patient_gender || "Male";
      
      let urgency = "Moderate";
      let reasoning = `Patient symptoms indicate ${detectedDept} consultation. Auto-assigned ${detectedDept} specialist.`;
      
      try {
        const res = await apiFetch<{
          recommended_specialty?: string;
          urgency?: string;
          reasoning?: string;
        }>("/api/op/ai/triage", {
          method: "POST",
          body: JSON.stringify({
            chief_complaint: appointmentForm.chief_complaint,
            symptoms: combined,
            symptom_severity: appointmentForm.symptom_severity,
            patient_gender: curGender,
          }),
        });
        if (res.recommended_specialty) {
          const apiDept = res.recommended_specialty;
          urgency = res.urgency || urgency;
          reasoning = res.reasoning || reasoning;
          setAppointmentForm((prev) => ({
            ...prev,
            department: apiDept,
            ai_recommendation: `${apiDept} - ${urgency}`,
          }));
          void loadEligibleDoctors(apiDept, curGender);
          setTriageResult({ urgency, reasoning });
          return;
        }
      } catch {
        // use local rule detection fallback
      }

      setAppointmentForm((prev) => ({
        ...prev,
        department: detectedDept,
        ai_recommendation: `${detectedDept} - ${urgency}`,
      }));
      void loadEligibleDoctors(detectedDept, curGender);
      setTriageResult({ urgency, reasoning });
    } finally {
      setTriageLoading(false);
    }
  };

  const loadAppointments = async () => {
    setAppointmentsLoading(true);
    try {
      const today = new Date().toLocaleDateString("en-CA");
      const data = await apiFetch<{ appointments?: Appointment[] }>(
        `/api/appointments?date=${today}`,
      );
      setAppointments(data.appointments || []);
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to load appointments.",
      );
    } finally {
      setAppointmentsLoading(false);
    }
  };

  const loadDepartmentOptions = async () => {
    try {
      const data = await apiFetch<{ departments?: Department[] }>(
        "/api/registration/departments",
      );
      setDepartments(data.departments || []);
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to load departments.",
      );
    }
  };

  const loadDoctorSuggestions = async () => {
    try {
      const doctorsData = await apiFetch<{
        doctors?: {
          doctor_name?: string | null;
          department?: string | null;
          consultation_fee?: string | number;
          status?: string | null;
        }[];
      }>("/api/op/doctors");
      setDoctors(doctorsData.doctors || []);
      const names = new Set<string>();
      (doctorsData.doctors || []).forEach((row) => {
        const value = (row.doctor_name || "").trim();
        if (value) names.add(value);
      });
      setDoctorSuggestions(
        Array.from(names).sort((a, b) => a.localeCompare(b)),
      );
    } catch {
      setDoctorSuggestions([]);
      setDoctors([]);
    }
  };

  const handleDepartmentChange = (dept: string) => {
    setAppointmentForm((prev) => {
      const safeDept = (dept || "").trim().toLowerCase();
      // Match case-insensitively against departments list and doctors list, fallback to fuzzy substring match
      let matchedDeptObj = departments.find(
        (d) => (d.department_name || "").trim().toLowerCase() === safeDept,
      );
      if (!matchedDeptObj) {
        matchedDeptObj = departments.find((d) => {
          const dbName = (d.department_name || "").trim().toLowerCase();
          return dbName.includes(safeDept) || safeDept.includes(dbName);
        });
      }

      let matchedDocDept = doctors.find(
        (d) => (d.department || "").trim().toLowerCase() === safeDept,
      );
      if (!matchedDocDept) {
        matchedDocDept = doctors.find((d) => {
          const dbName = (d.department || "").trim().toLowerCase();
          return dbName.includes(safeDept) || safeDept.includes(dbName);
        });
      }

      const targetDeptName = matchedDeptObj
        ? matchedDeptObj.department_name
        : matchedDocDept?.department || dept;

      let nextDoctor = prev.doctor_name;
      let nextFee = prev.consultation_fee;

      if (targetDeptName && doctors.length > 0) {
        // Find doctors belonging to target department (case-insensitive)
        const inDeptDocs = doctors.filter(
          (d) =>
            (d.department || "").toLowerCase() === targetDeptName.toLowerCase(),
        );
        const isCurrentDoctorInDept = inDeptDocs.some(
          (d) =>
            (d.doctor_name || "").toLowerCase() ===
            (prev.doctor_name || "").toLowerCase(),
        );

        if (!isCurrentDoctorInDept && inDeptDocs.length > 0) {
          const availableDocs = inDeptDocs.filter(
            (d) => d.status === "available",
          );
          const targetDoc =
            availableDocs.length > 0 ? availableDocs[0] : inDeptDocs[0];

          if (targetDoc) {
            nextDoctor = targetDoc.doctor_name || "";
            nextFee =
              targetDoc.consultation_fee != null
                ? String(targetDoc.consultation_fee)
                : "0";
          }
        } else if (inDeptDocs.length === 0 && dept !== "General") {
          // If the AI or user selected a department that has no doctors,
          // leave the doctor field blank so they can type a guest doctor name.
          nextDoctor = "";
          nextFee = "0";
        }
      }

      return {
        ...prev,
        department: targetDeptName || "General",
        doctor_name: nextDoctor,
        consultation_fee: nextFee,
      };
    });
  };

  const handleDoctorChange = (docName: string) => {
    setAppointmentForm((prev) => {
      let nextDept = prev.department;
      let nextFee = prev.consultation_fee;
      let targetDocName = docName;

      if (docName && doctors.length > 0) {
        const cleanDocName = docName.trim().toLowerCase();
        // 1. Try exact match
        let foundDoc = doctors.find(
          (d) => (d.doctor_name || "").trim().toLowerCase() === cleanDocName,
        );

        // 2. Try substring match (e.g. "Emily Chen" matches "Dr. Emily Chen")
        if (!foundDoc) {
          foundDoc = doctors.find((d) => {
            const dbName = (d.doctor_name || "").trim().toLowerCase();
            return (
              dbName.includes(cleanDocName) || cleanDocName.includes(dbName)
            );
          });
        }

        if (foundDoc) {
          targetDocName = foundDoc.doctor_name || docName;
          nextDept = foundDoc.department || prev.department;
          nextFee =
            foundDoc.consultation_fee != null
              ? String(foundDoc.consultation_fee)
              : prev.consultation_fee;
        }
      }

      return {
        ...prev,
        doctor_name: targetDocName,
        department: nextDept,
        consultation_fee: nextFee,
      };
    });
  };

  const loadRegistrationOps = async () => {
    try {
      const patientId = selectedPatient?.patient_id || "";
      const suffix = patientId
        ? `?patient_id=${encodeURIComponent(patientId)}`
        : "";
      const [consentData, insuranceData] = await Promise.all([
        apiFetch<{ consents?: ConsentRecord[] }>(
          `/api/registration/consents${suffix}`,
        ),
        apiFetch<{ verifications?: InsuranceRecord[] }>(
          `/api/registration/insurance${suffix}`,
        ),
      ]);
      setConsents(consentData.consents || []);
      setInsuranceChecks(insuranceData.verifications || []);
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to load registration records.",
      );
    }
  };

  useEffect(() => {
    void loadAppointments();
    void loadDepartmentOptions();
    void loadDoctorSuggestions();
    void loadRegistrationOps();
  }, []);

  useEffect(() => {
    apiFetch<{ configured?: boolean }>("/api/payments/razorpay/config")
      .then((data) => setIsRazorpayReady(data.configured !== false))
      .catch(() => setIsRazorpayReady(true));
  }, []);



  const ensureRazorpayConfigured = async () => {
    try {
      const config = await apiFetch<{ configured?: boolean }>(
        "/api/payments/razorpay/config",
      );
      const configured = config.configured !== false;
      setIsRazorpayReady(configured);
      if (!configured) {
        setNotice({
          type: "warning",
          message: "Razorpay is not configured. Add keys in backend .env.",
        });
        return false;
      }
      return true;
    } catch {
      return true;
    }
  };

  useEffect(() => {
    const defaultPatientName = patientFullName(selectedPatient);
    setAppointmentForm((prev) => ({
      ...prev,
      patient_id: selectedPatient?.patient_id || "",
      patient_name: defaultPatientName || prev.patient_name,
    }));
    setConsentForm((prev) => ({
      ...prev,
      patient_id: selectedPatient?.patient_id || "",
      patient_name: defaultPatientName || prev.patient_name,
    }));
    setInsuranceForm((prev) => ({
      ...prev,
      patient_id: selectedPatient?.patient_id || "",
      patient_name: defaultPatientName || prev.patient_name,
    }));
  }, [selectedPatient]);

  const handleAddDepartment = async () => {
    const departmentName = departmentInput.trim();
    if (!departmentName) {
      setNotice({ type: "warning", message: "Department name is required." });
      return;
    }
    setSavingDepartment(true);
    try {
      const data = await apiFetch<{
        department_id: number;
        department_name?: string;
        already_exists?: boolean;
      }>("/api/registration/departments", {
        method: "POST",
        body: JSON.stringify({ department_name: departmentName }),
      });
      setDepartmentInput("");
      await loadDepartmentOptions();
      if (data.already_exists) {
        setNotice({
          type: "warning",
          message: `Department ${data.department_name || departmentName} already exists.`,
        });
      } else {
        setNotice({
          type: "success",
          message: `Department ${departmentName} added.`,
        });
      }
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to add department.",
      );
    } finally {
      setSavingDepartment(false);
    }
  };

  const handleCreateAppointment = async () => {
    const patientName =
      appointmentForm.patient_name.trim() || patientFullName(selectedPatient);
    if (!patientName || !appointmentForm.appointment_date) {
      setNotice({
        type: "warning",
        message: "Patient name and appointment date/time are required.",
      });
      return;
    }
    setSavingAppointment(true);
    try {
      const isOp = appointmentForm.visit_type === "OP";
      const data = await apiFetch<{ token_no: number; op_number?: number; appointment_id?: number; patient_id?: string }>("/api/appointments", {
        method: "POST",
        body: JSON.stringify({
          patient_id:
            appointmentForm.patient_id.trim() ||
            selectedPatient?.patient_id ||
            undefined,
          patient_name: patientName,
          patient_gender: appointmentForm.patient_gender || "Male",
          patient_phone: appointmentForm.patient_phone || undefined,
          patient_age: appointmentForm.patient_age ? Number(appointmentForm.patient_age) : undefined,
          visit_type: appointmentForm.visit_type,
          department: appointmentForm.department.trim() || undefined,
          doctor_name: appointmentForm.doctor_name.trim() || undefined,
          appointment_date: appointmentForm.appointment_date,
          status: appointmentForm.doctor_name ? "checked_in" : "scheduled",
          notes: appointmentForm.notes.trim() || undefined,
          chief_complaint: appointmentForm.chief_complaint.trim() || undefined,
          symptoms: appointmentForm.symptoms.trim() || symptomsText.trim() || undefined,
          symptom_duration: appointmentForm.symptom_duration.trim() || undefined,
          symptom_severity: appointmentForm.symptom_severity || "moderate",
          ai_recommendation: appointmentForm.ai_recommendation || (triageResult ? `${triageResult.urgency}: ${triageResult.reasoning}` : undefined),
          gender_preference: appointmentForm.gender_preference || appointmentForm.patient_gender || undefined,
          consultation_fee: Number(appointmentForm.consultation_fee) || 0,
          payment_mode: appointmentForm.payment_mode,
        }),
      });
      const token = data.token_no || data.op_number || 1;
      const resolvedUmr = data.patient_id || appointmentForm.patient_id || "PAT-XXXXX";
      
      setRegisteredOpModalData({
        patient_id: resolvedUmr,
        token_no: token,
        patient_name: patientName,
        doctor_name: appointmentForm.doctor_name || "Assigned Specialist",
        department: appointmentForm.department || "General",
        consultation_fee: Number(appointmentForm.consultation_fee) || 0,
      });

      setAppointmentForm((prev) => ({
        ...DEFAULT_APPOINTMENT_FORM,
        patient_id: "",
        patient_name: "",
        department: prev.department,
        doctor_name: prev.doctor_name,
      }));
      setSymptomsText("");
      setTriageResult(null);
      await loadAppointments();
      await loadDoctorSuggestions();
      setNotice({
        type: "success",
        message: isOp
          ? `🎉 OP Encounter registered! UMR: ${resolvedUmr} · OP Token #${token}`
          : `Appointment scheduled. Token #${token}`,
      });
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to schedule appointment.",
      );
    } finally {
      setSavingAppointment(false);
    }
  };

  const handleCreateAppointmentWithRazorpay = async () => {
    if (!(await ensureRazorpayConfigured())) {
      return;
    }
    const patientName =
      appointmentForm.patient_name.trim() || patientFullName(selectedPatient);
    if (!patientName || !appointmentForm.appointment_date) {
      setNotice({
        type: "warning",
        message: "Patient name and appointment date/time are required.",
      });
      return;
    }
    const consultationFee = Number(appointmentForm.consultation_fee) || 0;
    if (consultationFee <= 0) {
      setNotice({
        type: "warning",
        message:
          "Consultation fee must be greater than zero for Razorpay payment.",
      });
      return;
    }

    const appointmentPayload = {
      patient_id:
        appointmentForm.patient_id.trim() ||
        selectedPatient?.patient_id ||
        undefined,
      patient_name: patientName,
      visit_type: appointmentForm.visit_type,
      department: appointmentForm.department.trim() || undefined,
      doctor_name: appointmentForm.doctor_name.trim() || undefined,
      appointment_date: appointmentForm.appointment_date,
      notes: appointmentForm.notes.trim() || undefined,
    };

    setSavingAppointment(true);
    try {
      const order = await apiFetch<{
        key_id: string;
        order_id: string;
        amount: number;
        currency: string;
      }>("/api/appointments/razorpay/order", {
        method: "POST",
        body: JSON.stringify({
          amount: consultationFee,
          notes: {
            patient_name: appointmentPayload.patient_name,
            doctor_name: appointmentPayload.doctor_name || "",
            appointment_date: appointmentPayload.appointment_date,
          },
        }),
      });

      const paymentResult = await openRazorpayCheckout({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "HospAI Registration Desk",
        description: "Appointment Booking",
        order_id: order.order_id,
        prefill: {
          name: appointmentPayload.patient_name,
        },
        notes: {
          patient_id: appointmentPayload.patient_id || "",
        },
        theme: {
          color: "#0f766e",
        },
      });

      const verification = await apiFetch<{ token_no: number }>(
        "/api/appointments/razorpay/verify",
        {
          method: "POST",
          body: JSON.stringify({
            amount: consultationFee,
            payment_mode: appointmentForm.payment_mode,
            appointment: appointmentPayload,
            razorpay_order_id: paymentResult.razorpay_order_id,
            razorpay_payment_id: paymentResult.razorpay_payment_id,
            razorpay_signature: paymentResult.razorpay_signature,
          }),
        },
      );

      setAppointmentForm((prev) => ({
        ...DEFAULT_APPOINTMENT_FORM,
        patient_id: selectedPatient?.patient_id || "",
        patient_name: patientName,
        visit_type: prev.visit_type,
        department: prev.department,
        doctor_name: prev.doctor_name,
      }));
      await loadAppointments();
      await loadDoctorSuggestions();
      setNotice({
        type: "success",
        message: `Appointment scheduled with Razorpay. Token #${verification.token_no}. Redirecting to queue...`,
      });
      onNavigate?.("queue");
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to schedule appointment via Razorpay.",
      );
    } finally {
      setSavingAppointment(false);
    }
  };

  const updateAppointmentStatus = async (
    appointmentId: number,
    status: string,
  ) => {
    try {
      await putAppointmentStatus(appointmentId, status);
      await loadAppointments();
      setNotice({
        type: "success",
        message: `Token status updated to ${status.replace("_", " ")}.`,
      });
      // Starting the visit hands the patient off to the doctor's consultation
      // desk; "completed" is only reachable from the appointment-out desk
      // itself, so there's nowhere further to send the operator for that one.
      if (status === "in_consultation") {
        onNavigate?.("doctor-prescription");
      }
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to update appointment status.",
      );
    }
  };

  const handleSaveConsent = async () => {
    const patientName =
      consentForm.patient_name.trim() || patientFullName(selectedPatient);
    if (!patientName || !consentForm.signed_by.trim()) {
      setNotice({
        type: "warning",
        message: "Patient name and signer are required for consent.",
      });
      return;
    }
    setSavingConsent(true);
    try {
      const body = JSON.stringify({
        patient_id:
          consentForm.patient_id.trim() ||
          selectedPatient?.patient_id ||
          undefined,
        patient_name: patientName,
        consent_type: consentForm.consent_type,
        signed_by: consentForm.signed_by.trim(),
        relation_to_patient:
          consentForm.relation_to_patient.trim() || undefined,
      });
      if (editingConsentId != null) {
        await apiFetch(`/api/registration/consents/${editingConsentId}`, {
          method: "PUT",
          body,
        });
      } else {
        await apiFetch("/api/registration/consents", { method: "POST", body });
      }
      setConsentForm({
        ...DEFAULT_CONSENT_FORM,
        patient_id: selectedPatient?.patient_id || "",
        patient_name: patientName,
      });
      setEditingConsentId(null);
      await loadRegistrationOps();
      setNotice({
        type: "success",
        message:
          editingConsentId != null
            ? "Consent updated."
            : "Digital consent recorded.",
      });
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to save consent.",
      );
    } finally {
      setSavingConsent(false);
    }
  };

  const handleEditConsent = (consent: ConsentRecord) => {
    setEditingConsentId(consent.id);
    setConsentForm({
      patient_id: consent.patient_id || "",
      patient_name: consent.patient_name || "",
      consent_type: consent.consent_type || "general",
      signed_by: consent.signed_by || "",
      relation_to_patient: consent.relation_to_patient || "",
    });
  };

  const handleCancelConsentEdit = () => {
    setEditingConsentId(null);
    setConsentForm({
      ...DEFAULT_CONSENT_FORM,
      patient_id: selectedPatient?.patient_id || "",
      patient_name: patientFullName(selectedPatient),
    });
  };

  const handleSaveInsuranceVerification = async () => {
    const patientName =
      insuranceForm.patient_name.trim() || patientFullName(selectedPatient);
    if (!patientName || !insuranceForm.insurer_name.trim()) {
      setNotice({
        type: "warning",
        message:
          "Patient name and insurer are required for insurance verification.",
      });
      return;
    }
    setSavingInsurance(true);
    try {
      const body = JSON.stringify({
        patient_id:
          insuranceForm.patient_id.trim() ||
          selectedPatient?.patient_id ||
          undefined,
        patient_name: patientName,
        insurer_name: insuranceForm.insurer_name.trim(),
        policy_number: insuranceForm.policy_number.trim() || undefined,
        member_id: insuranceForm.member_id.trim() || undefined,
        verification_status: insuranceForm.verification_status,
        coverage_notes: insuranceForm.coverage_notes.trim() || undefined,
      });
      if (editingInsuranceId != null) {
        await apiFetch(`/api/registration/insurance/${editingInsuranceId}`, {
          method: "PUT",
          body,
        });
      } else {
        await apiFetch("/api/registration/insurance", { method: "POST", body });
      }
      setInsuranceForm({
        ...DEFAULT_INSURANCE_FORM,
        patient_id: selectedPatient?.patient_id || "",
        patient_name: patientName,
      });
      setEditingInsuranceId(null);
      await loadRegistrationOps();
      setNotice({
        type: "success",
        message:
          editingInsuranceId != null
            ? "Insurance verification updated."
            : "Insurance verification saved.",
      });
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to save insurance verification.",
      );
    } finally {
      setSavingInsurance(false);
    }
  };

  const handleEditInsurance = (check: InsuranceRecord) => {
    setEditingInsuranceId(check.id);
    setInsuranceForm({
      patient_id: check.patient_id || "",
      patient_name: check.patient_name || "",
      insurer_name: check.insurer_name || "",
      policy_number: check.policy_number || "",
      member_id: check.member_id || "",
      verification_status: check.verification_status || "pending",
      coverage_notes: check.coverage_notes || "",
    });
  };

  const handleCancelInsuranceEdit = () => {
    setEditingInsuranceId(null);
    setInsuranceForm({
      ...DEFAULT_INSURANCE_FORM,
      patient_id: selectedPatient?.patient_id || "",
      patient_name: patientFullName(selectedPatient),
    });
  };

  const appointmentInQueue = useMemo(
    () =>
      appointments.filter((item) =>
        ["scheduled", "checked_in", "in_consultation"].includes(item.status),
      ),
    [appointments],
  );

  const appointmentOutActiveQueue = useMemo(
    () =>
      appointments.filter((item) =>
        ["checked_in", "in_consultation"].includes(item.status),
      ),
    [appointments],
  );

  const appointmentOutCompletedQueue = useMemo(
    () => appointments.filter((item) => item.status === "completed"),
    [appointments],
  );

  const allDepartments = useMemo(() => {
    const map = new Map<string, string>();
    departments.forEach((d) => {
      const name = (d.department_name || "").trim();
      if (name) map.set(name.toLowerCase(), name);
    });
    doctors.forEach((d) => {
      const name = (d.department || "").trim();
      if (name && !map.has(name.toLowerCase())) {
        map.set(name.toLowerCase(), name);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [departments, doctors]);

  if (mode === "consent") {
    return (
      <section className="module-page">
        <div className="panel registration-desk-panel">
          <div className="grid-form">
            <Label>
              Patient Name
              <Input
                value={consentForm.patient_name}
                onChange={(event) =>
                  setConsentForm((prev) => ({
                    ...prev,
                    patient_name: event.target.value,
                  }))
                }
                placeholder="Patient or guardian context"
              />
            </Label>
            <Label>
              Consent Type
              <Select
                value={consentForm.consent_type}
                onChange={(event) =>
                  setConsentForm((prev) => ({
                    ...prev,
                    consent_type: event.target.value,
                  }))
                }
              >
                <option value="general">General</option>
                <option value="procedure">Procedure</option>
                <option value="privacy">Privacy</option>
                <option value="insurance">Insurance</option>
              </Select>
            </Label>
            <Label>
              Signed By
              <Input
                value={consentForm.signed_by}
                onChange={(event) =>
                  setConsentForm((prev) => ({
                    ...prev,
                    signed_by: event.target.value,
                  }))
                }
                placeholder="Patient / Guardian"
              />
            </Label>
            <Label>
              Relation
              <Input
                value={consentForm.relation_to_patient}
                onChange={(event) =>
                  setConsentForm((prev) => ({
                    ...prev,
                    relation_to_patient: event.target.value,
                  }))
                }
                placeholder="Self / Spouse / Parent"
              />
            </Label>
          </div>
          <div className="form-actions">
            <Button
              variant="secondary"
              type="button"
              onClick={() => void handleSaveConsent()}
              disabled={savingConsent}
            >
              {savingConsent
                ? "Saving Consent..."
                : editingConsentId != null
                  ? "Update Consent"
                  : "Save Consent"}
            </Button>
            {editingConsentId != null ? (
              <Button
                variant="ghost"
                type="button"
                onClick={handleCancelConsentEdit}
                disabled={savingConsent}
              >
                Cancel Edit
              </Button>
            ) : null}
          </div>
          {consents.slice(0, 10).map((consent) => (
            <div
              key={consent.id}
              className="module-inline-actions"
              style={{ justifyContent: "space-between" }}
            >
              <p className="muted">
                {consent.patient_name} · {consent.consent_type} ·{" "}
                {consent.signed_by}
              </p>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => handleEditConsent(consent)}
              >
                Edit
              </Button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (mode === "insurance") {
    return (
      <section className="module-page">
        <div className="panel registration-desk-panel">
          <div className="grid-form">
            <Label>
              Patient Name
              <Input
                value={insuranceForm.patient_name}
                onChange={(event) =>
                  setInsuranceForm((prev) => ({
                    ...prev,
                    patient_name: event.target.value,
                  }))
                }
                placeholder="Patient name"
              />
            </Label>
            <Label>
              Insurer
              <Input
                value={insuranceForm.insurer_name}
                onChange={(event) =>
                  setInsuranceForm((prev) => ({
                    ...prev,
                    insurer_name: event.target.value,
                  }))
                }
                placeholder="Insurance provider"
              />
            </Label>
            <Label>
              Policy Number
              <Input
                value={insuranceForm.policy_number}
                onChange={(event) =>
                  setInsuranceForm((prev) => ({
                    ...prev,
                    policy_number: event.target.value,
                  }))
                }
                placeholder="Policy no."
              />
            </Label>
            <Label>
              Member ID
              <Input
                value={insuranceForm.member_id}
                onChange={(event) =>
                  setInsuranceForm((prev) => ({
                    ...prev,
                    member_id: event.target.value,
                  }))
                }
                placeholder="Member ID"
              />
            </Label>
            <Label>
              Status
              <Select
                value={insuranceForm.verification_status}
                onChange={(event) =>
                  setInsuranceForm((prev) => ({
                    ...prev,
                    verification_status: event.target.value,
                  }))
                }
              >
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </Select>
            </Label>
            <Label className="span-2">
              Coverage Notes
              <Textarea
                value={insuranceForm.coverage_notes}
                onChange={(event) =>
                  setInsuranceForm((prev) => ({
                    ...prev,
                    coverage_notes: event.target.value,
                  }))
                }
                rows={2}
              />
            </Label>
          </div>
          <div className="form-actions">
            <Button
              variant="secondary"
              type="button"
              onClick={() => void handleSaveInsuranceVerification()}
              disabled={savingInsurance}
            >
              {savingInsurance
                ? "Saving Verification..."
                : editingInsuranceId != null
                  ? "Update Verification"
                  : "Save Verification"}
            </Button>
            {editingInsuranceId != null ? (
              <Button
                variant="ghost"
                type="button"
                onClick={handleCancelInsuranceEdit}
                disabled={savingInsurance}
              >
                Cancel Edit
              </Button>
            ) : null}
          </div>
          {insuranceChecks.slice(0, 10).map((check) => (
            <div
              key={check.id}
              className="module-inline-actions"
              style={{ justifyContent: "space-between" }}
            >
              <p className="muted">
                {check.patient_name} · {check.insurer_name} ·{" "}
                {check.verification_status}
              </p>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => handleEditInsurance(check)}
              >
                Edit
              </Button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const queue =
    mode === "appointment-in" ? appointmentInQueue : appointmentOutActiveQueue;

  return (
    <section className="module-page">
      {mode === "appointment-out" && (
        <div style={{ marginBottom: "1.5rem" }}>
          <StatCard
            label="Completed Consultations Today"
            value={appointmentOutCompletedQueue.length}
          />
        </div>
      )}

      {mode === "appointment-in" ? (
        <div className="panel registration-desk-panel" style={{ borderRadius: "12px", border: "1px solid #e2e8f0", background: "#ffffff", padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.75rem" }}>
            <div>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                {appointmentForm.visit_type === "OP" ? "Outpatient (OP) Desk & Token Generation" : "Inpatient (IP) Scheduling"}
              </h3>
              <p style={{ fontSize: "0.825rem", color: "#64748b", margin: "2px 0 0" }}>
                {appointmentForm.visit_type === "OP"
                  ? "Streamlined OP intake: 1 UMR · 1 OP Token · AI Triage · Gender Rule Doctor Assignment"
                  : "Schedule Inpatient admission or follow-up"}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <span style={{
                fontSize: "0.8rem",
                padding: "0.25rem 0.75rem",
                borderRadius: "999px",
                fontWeight: 700,
                background: appointmentForm.visit_type === "OP" ? "#ecfdf5" : "#eff6ff",
                color: appointmentForm.visit_type === "OP" ? "#065f46" : "#1e40af",
                border: `1px solid ${appointmentForm.visit_type === "OP" ? "#a7f3d0" : "#bfdbfe"}`,
              }}>
                {appointmentForm.visit_type} Workflow
              </span>
            </div>
          </div>

          {/* Selected / Looked up Patient Card */}
          {loadedPatient ? (
            <div style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "10px",
              padding: "0.85rem 1.2rem",
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <div style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "8px",
                  background: loadedPatient.gender?.toLowerCase() === "female" ? "#fce7f3" : "#e0e7ff",
                  color: loadedPatient.gender?.toLowerCase() === "female" ? "#9d174d" : "#3730a3",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1rem",
                  fontWeight: 700,
                }}>
                  {loadedPatient.gender?.toLowerCase() === "female" ? "F" : "M"}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{patientFullName(loadedPatient)}</strong>
                    <span style={{ background: "#0284c7", color: "#ffffff", padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700 }}>
                      UMR: {loadedPatient.patient_id}
                    </span>
                    <span style={{ background: loadedPatient.gender?.toLowerCase() === "female" ? "#fdf2f8" : "#eff6ff", color: loadedPatient.gender?.toLowerCase() === "female" ? "#9d174d" : "#1e40af", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", border: `1px solid ${loadedPatient.gender?.toLowerCase() === "female" ? "#fbcfe8" : "#bfdbfe"}` }}>
                      {loadedPatient.gender || "Male"} {loadedPatient.age ? `· ${loadedPatient.age} yrs` : ""}
                    </span>
                  </div>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#475569" }}>
                    Phone: {loadedPatient.phone || "N/A"} {loadedPatient.blood_group ? `· Blood Group: ${loadedPatient.blood_group}` : ""}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLoadedPatient(null);
                  setAppointmentForm((prev) => ({ ...prev, patient_id: "", patient_name: "" }));
                }}
                style={{ color: "#0284c7" }}
              >
                Change Patient
              </Button>
            </div>
          ) : (
            <div className="grid-form" style={{ marginBottom: "1rem" }}>
              <Label>
                Patient ID / UMR
                <PatientAutocomplete
                  value={appointmentForm.patient_id}
                  onChange={(val) =>
                    setAppointmentForm((prev) => ({ ...prev, patient_id: val }))
                  }
                  onSelect={(patient) => {
                    const fullName = patientFullName(patient);
                    const gender = (patient.gender || "Male").trim();
                    const cleanGender = gender.toLowerCase() === "female" ? "Female" : "Male";
                    setLoadedPatient(patient);
                    setAppointmentForm((prev) => ({
                      ...prev,
                      patient_id: patient.patient_id,
                      patient_name: fullName,
                      patient_gender: cleanGender,
                    }));
                    void loadEligibleDoctors(appointmentForm.department, cleanGender);
                  }}
                  placeholder="Search by UMR (e.g. PAT-100001)"
                />
              </Label>
              <Label>
                Patient Name
                <PatientAutocomplete
                  value={appointmentForm.patient_name}
                  onChange={(val) =>
                    setAppointmentForm((prev) => ({ ...prev, patient_name: val }))
                  }
                  onSelect={(patient) => {
                    const fullName = patientFullName(patient);
                    const gender = (patient.gender || "Male").trim();
                    const cleanGender = gender.toLowerCase() === "female" ? "Female" : "Male";
                    setLoadedPatient(patient);
                    setAppointmentForm((prev) => ({
                      ...prev,
                      patient_id: patient.patient_id,
                      patient_name: fullName,
                      patient_gender: cleanGender,
                    }));
                    void loadEligibleDoctors(appointmentForm.department, cleanGender);
                  }}
                  placeholder="Search by Patient Name"
                />
              </Label>
            </div>
          )}

          <div className="grid-form">
            <Label>
              Visit Type
              <Select
                value={appointmentForm.visit_type}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({
                    ...prev,
                    visit_type: event.target.value,
                  }))
                }
              >
                <option value="OP">OP (Outpatient Department)</option>
                <option value="IP">IP (Inpatient Department)</option>
              </Select>
            </Label>
            <Label>
              Appointment Date & Time
              <Input
                type="datetime-local"
                value={appointmentForm.appointment_date}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({
                    ...prev,
                    appointment_date: event.target.value,
                  }))
                }
              />
            </Label>

            {/* Dedicated Outpatient Details */}
            {appointmentForm.visit_type === "OP" && (
              <>
                <Label>
                  Chief Complaint
                  <Input
                    value={appointmentForm.chief_complaint}
                    onChange={(e) => handleSymptomOrComplaintChange("chief_complaint", e.target.value)}
                    placeholder="e.g. Chest pain, High fever, Knee ache"
                  />
                </Label>
                <Label>
                  Symptom Duration & Severity
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <Input
                      value={appointmentForm.symptom_duration}
                      onChange={(e) => setAppointmentForm((prev) => ({ ...prev, symptom_duration: e.target.value }))}
                      placeholder="e.g. 3 days, 1 week"
                    />
                    <Select
                      value={appointmentForm.symptom_severity}
                      onChange={(e) => setAppointmentForm((prev) => ({ ...prev, symptom_severity: e.target.value }))}
                    >
                      <option value="mild">Mild</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe / Urgent</option>
                    </Select>
                  </div>
                </Label>

                {/* AI Triage & Recommendation */}
                <div style={{ gridColumn: "1 / -1", background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, color: "#1e293b", fontSize: "0.9rem" }}>
                      <FiCpu style={{ color: "#6366f1" }} />
                      <span>AI Symptom Triage & Specialty Recommender</span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => void handleAITriage()}
                      disabled={triageLoading}
                      style={{ background: "#4f46e5", color: "#ffffff", border: "none" }}
                    >
                      {triageLoading ? "Analyzing Symptoms..." : "Run AI Triage"}
                    </Button>
                  </div>
                  <Textarea
                    value={symptomsText || appointmentForm.symptoms}
                    onChange={(e) => {
                      setSymptomsText(e.target.value);
                      handleSymptomOrComplaintChange("symptoms", e.target.value);
                    }}
                    placeholder="Enter detailed patient symptoms for AI triage analysis..."
                    rows={2}
                  />
                  {triageResult && (
                    <div style={{ marginTop: "0.5rem", padding: "0.6rem 0.8rem", background: "#ecfdf5", borderRadius: "6px", border: "1px solid #a7f3d0", fontSize: "0.825rem", color: "#065f46" }}>
                      <strong>AI Triage Result:</strong> Urgency: <span style={{ fontWeight: 700 }}>{triageResult.urgency}</span> · {triageResult.reasoning}
                    </div>
                  )}
                </div>

                {/* Gender Matching Doctor Engine Card */}
                <div style={{ gridColumn: "1 / -1", background: "#faf5ff", padding: "1rem", borderRadius: "8px", border: "1px solid #e9d5ff" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, color: "#6b21a8", fontSize: "0.9rem" }}>
                      <FiZap style={{ color: "#9333ea" }} />
                      <span>Gender-Matched Doctor Recommendation</span>
                    </div>
                    {recommendedDoctor && (
                      <span style={{ fontSize: "0.75rem", background: "#f3e8ff", color: "#7e22ce", padding: "0.15rem 0.5rem", borderRadius: "999px", fontWeight: 600 }}>
                        {recommendedDoctor.gender_matches ? `Gender Matched (${recommendedDoctor.gender})` : "Specialty Matched"} · Workload: {recommendedDoctor.current_workload} waiting
                      </span>
                    )}
                  </div>

                  {recommendedDoctor ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", padding: "0.6rem 0.9rem", borderRadius: "6px", border: "1px solid #d8b4fe" }}>
                      <div>
                        <strong style={{ color: "#0f172a" }}>{recommendedDoctor.doctor_name}</strong>
                        <span style={{ marginLeft: "0.5rem", color: "#64748b", fontSize: "0.825rem" }}>
                          {recommendedDoctor.department} · {recommendedDoctor.gender} · ₹{recommendedDoctor.consultation_fee}
                        </span>
                        <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: 600, background: recommendedDoctor.is_available ? "#dcfce7" : "#fee2e2", color: recommendedDoctor.is_available ? "#166534" : "#991b1b" }}>
                          {recommendedDoctor.is_available ? "Available" : recommendedDoctor.status}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setAppointmentForm((prev) => ({
                            ...prev,
                            doctor_name: recommendedDoctor.doctor_name,
                            department: recommendedDoctor.department,
                            consultation_fee: String(recommendedDoctor.consultation_fee),
                          }));
                        }}
                      >
                        Use Recommended
                      </Button>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: "0.825rem", color: "#6b21a8" }}>
                      Select a department above or run AI Triage to view matched doctors.
                    </p>
                  )}
                </div>
              </>
            )}

            <Label>
              Department
              <Select
                value={appointmentForm.department}
                onChange={(event) => {
                  handleDepartmentChange(event.target.value);
                  if (appointmentForm.visit_type === "OP") {
                    const pGen = loadedPatient?.gender || appointmentForm.patient_gender || "Male";
                    void loadEligibleDoctors(event.target.value, pGen);
                  }
                }}
              >
                <option value="">Select department</option>
                {allDepartments.map((deptName) => (
                  <option key={deptName} value={deptName}>
                    {deptName}
                  </option>
                ))}
              </Select>
            </Label>
            <Label>
              Assigned Doctor
              <Input
                value={appointmentForm.doctor_name}
                onChange={(event) => handleDoctorChange(event.target.value)}
                list="registration-doctors"
                placeholder="Select or type doctor name"
              />
              <datalist id="registration-doctors">
                {eligibleDoctors.length > 0
                  ? eligibleDoctors.map((doc) => (
                      <option key={doc.id} value={doc.doctor_name}>
                        {doc.doctor_name} ({doc.department} - {doc.gender} - {doc.status})
                      </option>
                    ))
                  : doctorSuggestions.map((doctor) => (
                      <option key={doctor} value={doctor} />
                    ))}
              </datalist>
            </Label>
            <Label>
              Consultation Fee (₹)
              <Input
                type="number"
                min={0}
                value={appointmentForm.consultation_fee}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({
                    ...prev,
                    consultation_fee: event.target.value,
                  }))
                }
                placeholder="Consultation amount"
              />
            </Label>
            <Label>
              Payment Mode
              <Select
                value={appointmentForm.payment_mode}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({
                    ...prev,
                    payment_mode: event.target.value,
                  }))
                }
              >
                <option value="cash">Cash (OP Desk)</option>
                <option value="upi">UPI (Instant)</option>
                <option value="card">Card / POS</option>
                <option value="bank">Bank Transfer</option>
              </Select>
            </Label>
            <Label className="span-2">
              Registration Notes
              <Textarea
                value={appointmentForm.notes}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                rows={2}
                placeholder="Optional notes for OP encounter..."
              />
            </Label>
          </div>

          <div className="form-actions" style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem" }}>
            <Button
              variant="primary"
              type="button"
              onClick={() => void handleCreateAppointment()}
              disabled={savingAppointment}
              style={{ background: "#059669", padding: "0.6rem 1.25rem", fontSize: "0.9rem" }}
            >
              {savingAppointment ? "Generating Token..." : "🚀 Register OP Encounter & Issue Token"}
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => void handleCreateAppointmentWithRazorpay()}
              disabled={savingAppointment || !isRazorpayReady}
            >
              {savingAppointment
                ? "Processing..."
                : "Pay via Razorpay & Issue Token"}
            </Button>
          </div>
          {!isRazorpayReady ? (
            <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
              Razorpay payments are optional; cash & direct modes are active.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "appointment-in" || mode === "appointment-out" ? (
        <div className="panel registration-desk-panel">
          <h4>
            {mode === "appointment-in"
              ? "Appointment Queue (In)"
              : "Active Consultations"}
          </h4>
          {appointmentsLoading ? (
            <p className="muted">Loading queue...</p>
          ) : null}
          {!appointmentsLoading && queue.length === 0 ? (
            <div className="module-empty-state">
              <span className="module-empty-state-icon">
                <FiCalendar aria-hidden />
              </span>
              <p className="module-empty-state-title">
                No appointments found for today
              </p>
              <p className="module-empty-state-hint">
                {mode === "appointment-in"
                  ? "Schedule an appointment above to assign a token and send the patient to the queue."
                  : "Checked-in patients will appear here once they're ready to be marked out."}
              </p>
            </div>
          ) : null}
          {!appointmentsLoading && queue.length > 0 ? (
            <div className="queue-card-list">
              {queue.map((appointment) => (
                <AppointmentQueueCard
                  key={appointment.id}
                  appointment={appointment}
                  actions={
                    <>
                      {mode === "appointment-in" &&
                      appointment.status === "scheduled" ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            void updateAppointmentStatus(
                              appointment.id,
                              "checked_in",
                            )
                          }
                        >
                          Check In
                        </Button>
                      ) : null}
                      {mode === "appointment-in" &&
                      appointment.status === "checked_in" ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            void updateAppointmentStatus(
                              appointment.id,
                              "in_consultation",
                            )
                          }
                        >
                          Start Visit
                        </Button>
                      ) : null}
                      {mode === "appointment-out" &&
                      (appointment.status === "checked_in" ||
                        appointment.status === "in_consultation") ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void updateAppointmentStatus(
                              appointment.id,
                              "completed",
                            )
                          }
                        >
                          Complete
                        </Button>
                      ) : null}
                      {(mode === "appointment-in" ||
                        mode === "appointment-out") &&
                      appointment.status !== "completed" &&
                      appointment.status !== "cancelled" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void updateAppointmentStatus(
                              appointment.id,
                              "cancelled",
                            )
                          }
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </>
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "appointment-out" && (
        <div className="panel registration-desk-panel">
          <h4>Completed Consultations</h4>
          {appointmentOutCompletedQueue.length === 0 ? (
            <div className="module-empty-state">
              <span className="module-empty-state-icon">
                <FiCalendar aria-hidden />
              </span>
              <p className="module-empty-state-title">
                No completed consultations today
              </p>
            </div>
          ) : (
            <div className="queue-card-list">
              {appointmentOutCompletedQueue.map((appointment) => (
                <AppointmentQueueCard
                  key={appointment.id}
                  appointment={appointment}
                  actions={null}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Registered OP Success Modal */}
      {registeredOpModalData && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "1rem",
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: "16px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            maxWidth: "520px",
            width: "100%",
            padding: "2rem",
            textAlign: "center",
            border: "1px solid #e2e8f0",
            animation: "fadeIn 0.2s ease-out",
          }}>
            <div style={{
              width: "64px",
              height: "64px",
              background: "#dcfce7",
              color: "#166534",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
              margin: "0 auto 1rem",
            }}>
              ✓
            </div>
            <h3 style={{ margin: "0 0 0.5rem", color: "#0f172a", fontSize: "1.35rem" }}>
              OP Encounter Registered!
            </h3>
            <p style={{ margin: "0 0 1.5rem", color: "#64748b", fontSize: "0.9rem" }}>
              Patient has been successfully enrolled and token assigned to the OP queue.
            </p>

            <div style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "1.25rem",
              marginBottom: "1.5rem",
              textAlign: "left",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Permanent UMR</span>
                <p style={{ margin: "0.2rem 0 0", fontSize: "1.1rem", fontWeight: 800, color: "#0284c7" }}>
                  {registeredOpModalData.patient_id}
                </p>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>OP Token #</span>
                <p style={{ margin: "0.2rem 0 0", fontSize: "1.3rem", fontWeight: 900, color: "#16a34a" }}>
                  #{registeredOpModalData.token_no}
                </p>
              </div>
              <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #f1f5f9", paddingTop: "0.75rem" }}>
                <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Patient Name</span>
                <p style={{ margin: "0.2rem 0 0", fontSize: "1rem", fontWeight: 700, color: "#1e293b" }}>
                  {registeredOpModalData.patient_name}
                </p>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Doctor Assigned</span>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.9rem", fontWeight: 600, color: "#334155" }}>
                  {registeredOpModalData.doctor_name}
                </p>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Department & Fee</span>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.9rem", fontWeight: 600, color: "#334155" }}>
                  {registeredOpModalData.department} (₹{registeredOpModalData.consultation_fee})
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <Button
                variant="primary"
                type="button"
                onClick={() => {
                  setRegisteredOpModalData(null);
                  onNavigate?.("op-desk");
                }}
                style={{ width: "100%", background: "#0284c7", padding: "0.75rem", fontSize: "0.95rem" }}
              >
                🚀 Open OP Command Center
              </Button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setRegisteredOpModalData(null);
                    onNavigate?.("queue");
                  }}
                  style={{ padding: "0.6rem" }}
                >
                  🚶 Live Queue
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setRegisteredOpModalData(null)}
                  style={{ padding: "0.6rem" }}
                >
                  + New Registration
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
