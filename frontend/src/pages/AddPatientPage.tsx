import { useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, KeyboardEvent, SetStateAction } from "react";
import {
  Alert,
  Button,
  Input,
  Label,
  Select,
  Textarea,
} from "../components/ui";
import { EMPTY_PATIENT_FORM } from "../lib/constants";
import { apiFetch, reportError } from "../lib/api";
import type { Notice, PatientForm, PatientMatchItem } from "../types";
import { FiCheckCircle, FiAlertCircle, FiUserCheck, FiArrowRight, FiUserPlus } from "react-icons/fi";

type Props = {
  onCreate: (
    payload: Record<string, unknown>,
    setForm: Dispatch<SetStateAction<PatientForm>>,
    setDuplicateInfo: Dispatch<SetStateAction<any>>,
    refreshPatientId: () => Promise<void>,
  ) => Promise<{ patient_id: string; admission_id?: string } | null>;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate: (page: string, extraData?: any) => void;
};

function calculateAgeFromDob(dob: string): string {
  if (!dob) return "";
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const birthdayPassed =
    monthDiff > 0 ||
    (monthDiff === 0 && today.getDate() >= birthDate.getDate());
  if (!birthdayPassed) {
    age -= 1;
  }
  if (age < 0) return "";
  return String(age);
}

export default function AddPatientPage({
  onCreate,
  setNotice,
  onNavigate,
  returnTo,
  mergeVisitId,
}: Props) {
  const registrationFormId = "patient-registration-form";
  const [form, setForm] = useState<PatientForm>(EMPTY_PATIENT_FORM);
  const [patientId, setPatientId] = useState("");
  const [duplicateInfo, setDuplicateInfo] = useState<any>(null);
  // Without this, a double-click (or a slow request the user re-tries by
  // clicking again) fires handleSubmit twice before the first POST /api/patients
  // resolves -- the duplicate-name check on the backend runs against the
  // pre-insert state for both requests, so it doesn't catch the second one,
  // and two patient records get created.
  const [submitting, setSubmitting] = useState(false);

  // Live match state
  const [matchingPatients, setMatchingPatients] = useState<PatientMatchItem[]>([]);
  const [checkingMatch, setCheckingMatch] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPatientId = async () => {
    try {
      const data = await apiFetch<{ patient_id?: string }>(
        "/api/patients/next-id",
      );
      setPatientId(data.patient_id || "");
    } catch {
      setPatientId("");
    }
  };

  useEffect(() => {
    refreshPatientId();
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem("ocr_demographics");
    if (!raw) return;
    sessionStorage.removeItem("ocr_demographics");
    try {
      const extracted = JSON.parse(raw) as {
        dob?: string;
        age?: string;
        notes?: string;
      };
      setForm((prev) => ({
        ...prev,
        dob: extracted.dob || prev.dob,
        age: extracted.age || prev.age,
        symptoms: extracted.notes
          ? [extracted.notes, prev.symptoms].filter(Boolean).join("\n\n")
          : prev.symptoms,
      }));
    } catch {
      // malformed sessionStorage payload — ignore
    }
  }, []);

  // Debounced search for New vs Existing Patient
  useEffect(() => {
    const query = `${form.name} ${form.last_name || ""} ${form.phone || ""}`.trim();
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    if (query.length < 2) {
      setMatchingPatients([]);
      setCheckingMatch(false);
      return;
    }

    setCheckingMatch(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch<{ matches: PatientMatchItem[]; is_match: boolean }>(
          `/api/op/patients/check-match?q=${encodeURIComponent(query)}`
        );
        setMatchingPatients(res.matches || []);
      } catch {
        setMatchingPatients([]);
      } finally {
        setCheckingMatch(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [form.name, form.last_name, form.phone]);

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const tagName = (event.target as HTMLElement).tagName;
    if (
      event.key === "Enter" &&
      tagName !== "TEXTAREA" &&
      tagName !== "BUTTON"
    ) {
      event.preventDefault();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (!form.phone || !/^\d{10}$/.test(form.phone.trim())) {
      setNotice({
        type: "warning",
        message: "Phone number must be exactly 10 digits.",
      });
      return;
    }

    if (form.aadhar_number && !/^\d{12}$/.test(form.aadhar_number.trim())) {
      setNotice({
        type: "warning",
        message: "Aadhar number must be exactly 12 digits.",
      });
      return;
    }

    if (
      form.emergency_contact &&
      !/^\d{10}$/.test(form.emergency_contact.trim())
    ) {
      setNotice({
        type: "warning",
        message: "Emergency contact must be exactly 10 digits.",
      });
      return;
    }

    const payload: Record<string, unknown> = {
      ...form,
    };
    setSubmitting(true);
    let createdPatient: { patient_id: string; admission_id?: string } | null;
    try {
      createdPatient = await onCreate(
        payload,
        setForm,
        setDuplicateInfo,
        refreshPatientId,
      );
    } finally {
      setSubmitting(false);
    }
    if (!createdPatient?.patient_id) return;

    if (returnTo === "er") {
      setNotice({
        type: "success",
        message: `Patient ${createdPatient.patient_id} registered. Starting their ER visit...`,
      });
      onNavigate("er", {
        newlyRegisteredPatient: {
          patient_id: createdPatient.patient_id,
          name: form.name,
          last_name: form.last_name,
        },
      });
      return;
    }

    if (returnTo === "er-merge" && mergeVisitId) {
      // The actual merge-unknown API call happens in ErPage (see
      // mergeTarget) -- this page's job ends at "patient exists, hand off
      // which visit it belongs to."
      onNavigate("er", {
        mergeIntoVisit: { visitId: mergeVisitId, patientId: createdPatient.patient_id },
      });
      return;
    }

    setNotice({
      type: "success",
      message: `Patient ${createdPatient.patient_id} registered. Redirecting to OP appointment booking...`,
    });

    onNavigate("appointment-in");
  };

  const handleChange =
    (field: keyof PatientForm) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      let value: string | boolean | number =
        field === "pregnant"
          ? (event.target as HTMLInputElement).checked
          : event.target.value;

      if (field === "phone") {
        value = (value as string).replace(/\D/g, "").slice(0, 10);
      }
      if (field === "emergency_contact") {
        value = (value as string).replace(/\D/g, "").slice(0, 10);
      }
      if (field === "aadhar_number") {
        value = (value as string).replace(/\D/g, "").slice(0, 12);
      }

      setForm((prev) => {
        if (field === "dob") {
          return {
            ...prev,
            dob: typeof value === "string" ? value : prev.dob,
            age:
              typeof value === "string" ? calculateAgeFromDob(value) : prev.age,
          };
        }
        return { ...prev, [field]: value };
      });
    };

  const handleClearForm = () => {
    setForm(EMPTY_PATIENT_FORM);
    setDuplicateInfo(null);
    setMatchingPatients([]);
    void refreshPatientId();
  };

  const handleSelectExisting = (patient: PatientMatchItem) => {
    setNotice({
      type: "success",
      message: `Selected existing patient ${patient.full_name} (${patient.patient_id}). Opening OP appointment booking...`,
    });
    onNavigate("appointment-in", {
      patient_id: patient.patient_id,
      patient_name: patient.full_name,
    });
  };

  const hasEnteredDetails = form.name.trim().length > 1;

  return (
    <section className="form-layout" style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <div className="panel" style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "1.5rem" }}>
        
        {/* Real-time New vs Existing Patient Status Banner */}
        <div style={{ marginBottom: "1.25rem" }}>
          {hasEnteredDetails && matchingPatients.length > 0 ? (
            <div style={{
              background: "#ecfdf5",
              border: "1px solid #6ee7b7",
              borderRadius: "10px",
              padding: "1rem",
              marginBottom: "1rem"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#065f46", fontWeight: 700 }}>
                  <FiUserCheck style={{ fontSize: "1.2rem", color: "#059669" }} />
                  <span>Existing Patient Match Found ({matchingPatients.length} matching)</span>
                </div>
                <span style={{ fontSize: "0.75rem", background: "#d1fae5", color: "#065f46", padding: "0.2rem 0.6rem", borderRadius: "999px", fontWeight: 600 }}>
                  Preserve UMR Rule
                </span>
              </div>
              <p style={{ fontSize: "0.825rem", color: "#047857", marginBottom: "0.75rem" }}>
                This patient may already have an active UMR. To avoid creating duplicate records, select their existing profile below to generate a new OP token under their original UMR:
              </p>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {matchingPatients.map((m) => (
                  <div key={m.patient_id} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#ffffff",
                    padding: "0.6rem 0.9rem",
                    borderRadius: "8px",
                    border: "1px solid #a7f3d0"
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>{m.full_name}</span>
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", background: "#f1f5f9", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600, color: "#334155" }}>
                        UMR: {m.patient_id}
                      </span>
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#64748b" }}>
                        Phone: {m.phone || "N/A"} · {m.gender} · {m.age ? `${m.age} yrs` : ""} · {m.total_op_visits || 0} prev OP visits
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem", background: "#059669" }}
                      onClick={() => handleSelectExisting(m)}
                    >
                      Select & Book OP <FiArrowRight style={{ marginLeft: "4px" }} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : hasEnteredDetails && !checkingMatch ? (
            <div style={{
              background: "#eff6ff",
              border: "1px solid #93c5fd",
              borderRadius: "10px",
              padding: "0.75rem 1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#1e40af" }}>
                <FiUserPlus style={{ fontSize: "1.1rem", color: "#2563eb" }} />
                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  New Patient Confirmed — Unique UMR ({patientId || "PAT-XXXXXX"}) will be generated on registration
                </span>
              </div>
              <span style={{ fontSize: "0.75rem", background: "#dbeafe", color: "#1e40af", padding: "0.2rem 0.6rem", borderRadius: "999px", fontWeight: 600 }}>
                1 Patient = 1 UMR
              </span>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.75rem" }}>
          <div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>Patient Registration Desk</h2>
            <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "2px 0 0" }}>Register new patient profile and automatically initialize medical record</p>
          </div>
          <span style={{ fontSize: "0.825rem", color: "#475569", fontWeight: 600, background: "#f8fafc", padding: "0.3rem 0.75rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            Assigned UMR: <strong style={{ color: "#0f172a" }}>{patientId || "Generated on Save"}</strong>
          </span>
        </div>

        {duplicateInfo && (
          <Alert variant="warning">
            Possible duplicate found: {duplicateInfo.name}{" "}
            {duplicateInfo.last_name} (UMR: {duplicateInfo.patient_id})
          </Alert>
        )}

        <form
          id={registrationFormId}
          className="grid-form patient-grid-form"
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
        >
          <Label>
            First Name
            <Input value={form.name} onChange={handleChange("name")} placeholder="e.g. Ravi" required />
          </Label>
          <Label>
            Middle Name
            <Input
              value={form.middle_name}
              onChange={handleChange("middle_name")}
              placeholder="e.g. Kumar"
            />
          </Label>
          <Label>
            Last Name
            <Input
              value={form.last_name}
              onChange={handleChange("last_name")}
              placeholder="e.g. Sharma"
              required
            />
          </Label>
          <Label>
            Date of Birth
            <Input
              type="date"
              value={form.dob}
              onChange={handleChange("dob")}
            />
          </Label>
          <Label>
            Age
            <Input
              type="number"
              value={form.age}
              onChange={handleChange("age")}
              placeholder="Age in years"
            />
          </Label>
          <Label>
            Phone Number (10 Digits)
            <Input
              type="tel"
              value={form.phone}
              onChange={handleChange("phone")}
              maxLength={10}
              pattern="\d{10}"
              placeholder="9876543210"
              required
            />
          </Label>
          <Label>
            Weight (kg)
            <Input
              type="number"
              value={form.weight}
              onChange={handleChange("weight")}
              placeholder="e.g. 68"
            />
          </Label>
          <Label>
            Height (cm)
            <Input
              type="number"
              value={form.height}
              onChange={handleChange("height")}
              placeholder="e.g. 172"
            />
          </Label>
          <Label>
            Gender
            <Select value={form.gender} onChange={handleChange("gender")}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </Select>
          </Label>
          <Label>
            Blood Group
            <Select
              value={form.blood_group}
              onChange={handleChange("blood_group")}
            >
              <option value="">Select Blood Group</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </Select>
          </Label>
          <Label>
            Emergency Contact
            <Input
              type="tel"
              value={form.emergency_contact}
              onChange={handleChange("emergency_contact")}
              maxLength={10}
              pattern="\d{10}"
              placeholder="10-digit number"
            />
          </Label>
          <Label>
            Aadhar / National ID (12 Digits)
            <Input
              type="text"
              value={form.aadhar_number}
              onChange={handleChange("aadhar_number")}
              maxLength={12}
              pattern="\d{12}"
              placeholder="12-digit number"
            />
          </Label>
          <Label style={{ gridColumn: "1 / -1" }}>
            Full Address
            <Textarea value={form.address} onChange={handleChange("address")} placeholder="Street, Area, City, Pincode" rows={2} />
          </Label>
        </form>

        <div className="form-actions patient-form-actions patient-actions-bottom" style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
          <Button variant="primary" type="submit" form={registrationFormId}>
            Register & Proceed to OP Booking
          </Button>
          <Button variant="secondary" type="button" onClick={handleClearForm}>
            Clear Form
          </Button>
        </div>
      </div>
    </section>
  );
}
