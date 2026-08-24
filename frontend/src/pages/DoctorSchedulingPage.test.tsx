import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import DoctorSchedulingPage from "./DoctorSchedulingPage";

function jsonResponse(payload: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("DoctorSchedulingPage OP workflow", () => {
  test("renders the queue and registers a new OP visit", async () => {
    const requests: Array<{ url: string; options?: RequestInit }> = [];
    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      requests.push({ url: String(url), options });
      if (String(url).includes("/api/op/summary")) {
        return jsonResponse({ total_appointments: 1, active_queue: 1 });
      }
      if (String(url).includes("/api/registration/departments")) {
        return jsonResponse({ departments: [] });
      }
      if (String(url).includes("/api/op/doctors")) {
        return jsonResponse({ doctors: [] });
      }
      if (String(url).includes("/api/queue")) {
        return jsonResponse({
          queue: [{ id: 7, patient_id: "PAT-100001", patient_name: "Existing Patient", token_no: 4, status: "scheduled" }],
        });
      }
      if (String(url).includes("/api/op/visits") && options?.method === "POST") {
        return jsonResponse({ patient_id: "PAT-100002", op_number: 5 });
      }
      return jsonResponse({});
    }) as any;

    const setNotice = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<DoctorSchedulingPage setNotice={setNotice} canEdit={true} />);
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("Today's OP Queue");
    expect(container.textContent).toContain("Existing Patient");

    const input = (placeholder: string) =>
      container.querySelector(`input[placeholder="${placeholder}"]`) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input("First name"), { target: { value: "New" } });
      fireEvent.change(input("Last name"), { target: { value: "Patient" } });
      fireEvent.change(input("Chief complaint"), { target: { value: "Fever" } });
      const registerButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Register OP Visit"));
      fireEvent.click(registerButton as HTMLButtonElement);
      await flush();
    });

    const registration = requests.find((request) => request.url.includes("/api/op/visits"));
    expect(registration).toBeTruthy();
    expect(JSON.parse(String(registration?.options?.body))).toMatchObject({
      patient: { name: "New", last_name: "Patient" },
      appointment: { chief_complaint: "Fever" },
    });

    act(() => root.unmount());
    container.remove();
  });
});
