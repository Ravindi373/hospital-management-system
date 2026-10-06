-- =====================================================================
-- Update an EXISTING hospital_db to version 1.1: patient and nurse accounts, vital signs,
-- account-request notifications.
-- Run once in phpMyAdmin (Import) or:  mysql -u root -p hospital_db < database/migrations/001_patient_and_nurse_accounts.sql
-- Not needed if you create the database fresh from schema.sql + seed.sql.
-- =====================================================================
USE hospital_db;

ALTER TABLE users
  MODIFY role ENUM('admin','receptionist','doctor','nurse','lab_staff','pharmacist','accountant','patient') NOT NULL,
  ADD COLUMN patient_id INT UNSIGNED NULL UNIQUE AFTER role,
  ADD COLUMN rejection_reason VARCHAR(255) NULL AFTER must_change_password,
  ADD COLUMN reviewed_at DATETIME NULL AFTER rejection_reason;
ALTER TABLE users ADD CONSTRAINT fk_users_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS vitals (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id     INT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED NULL,
  bp_systolic    SMALLINT UNSIGNED NULL,
  bp_diastolic   SMALLINT UNSIGNED NULL,
  pulse          SMALLINT UNSIGNED NULL,
  temperature    DECIMAL(4,1) NULL,
  spo2           TINYINT UNSIGNED NULL,
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

CREATE TABLE IF NOT EXISTS notifications (
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

-- Demo accounts (temporary password ChangeMe@2026, must be changed at first sign-in)
SET @pw = '$2a$12$Utj6zYuSNYTErlUfKuPQx.qB788yPvHWheR6.pZVXvvWibxJagHfW';
INSERT IGNORE INTO users (username, password_hash, full_name, email, phone, role, status, must_change_password)
  VALUES ('nurse', @pw, 'Anoma Silva', 'anoma@cgh.lk', '0711000009', 'nurse', 'active', 1);
UPDATE staff SET user_id = (SELECT id FROM users WHERE username = 'nurse')
  WHERE full_name = 'Anoma Silva' AND user_id IS NULL;
INSERT IGNORE INTO users (username, password_hash, full_name, email, phone, role, status, must_change_password, patient_id)
  SELECT 'kamal', @pw, 'Kamal Gunawardena', 'kamal.g@example.lk', '0771234567', 'patient', 'active', 1, id
    FROM patients WHERE mrn = 'MRN-000001';

INSERT INTO audit_logs (username, role, action, details) VALUES ('system', '', 'MIGRATION', '001 patient and nurse accounts');
