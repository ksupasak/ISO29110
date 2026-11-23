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

แอปจะรัน migration ฐานข้อมูลให้อัตโนมัติเมื่อเริ่ม ข้อมูลใน volume `pgdata` และ `files` ไม่หาย
**ห้ามใช้ `docker compose down -v`** เพราะจะลบข้อมูลทั้งหมด (ใช้ `docker compose down` ได้)

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
| `npm run lint` | ESLint |
| `npm run build` | Build production |

### เครื่องที่สร้าง Docker network ใหม่ไม่ได้

ถ้า Docker แจ้ง `all predefined address pools have been fully subnetted` ให้ใช้ไฟล์ override
`docker-compose.local.yml` (ใช้ `network_mode: bridge` และให้แอปเชื่อมต่อฐานข้อมูลผ่าน `host.docker.internal`)
**ใช้เฉพาะเครื่องพัฒนา ไม่ใช่เซิร์ฟเวอร์จริง**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build   # รวมแอป
```
