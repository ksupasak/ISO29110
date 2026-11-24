# Release 1 — รายการค้างสำหรับ Release 2

ที่มา: ข้อสังเกตระดับ Minor จากการตรวจรายงานและการตรวจรวมของ Release 1 (branch release-1-foundation)

## ต้องทำก่อนใช้กับข้อมูลจริง
- ทดสอบติดตั้งครั้งแรกบน server จริงด้วย `docker compose up -d --build` (เส้นทาง network ปกติยังไม่เคยรัน) และทดสอบ backup → restore ตาม README หัวข้อ "ตรวจรับการติดตั้งครั้งแรก"

## งานแรกของ Release 2
- จำกัดชนิดข้อมูลที่ requireUser คืน ไม่ให้มี passwordHash
- เพิ่มช่อง customerContact, type, devCycle ในฟอร์มโครงการ (จำเป็นต่อการส่งออก docx)
- e2e: กรณีคนนอกทีมเปิด /projects/<code> และ /api/files/<id> ได้ 404; คลิก dialog แนบหลักฐาน

## ข้อสังเกตที่เลื่อนไว้ (จาก ledger)
- Task 2: minor (deferred): wp-catalog test does not assert states/generated/phase folder values
- Task 2: minor (deferred): DocumentVersion.attachment FK is RESTRICT; project delete works today because of trigger order — consider NoAction for robustness
- Task 3: minor (deferred): proxy matcher excludes only _next/static|image and `login` prefix has no boundary
- Task 3: minor (deferred): cookie name "esm_session" duplicated in proxy.ts
- Task 3: minor (deferred): getSessionUser/requireUser return full User incl. passwordHash — never pass to client components (carry to T5/T6/T7 dispatches)
- Task 3: minor (deferred): seed upsert resets admin password/role/active on every run
- Task 3: minor (deferred): expired Session rows never purged
- Task 4: minor (deferred): ALL_ROLES duplicates ProjectRole enum; redundant type annotation; no test for roles:[] or ADMIN-who-is-member
- Task 5: minor (deferred): users table td uses flex; dialog keeps stale error on reopen; malformed date → null silently; no rollback test; updateProject date check not transactional; edit/reset/toggle/logout UI not browser-exercised (T8 e2e covers logout)
- Task 6: minor (deferred): budget 0 shown as "-" (truthiness) in projects/[code]/page.tsx; last-PM guard not transactional; unchecked role casts in members actions; FormDialog duplicates users dialogs; home card indentation; project.type printed raw (free-text String, default "Internal")
- Task 7: minor (deferred): any member can move a Baselined doc back to another status; P2002 assumed = duplicate version; duplicated size/empty messages in actions vs service; Uint8Array copy on download; uploads buffered in memory; currentVersion update not atomic under concurrent uploads; dialogs never clicked in a real browser (T8 e2e must cover upload dialog)
- Task 8: minor (deferred): playwright webServer starts before TEST_DATABASE_URL guard; e2e shares .next with dev server; `npm start` warns with standalone; README restore should stop app first and note volume overwrite; DB password special chars need percent-encoding (undocumented); prod gets unused esm_test DB; test-storage accumulates; fixture docx is plain text
- Final: minor (deferred): setDocumentStatus read-then-update race (TL baselines between AN read and write).
- ไม่มีการจำกัดจำนวนครั้ง login ผิด (ยอมรับได้ในเครือข่ายภายใน)
- last-PM guard นับผู้ใช้ที่ถูกปิดบัญชีด้วย
- ฟอนต์ Geist โหลดเฉพาะ latin ข้อความไทยใช้ฟอนต์สำรอง
- image ของ Docker มี node_modules เต็มชุด (ขนาดใหญ่)

## สิ่งที่ผู้ตรวจไม่ตัดสิน (รอการตัดสินใจเชิงผลิตภัณฑ์)
- ไม่มีวิธีลบหรือแทนที่ไฟล์ที่อัปโหลดผิด
- ADMIN ที่ไม่ใช่สมาชิกโครงการมีสิทธิ์เขียนทุกโครงการ
- สมาชิกทุกคนรวม VIEWER เห็นงบประมาณโครงการ
- ไม่มีการลบ/เก็บถาวรโครงการ และไม่มีการลบผู้ใช้

## จากการเปลี่ยนหน้าตาเป็น Bootstrap + Material (branch ui-material-bootstrap)

- ฟอนต์ไอคอน Material Symbols เป็นไฟล์ 4 MB: ควรตัดให้เหลือเฉพาะไอคอนที่ใช้ (เปิดหน้าครั้งแรกบนเครือข่ายช้าจะเห็นไอคอนช้า)
- ตัดสินใจ `$min-contrast-ratio` (ตอนนี้ 3) ก่อนเพิ่มปุ่มสี success/info/secondary: ถ้าปรับเป็น 4.5 ปุ่มเขียว/ฟ้าจะใช้ตัวอักษรสีเข้ม
- ข้อความ error ของตัวเลือกสถานะเอกสาร (doc-controls.tsx) ยังใช้รูปแบบ `text-danger small` ต่างจากที่อื่น
- FormDialog: แยก prop ขนาดปุ่มออกจาก `triggerVariant`; `IconButton` รองรับ `href`
- PhaseItem pill และ RoleBadge ซ้ำ markup ของ StatusChip
- `role="switch"` บน checkbox บทบาท; ชื่อ WP ใช้ text-truncate บนจอสัมผัส
- สคริปต์ `npm run screens` ใช้ได้เฉพาะ shell แบบ POSIX
- e2e: ตรวจ scrollWidth ครั้งเดียวโดยไม่รอ render (ความเสี่ยง flaky ต่ำ)
