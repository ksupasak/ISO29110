# ระบบบริหารโครงการ ISO/IEC 29110

ระบบภายในบริษัทสำหรับบริหารโครงการซอฟต์แวร์ตามมาตรฐาน ISO/IEC 29110 พัฒนาด้วย Next.js 16 และ PostgreSQL
รุ่นที่ 1 (Release 1) ครอบคลุม: การเข้าสู่ระบบ, การจัดการผู้ใช้, โครงการ, ทีมงานและบทบาท, และคลังเอกสาร Work Product (อัปโหลดไฟล์เป็นเวอร์ชัน, สถานะเอกสาร, ไฟล์แนบหลักฐาน)

- เฉพาะผู้ดูแลระบบ (ADMIN) เท่านั้นที่สร้างโครงการและกำหนดผู้จัดการโครงการ (PM) คนแรก
- ไม่มีการล็อกอินสำหรับลูกค้า และไม่มีลายเซ็นอิเล็กทรอนิกส์ เอกสารเป็นไฟล์ที่อัปโหลด (ไม่เกิน 50 MB)

## สิ่งที่ต้องมี

- เซิร์ฟเวอร์ Linux ที่ติดตั้ง Docker Engine และ Docker Compose v2 (`docker compose`)
- พอร์ต 3000 ว่าง (เปลี่ยนได้ด้วย `APP_PORT` ใน `.env`)
- ถ้าให้บริการผ่าน HTTPS ควรมี reverse proxy (เช่น nginx) ด้านหน้า

## ติดตั้งครั้งแรกบนเซิร์ฟเวอร์

1. นำซอร์สโค้ดมาไว้บนเซิร์ฟเวอร์ (เช่น `git clone`) แล้วเข้าไปที่โฟลเดอร์โปรเจกต์
2. สร้างไฟล์ตั้งค่า

   ```bash
   cp .env.example .env
   ```

3. แก้ไข `.env` **ต้องเปลี่ยนรหัสผ่านทุกค่า**

   | ตัวแปร | ความหมาย |
   |---|---|
   | `POSTGRES_PASSWORD` | รหัสผ่านฐานข้อมูล (ใช้ตอนสร้างฐานข้อมูลครั้งแรกเท่านั้น) |
   | `DATABASE_URL` | `postgresql://esm:<POSTGRES_PASSWORD>@postgres:5432/esm` (โฮสต์คือ `postgres`, รหัสผ่านต้องตรงกับข้างบน) |
   | `SEED_ADMIN_PASSWORD` | รหัสผ่านเริ่มต้นของผู้ใช้ `admin` (ใช้ตอนรัน seed; หลังใช้ครั้งแรกให้ลบค่านี้ออกจาก `.env` ให้เป็นค่าว่าง) |
   | `SEED_RESET_ADMIN` | (ไม่บังคับ) ตั้งเป็น `true` เฉพาะเมื่อต้องการให้ seed รีเซ็ตรหัสผ่าน/บทบาทของ `admin` ที่มีอยู่แล้ว ปกติไม่ต้องตั้ง |
   | `SESSION_COOKIE_SECURE` | ตั้งเป็น `true` เมื่อใช้งานผ่าน HTTPS |
   | `SETTINGS_SECRET` | ข้อความลับ (ยาวอย่างน้อย 16 ตัวอักษร) ใช้เข้ารหัส API key ของ AI ที่เก็บในฐานข้อมูล เช่น `openssl rand -hex 32` (ดูหัวข้อ "ตั้งค่า AI Model") |
   | `APP_PORT` | (ไม่บังคับ) พอร์ตของแอปบนเครื่อง ค่าเริ่มต้น 3000 |

   ห้าม commit ไฟล์ `.env`

   **ข้อควรระวังเรื่องรหัสผ่านฐานข้อมูล:** `POSTGRES_PASSWORD` ถูกใช้ตรงตัวโดย PostgreSQL และถูกใช้อีกครั้งใน `DATABASE_URL`
   ให้ใช้เฉพาะอักขระ `A-Za-z0-9_-` หรือถ้าใช้อักขระอื่นต้องทำ percent-encode รหัสผ่านใน `DATABASE_URL` (เช่น `@` เป็น `%40`)

4. สร้างและเริ่มระบบ (แอปจะรัน `prisma migrate deploy` เองทุกครั้งที่เริ่ม)

   ```bash
   docker compose up -d --build
   ```

5. ตรวจสอบ: `curl -sI http://localhost:3000/login` ต้องตอบ `200`

### สร้างผู้ดูแลระบบคนแรก

รันคำสั่งนี้ **หนึ่งครั้ง** หลังติดตั้ง (ต้องตั้ง `SEED_ADMIN_PASSWORD` ใน `.env` ไว้แล้ว):

```bash
docker compose exec app npx tsx prisma/seed.ts
```

จะได้ผู้ใช้ `admin` พร้อมรหัสผ่านตาม `SEED_ADMIN_PASSWORD` ถ้ามีผู้ใช้ `admin` อยู่แล้ว seed **จะไม่แก้ไข** ผู้ใช้นั้น
(ถ้าลืมรหัสผ่านและต้องการรีเซ็ต ให้ตั้ง `SEED_RESET_ADMIN=true` ใน `.env` รัน seed หนึ่งครั้ง แล้วลบตัวแปรนี้ออก)
หลังสร้างผู้ดูแลระบบแล้ว ให้ลบค่า `SEED_ADMIN_PASSWORD` ใน `.env` ให้เป็นค่าว่าง แล้วรัน `docker compose up -d` เพื่อให้แอปอ่านค่าใหม่
จากนั้นเข้าสู่ระบบที่ `http://<เซิร์ฟเวอร์>:3000` แล้วสร้างผู้ใช้อื่นที่เมนู "ผู้ใช้งาน"

## สำรองข้อมูลและกู้คืน

ข้อมูลอยู่ 2 ส่วน ต้องสำรองทั้งคู่ในเวลาใกล้เคียงกัน: ฐานข้อมูล (volume `pgdata`) และไฟล์เอกสาร (volume `files`)

### สำรอง

```bash
mkdir -p backup
# 1) ฐานข้อมูล
docker compose exec -T postgres pg_dump -U esm -d esm -Fc > backup/esm-$(date +%F).dump
# 2) ไฟล์เอกสาร
docker run --rm -v esm-project_files:/data/files:ro -v "$PWD/backup":/backup alpine \
  tar czf /backup/files-$(date +%F).tar.gz -C /data/files .
```

(ชื่อ volume คือ `esm-project_files` เพราะชื่อโปรเจกต์ Compose คือ `esm-project`; ตรวจด้วย `docker volume ls`)

### กู้คืน

> การกู้คืนจะเขียนทับข้อมูลปัจจุบัน ควรหยุดแอปก่อนเพื่อไม่ให้มีการเขียนข้อมูลระหว่างกู้คืน

```bash
docker compose up -d postgres
docker compose stop app
# 1) ฐานข้อมูล (ลบข้อมูลเดิมในฐานข้อมูล esm แล้วใส่ข้อมูลจากไฟล์สำรอง)
docker compose exec -T postgres pg_restore -U esm -d esm --clean --if-exists < backup/esm-YYYY-MM-DD.dump
# 2) ไฟล์เอกสาร: การแตกไฟล์ tar จะเขียนทับ/รวมเข้ากับไฟล์ที่มีอยู่แล้วใน volume
#    ถ้าต้องการให้ตรงกับไฟล์สำรองเป๊ะ ให้ล้าง volume ก่อน (คำสั่งแรกด้านล่าง) แล้วจึงแตกไฟล์
docker run --rm -v esm-project_files:/data/files alpine sh -c "find /data/files -mindepth 1 -delete"
docker run --rm -v esm-project_files:/data/files -v "$PWD/backup":/backup alpine \
  sh -c "cd /data/files && tar xzf /backup/files-YYYY-MM-DD.tar.gz && chown -R 1001:1001 /data/files"
docker compose start app
```

## ตรวจรับการติดตั้งครั้งแรก

ขั้นตอนการติดตั้งแบบ Docker Compose บน network ปกติ และคำสั่งสำรอง/กู้คืนข้างต้น **ยังไม่เคยถูกรันจริงที่ใดเลย**
(ตอนพัฒนาเครื่องที่ใช้ทดสอบสร้าง Docker network ไม่ได้ จึงทดสอบผ่าน `docker-compose.local.yml` เท่านั้น)
ให้ทำรอบตรวจรับนี้หนึ่งครั้งบนเซิร์ฟเวอร์จริงก่อนใช้งานจริง:

1. `docker compose up -d --build` แล้วตรวจว่า `curl -sI http://localhost:3000/login` ตอบ `200`
2. รัน seed สร้างผู้ดูแลระบบ (`docker compose exec app npx tsx prisma/seed.ts`)
3. เข้าสู่ระบบด้วย `admin`
4. สร้างโครงการ (ระบุ PM)
5. อัปโหลดไฟล์เวอร์ชัน 1.0 ให้เอกสารหนึ่งรายการ
6. ดาวน์โหลดไฟล์นั้นกลับมาและตรวจว่าเนื้อหาตรงกัน
7. สำรองข้อมูลตามหัวข้อ "สำรอง"
8. กู้คืนตามหัวข้อ "กู้คืน" (ใช้ไฟล์สำรองที่เพิ่งสร้าง)
9. ดาวน์โหลดไฟล์เดิมอีกครั้งและตรวจว่ายังตรงกัน

## การให้บริการผ่าน HTTPS

reverse proxy ต้องส่งหัว `Host` (หรือ `X-Forwarded-Host`) ของโดเมนจริงมายังแอป มิฉะนั้น Server Actions ของ Next.js
จะปฏิเสธคำขอ (หรือกำหนด `serverActions.allowedOrigins` ใน `next.config`) และต้องตั้ง `SESSION_COOKIE_SECURE=true` ใน `.env`

## อัปเดตเป็นเวอร์ชันใหม่

```bash
# สำรองข้อมูลก่อนเสมอ (ดูหัวข้อด้านบน)
git pull
docker compose up -d --build
```

แอปจะรัน migration ฐานข้อมูลให้อัตโนมัติเมื่อเริ่ม ข้อมูลใน volume `pgdata` และ `files` และไฟล์ใน `templates/` ไม่หาย (`git pull` แทนที่เฉพาะ `templates-default/`)
**ห้ามใช้ `docker compose down -v`** เพราะจะลบข้อมูลทั้งหมด (ใช้ `docker compose down` ได้)

## ตั้งค่า AI Model

ผู้ดูแลระบบเลือก model ที่ระบบ AI จะใช้ได้ที่เมนู **ตั้งค่า AI** (`/admin/ai`) ปัจจุบันยังไม่มีฟีเจอร์ใดเรียกใช้ AI
หน้านี้มีปุ่ม **ทดสอบการเชื่อมต่อ** สำหรับตรวจว่าตั้งค่าถูกต้อง (ทดสอบด้วยค่าที่บันทึกไว้แล้ว)

| ช่อง | ความหมาย |
|---|---|
| เปิดใช้ AI | ปิดไว้เป็นค่าเริ่มต้น เมื่อปิด ฟีเจอร์ที่ใช้ AI จะได้ข้อความ `ยังไม่ได้เปิดใช้ AI` |
| ผู้ให้บริการ | `Local / OpenAI-compatible` (เซิร์ฟเวอร์ model ในเครือข่ายบริษัท) หรือ `Claude (Anthropic)` |
| URL ปลายทาง | เฉพาะ Local ต้องเป็น `http://` หรือ `https://` ระบบจะต่อท้าย `/chat/completions` และ `/models` ให้เอง เช่น `http://192.168.1.50:11434/v1` |
| API key | Local ไม่บังคับ, Claude บังคับเมื่อเปิดใช้ หน้าเว็บแสดงเพียง 4 ตัวท้าย เว้นว่างตอนบันทึกเพื่อคงค่าเดิม หรือติ๊ก `ลบ API key` เพื่อลบ |
| Model | Claude เลือกจากรายการ; Local พิมพ์เอง หรือกด `ดึงรายชื่อ model` เพื่อดึงจาก `<URL ปลายทาง>/models` |

**`SETTINGS_SECRET`** ต้องตั้งใน `.env` (และ `docker compose up -d` ใหม่) ก่อนจึงจะบันทึก API key ได้ API key ถูกเข้ารหัส AES-256-GCM
ด้วยคีย์ที่ได้จากค่านี้ก่อนเก็บในฐานข้อมูล ถ้าเปลี่ยนค่า `SETTINGS_SECRET` ภายหลัง API key เดิมจะอ่านไม่ได้และต้องกรอกใหม่ (ระบบไม่ล่ม)

**ตัวอย่าง Ollama** บนเครื่องที่รัน `ollama serve`: ตั้ง URL ปลายทางเป็น `http://<IP เครื่อง Ollama>:11434/v1`, ไม่ต้องใส่ API key
แล้วกด `ดึงรายชื่อ model` เพื่อเลือก model ที่ติดตั้งไว้

**เมื่อแอปรันใน Docker และ model server อยู่บนเครื่องโฮสต์เดียวกัน** `localhost` ในคอนเทนเนอร์คือตัวคอนเทนเนอร์เอง ให้ใช้ `http://host.docker.internal:11434/v1`
(Docker Desktop) หรือ IP ของเครื่องโฮสต์ในเครือข่าย (บน Linux เพิ่ม `extra_hosts: ["host.docker.internal:host-gateway"]` ให้บริการ `app`)
และให้ model server รับการเชื่อมต่อจากภายนอกโลคอลโฮสต์ (Ollama: ตั้ง `OLLAMA_HOST=0.0.0.0`)

**คำเตือน:** เมื่อเลือก `Claude (Anthropic)` เนื้อหาเอกสารจะถูกส่งออกนอกเครือข่ายของบริษัทไปยัง Anthropic

## เปลี่ยนรหัสผ่านของตนเอง

ผู้ใช้ทุกคนเปลี่ยนรหัสผ่านได้เองจากเมนูชื่อผู้ใช้มุมขวาบน > `เปลี่ยนรหัสผ่าน` (ต้องกรอกรหัสเดิม รหัสใหม่อย่างน้อย 8 ตัวอักษรและต่างจากรหัสเดิม) เมื่อเปลี่ยนสำเร็จ การเข้าสู่ระบบบนอุปกรณ์อื่นจะหมดอายุ ส่วนอุปกรณ์ที่ใช้เปลี่ยนยังคงเข้าสู่ระบบอยู่ ผู้ดูแลระบบยังรีเซ็ตรหัสผ่านให้ผู้ใช้ได้ที่หน้า `ผู้ใช้งาน`

## คลัง template

ไฟล์ template และตัวอย่างของแต่ละ WP มาจากสองโฟลเดอร์ ระบบสแกนทุกครั้งที่เปิดหน้า จึงไม่ต้องรีสตาร์ตเมื่อเปลี่ยนไฟล์

- `templates-default/` — ค่าเริ่มต้นที่มากับระบบ (อยู่ใน git, `TEMPLATES_DEFAULT_DIR`) **ห้ามแก้บน server** เพราะการอัปเดต (`git pull`) จะแทนที่โฟลเดอร์นี้
- `templates/` — โฟลเดอร์ของผู้ดูแลระบบ (override, `TEMPLATES_DIR`, ค่าเริ่มต้น `./templates`) ไม่อยู่ใน git การอัปเดตไม่แตะต้อง

กติกา:

- โฟลเดอร์ที่ชื่อมี `WP` ตามด้วยเลขสองหลักพอดี (เช่น `05_WP07_Meeting Record`; `WP070` และ `XWP07` ไม่ถูกนับ) เป็นของ WP นั้น จะซ้อนอยู่ในโฟลเดอร์ phase กี่ชั้นก็ได้
- ไฟล์ที่ชื่อขึ้นต้นด้วยรหัส WP ของโฟลเดอร์นั้น เช่น `WP07_meeting_record.docx` คือ template ไฟล์อื่นในโฟลเดอร์คือตัวอย่าง ถ้า `templates/` มี template ของ WP ไหน จะใช้ไฟล์นั้นแทนค่าเริ่มต้น (ควรมีไฟล์เดียวต่อ WP; ถ้ามีหลายไฟล์ ระบบใช้ไฟล์แรกตามชื่อและเตือนในหน้า `Template`) ส่วนตัวอย่างจะรวมกันทั้งสองโฟลเดอร์ ถ้าชื่อซ้ำให้ใช้ไฟล์ใน `templates/`
- ข้ามไฟล์ที่ขึ้นต้นด้วย `.` หรือ `~$` โฟลเดอร์ที่ขึ้นต้นด้วย `.` หรือ `~$` โฟลเดอร์ย่อยของโฟลเดอร์ WP และ symlink

วิธีเปลี่ยน template: คัดลอกไฟล์จาก `templates-default/<โฟลเดอร์ WP เดียวกัน>/` ไปไว้ใน `templates/<โฟลเดอร์ที่ชื่อมีรหัส WP นั้น>/` แล้วแก้ไขที่นั่น ลบไฟล์นั้นเพื่อกลับไปใช้ค่าเริ่มต้น ผู้ใช้เห็นปุ่ม `ดาวน์โหลด template` ในหน้าเอกสารของแต่ละโครงการ ส่วนผู้ดูแลระบบดูสถานะครบ 23 WP (ป้าย `แก้ไขแล้ว` / `ค่าเริ่มต้น`) ได้ที่เมนู `Template`

Docker: image มี `templates-default/` อยู่แล้ว (`TEMPLATES_DEFAULT_DIR=/app/templates-default`) และ `docker-compose.yml` mount `./templates` ของเครื่อง host เข้า `/data/templates` แบบอ่านอย่างเดียว (`TEMPLATES_DIR` ใน container ถูกกำหนดโดย `docker-compose.yml` ไม่ต้องตั้งใน `.env`) ไฟล์และโฟลเดอร์ใน `templates/` ต้องอ่านได้โดย uid 1001 (ผู้ใช้ `app` ใน container) เช่น `chmod -R a+rX templates`

## เอกสารที่ระบบสร้างจาก template

รุ่นนี้ระบบสร้างเอกสาร **WP07 Meeting Record** (บันทึกการประชุม) จากไฟล์ template ของ WP07 โดยเติมข้อมูลจากหน้า `การประชุม` ของโครงการ

- ปุ่ม `ส่งออก docx` ในหน้าการประชุม: การประชุมที่เป็น Draft จะเติม template ใหม่ทุกครั้ง; เมื่อ PM กด `อนุมัติ` ระบบเติมแล้วเก็บไฟล์ไว้เป็นฉบับอนุมัติ การส่งออกหลังจากนั้นได้ไฟล์เดิมทุกไบต์ ไม่เปลี่ยนตาม template หรือสถานะ Task ที่แก้ภายหลัง (กด `กลับเป็น Draft` แล้วอนุมัติใหม่เพื่อสร้างฉบับใหม่)
- ปุ่ม `ดาวน์โหลด template` ของ WP07 ในหน้าเอกสารส่งไฟล์ที่เติมค่าว่างแล้ว (ตารางมีแถวเปล่า 3 แถว) สำหรับกรอกมือ

วิธีแก้ template ของ WP ที่ระบบสร้าง:

1. คัดลอก `templates-default/02_…/05_WP07_Meeting Record/WP07_meeting_record.docx` ไปไว้ที่ `templates/<โฟลเดอร์ที่ชื่อมี WP07>/` แล้วแก้ใน Word ได้ตามต้องการ (โลโก้ ชื่อบริษัท รูปแบบตัวอักษร)
2. คงเครื่องหมาย `{…}` ทุกตัวไว้ สะกดตรงตามเดิม และให้ทั้งเครื่องหมายมีรูปแบบตัวอักษรเดียวกัน
3. เปิดหน้า `Template` (`/admin/templates`) คอลัมน์ `ผลตรวจ` ต้องเป็น `ผ่าน`; ถ้า `ไม่ผ่าน` จะแสดงชื่อเครื่องหมายที่หายไป สะกดผิด หรือปิดไม่ครบ แก้แล้วกด `ตรวจอีกครั้ง` รายชื่อเครื่องหมายทั้งหมดอยู่ในการ์ด `เครื่องหมายของ WP07 Meeting Record` ใต้ตาราง

template ที่ตรวจไม่ผ่าน: การส่งออก การอนุมัติ และ `ดาวน์โหลด template` จะตอบข้อความภาษาไทยที่ระบุ WP07 และสาเหตุ ไม่ส่งไฟล์เสีย

รูปแบบเครื่องหมาย (สองแบบ):

- แถวตาราง: `{#attendees}` ในช่องแรกของแถวข้อมูลแถวเดียว … `{/attendees}` ในช่องสุดท้าย ระหว่างนั้นใช้ `{no}` `{name}` … ระบบทำซ้ำแถวนั้นตามจำนวนรายการ
- ย่อหน้ารายการ (bullet): `{-w:p accomplished}{text}{/accomplished}` ในย่อหน้าเดียว ระบบทำซ้ำย่อหน้านั้นตามจำนวนรายการ

## แผนงาน (Milestone และ Task)

หน้า `แผนงาน` ของโครงการแสดง Task เป็นตาราง (ค่าเริ่มต้น) หรือกดปุ่ม `Gantt` เพื่อดูเป็นแผนภูมิ Gantt แบบอ่านอย่างเดียว (แท่งตามแผน ความคืบหน้า วันจริง เลยกำหนด Milestone และเส้นวันนี้ เลือกมาตราส่วน `สัปดาห์` / `เดือน` ได้ ตัวกรองยังใช้ได้เหมือนเดิม)

## สำหรับนักพัฒนา

ต้องมี Node.js 22 และ Docker

```bash
npm ci
cp .env.example .env     # แล้วแก้ DATABASE_URL เป็น postgresql://esm:esm@localhost:5432/esm และตั้ง POSTGRES_PASSWORD=esm
docker compose up -d postgres   # PostgreSQL ที่ 127.0.0.1:5432 (มีฐานข้อมูล esm และ esm_test)
npm run db:migrate
SEED_ADMIN_PASSWORD=<รหัสผ่าน> npm run db:seed
npm run dev
```

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm test` | Vitest (unit/integration) บนฐานข้อมูล `esm_test` |
| `npm run test:e2e` | Playwright ทดสอบการใช้งานจริงผ่านเบราว์เซอร์ (รัน dev server ที่พอร์ต 3100 บนฐานข้อมูล `esm_test` และรีเซ็ตฐานข้อมูลนั้นทุกครั้ง) ติดตั้งเบราว์เซอร์ครั้งแรกด้วย `npx playwright install chromium` |
| `npm run screens` | Playwright เก็บภาพหน้าจอ (login, หน้าแรก, ผู้ใช้งาน, ภาพรวมโครงการ, เอกสาร, dialog; เดสก์ท็อป 1440×900 และมือถือ 390×844) ลง `docs/screenshots/ui-v2/` บนฐานข้อมูล `esm_test` ไม่รวมอยู่ใน `npm run test:e2e` |
| `npm run lint` | ESLint |
| `npm run build` | Build production |

### ธีมและสี (Bootstrap)

UI ใช้ Bootstrap 5.3 + react-bootstrap พร้อมธีมสไตล์ Material อยู่ที่ `src/styles/`:
`_variables.scss` (ตัวแปร Bootstrap), `_material.scss` (การ์ด ปุ่ม ฟอร์ม ตาราง ชิปสถานะ), `_shell.scss` (แถบด้านข้าง/แถบบน), `app.scss` (จุดรวม)
ฟอนต์ Sarabun (`@fontsource/sarabun`) และไอคอน Material Symbols (`material-symbols`) ถูกบันทึกในแพ็กเกจ ไม่เรียกทรัพยากรภายนอก

เปลี่ยนสี: แก้ค่า `$primary`, `$secondary`, `$success`, `$warning`, `$danger`, `$info` และ `$body-bg` ใน `src/styles/_variables.scss`
(สีอื่นในธีมคำนวณจากค่าเหล่านี้) แล้วรัน `npm run screens` เพื่อตรวจหน้าตาทุกหน้า

### แนวทาง UI

- ฟอร์มใน dialog: ใช้ `FormDialog` + `form-fields` (`FloatingField`, `FloatingSelect`, `FloatingTextarea`, `FileField`) ได้ label แบบลอย ข้อความผิดพลาดสไตล์เดียว (`alert alert-danger`) และปุ่ม `ยกเลิก` + ปุ่มบันทึก
- หน้าจอ: ใช้ `AppCard` + `PageHeader` เป็นโครงของทุกหน้า
- ตาราง: ใช้รูปแบบตามขนาดจอเดียวกัน คือครอบด้วย `table-responsive`, ใส่ `table-actions` ที่คอลัมน์ปุ่มจัดการ (ติดขอบขวาเมื่อเลื่อนตาราง), ซ่อนคอลัมน์รองด้วย `d-none d-md-table-cell` และใส่ `text-nowrap` ที่เซลล์ชื่อ
- ปุ่มในแถว: ใช้ `IconButton` พร้อม `aria-label`/`title` (ผ่าน prop `label`)
- สีสถานะ: ใช้ `docStatusVariant` / `projectStatusVariant` กับ `StatusChip` (หรือ `DocStatusBadge`/`ProjectStatusBadge`) แทนการกำหนดสีเอง; การประชุมใช้ `MeetingStatusBadge` และประเด็นค้างใช้ `OpenIssueStatusBadge`

### เครื่องที่สร้าง Docker network ใหม่ไม่ได้

ถ้า Docker แจ้ง `all predefined address pools have been fully subnetted` ให้ใช้ไฟล์ override
`docker-compose.local.yml` (ใช้ `network_mode: bridge` และให้แอปเชื่อมต่อฐานข้อมูลผ่าน `host.docker.internal`)
**ใช้เฉพาะเครื่องพัฒนา ไม่ใช่เซิร์ฟเวอร์จริง**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build   # รวมแอป
```
