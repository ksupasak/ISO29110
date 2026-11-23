# ระบบบริหารโครงการพัฒนาซอฟต์แวร์ตาม ISO/IEC 29110 — เอกสารออกแบบ

วันที่: 23/11/2569 (2026-11-23) · สถานะ: รออนุมัติ

## 1. เจตนาและเหตุผล

บริษัทบริหารโครงการพัฒนาซอฟต์แวร์ 3–5 โครงการพร้อมกัน และต้องมีหลักฐานตาม ISO/IEC 29110-5-1-2:2025 Basic Profile ครบ 23 work products (WP) ต่อโครงการ ปัจจุบันมี template docx ที่ผู้ใช้พอใจแล้ว (`../repository/project_templates`) แต่การกรอกทีละไฟล์ทำให้ข้อมูลซ้ำซ้อนและรหัสอ้างอิงข้ามเอกสารผิดง่าย

ระบบนี้ให้เจ้าหน้าที่แต่ละบทบาท **กรอกข้อมูลเท่าที่จำเป็นครั้งเดียว** บน web แล้วระบบ **สร้างเอกสาร docx ฉบับสมบูรณ์** ในรูปแบบเดียวกับ template ชุดปัจจุบัน เพื่อใช้เป็นหลักฐานการประเมิน

## 2. เป้าหมาย / สิ่งที่ไม่ทำ / สิ่งที่ห้ามเกิด

**เป้าหมาย**
- จัดการหลายโครงการ ทีม แผนงาน และ Task ในที่เดียว
- บันทึกทะเบียน 8 ชนิดผ่านฟอร์ม: Meeting Record, Change Request, Correction Register, Progress Status Record, Verification Record, Validation Record, Test Cases (รวมผลทดสอบและ Test Report), Traceability Record
- เก็บไฟล์แนบของทุก WP พร้อมเวอร์ชันและสถานะ รวมถึงไฟล์ที่ลูกค้าเซ็นแล้ว
- ส่งออก docx รายฉบับ และส่งออกทั้งโครงการเป็นชุดโฟลเดอร์ 9 ช่วงงาน / 23 WP

**สิ่งที่ไม่ทำ (non-goals)**
- ลูกค้าไม่ login เข้าระบบ ไม่มี e-signature
- ไม่แก้เอกสารเชิงบรรยาย (Agreement, Project Plan, SRS, Software Design, คู่มือต่าง ๆ) บน web — เขียนเป็น docx แล้วแนบ
- ไม่มี Gantt แบบลากวาง ไม่มี mobile app ไม่เชื่อม Git/CI ไม่มีอีเมลแจ้งเตือนในรุ่นแรก

**สิ่งที่ห้ามเกิด (anti-goals)**
- ผู้ใช้ต้องกรอกมากกว่าการกรอกไฟล์ Word เดิม
- เอกสารที่ส่งออกหน้าตาหรือหัวข้อต่างจาก template ที่อนุมัติแล้ว
- ข้อมูลตัวเลขเดียวกันต้องกรอกสองที่

## 3. ข้อจำกัด

- ฐานข้อมูล PostgreSQL (ผู้ใช้กำหนด)
- ติดตั้งบน server ของบริษัท (ผู้ใช้กำหนด) ใช้ภายใน ผู้ใช้ประมาณ 10–30 คน
- หน้าจอภาษาไทย วันที่แสดงแบบ วว/ดด/ปปปป พ.ศ. (เก็บในฐานข้อมูลเป็น date ปกติ)
- เอกสารส่งออกต้องใช้ฟอนต์ Tahoma และรูปแบบเดิมจาก `../repository/templates/_generator`

## 4. แนวทางที่พิจารณา

| แนวทาง | ข้อดี | ข้อแลก |
|---|---|---|
| **A. Next.js (TypeScript) + PostgreSQL โปรเจกต์เดียว** | ใช้ตัวสร้าง docx เดิม (JavaScript, docx-js) ได้ตรง ๆ; ภาษาเดียว; service เดียว | ต้องเขียนหน้าฟอร์ม/ตารางเอง |
| B. Rails หรือ Django + PostgreSQL | CRUD/admin เร็ว | ต้องเขียนตัวสร้าง docx ใหม่ 23 แบบ หรือดูแล Node service แยก |
| C. Low-code (Directus/NocoDB) + service ส่งออก | ได้ฟอร์มเร็วที่สุด | หน้าจอเฉพาะ (Traceability, workflow สถานะ, กระดาน Task) ทำได้จำกัด; พึ่งเครื่องมือภายนอก |

**เลือก A** — ผู้ใช้ตอบ "ตามนี้เลย" ต่อข้อเสนอที่ระบุแนวทาง A เหตุผล: ส่วนที่มีค่าที่สุดคือการส่งออกเอกสารตรงรูปแบบ ซึ่งทำเสร็จแล้วใน JavaScript

## 5. สิ่งที่ผู้ใช้ตัดสินใจแล้ว

- ขอบเขต: ข้อมูลโครงการ, Team, Task, Planning, ทะเบียนเอกสารที่จำเป็น, ไฟล์แนบ
- PostgreSQL; ติดตั้งบน server ของตนเอง
- เจ้าหน้าที่แต่ละบทบาทกรอกเท่าที่จำเป็น; 3–5 โครงการพร้อมกัน
- ลูกค้าไม่เข้าระบบ แต่แนบเอกสารที่เซ็นแล้วเป็นหลักฐานได้
- ยอมรับข้อเสนอ: ตารางบทบาท, โครงหน้าจอ, หลักการ "กรอกครั้งเดียวใช้หลายที่", รหัสเอกสารอัตโนมัติ, ล็อกรายการเมื่อมีไฟล์เซ็น, หน้าจอภาษาไทย

## 6. การออกแบบ

### 6.1 เทคโนโลยี (ผู้ออกแบบเลือก)

- Next.js (App Router) + TypeScript, Server Actions สำหรับการบันทึก
- PostgreSQL + Prisma (migration อยู่ใน repo)
- Auth.js แบบ username/password (bcrypt) session ในฐานข้อมูล
- Tailwind CSS + shadcn/ui; ตารางใช้ TanStack Table
- docx (docx-js) สำหรับส่งออก; archiver สำหรับ zip
- ไฟล์แนบเก็บบน disk ที่ path กำหนดด้วย `FILE_STORAGE_DIR`; PostgreSQL เก็บ metadata
- Docker Compose: `app` + `postgres` + volume สำหรับไฟล์; สคริปต์ backup รายวัน (pg_dump + ไฟล์)

### 6.2 บทบาทและสิทธิ์

บทบาทระดับระบบ: `ADMIN` (จัดการผู้ใช้), `USER`
บทบาทระดับโครงการ (หนึ่งคนมีได้หลายบทบาท ต่างกันได้ในแต่ละโครงการ): `PM`, `TL`, `AN`, `PR`, `QA`, `VIEWER`

| ข้อมูล | สร้าง/แก้ไข | อนุมัติ/เปลี่ยนสถานะสุดท้าย |
|---|---|---|
| โครงการ, ทีม, milestone, แผนงาน | PM | PM |
| Task | PM (ทุก task), ผู้รับผิดชอบ (สถานะ, %, วันจริง, จำนวนวันที่ใช้ของตัวเอง) | PM |
| Meeting Record | PM, AN | PM |
| Change Request | ทุกคนในโครงการ (Initiated) | PM (Evaluated), PM บันทึกผลจากลูกค้า (Accepted/Rejected) |
| Correction Register | PM, TL | PM |
| Progress Status | PM | PM (Published) |
| Verification Record | TL, AN, QA | TL หรือ PM |
| Validation Record | PM, AN | PM |
| Requirement, Component, Traceability | AN, TL | TL |
| Test Case, ผลทดสอบ, Defect | QA (PR แก้สถานะ defect) | TL |
| เอกสาร WP / ไฟล์แนบ | ทุกคนในโครงการยกเว้น VIEWER | PM, TL (Baselined) |

ทุกคนในโครงการอ่านได้ทุกอย่างของโครงการนั้น ผู้ที่ไม่ใช่สมาชิกมองไม่เห็นโครงการ (ยกเว้น ADMIN)

### 6.3 โมเดลข้อมูล (ตารางหลัก)

**แกนกลาง**
- `user` (ชื่อ, ตำแหน่ง, username, รหัสผ่าน hash, ระบบ role, active)
- `project` (code เช่น INT-2569-001, name, short_name, customer_name, customer_contact, type, start/end, budget, dev_cycle, status: Planning/Active/Closed, description)
- `project_member` (project, user, roles[], primary_role ใช้จัดกลุ่มแรงงานตามบทบาท, daily_rate ไม่บังคับ เห็นเฉพาะ PM/ADMIN)
- `project_objective` (objective, indicator, target) — ใช้ในตาราง "ผลลัพธ์เทียบวัตถุประสงค์" ของ Progress Status
- `project_signatory` (role_label เช่น Customer, name, position) — ชื่อผู้ลงนามฝ่ายลูกค้าที่พิมพ์ในช่องลายเซ็น
- `milestone` (code M1.., name, planned_date, revised_date, actual_date)
- `task` (wbs_code, parent, title, iso_activity เช่น SI.02.04, qa_type: Ver/Val/Rev/none, assignee, planned_start/end, actual_start/end, status: Todo/Doing/Done/Blocked, percent, planned_days, actual_days (หน่วยเป็นวัน ทศนิยม 0.5 ได้ ไม่ใช้ชั่วโมง), output_wp)
- `risk` (code, description, probability 1–3, impact 1–3, mitigation, owner, status)
- `budget_line` (name, planned_amount, actual_amount, is_labour) — บรรทัดแรงงาน: ถ้าสมาชิกมี daily_rate ระบบคำนวณ actual = actual_days × rate ให้ ถ้าไม่มี PM กรอก actual เอง
- `doc_sequence` (project, prefix, buddhist_year, last_no) — ออกรหัส `MR-2570-05`
- `backup_log` (code BK-nn, date, type, scope, location, result, ref, operator) — ที่มาของเอกสาร WP12 และตารางกู้คืนใน WP11
- `repository_property` (project, ลำดับ 1–8 ตามคุณสมบัติที่มาตรฐานกำหนด, has, method) — ตั้งต้นจากค่ามาตรฐาน แก้ได้ต่อโครงการ

**ทะเบียน PM**
- `meeting` (no, topic, held_at, ended_at, place, organizer, purpose, previous_ref → meeting, next_meeting, recorder, status: Draft/Approved)
  - `meeting_attendee` (user หรือชื่อบุคคลภายนอก, ตำแหน่ง, ฝ่าย, present: เข้าร่วม/ไม่เข้าร่วม)
  - `meeting_item` (kind: Accomplished/Issue/OpenIssue/Agreement, text, owner, due_date, status สำหรับ OpenIssue)
- `change_request` (no, title, requester_name/position/contact, purpose, reasons[], impact_function/performance/security, effort_days, cost, schedule_impact, criticality, date_needed, status: Initiated/Evaluated/Accepted/Rejected)
  - `cr_affected_item` (component หรือเอกสาร, change_type, detail, new_version)
  - `status_history` (ใช้ร่วมทุกทะเบียน: entity, from, to, by, at, note)
- `correction` (no CO-nn, opened_at, problem, solution, actions, owner, due_date, status: Initiated/Approved/Completed, follow_up, source_type + source_id อ้างถึง meeting/progress/อื่น ๆ)
- `progress_report` (no, period_start/end, overall_status, pm_summary, status: Draft/Published, `snapshot` JSONB ของ task/milestone/effort/cost/risk ณ วันเผยแพร่)
  - `progress_deviation` (deviation, cause, action, ref)
  - `progress_objective_result` (objective, current_result, status) — PM กรอกผลปัจจุบันของแต่ละวัตถุประสงค์

**Verification / Validation**
- `verification_record` (no, wp_code, document_version, author, verifier, date, method, iso_task, duration, result: Passed/Passed with corrections/Failed, status: Initiated/Approved)
  - `checklist_item` (ใช้ร่วมกับ validation: ref, criterion, result: Pass/Fail/Pending, note)
  - `review_defect` (ใช้ร่วม: code, description, severity, action, closed_at)
- `validation_record` (no, subject, date, place, duration, iso_task, result, status)
  - ผู้เข้าร่วมใช้โครงสร้างเดียวกับ `meeting_attendee`
- `checklist_template` (wp_code, รายการเกณฑ์มาตรฐาน) — ตั้งต้นจากเกณฑ์ใน template เดิม เพื่อไม่ต้องพิมพ์เกณฑ์ซ้ำ

**ทดสอบและ Traceability**
- `agreement_item` (code AG-01.., text) — ขอบเขตตาม Agreement
- `requirement` (code REQ-F01.., type: Functional/NonFunctional, text, priority, agreement_item, design_ref ข้อความอ้างหัวข้อใน Software Design, status, added_by_cr)
- `component` (code C01.., name, description, owner, unit_test_status, version)
- `requirement_component` (many-to-many)
- `test_case` (code TC-01.., title, type, precondition, steps[], expected, status)
- `test_case_requirement` (many-to-many)
- `test_run` (no, round, started/ended, environment, tester, summary, status: Draft/Baselined)
- `test_result` (run, test_case, result: Pass/Fail/Blocked/NotRun, actual, defect)
- `defect` (code DEF-01.., description, severity, component, status: Open/Fixed/Closed, fixed_in_run)

**เอกสารและไฟล์แนบ**
- `wp_document` (project, wp_code WP01–WP23, title, current_version, status ตามสถานะที่มาตรฐานกำหนดของ WP นั้น)
- `document_version` (wp_document, version, file, note, uploaded_by, cr อ้างอิง)
- `attachment` (entity_type + entity_id, file_name, stored_path, size, mime, kind: Evidence/Signed/Other, uploaded_by)
- `audit_log` (user, entity, action, before/after JSONB, at)

### 6.4 กฎสำคัญ

1. **กรอกครั้งเดียว** — Progress Status ดึง task/milestone/effort/cost/risk อัตโนมัติ PM กรอกเฉพาะสรุปและความเบี่ยงเบน; เมื่อ Publish ระบบเก็บ snapshot เพื่อให้เอกสารย้อนหลังไม่เปลี่ยนตามข้อมูลปัจจุบัน
2. **Test Report** สร้างจาก `test_run` + `test_result` + `defect`; **Traceability Record** สร้างจาก agreement_item → requirement → design_ref → component → test_case → ผลล่าสุด ไม่มีฟอร์มกรอก Traceability แยก แต่มีหน้าตารางที่แสดงช่องว่าง (requirement ที่ไม่มี test case ฯลฯ) และแก้การโยงได้จากหน้านั้น
3. **รหัสเอกสาร** ออกอัตโนมัติจาก `doc_sequence` รูปแบบ `<PREFIX>-<ปี พ.ศ.>-<ลำดับ>`; นับแยกตามโครงการ และเริ่มนับ 01 ใหม่ทุกปี พ.ศ.; ลำดับ 2 หลัก ยกเว้น CR ใช้ 3 หลักตาม template (`CR-2569-001`); prefix: MR, CR, PSR, VER, VAL, TRP (Test Report), BKP; รหัสรายการภายในโครงการไม่มีปี: CO-nn, REQ-Fnn/REQ-Nnn, Cnn, TC-nn, DEF-nn, AG-nn, BK-nn, Rnn, Mn; ความกว้างของลำดับเก็บเป็นค่าตั้งต่อ prefix; การอ้างอิงข้ามทะเบียนเลือกจากรายการ
4. **การล็อก** — รายการที่มีไฟล์แนบชนิด `Signed` หรืออยู่ในสถานะสุดท้าย (Approved/Published/Baselined/Accepted/Rejected/Completed) แก้ไม่ได้ PM ปลดล็อกได้โดยต้องระบุเหตุผล และบันทึกลง `audit_log`
5. **สถานะ WP** ใช้ชุดสถานะตามมาตรฐานของแต่ละ WP (เช่น CR: Initiated/Evaluated/Accepted/Rejected)
6. **ทะเบียนที่ปรับปรุงต่อเนื่อง** (Correction Register, Traceability Record, Test Cases, Repository Register, Backup Log) เป็นเอกสารหนึ่งฉบับต่อโครงการ ผู้มีสิทธิ์อนุมัติกด "ออกฉบับ" เพื่อสร้าง docx เก็บเป็น `document_version` ใหม่ใต้ `wp_document` ของ WP นั้น (เลขเวอร์ชัน minor +1 อัตโนมัติ) ฉบับที่ออกแล้วไม่เปลี่ยนตามข้อมูลภายหลัง; การส่งออกระหว่างรอบพิมพ์คำว่า Draft ที่หัวกระดาษ
7. **การสร้างโครงการ** — เฉพาะ ADMIN สร้างโครงการและกำหนด PM คนแรก จากนั้น PM จัดการทีมเอง
8. **CR ที่ Accepted** สร้างรายการเตือนในหน้าโครงการว่าเอกสาร/requirement ใดต้องปรับเวอร์ชัน (จาก `cr_affected_item`) แต่ไม่แก้ให้อัตโนมัติ

### 6.5 หน้าจอ

```
/                          หน้ารวม: การ์ดโครงการ (สถานะ, %, milestone ถัดไป), งานของฉัน, รายการรอฉันอนุมัติ
/projects/[code]           ภาพรวม: ข้อมูลโครงการ, ทีม, milestone, ความเสี่ยง, งบประมาณ, รายการเตือน
  /plan                    WBS แบบต้นไม้ + ตาราง Task; มุมมองกระดานตามสถานะ
  /meetings /changes /corrections /progress
  /verifications /validations
  /requirements /components /test-cases /test-runs /traceability
  /documents               23 WP จัดกลุ่ม 9 ช่วงงาน: เวอร์ชัน, สถานะ, ไฟล์, ไฟล์ที่เซ็น
  /export                  ส่งออกรายฉบับ หรือทั้งชุดเป็น zip
/admin/users
```

ทุกทะเบียนใช้ component กลางชุดเดียว: ตารางรายการ (ค้นหา/กรองสถานะ) → หน้ารายละเอียด (ฟอร์ม, แถบสถานะ, ไฟล์แนบ, ปุ่มส่งออก docx, ประวัติ)

### 6.6 การส่งออกเอกสาร

- **รูปแบบที่ถือเป็นฉบับอนุมัติคือ template เปล่าใน `../repository/project_templates`** ไม่ใช่เอกสารตัวอย่างใน `FRA_flora_01` (สองชุดนี้ต่างกันในเอกสาร PM: template ของ WP03/WP07 มาจาก `build.js`, WP04/WP09/WP11/WP22 มาจาก `forms.js` ส่วนตัวอย่างสร้างด้วยรูปแบบย่อใน `pm.js`) ฟอร์มกรอกข้อมูลและ schema ต้องครอบคลุมทุกช่องใน template ฉบับอนุมัติ
- ย้ายโค้ดจาก `../repository/templates/_generator` มาไว้ที่ `src/docgen/` แปลงเป็น TypeScript: `build.js` (ตัวช่วยกลาง + WP03, WP07), `forms.js` (WP04, WP09, WP11, WP22), `lib.js` + ส่วนที่เกี่ยวข้องใน `si.js` (WP19, WP20, WP21, WP23) และ `wp12.js` (WP12); แต่ละเอกสารเป็นฟังก์ชันที่รับข้อมูลจากฐานข้อมูลแทน placeholder หรือ `data.js`
- เอกสารที่ระบบสร้าง: WP03, WP04, WP07, WP09, WP12, WP19, WP20, WP21, WP22, WP23 และทะเบียน WP11 (รายการเอกสารจาก `wp_document` + `repository_property` + `backup_log`)
- **ส่งออกทั้งชุด**: zip ที่มีโฟลเดอร์ 9 ช่วงงาน / 23 WP เหมือน `project_templates` ภายในมีเอกสารที่ระบบสร้าง + เวอร์ชันล่าสุดของไฟล์ที่แนบ + ไฟล์ที่เซ็นแล้ว; ชื่อไฟล์ `<รหัสโครงการ>_<ชื่อเอกสาร>_<เลข/เวอร์ชัน>.docx`
- หัวกระดาษใช้ชื่อบริษัทและโลโก้จากการตั้งค่าระบบ

### 6.7 ลำดับการส่งมอบ

| รุ่น | เนื้อหา | ใช้งานได้อย่างไรเมื่อจบรุ่น |
|---|---|---|
| 1 | โครงสร้างโปรเจกต์, login, ผู้ใช้, โครงการ, ทีม, เอกสาร WP + ไฟล์แนบ, Docker Compose | ใช้เป็นคลังเอกสารโครงการ (แทนโฟลเดอร์) ได้ |
| 2 | Milestone, WBS/Task, risk, budget, หน้ารวม | บริหารแผนและงานได้ |
| 3 | Meeting, Change Request, Correction, Progress + ส่งออก docx | PM เลิกกรอกไฟล์ 4 ชนิดนี้ |
| 4 | Verification, Validation + checklist template + ส่งออก | |
| 5 | Requirement, Component, Test Case, Test Run, Defect, Traceability + ส่งออก | |
| 6 | ส่งออกทั้งชุด, การล็อก/ปลดล็อก, audit log, สคริปต์ backup | พร้อมใช้เป็นหลักฐานการประเมิน |

แต่ละรุ่นมีแผนงานของตัวเอง เริ่มจากรุ่น 1

### 6.8 การทดสอบ

- Unit test สำหรับกฎ: การออกรหัส, สิทธิ์ตามบทบาท, การล็อก, การคำนวณ Progress snapshot, การสร้าง Traceability
- ทดสอบการส่งออก: สร้าง docx จากข้อมูลตัวอย่าง TaskDoc แล้วเทียบหัวข้อและหัวตารางกับ template ใน `../repository/project_templates` ทุกหัวข้อของ template ต้องปรากฏในเอกสารที่ส่งออก
- End-to-end (Playwright) เส้นทางหลักต่อรุ่น

## 7. สิ่งที่ปล่อยให้ผู้สร้างตัดสินใจ

- รายละเอียด schema ระดับคอลัมน์ ดัชนี และชื่อไฟล์ในโค้ด
- หน้าตา UI ภายในแนวทาง shadcn/ui
- วิธีแสดง WBS (ต้นไม้พับได้หรือตารางเยื้อง)
- โครงสร้างโฟลเดอร์เก็บไฟล์บน disk
- ข้อมูลตั้งต้น (seed): โครงการตัวอย่าง TaskDoc จาก `data.js` สำหรับ dev/ทดสอบเท่านั้น

## 8. ส่วนเพิ่มเติม 23/11/2569 — สายการอ้างอิงและลำดับรุ่นใหม่ (ผู้ใช้อนุมัติ)

ผู้ใช้ต้องการให้เอกสารที่เกิดซ้ำได้หลายครั้ง (เช่น Meeting Record) กรอกผ่านฟอร์มครบทุกช่อง ออกรหัสอัตโนมัติ และไล่ตามรอยได้ตั้งแต่ Requirement → Dev task → ผลทดสอบ

### 8.1 สายการอ้างอิง

```
AG-nn (agreement_item)
  └─ REQ-xnn (requirement)
       ├─ T-nnn (task ชนิด dev)  ── many-to-many: task_requirement
       │    └─ Cnn (component)   ── many-to-many: task_component
       ├─ TC-nn (test_case)      ── test_case_requirement (เดิม)
       │    └─ test_result → DEF-nn (defect) → T-nnn (task แก้ไข: task.defect_id)
       └─ CR (change_request)    ── requirement.added_by_cr / cr_affected_item (เดิม)

MR (meeting) → meeting_item (OpenIssue/Agreement) → สร้างหรืออ้าง task, correction, change_request
```

- เพิ่มตาราง `task_requirement` และ `task_component`; เพิ่ม `task.code` (`T-nnn` นับต่อโครงการ), `task.kind` (Plan/Dev/Fix/Review), `task.defect_id`, `meeting_item.linked_type` + `linked_id`
- `requirement_component` (เดิม) คงไว้สำหรับการโยงตรง แต่ Traceability คำนวณจากทั้งสองทาง (ผ่าน task และโยงตรง)
- ทุกหน้ารายละเอียดมีแผง "การอ้างอิง" แสดงรายการต้นทางและปลายทาง; Traceability Record ที่ส่งออกมีคอลัมน์ Task เพิ่ม

### 8.2 ลำดับรุ่นใหม่ (แทนตารางในข้อ 6.7 ตั้งแต่รุ่น 2)

| รุ่น | เนื้อหา |
|---|---|
| 1 | เสร็จแล้ว (ฐานระบบ + คลังเอกสาร) |
| 1.5 | เปลี่ยนหน้าตาเป็น Bootstrap 5 + Material (เอกสารแยก: 2026-11-23-material-bootstrap-ui-design.md) |
| 2 | Milestone, WBS/Task, Requirement, Component, agreement_item, การโยง AG→REQ→Task→Component, Meeting Record แบบฟอร์มเต็ม + ส่งออก docx (ต้นแบบของทะเบียนที่เกิดซ้ำ), ผู้ใช้เปลี่ยนรหัสผ่านเอง |
| 3 | Change Request, Correction, Progress Status (+ risk, budget) + ส่งออก |
| 4 | Verification, Validation + ส่งออก |
| 5 | Test Case, Test Run, Defect, Traceability Record + ส่งออก |
| 6 | ส่งออกทั้งชุด, การล็อก, audit log, backup log |
