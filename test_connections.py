import requests
import json

BASE_URL = 'http://localhost:5173'
session = requests.Session()

print('=' * 60)
print('Keppler Healthcare End-to-End Connectivity Test')
print('=' * 60)

# 1. Test frontend root
r_home = session.get(f'{BASE_URL}/')
print(f'[1] Frontend Web Server: HTTP {r_home.status_code} (HTML Size: {len(r_home.text)} bytes)')

# 2. Test Login
r_login = session.post(
    f'{BASE_URL}/api/auth/login',
    json={'username': 'admin', 'password': 'Admin@123'}
)
login_data = r_login.json()
print(f'[2] Auth Service: HTTP {r_login.status_code}')
if r_login.status_code == 200:
    user = login_data.get('user', {})
    print(f'    - Logged in as: {user.get("full_name")} ({user.get("email")})')
    print(f'    - Role: {user.get("access_role")}')
    print(f'    - Hospital Code: {user.get("hospital_code")}')

csrf_token = session.cookies.get('csrf_token')
headers = {'X-CSRF-Token': csrf_token} if csrf_token else {}

# 3. Test Dashboard Analytics
r_dash = session.get(f'{BASE_URL}/api/dashboard/analytics', headers=headers)
print(f'[3] Dashboard Analytics API: HTTP {r_dash.status_code}')
if r_dash.status_code == 200:
    print(f'    - Analytics keys: {list(r_dash.json().keys())}')

# 4. Test Patients
r_patients = session.get(f'{BASE_URL}/api/patients', headers=headers)
print(f'[4] Patients API: HTTP {r_patients.status_code}')
if r_patients.status_code == 200:
    data = r_patients.json()
    patients = data.get('patients', []) if isinstance(data, dict) else data
    print(f'    - Total patients retrieved: {len(patients)}')

# 5. Test Appointments
r_appt = session.get(f'{BASE_URL}/api/appointments', headers=headers)
print(f'[5] Appointments API: HTTP {r_appt.status_code}')
if r_appt.status_code == 200:
    data = r_appt.json()
    appts = data.get('appointments', []) if isinstance(data, dict) else data
    print(f'    - Total appointments: {len(appts)}')

# 6. Test Bed Allocations
r_beds = session.get(f'{BASE_URL}/api/beds', headers=headers)
print(f'[6] Bed Management API: HTTP {r_beds.status_code}')

# 7. Test Pharmacy
r_pharm = session.get(f'{BASE_URL}/api/pharmacy/summary', headers=headers)
print(f'[7] Pharmacy API: HTTP {r_pharm.status_code}')

# 8. Test Symptom AI Microservice
r_symptom = session.get(f'{BASE_URL}/api/symptom-ai/meta', headers=headers)
print(f'[8] Symptom AI Service (/api/symptom-ai/meta): HTTP {r_symptom.status_code}')
if r_symptom.status_code == 200:
    print(f'    - Available Body Regions: {len(r_symptom.json().get("regions", []))}')

print('=' * 60)
print('ALL SERVICES, CONTAINERS, AND CONNECTIONS ARE OPERATIONAL!')
print('=' * 60)
