-- =====================================================================
-- Hospital Management System - starter data
-- Run AFTER schema.sql:  mysql -u root -p hospital_db < database/seed.sql
--
-- Every seeded account (staff and the demo patient 'kamal') has the temporary password  ChangeMe@2026
-- and is forced to choose a new password at first sign-in.
-- =====================================================================
USE hospital_db;

INSERT INTO departments (id, name) VALUES
 (1,'General Medicine'),(2,'Cardiology'),(3,'Paediatrics'),(4,'Orthopaedics'),
 (5,'Laboratory'),(6,'Pharmacy'),(7,'Front Office'),(8,'Accounts'),(9,'Administration'),(10,'Nursing');

-- bcrypt (cost 12) hash of "ChangeMe@2026"
SET @pw = '$2a$12$Utj6zYuSNYTErlUfKuPQx.qB788yPvHWheR6.pZVXvvWibxJagHfW';

INSERT INTO users (id, username, password_hash, full_name, email, phone, role, status, must_change_password) VALUES
 (1,'admin',      @pw,'Sanjeewa Kumara',           'admin@cgh.lk',     '0711000001','admin',       'active',1),
 (2,'reception',  @pw,'Pradeep Weerasinghe',       'reception@cgh.lk', '0711000002','receptionist','active',1),
 (3,'dr.perera',  @pw,'Dr. Nimal Perera',          'nimal@cgh.lk',     '0711000003','doctor',      'active',1),
 (4,'dr.shalini', @pw,'Dr. Shalini Wickramasinghe','shalini@cgh.lk',   '0711000004','doctor',      'active',1),
 (5,'lab',        @pw,'Ishara Madushani',          'lab@cgh.lk',       '0711000005','lab_staff',   'active',1),
 (6,'pharmacy',   @pw,'Lahiru Samarasinghe',       'pharmacy@cgh.lk',  '0711000006','pharmacist',  'active',1),
 (7,'accounts',   @pw,'Gayani Peiris',             'accounts@cgh.lk',  '0711000007','accountant',  'active',1),
 (8,'nurse',      @pw,'Anoma Silva',               'anoma@cgh.lk',     '0711000009','nurse',       'active',1),
 (9,'kamal',      @pw,'Kamal Gunawardena',         'kamal.g@example.lk','0771234567','patient',    'active',1);

INSERT INTO doctors (id, user_id, full_name, specialization, department_id, license_no, phone, email, consultation_fee) VALUES
 (1,3,   'Dr. Nimal Perera',          'Consultant Cardiologist',  2,'SLMC 18200','0711000003','nimal@cgh.lk',  3500.00),
 (2,4,   'Dr. Shalini Wickramasinghe','Consultant Physician',     1,'SLMC 19133','0711000004','shalini@cgh.lk',2000.00),
 (3,NULL,'Dr. Ayesha Fernando',       'Consultant Paediatrician', 3,'SLMC 18511','0711000008','ayesha@cgh.lk', 2500.00);

-- Every weekday morning for the physician; set days for the specialists.
INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time) VALUES
 (1,1,'08:00','12:00'),(1,3,'14:00','17:00'),(1,5,'08:00','12:00'),
 (2,0,'08:00','12:00'),(2,1,'08:00','12:00'),(2,2,'08:00','12:00'),(2,3,'08:00','12:00'),(2,4,'08:00','12:00'),(2,5,'08:00','12:00'),(2,6,'08:00','12:00'),
 (3,2,'08:00','12:00'),(3,4,'08:00','12:00'),(3,6,'09:00','12:00');

INSERT INTO staff (user_id, full_name, designation, department_id, phone, email, hire_date) VALUES
 (1,'Sanjeewa Kumara',     'Hospital Administrator',          9,'0711000001','admin@cgh.lk',    '2021-02-01'),
 (2,'Pradeep Weerasinghe', 'Receptionist',                    7,'0711000002','reception@cgh.lk','2023-05-15'),
 (5,'Ishara Madushani',    'Medical Laboratory Technologist', 5,'0711000005','lab@cgh.lk',      '2022-08-01'),
 (6,'Lahiru Samarasinghe', 'Pharmacist',                      6,'0711000006','pharmacy@cgh.lk', '2022-01-10'),
 (7,'Gayani Peiris',       'Accountant',                      8,'0711000007','accounts@cgh.lk', '2020-11-02'),
 (8,'Anoma Silva',         'Nursing Officer',                10,'0711000009','anoma@cgh.lk',    '2019-04-20');

INSERT INTO lab_tests (name, reference_range, unit, price) VALUES
 ('Full blood count - platelets','150-450','x10^3/uL',1200.00),
 ('Fasting blood sugar',         '70-100', 'mg/dL',    450.00),
 ('HbA1c',                       '4.0-5.6','%',       2200.00),
 ('Total cholesterol',           '0-200',  'mg/dL',   2400.00),
 ('Serum creatinine',            '0.6-1.2','mg/dL',    800.00),
 ('TSH',                         '0.4-4.0','mIU/L',   1800.00),
 ('Dengue NS1 antigen',          'Negative',NULL,     2800.00),
 ('Urine full report',           'Normal', NULL,       500.00);

INSERT INTO medicines (name, generic_name, form, strength, unit_price, stock_quantity, reorder_level, batch_no, expiry_date, supplier) VALUES
 ('Paracetamol','Paracetamol','tablet','500 mg',   8.00,2400,500,'PCM-2408',DATE_ADD(CURDATE(),INTERVAL 420 DAY),'State Pharmaceuticals Corp.'),
 ('Amlodipine', 'Amlodipine', 'tablet','5 mg',    14.00, 900,200,'AML-2402',DATE_ADD(CURDATE(),INTERVAL 300 DAY),'Hemas Pharma'),
 ('Metformin',  'Metformin',  'tablet','500 mg',  10.00,1500,300,'MET-2411',DATE_ADD(CURDATE(),INTERVAL 500 DAY),'State Pharmaceuticals Corp.'),
 ('Atorvastatin','Atorvastatin','tablet','20 mg', 32.00, 160,200,'ATV-2403',DATE_ADD(CURDATE(),INTERVAL 200 DAY),'Navesta Pharma'),
 ('Amoxicillin','Amoxicillin','capsule','500 mg', 22.00, 640,200,'AMX-2312',DATE_SUB(CURDATE(),INTERVAL 12 DAY),'Hemas Pharma'),
 ('Salbutamol inhaler','Salbutamol','inhaler','100 mcg',780.00,24,10,'SAL-2405',DATE_ADD(CURDATE(),INTERVAL 70 DAY),'Navesta Pharma'),
 ('Oral rehydration salts','ORS','sachet',NULL,   35.00, 180,100,'ORS-2406',DATE_ADD(CURDATE(),INTERVAL 540 DAY),'State Pharmaceuticals Corp.'),
 ('Losartan',   'Losartan',   'tablet','50 mg',   16.00,   0,150,'LOS-2404',DATE_ADD(CURDATE(),INTERVAL 260 DAY),'Hemas Pharma'),
 ('Cetirizine', 'Cetirizine', 'tablet','10 mg',    6.00, 820,200,'CTZ-2410',DATE_ADD(CURDATE(),INTERVAL 60 DAY),'Navesta Pharma');

INSERT INTO stock_movements (medicine_id, change_qty, reason, reference, user_id)
 SELECT id, stock_quantity, 'opening', 'Seed data', 1 FROM medicines WHERE stock_quantity > 0;

INSERT INTO patients (mrn, first_name, last_name, gender, date_of_birth, nic, blood_group, phone, address, allergies, emergency_contact_name, emergency_contact_phone, created_by, created_at) VALUES
 ('MRN-000001','Kamal','Gunawardena','male',  '1968-03-14','196807401234','B+', '0771234567','12, Flower Road, Colombo 07','Penicillin','Sunethra Gunawardena','0771234000',2,DATE_SUB(NOW(),INTERVAL 60 DAY)),
 ('MRN-000002','Dilani','Senanayake','female','1990-07-22','199070402345','O+', '0712345678','8/2, Stanley Thilakaratne Mw, Nugegoda',NULL,'Ruwan Senanayake','0712345000',2,DATE_SUB(NOW(),INTERVAL 41 DAY)),
 ('MRN-000003','Sahan','Fernando',  'male',  '2017-11-05',NULL,          'A+', '0763456789','33, Hill Street, Dehiwala',NULL,'Nirosha Fernando','0763456000',2,DATE_SUB(NOW(),INTERVAL 20 DAY)),
 ('MRN-000004','Malini','Rodrigo',  'female','1955-01-30','195553001234','AB+','0704567890','5, Parliament Road, Kotte','Sulfonamides','Chaminda Rodrigo','0704567000',2,DATE_SUB(NOW(),INTERVAL 9 DAY));

-- The demo patient account "kamal" belongs to patient record MRN-000001
UPDATE users SET patient_id = 1 WHERE username = 'kamal';

-- Today's clinic for the physician (Dr. Shalini consults every day)
INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, reason, status, created_by) VALUES
 (1,2,CURDATE(),'08:30','Blood pressure review','checked_in',2),
 (2,2,CURDATE(),'09:00','Fever and cough','scheduled',2),
 (4,2,CURDATE(),'09:30','Diabetes follow-up','scheduled',2);

INSERT INTO audit_logs (username, role, action, details) VALUES ('system','', 'SEED', 'Starter data loaded');
