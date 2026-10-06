-- =====================================================================
-- Update an EXISTING hospital_db to version 1.2: patient SMS (+ more staff alerts, which need no table changes).
-- Run once AFTER 001_patient_and_nurse_accounts.sql:
--   phpMyAdmin: click hospital_db -> Import -> choose this file -> Import
-- Not needed if you create the database fresh from schema.sql + seed.sql.
-- =====================================================================
USE hospital_db;

-- Patients can say no to SMS. Existing patients default to "yes".
ALTER TABLE patients ADD COLUMN sms_consent TINYINT(1) NOT NULL DEFAULT 1 AFTER emergency_contact_phone;

CREATE TABLE IF NOT EXISTS sms_messages (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id     INT UNSIGNED NULL,
  appointment_id INT UNSIGNED NULL,
  phone          VARCHAR(20)  NOT NULL,
  message        VARCHAR(480) NOT NULL,
  type           VARCHAR(40)  NOT NULL,
  status         ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  provider       VARCHAR(20)  NULL,
  provider_ref   VARCHAR(120) NULL,
  error          VARCHAR(255) NULL,
  attempts       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at        DATETIME NULL,
  dedupe_key     VARCHAR(80) NULL UNIQUE,
  CONSTRAINT fk_sms_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  CONSTRAINT fk_sms_appt    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  CONSTRAINT fk_sms_user    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sms_status (status, id)
) ENGINE=InnoDB;

INSERT INTO audit_logs (username, role, action, details) VALUES ('system', '', 'MIGRATION', '002 staff alerts and patient SMS');
