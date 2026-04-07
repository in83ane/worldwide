# ระบบจัดการตารางงาน (Work Management System)

## 1. ภาพรวมระบบ

โปรเจกต์นี้เป็น **แอปพลิเคชันจัดการตารางงาน** สำหรับพนักงานที่ต้องออกไปทำงานนอกสถานที่ มีฟีเจอร์หลักคือ:
- **ปฏิทินงาน** - ดูงานในมุมมองรายเดือนและรายวัน
- **แผนที่เส้นทาง** - คำนวณเส้นทางที่เหมาะสมที่สุดจากจุดเริ่มต้นไปทุกหน่วยงาน
- **จัดการพนักงาน** - เพิ่ม/ลบ/แก้ไขพนักงาน
- **ระบบยืนยันงาน** - ถ่ายรูปยืนยันการเริ่มและเสร็จงาน

**เทคโนโลยีที่ใช้:**
- Next.js 16 + React 19
- TypeScript
- Supabase (Database + Auth + Storage)
- Leaflet.js (แผนที่)
- Tailwind CSS

---

## 2. สถาปัตยกรรมระบบ (System Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │  Calendar   │  │  Map Page   │  │  Employee Mgmt      │   │
│  │  (page.tsx) │  │ (page.tsx)  │  │  (page.tsx)         │   │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │
│         │                │                    │              │
│         └────────────────┼────────────────────┘              │
│                          │                                   │
│  ┌───────────────────────┴───────────────────────┐           │
│  │           Supabase Client (@/lib/supabase)   │           │
│  │  - createClient() สำหรับ Client-side          │           │
│  └───────────────────────┬───────────────────────┘           │
└──────────────────────────┼───────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────┐
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐     │
│  │              Supabase (Backend)                      │     │
│  │  ┌──────────────┐ ┌──────────┐ ┌─────────────────┐  │     │
│  │  │  PostgreSQL  │ │   Auth   │ │     Storage     │  │     │
│  │  │  (Database)  │ │(JWT/SSR) │ │  (work-photos)  │  │     │
│  │  └──────────────┘ └──────────┘ └─────────────────┘  │     │
│  └─────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. ฟีเจอร์หลักและอัลกอริทึม

### 3.1 ระบบ Authentication (middleware.ts)

**หน้าที่:** ตรวจสอบสิทธิ์ก่อนเข้าถึงหน้าต่างๆ

**Algorithm:**
```typescript
// ลำดับการตรวจสอบ:
1. สร้าง Supabase Server Client ด้วย cookies
2. ดึงข้อมูล user จาก supabase.auth.getUser()
3. ถ้าไม่มี user + พยายามเข้าหน้าที่ต้อง login → redirect ไป /auth/login
4. ถ้ามี user แล้ว:
   - เช็ค role จาก profiles table
   - ถ้าไม่ใช่ admin แต่พยายามเข้าหน้า admin → redirect ไป /home
   - ถ้า login อยู่แล้วพยายามเข้า login → redirect ไป /home
```

**Code:**
```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const supabase = createServerClient(...)
  const { data: { user } } = await supabase.auth.getUser()
  
  // Admin paths vs User paths
  const adminOnlyPaths = ['/employees', '/departments', '/price']
  const userPaths = ['/home', '/calendar', '/settings', '/map']
  
  // Check permissions...
}
```

---

### 3.2 ระบบจัดเส้นทางบนแผนที่ (Map + Route Optimization)

**ไฟล์ที่เกี่ยวข้อง:**
- `map/page.tsx` - UI และ State Management
- `map/MapComponent.tsx` - แสดงผลแผนที่
- `map/routeUtils.ts` - อัลกอริทึมคำนวณเส้นทาง

#### อัลกอริทึม 1: Haversine Distance
คำนวณระยะทางระหว่างจุดสองจุดบนพื้นผิวโลก (โลกเป็นทรงกลม)

**หลักการ:**
- ใช้สูตร Haversine คำนวณระยะทางจากพิกัดละติจูด/ลองจิจูด
- R = 6371 km (รัศมีโลก)

**Code:**
```typescript
// routeUtils.ts บรรทัด 10-20
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371; // รัศมีโลกเป็นกิโลเมตร
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;  // ความต่างละติจูด
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;  // ความต่างลองจิจูด
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
```

#### อัลกอริทึม 2: Group By Time Window
จัดกลุ่มงานตามช่วงเวลา (90 นาที)

**หลักการ:**
- เรียงงานตามเวลา work_time จากน้อยไปมาก
- ถ้างานถัดไปห่างกันไม่เกิน 90 นาที → อยู่กลุ่มเดียวกัน
- ถ้าเกิน 90 นาที → สร้างกลุ่มใหม่

**Code:**
```typescript
// routeUtils.ts บรรทัด 39-52
const TIME_WINDOW_MIN = 90; // 1 ชั่วโมง 30 นาที

function groupByTimeWindow(tasks: MapTask[]): MapTask[][] {
  const sorted = [...tasks].sort(
    (a, b) => timeToMinutes(a.work_time) - timeToMinutes(b.work_time)
  );
  const groups: MapTask[][] = [];
  let current: MapTask[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const diff = timeToMinutes(sorted[i].work_time) - timeToMinutes(sorted[i - 1].work_time);
    if (diff <= TIME_WINDOW_MIN) current.push(sorted[i]);
    else { groups.push(current); current = [sorted[i]]; }
  }
  groups.push(current);
  return groups;
}
```

#### อัลกอริทึม 3: Nearest Neighbor
หาเส้นทางที่สั้นที่สุดในแต่ละกลุ่ม (Greedy Algorithm)

**หลักการ:**
- เริ่มจากตำแหน่งปัจจุบัน
- หางานที่ใกล้ที่สุด → ไปงานนั้น → ทำซ้ำจนกว่าจะครบ
- เป็น Greedy Algorithm (ไม่ใช่ optimal แต่เร็วและใช้งานได้จริง)

**Code:**
```typescript
// routeUtils.ts บรรทัด 22-37
function nearestNeighbor(from: [number, number], group: MapTask[]): MapTask[] {
  const remaining = [...group];  // งานที่เหลือ
  const result: MapTask[] = [];
  let cur = from;  // ตำแหน่งปัจจุบัน
  
  while (remaining.length > 0) {
    let bestIdx = 0, bestDist = Infinity;
    
    // หางานที่ใกล้ที่สุด
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(cur, [remaining[i].lat, remaining[i].lng]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    
    result.push(remaining[bestIdx]);
    cur = [remaining[bestIdx].lat, remaining[bestIdx].lng];
    remaining.splice(bestIdx, 1);  // ลบงานที่เลือกออก
  }
  return result;
}
```

#### อัลกอริทึม 4: รวมทุกอย่างเข้าด้วยกัน

**Flow หลัก:**
```
จุดเริ่มต้น
    ↓
จัดกลุ่มงานตามช่วงเวลา (90 นาที)
    ↓
สำหรับแต่ละกลุ่ม:
    → ใช้ Nearest Neighbor หาเส้นทาง
    → อัปเดตตำแหน่งปัจจุบันเป็นจุดสุดท้ายของกลุ่ม
    ↓
รวมผลทุกกลุ่ม → ได้ลำดับงานที่เหมาะสมที่สุด
```

**Code:**
```typescript
// routeUtils.ts บรรทัด 54-67
export function orderTasksWithTime(
  start: [number, number], 
  tasks: MapTask[]
): MapTask[] {
  if (tasks.length === 0) return [];
  if (tasks.length === 1) return tasks;
  
  const groups = groupByTimeWindow(tasks);  // แบ่งกลุ่มตามเวลา
  const ordered: MapTask[] = [];
  let curPos = start;
  
  for (const group of groups) {
    const optimized = nearestNeighbor(curPos, group);  // หาเส้นทางในกลุ่ม
    ordered.push(...optimized);
    const last = optimized[optimized.length - 1];
    curPos = [last.lat, last.lng];  // อัปเดตตำแหน่งสุดท้าย
  }
  return ordered;
}
```

#### อัลกอริทึม 5: ดึงเส้นทางจริงจาก OSRM

**หลักการ:**
- ใช้ Open Source Routing Machine (OSRM) API
- ส่งพิกัด waypoint ทั้งหมด
- ได้รับเส้นทางจริงบนถนนกลับมา

**Code:**
```typescript
// MapComponent.tsx บรรทัด 152-169
async function fetchOSRMRoute(waypoints: [number, number][]): Promise<[number, number][]> {
  if (waypoints.length < 2) return [];
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
  );
  const data = await res.json();
  
  if (data.code === 'Ok' && data.routes?.[0]) {
    // แปลงจาก [lng, lat] → [lat, lng]
    return data.routes[0].geometry.coordinates.map(
      (c: [number, number]): [number, number] => [c[1], c[0]]
    );
  }
  return waypoints; // fallback เส้นตรง
}
```

---

### 3.3 ระบบปฏิทิน (Calendar)

**ไฟล์:** `calendar/page.tsx`

#### อัลกอริทึมการแสดงปฏิทิน

**1. คำนวณวันในเดือน:**
```typescript
// บรรทัด 256-260
const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
const offset = firstDay === 0 ? 6 : firstDay - 1; // ปรับให้เริ่มจันทร์
```

**2. กรองงานตามวันที่:**
```typescript
// บรรทัด 266
const dayWorks = workSchedules.filter(
  w => w.startDate.toDateString() === dateObj.toDateString() 
    && w.status !== 'complete'
);
```

**3. จัดกลุ่มงานที่ซ้ำกัน:**
```typescript
// บรรทัด 270-275
const uniqueJobs: Record<string, WorkSchedule[]> = {};
dayWorks.forEach(work => {
    const jobKey = `${work.work_time}-${work.department}-${work.detail}`;
    if (!uniqueJobs[jobKey]) uniqueJobs[jobKey] = [];
    uniqueJobs[jobKey].push(work);
});
```

**4. Timeline View (Desktop):**
- แสดงงานแบบ Gantt Chart
- คำนวณตำแหน่ง left ตามชั่วโมง

```typescript
// บรรทัด 439-448
const leftPos = ((work.startTime.getHours() - 8) * hourWidth) + 
                (work.startTime.getMinutes() / 60 * hourWidth);
```

**5. Animation Status:**
- Overdue (เกินเวลา): กระพริบสีแดง
- In Progress: กระพริบสีเหลือง

```typescript
// บรรทัด 45-55
@keyframes pulse-red-dynamic {
  0%, 100% { background-color: var(--dept-color); }
  50% { background-color: #ef4444; }
}
```

---

### 3.4 ระบบอัปโหลดรูปยืนยันงาน

**ไฟล์:**
- `PhotoUploadModal.tsx` - UI สำหรับถ่าย/อัปโหลดรูป
- `lib/uploadWorkPhoto.ts` - ฟังก์ชันอัปโหลด

**Algorithm:**

**1. ตั้งชื่อไฟล์แบบ Unique:**
```typescript
// uploadWorkPhoto.ts บรรทัด 16-18
const ext = file.name.split('.').pop() ?? 'jpg';
const filename = `${workId}_${type}_${Date.now()}.${ext}`;
// ตัวอย่าง: work_123_start_1699123456789.jpg
```

**2. อัปโหลดไป Supabase Storage:**
```typescript
// uploadWorkPhoto.ts บรรทัด 20-27
const { error: uploadError } = await supabase.storage
  .from('work-photos')
  .upload(path, file, { 
    upsert: true,           // อัปเดทถ้ามีอยู่แล้ว
    contentType: file.type   // เก็บ MIME type
  });

// ดึง Public URL
const { data } = supabase.storage.from('work-photos').getPublicUrl(path);
return data.publicUrl;
```

**3. อัปเดทสถานะงานพร้อมรูป:**
```typescript
// calendar/page.tsx บรรทัด 234-244
const status = mode === 'start' ? 'inprogress' : 'complete';
const updateData: Record<string, string> = { status };

if (mode === 'start') {
    updateData.started_at = new Date().toISOString();
    updateData.start_photo_url = photoUrl;
} else {
    updateData.completed_at = new Date().toISOString();
    updateData.complete_photo_url = photoUrl;
}

await supabase.from("work_schedule").update(updateData).in("id", ids);
```

---

### 3.5 ระบบจัดการพนักงาน (Employee Management)

**ไฟล์:** `employees/api/route.ts`

**Algorithm:**

ใช้ Supabase Service Role Key เพื่อจัดการ user โดยตรง

**1. สร้าง User ใหม่:**
```typescript
// POST: สร้าง employee
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,      // ยืนยันอีเมลอัตโนมัติ
  user_metadata: { full_name: name },
});
```

**2. ลบ User:**
```typescript
// DELETE: ลบ employee
const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
```

**3. รีเซ็ตรหัสผ่าน:**
```typescript
// PATCH: รีเซ็ตรหัสผ่าน
const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
  userId, 
  { password: newPassword }
);
```

---

## 4. Data Flow สำคัญ

### 4.1 การโหลดงานบนแผนที่

```
User เลือกพนักงาน
    ↓
Fetch work_schedule จาก Supabase
    ↓
กรองเฉพาะงานวันนี้ (todayStr())
    ↓
แปลงเป็น MapTask (lat, lng, status, etc.)
    ↓
ส่งไป MapComponent
    ↓
คำนวณเส้นทางด้วย orderTasksWithTime()
    ↓
เรียก OSRM API ดึงเส้นทางจริง
    ↓
แสดงผล: Markers + Polyline (เส้นสีฟ้า/สีส้ม)
```

### 4.2 การอัปเดทสถานะงาน

```
User กด "เริ่มงาน" / "เสร็จสิ้น"
    ↓
เปิด PhotoUploadModal
    ↓
User ถ่าย/อัปโหลดรูป
    ↓
uploadWorkPhoto() → Supabase Storage
    ↓
ได้ Public URL กลับมา
    ↓
อัปเดท work_schedule:
    - status: 'inprogress' | 'complete'
    - started_at | completed_at: ISO timestamp
    - start_photo_url | complete_photo_url: URL
    ↓
Refresh ข้อมูลบนหน้า
```

---

## 5. Database Schema (ที่สำคัญ)

### work_schedule (ตารางหลัก)
```typescript
{
  id: string;                    // UUID
  work_date: string;             // วันที่เริ่ม (YYYY-MM-DD)
  end_date: string | null;       // วันที่จบ (null = งานวันเดียว)
  work_time: string;             // เวลา (HH:MM)
  worker: string;                // ชื่อพนักงาน
  worker_role: string;           // แผนก (comma-separated)
  detail: string;                // รายละเอียดงาน
  department: string;            // สถานที่/หน่วยงาน
  status: 'pending' | 'inprogress' | 'complete';
  lat: number | null;            // ละติจูด
  lng: number | null;            // ลองจิจูด
  started_at: string | null;     // เวลาเริ่มงานจริง (ISO)
  completed_at: string | null;   // เวลาจบงานจริง (ISO)
  employee_ids: string[];        // ID พนักงานที่ได้รับมอบหมาย
  start_photo_url: string | null;
  complete_photo_url: string | null;
}
```

### employees
```typescript
{
  id: string;
  user_id: string;       // เชื่อมกับ auth.users
  name: string;
  department_id: string;
  is_active: boolean;
  image_url: string | null;
}
```

---

## 6. สรุปอัลกอริทึมที่ใช้

| ฟีเจอร์ | อัลกอริทึม | Complexity | ไฟล์ |
|---------|-----------|------------|------|
| คำนวณระยะทาง | Haversine Formula | O(1) | routeUtils.ts:10 |
| จัดกลุ่มงานตามเวลา | Sort + Greedy | O(n log n) | routeUtils.ts:39 |
| หาเส้นทาง | Nearest Neighbor | O(n²) | routeUtils.ts:22 |
| ดึงเส้นทางจริง | OSRM API | External | MapComponent.tsx:152 |
| ค้นหาสถานที่ | Longdo Map Search | External | map/page.tsx:62 |
| แสดงปฏิทิน | Calendar Math | O(1) | calendar/page.tsx:256 |

---

## 7. จุดเด่นของระบบ

1. **Route Optimization** - ใช้ Nearest Neighbor + Time Window ช่วยให้พนักงานเดินทางสั้นที่สุด
2. **Real-time GPS** - แสดงตำแหน่งผู้ใช้บนแผนที่ + นำทางไป Google Maps
3. **Photo Proof** - ถ่ายรูปยืนยันการทำงาน มี timestamp อัตโนมัติ
4. **Multi-day Jobs** - รองรับงานที่ยาวหลายวัน
5. **Role-based Access** - Admin vs User มีสิทธิ์ต่างกัน
6. **Responsive Design** - รองรับทั้ง Mobile และ Desktop
