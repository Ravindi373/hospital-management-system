-- =====================================================================
-- Hospital Management System - MySQL schema
-- MySQL 8.0+ (or MariaDB 10.6+). Run:  mysql -u root -p < database/schema.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS hospital_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hospital_db;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS sms_messages, notifications, vitals, audit_logs, payments, invoice_items, invoices, lab_requests, lab_tests,
  stock_movements, prescription_items, prescriptions, medicines, medical_records, appointments,
  patients, doctor_schedules, doctors, staff, departments, sessions, users;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Users, roles and sessions
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username             VARCHAR(50)  NOT NULL UNIQUE,
  password_hash        VARCHAR(100) NOT NULL,              -- bcrypt hash, never the password
  full_name            VARCHAR(120) NOT NULL,
  email                VARCHAR(150) NULL UNIQUE,
  phone                VARCHAR(20)  NULL,
  role                 ENUM('admin','receptionist','doctor','nurse','lab_staff','pharmacist','accountant','patient') NOT NULL,
  patient_id           INT UNSIGNED NULL UNIQUE,              -- for role 'patient': their own hospital record
  status               ENUM('pending','active','disabled') NOT NULL DEFAULT 'pending',
  must_change_password TINYINT(1)   NOT NULL DEFAULT 0,
  rejection_reason     VARCHAR(255) NULL,                     -- shown to a declined applicant
  reviewed_at          DATETIME     NULL,                     -- when an admin approved or declined the request
  failed_attempts      INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until         DATETIME     NULL,
  last_login_at        DATETIME     NULL,
  password_changed_at  DATETIME     NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_status (status)
) ENGINE=InnoDB;

-- Server-side sessions. Only a SHA-256 hash of the session token is stored,
-- so a database leak cannot be used to hijack live sessions.
CREATE TABLE sessions (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NOT NULL,
  token_hash       CHAR(64)     NOT NULL UNIQUE,
  ip_address       VARCHAR(45)  NULL,
  user_agent       VARCHAR(255) NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME     NOT NULL,                  -- absolute lifetime
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Departments, doctors and staff
-- ---------------------------------------------------------------------
CREATE TABLE departments (
  id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE doctors (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NULL UNIQUE,              -- login account linked to this doctor
  full_name        VARCHAR(120) NOT NULL,
  specialization   VARCHAR(120) NOT NULL,
  department_id    INT UNSIGNED NULL,
  license_no       VARCHAR(40)  NULL UNIQUE,              -- SLMC registration number
  phone            VARCHAR(20)  NULL,
  email            VARCHAR(150) NULL,
  consultation_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_doctors_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE doctor_schedules (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doctor_id   INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,                  -- 0 = Sunday ... 6 = Saturday
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  CONSTRAINT fk_sched_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  UNIQUE KEY uq_sched (doctor_id, day_of_week),
  CHECK (day_of_week BETWEEN 0 AND 6),
  CHECK (end_time > start_time)
) ENGINE=InnoDB;

CREATE TABLE staff (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NULL UNIQUE,
  full_name     VARCHAR(120) NOT NULL,
  designation   VARCHAR(100) NOT NULL,
  department_id INT UNSIGNED NULL,
  phone         VARCHAR(20)  NULL,
  email         VARCHAR(150) NULL,
  hire_date     DATE         NULL,
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_staff_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Patients and appointments
-- ---------------------------------------------------------------------
CREATE TABLE patients (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mrn                     VARCHAR(20)  NOT NULL UNIQUE,   -- medical record number, e.g. MRN-000001
  first_name              VARCHAR(60)  NOT NULL,
  last_name               VARCHAR(60)  NOT NULL,
  gender                  ENUM('male','female','other') NOT NULL,
  date_of_birth           DATE         NOT NULL,
  nic                     VARCHAR(20)  NULL UNIQUE,
  blood_group             ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NULL,
  phone                   VARCHAR(20)  NOT NULL,
  email                   VARCHAR(150) NULL,
  address                 VARCHAR(255) NULL,
  allergies               VARCHAR(255) NULL,
  emergency_contact_name  VARCHAR(120) NULL,
  emergency_contact_phone VARCHAR(20)  NULL,
  sms_consent             TINYINT(1)   NOT NULL DEFAULT 1,      -- patient agreed to appointment SMS
  created_by              INT UNSIGNED NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_patients_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_patients_name (last_name, first_name),
  INDEX idx_patients_phone (phone)
) ENGINE=InnoDB;

CREATE TABLE appointments (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id       INT UNSIGNED NOT NULL,
  doctor_id        INT UNSIGNED NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  reason           VARCHAR(255) NULL,
  status           ENUM('scheduled','checked_in','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
  created_by       INT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_appt_doctor  FOREIGN KEY (doctor_id)  REFERENCES doctors(id),
  CONSTRAINT fk_appt_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_appt_doctor_slot (doctor_id, appointment_date, appointment_time),
  INDEX idx_appt_date (appointment_date)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Clinical: medical records and prescriptions
-- ---------------------------------------------------------------------
CREATE TABLE medical_records (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id     INT UNSIGNED NOT NULL,
  doctor_id      INT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED NULL UNIQUE,
  visit_date     DATE NOT NULL,
  complaint      VARCHAR(255) NULL,
  diagnosis      VARCHAR(255) NOT NULL,
  icd10_code     VARCHAR(10)  NULL,
  clinical_notes TEXT NULL,
  treatment_plan TEXT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rec_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_rec_doctor  FOREIGN KEY (doctor_id)  REFERENCES doctors(id),
  CONSTRAINT fk_rec_appt    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  INDEX idx_rec_patient (patient_id, visit_date)
) ENGINE=InnoDB;

CREATE TABLE medicines (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(120) NOT NULL,
  generic_name   VARCHAR(120) NULL,
  form           ENUM('tablet','capsule','syrup','injection','inhaler','sachet','cream','drops') NOT NULL,
  strength       VARCHAR(40)  NULL,
  unit_price     DECIMAL(10,2) NOT NULL,
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  reorder_level  INT UNSIGNED NOT NULL DEFAULT 0,
  batch_no       VARCHAR(40)  NULL,
  expiry_date    DATE NULL,
  supplier       VARCHAR(120) NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_medicine (name, strength, form),
  CHECK (unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE prescriptions (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  record_id    INT UNSIGNED NOT NULL UNIQUE,
  patient_id   INT UNSIGNED NOT NULL,
  doctor_id    INT UNSIGNED NOT NULL,
  status       ENUM('pending','dispensed','cancelled') NOT NULL DEFAULT 'pending',
  dispensed_by INT UNSIGNED NULL,
  dispensed_at DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rx_record  FOREIGN KEY (record_id)  REFERENCES medical_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_rx_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_rx_doctor  FOREIGN KEY (doctor_id)  REFERENCES doctors(id),
  CONSTRAINT fk_rx_disp    FOREIGN KEY (dispensed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_rx_status (status)
) ENGINE=InnoDB;

CREATE TABLE prescription_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prescription_id INT UNSIGNED NOT NULL,
  medicine_id     INT UNSIGNED NOT NULL,
  dosage          VARCHAR(40) NOT NULL,                   -- e.g. "1 tablet"
  frequency       ENUM('OD','BD','TDS','QDS','NOCTE','PRN','STAT') NOT NULL,
  duration_days   SMALLINT UNSIGNED NOT NULL,
  quantity        INT UNSIGNED NOT NULL,
  instructions    VARCHAR(255) NULL,
  CONSTRAINT fk_rxi_rx  FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_rxi_med FOREIGN KEY (medicine_id) REFERENCES medicines(id),
  CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE stock_movements (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medicine_id INT UNSIGNED NOT NULL,
  change_qty  INT NOT NULL,                               -- + received, - issued/discarded
  reason      ENUM('opening','restock','dispense','adjustment','expired') NOT NULL,
  reference   VARCHAR(80) NULL,
  user_id     INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sm_med  FOREIGN KEY (medicine_id) REFERENCES medicines(id),
  CONSTRAINT fk_sm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sm_med (medicine_id, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Laboratory
-- ---------------------------------------------------------------------
CREATE TABLE lab_tests (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120) NOT NULL UNIQUE,
  reference_range VARCHAR(60)  NOT NULL,                  -- "70-100" or "Negative"
  unit            VARCHAR(30)  NULL,
  price           DECIMAL(10,2) NOT NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE lab_requests (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id        INT UNSIGNED NOT NULL,
  doctor_id         INT UNSIGNED NULL,
  test_id           INT UNSIGNED NOT NULL,
  priority          ENUM('routine','urgent') NOT NULL DEFAULT 'routine',
  status            ENUM('requested','sample_collected','completed','cancelled') NOT NULL DEFAULT 'requested',
  sample_id         VARCHAR(30) NULL UNIQUE,
  result_value      VARCHAR(60) NULL,
  result_flag       ENUM('L','N','H','A') NULL,           -- low, normal, high, abnormal
  remarks           VARCHAR(255) NULL,
  requested_by      INT UNSIGNED NULL,
  result_entered_by INT UNSIGNED NULL,
  requested_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  collected_at      DATETIME NULL,
  completed_at      DATETIME NULL,
  CONSTRAINT fk_lr_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_lr_doctor  FOREIGN KEY (doctor_id)  REFERENCES doctors(id) ON DELETE SET NULL,
  CONSTRAINT fk_lr_test    FOREIGN KEY (test_id)    REFERENCES lab_tests(id),
  CONSTRAINT fk_lr_req     FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_lr_res     FOREIGN KEY (result_entered_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_lr_status (status, priority)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Billing and payments
-- ---------------------------------------------------------------------
CREATE TABLE invoices (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_no  VARCHAR(20) NOT NULL UNIQUE,
  patient_id  INT UNSIGNED NOT NULL,
  subtotal    DECIMAL(12,2) NOT NULL,
  discount    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total       DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status      ENUM('unpaid','partially_paid','paid','void') NOT NULL DEFAULT 'unpaid',
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_inv_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (discount >= 0 AND total >= 0 AND amount_paid >= 0),
  INDEX idx_inv_status (status),
  INDEX idx_inv_date (created_at)
) ENGINE=InnoDB;

-- (item_type, reference_id) is unique, so the same consultation, lab test or
-- prescription can never be billed twice.
CREATE TABLE invoice_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id   INT UNSIGNED NOT NULL,
  item_type    ENUM('consultation','lab','pharmacy','other') NOT NULL,
  reference_id INT UNSIGNED NULL,
  description  VARCHAR(255) NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  UNIQUE KEY uq_billed_once (item_type, reference_id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receipt_no  VARCHAR(20) NOT NULL UNIQUE,
  invoice_id  INT UNSIGNED NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  method      ENUM('cash','card','bank_transfer','insurance') NOT NULL,
  reference   VARCHAR(80) NULL,
  received_by INT UNSIGNED NULL,
  paid_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT fk_pay_user    FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (amount > 0),
  INDEX idx_pay_date (paid_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Vital signs (recorded by nurses, read by doctors)
-- ---------------------------------------------------------------------
CREATE TABLE vitals (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id     INT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED NULL,
  bp_systolic    SMALLINT UNSIGNED NULL,
  bp_diastolic   SMALLINT UNSIGNED NULL,
  pulse          SMALLINT UNSIGNED NULL,                  -- beats per minute
  temperature    DECIMAL(4,1) NULL,                       -- degrees Celsius
  spo2           TINYINT UNSIGNED NULL,                   -- oxygen saturation %
  weight_kg      DECIMAL(5,1) NULL,
  height_cm      DECIMAL(5,1) NULL,
  notes          VARCHAR(255) NULL,
  recorded_by    INT UNSIGNED NULL,
  recorded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vitals_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_vitals_appt    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  CONSTRAINT fk_vitals_user    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_vitals_patient (patient_id, recorded_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- In-app notifications (bell icon)
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  type       VARCHAR(40)  NOT NULL,                       -- e.g. ACCOUNT_REQUEST, ACCOUNT_APPROVED
  title      VARCHAR(150) NOT NULL,
  body       VARCHAR(500) NULL,
  link       VARCHAR(200) NULL,                           -- page to open in the app, e.g. /users
  is_read    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, is_read, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Patient SMS (queue + log). Messages never contain diagnoses or results.
-- ---------------------------------------------------------------------
CREATE TABLE sms_messages (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id     INT UNSIGNED NULL,
  appointment_id INT UNSIGNED NULL,
  phone          VARCHAR(20)  NOT NULL,                   -- 9471XXXXXXX
  message        VARCHAR(480) NOT NULL,
  type           VARCHAR(40)  NOT NULL,                   -- APPT_BOOKED, APPT_REMINDER, LAB_READY, ...
  status         ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  provider       VARCHAR(20)  NULL,
  provider_ref   VARCHAR(120) NULL,
  error          VARCHAR(255) NULL,
  attempts       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at        DATETIME NULL,
  dedupe_key     VARCHAR(80) NULL UNIQUE,                 -- stops the same reminder going out twice
  CONSTRAINT fk_sms_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  CONSTRAINT fk_sms_appt    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  CONSTRAINT fk_sms_user    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sms_status (status, id)
) ENGINE=InnoDB;

-- A patient's online account points at their hospital record.
ALTER TABLE users ADD CONSTRAINT fk_users_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Audit log (append-only from the application's point of view)
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NULL,
  username    VARCHAR(50)  NULL,
  role        VARCHAR(20)  NULL,
  action      VARCHAR(60)  NOT NULL,                      -- e.g. LOGIN_SUCCESS, PATIENT_CREATE
  entity      VARCHAR(40)  NULL,
  entity_id   VARCHAR(40)  NULL,
  details     TEXT         NULL,
  ip_address  VARCHAR(45)  NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_user (user_id, created_at),
  INDEX idx_audit_action (action)
) ENGINE=InnoDB;
