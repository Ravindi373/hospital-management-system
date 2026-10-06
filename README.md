# Hospital Management System (HMS)

A web application for a hospital's front desk, doctors, laboratory, pharmacy, accounts and administration.
Built with **React (Vite)**, **Node.js / Express** and **MySQL**, with role-based access control and
security built in from the start.

---

## What each role can do

| Role | Main tasks |
|---|---|
| **Receptionist** | Register patients · Book, reschedule, check in and cancel appointments |
| **Doctor** | See own appointments · Check patient history · Enter diagnosis · Give prescriptions · Request lab tests |
| **Lab Staff** | Register test requests · Collect samples · Enter results (High/Low/Normal flag is automatic) |
| **Pharmacist** | Check prescriptions · Issue (dispense) medicine · Manage stock, batches and expiry |
| **Accountant** | Generate bills from unbilled services · Record payments and print receipts · Revenue report |
| **Admin** | Manage users and sign-up approvals · Manage doctors, schedules and staff · All reports · Audit log · Backups |

Doctor menu: **Dashboard · Patients · Appointments · Medical Records · Prescriptions** (+ Laboratory results).

The full permission list is in `backend/middleware/rbac.js` and on the **Users & roles** page.

### Reports
Patient · Appointment · Revenue · Pharmacy · Laboratory · Staff (each with a date range and "Copy as CSV").

### Flow
```
Username + Password → Login → Dashboard (shows only the modules for your role)

Register patient → Book appointment → Doctor consultation (diagnosis + prescription + lab request)
      → Lab: collect sample → enter result
      → Pharmacy: check prescription → dispense medicine (stock reduced)
      → Accounts: bill (consultation + lab + medicine) → payment → receipt
```

---

## Security features

| Requirement | How it is done |
|---|---|
| **Secure login** | Generic "incorrect username or password" message, equal timing for unknown users, 5 wrong passwords lock the account for 15 minutes, 20 sign-in attempts per 15 min per IP address |
| **Password hashing** | bcrypt with cost 12 (salted). Passwords are never stored or logged. Policy: 10+ characters, upper and lower case, a number, a symbol, must not contain the username |
| **First sign-in** | Every seeded or admin-created account has a temporary password and must choose a new one before doing anything else |
| **Role-based access** | Every API route declares the permission it needs and the server checks it on every request. Doctors only see their own appointments and prescriptions. Clinical history is doctors-only |
| **Session timeout** | Server-side sessions: random 256-bit token in an HttpOnly, SameSite=Strict cookie. Only its SHA-256 hash is stored. Ends after **15 minutes idle** or **8 hours** total. The page warns 60 seconds before. Changing a role, disabling an account or changing a password signs the user out everywhere |
| **Audit logs** | Sign-ins, failed attempts, lockouts, timeouts, every create/update, every view of a patient's medical history, allergy alerts, reports viewed, backups. Admin can search and filter them |
| **Database backups** | `mysqldump` in one consistent transaction, gzip-compressed, automatic every day at 02:00 (configurable), kept 30 days, plus "Back up now" for admins and `npm run backup` |
| Other | SQL injection protection (parameterised queries everywhere) · input validation with zod (unknown fields dropped) · CSRF protection (SameSite cookie + Origin check + required header) · security headers via Helmet (CSP, no framing, no-sniff) · `Cache-Control: no-store` on all patient data · totals for bills are calculated on the server, never trusted from the browser · a service can never be billed twice (database unique key) · stock and payments use row locks so two people can't dispense the same stock or overpay an invoice |

---

## Notifications

### Staff alerts (bell icon, top right)
The bell shows an unread count and checks for new alerts every 30 seconds. A short pop-up appears when something new arrives.
These checks do **not** count as activity, so the 15-minute idle sign-out still works with the page open.

| Who | Is told when |
|---|---|
| Doctor | A patient books, is rescheduled or cancels · a patient is checked in and waiting · a lab result is ready (abnormal results are marked) |
| Pharmacist | A new prescription arrives · a medicine falls to its reorder level · daily stock check at 07:30 (low, expired, expiring in 30 days) |
| Lab staff | A doctor requests tests (urgent requests are marked URGENT) |
| Accountant | Medicines were dispensed and the charges are ready to bill |
| Admin | New account requests · an account is locked after wrong passwords · a backup fails · an SMS could not be sent |

### Patient SMS
| Message | When |
|---|---|
| Appointment confirmed | Reception or the patient books |
| Appointment moved / cancelled | It is rescheduled or cancelled |
| Reminder | 18:00 the day before (`SMS_REMINDER_CRON`) |
| Lab report ready | All of the patient's open tests are finished (the result itself is never sent) |
| Private message | An admin types it in **Patient SMS → Send a private message**, to one patient or any mobile number (max 300 characters; the audit log records who sent it, not the text) |

- SMS never contain diagnoses, results or amounts.
- Patients can say no: tick box on the patient form (reception), or in **My details** in the patient portal.
- Messages are queued and sent in the background; failures are retried 3 times and can be re-sent from **Administration → Patient SMS**, which also has a test-send button and the full log.
- Out of the box `SMS_PROVIDER=log`: nothing is sent, messages go to `logs/sms-outbox.log`.

**To send real SMS with Notify.lk** (Sri Lanka): create an account at notify.lk, top up credit, then in `.env`:
```
SMS_PROVIDER=notifylk
NOTIFYLK_USER_ID=your user id
NOTIFYLK_API_KEY=your api key
NOTIFYLK_SENDER_ID=NotifyDEMO      # until Notify.lk approves your own sender name
HOSPITAL_PHONE=011 269 1111
```
Restart the backend, open **Patient SMS** and send a test to your own phone. Twilio is also supported (`SMS_PROVIDER=twilio`).

---

## Upgrading an existing database
If you already imported `schema.sql` + `seed.sql` from an earlier version, run the upgrade files **in order**
(phpMyAdmin → click `hospital_db` → Import), skipping any you have already run:

1. `database/migrations/001_patient_and_nurse_accounts.sql` – patient portal, nurse role, vital signs, account-request notifications
2. `database/migrations/002_staff_alerts_and_sms.sql` – staff alerts and patient SMS

Then copy the new SMS lines from `.env.example` into your `.env`, run `npm install` in `backend` and `frontend`, and restart both.

---

## Requirements

- **Node.js 18 or newer** (20 LTS recommended)
- **MySQL 8** or **MariaDB 10.6+** (XAMPP, WAMP or a standalone install all work)

---

## Setup

### 1. Create the database
```bash
mysql -u root -p < database/schema.sql
mysql -u root -p hospital_db < database/seed.sql
```
On XAMPP you can also open phpMyAdmin → Import, and import `schema.sql` then `seed.sql`.

### 2. Create a dedicated database account (do not run the app as root)
```sql
CREATE USER 'hms_app'@'localhost' IDENTIFIED BY 'choose-a-long-random-password';
GRANT SELECT, INSERT, UPDATE, DELETE, LOCK TABLES, SHOW VIEW, TRIGGER ON hospital_db.* TO 'hms_app'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Configure
Copy `.env.example` to `.env` (in the project root) and set at least `DB_USER` and `DB_PASSWORD`.
On Windows with XAMPP also set `MYSQLDUMP_PATH=C:\xampp\mysql\bin\mysqldump.exe` so backups work.

### 4. Install and run (development)
```bash
cd backend
npm install
npm run dev          # API on http://localhost:5000

# in a second terminal
cd frontend
npm install
npm run dev          # website on http://localhost:5173
```
Open **http://localhost:5173**.

### 5. Production
```bash
cd frontend && npm run build      # creates frontend/dist
cd ../backend && npm start        # serves the website and the API on http://localhost:5000
```
Put it behind HTTPS (for example Nginx with a certificate), then set `COOKIE_SECURE=true`,
`TRUST_PROXY=1` and `ALLOWED_ORIGINS=https://your-domain` in `.env`.

---

## Starter accounts

All have the temporary password **`ChangeMe@2026`** and must set their own password at first sign-in.

| Username | Role |
|---|---|
| `admin` | Administrator |
| `reception` | Receptionist |
| `dr.perera`, `dr.shalini` | Doctor |
| `lab` | Lab Staff |
| `pharmacy` | Pharmacist |
| `accounts` | Accountant |

New staff can also use **Sign up** on the sign-in page. Their account stays *pending* until an admin approves it
under **Users & roles** (and, for doctors, links it to the right doctor profile). Nobody can sign up as Admin.

---

## Backups and restore

- Automatic: every day at 02:00 into `/backups` (change `BACKUP_CRON`, `BACKUP_DIR`, `BACKUP_RETENTION_DAYS` in `.env`).
- Manual: **Backups → Back up now**, or `cd backend && npm run backup`.
- Restore:
  ```bash
  # stop the server first
  gunzip -c backups/hms-YYYYMMDD-HHMMSS-scheduled.sql.gz | mysql -u root -p hospital_db
  ```
  On Windows use 7-Zip to extract the `.sql` file, then `mysql -u root -p hospital_db < file.sql`.
- Copy the backups folder to another disk or encrypted cloud storage regularly, and test a restore monthly.

---

## Project structure

```
hospital-management-system/
├── frontend/                 React + Vite
│   └── src/
│       ├── components/       Layout (menu, back button), route guard, shared UI, patient search
│       ├── pages/            One file per screen (Login, Signup, Dashboard, Patients, Appointments, ...)
│       ├── services/         API client, sign-in state + idle timeout, formatting
│       └── App.jsx           Routes, each protected by a permission
├── backend/                  Node.js + Express
│   ├── controllers/          Request handling and business rules per module
│   ├── models/               SQL queries (parameterised) and transactions
│   ├── routes/               URL → permission → validation → controller
│   ├── middleware/           auth (sessions), rbac, validation, CSRF guard, errors
│   ├── services/             passwords, sessions, audit log, backups, reports, clinical checks
│   └── server.js
├── database/
│   ├── schema.sql            Tables, keys and constraints
│   └── seed.sql              Departments, starter accounts, doctors, tests, medicines, sample patients
├── README.md
└── .env.example              Copy to .env
```

## Main API endpoints

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login` · `POST /api/auth/register` · `POST /api/auth/logout` · `GET /api/auth/me` · `POST /api/auth/change-password` |
| Patients | `GET/POST /api/patients` · `GET/PATCH /api/patients/:id` · `GET /api/patients/:id/history` |
| Appointments | `GET/POST /api/appointments` · `GET /api/appointments/slots` · `PATCH /api/appointments/:id/status` · `PATCH /api/appointments/:id/reschedule` |
| Clinical | `GET/POST /api/records` · `GET /api/records/:id` · `GET /api/prescriptions` · `POST /api/prescriptions/:id/dispense` |
| Laboratory | `GET /api/lab/tests` · `GET/POST /api/lab/requests` · `POST /api/lab/requests/:id/collect` · `POST /api/lab/requests/:id/result` |
| Pharmacy | `GET/POST /api/medicines` · `POST /api/medicines/:id/restock` · `POST /api/medicines/:id/adjust` |
| Billing | `GET /api/billing/unbilled/:patientId` · `GET/POST /api/billing/invoices` · `POST /api/billing/invoices/:id/payments` |
| Admin | `GET/POST/PATCH /api/users` · `/api/doctors` · `/api/staff` · `GET /api/reports/:type` · `GET /api/audit` · `GET/POST /api/backups` |
