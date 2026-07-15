/**
 * July 2026 dual-nurse simulation (schedule, leave, clock)
 * Run: node scripts/seed-july-simulation.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const YEAR = 2026;
const MONTH = 7;
const CLINIC_SEED_ID = "11111111-1111-1111-1111-111111111111";
const NURSE_A_ID = "22222222-2222-2222-2222-222222222201";
const NURSE_B_ID = "22222222-2222-2222-2222-222222222202";
const LEAVE_WANG = ["2026-07-08", "2026-07-09"];
const LEAVE_LI = ["2026-07-15"];
const DEMO_CLOCK_IDS = [
  "66666666-6666-6666-6666-666666660701",
  "66666666-6666-6666-6666-666666660702",
  "66666666-6666-6666-6666-666666661401",
  "66666666-6666-6666-6666-666666661402",
  "66666666-6666-6666-6666-666666661403",
  "66666666-6666-6666-6666-666666661404",
];

const GOLDEN = {
  MORNING_IN: "08:20",
  MORNING_OUT: "12:00",
  EVENING_IN: "16:00",
  EVENING_OUT: "20:00",
};

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function formatTaipeiDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseTaipeiDate(dateStr) {
  return new Date(`${dateStr}T12:00:00+08:00`);
}

function addDays(dateStr, days) {
  const base = parseTaipeiDate(dateStr);
  base.setTime(base.getTime() + days * 86_400_000);
  return formatTaipeiDate(base);
}

function addMonths(dateStr, months) {
  const d = parseTaipeiDate(dateStr);
  const next = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  return formatTaipeiDate(next);
}

function addYears(dateStr, years) {
  return addMonths(dateStr, years * 12);
}

function getEntitledDays(completedYears) {
  if (completedYears < 1) return 3;
  if (completedYears === 1) return 7;
  if (completedYears === 2) return 10;
  if (completedYears === 3 || completedYears === 4) return 14;
  if (completedYears >= 5 && completedYears <= 9) return 15;
  return Math.min(30, 15 + (completedYears - 9));
}

function resolveCurrentLeavePeriod(arrivalDate, asOfDate) {
  const asOf = asOfDate ?? formatTaipeiDate(new Date());
  const sixMonthMark = addMonths(arrivalDate, 6);
  if (asOf < sixMonthMark) return null;

  for (let completedYears = 0; completedYears <= 40; completedYears++) {
    const periodStart =
      completedYears === 0 ? sixMonthMark : addYears(arrivalDate, completedYears);
    const nextAnniversary = addYears(arrivalDate, completedYears + 1);
    const expiryDate = addDays(nextAnniversary, -1);
    const totalDays = getEntitledDays(completedYears);
    if (asOf >= periodStart && asOf <= expiryDate) {
      return { periodStart, periodEnd: expiryDate, expiryDate, totalDays };
    }
  }
  return null;
}

function weekdayDates(year, month) {
  const dates = [];
  const d = new Date(`${year}-${String(month).padStart(2, "0")}-01T12:00:00+08:00`);
  while (d.getMonth() + 1 === month) {
    const iso = formatTaipeiDate(d);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) dates.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function toTaipeiIso(workDate, time) {
  const t = time.length >= 5 ? time.slice(0, 5) : time;
  return new Date(`${workDate}T${t}:00+08:00`).toISOString();
}

async function ensureShiftType(supabase, clinicId, slot) {
  const { data: existing } = await supabase
    .from("shift_types")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("code", slot.code)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("shift_types")
      .update({
        name: slot.name,
        category: slot.category,
        default_clock_in: slot.default_clock_in,
        default_clock_out: slot.default_clock_out,
        planned_hours: slot.planned_hours,
        color_hex: slot.color_hex,
        sort_order: slot.sort_order,
        is_active: true,
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("shift_types")
    .insert({ ...slot, clinic_id: clinicId, is_active: true })
    .select("id")
    .single();

  if (error) throw new Error(`shift_types ${slot.code}: ${error.message}`);
  return created.id;
}

async function ensureEmployee(supabase, row) {
  let payload = { ...row };
  let { data, error } = await supabase
    .from("employees")
    .upsert(payload, { onConflict: "id" })
    .select("id, name, employee_no, hire_date")
    .single();

  if (error?.message.includes("arrival_date")) {
    const { arrival_date: _a, ...rest } = row;
    ({ data, error } = await supabase
      .from("employees")
      .upsert(rest, { onConflict: "id" })
      .select("id, name, employee_no, hire_date")
      .single());
  }

  if (error) throw new Error(`employees ${row.name}: ${error.message}`);
  return data;
}

async function ensureSchedule(supabase, clinicId) {
  const { data: existing } = await supabase
    .from("schedules")
    .select("id, status")
    .eq("clinic_id", clinicId)
    .eq("year", YEAR)
    .eq("month", MONTH)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("schedules")
    .insert({ clinic_id: clinicId, year: YEAR, month: MONTH, status: "draft" })
    .select("id, status")
    .single();

  if (error) throw new Error(`schedules: ${error.message}`);
  return data;
}

async function upsertAssignment(supabase, payload) {
  const { data: existing } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("employee_id", payload.employee_id)
    .eq("work_date", payload.work_date)
    .eq("shift_type_id", payload.shift_type_id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("shift_assignments").update(payload).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("shift_assignments")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new Error(`assignment ${payload.work_date}: ${error.message}`);
  return data.id;
}

async function findMorningAssignmentId(supabase, employeeId, workDate, morningShiftTypeId) {
  const { data } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .eq("shift_type_id", morningShiftTypeId)
    .maybeSingle();
  return data?.id ?? null;
}

async function upsertClock(supabase, payload) {
  const { id, clock_date: _cd, ...rest } = payload;
  const earlyKeys = [
    "is_early",
    "early_minutes",
    "payable_clocked_at",
    "is_early_abnormal",
    "early_work_approved",
    "early_reviewed_by",
    "early_reviewed_at",
  ];
  const bodies = [{ id, ...rest }];
  const minimal = { id, ...rest };
  for (const k of earlyKeys) delete minimal[k];
  bodies.push(minimal);

  for (const body of bodies) {
    const { error } = await supabase.from("clock_records").upsert(body, { onConflict: "id" });
    if (!error) return;
    const msg = error.message ?? "";
    if (msg.includes("is_early") || msg.includes("early_minutes") || msg.includes("payable_clocked_at")) {
      continue;
    }
    throw new Error(`clock ${payload.clock_type} ${payload.clocked_at}: ${msg}`);
  }
}

async function countAnnualLeaveUsed(supabase, employeeId, periodStart, periodEnd) {
  const { data, error } = await supabase
    .from("shift_assignments")
    .select("work_date, shift_types(code)")
    .eq("employee_id", employeeId)
    .gte("work_date", periodStart)
    .lte("work_date", periodEnd)
    .neq("status", "cancelled");

  if (error) throw new Error(error.message);

  let days = 0;
  for (const row of data ?? []) {
    const st = Array.isArray(row.shift_types) ? row.shift_types[0] : row.shift_types;
    if (st?.code === "ANNUAL_LEAVE") days += 1;
  }
  return days;
}

async function syncLeaveRecord(supabase, employeeId, arrivalDate, asOfDate) {
  const period = resolveCurrentLeavePeriod(arrivalDate, asOfDate);
  if (!period) {
    console.log(`   skip leave sync ${employeeId}: before 6-month mark`);
    return;
  }

  const usedDays = await countAnnualLeaveUsed(
    supabase,
    employeeId,
    period.periodStart,
    period.periodEnd
  );

  const { error } = await supabase.from("annual_leave_records").upsert(
    {
      employee_id: employeeId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      expiry_date: period.expiryDate,
      total_days: period.totalDays,
      used_days: usedDays,
      note: "July 2026 demo seed",
    },
    { onConflict: "employee_id,period_start" }
  );

  if (error?.message.includes("annual_leave_records")) {
    console.log("   warn: annual_leave_records table missing (migration 008)");
    return;
  }
  if (error) throw new Error(error.message);
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and ANON/SERVICE KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);
const asOf = "2026-07-14";

console.log("July 2026 simulation seed starting...\n");

await supabase.from("clock_records").delete().in("id", DEMO_CLOCK_IDS);

const { data: clinicRow, error: clinicErr } = await supabase
  .from("clinics")
  .select("id, name")
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();

if (clinicErr || !clinicRow) {
  console.error("No clinic:", clinicErr?.message ?? "empty");
  process.exit(1);
}

let clinicId = clinicRow.id;
let clinicName = clinicRow.name;
console.log(`Clinic: ${clinicName} (${clinicId})`);

const { data: seedClinic } = await supabase
  .from("clinics")
  .select("id, name")
  .eq("id", CLINIC_SEED_ID)
  .maybeSingle();
if (seedClinic) {
  clinicId = seedClinic.id;
  clinicName = seedClinic.name;
}

const shiftSlots = [
  {
    code: "MORNING",
    name: "早診",
    category: "morning",
    default_clock_in: GOLDEN.MORNING_IN,
    default_clock_out: GOLDEN.MORNING_OUT,
    planned_hours: 3.67,
    color_hex: "#F59E0B",
    sort_order: 1,
  },
  {
    code: "EVENING",
    name: "晚診",
    category: "evening",
    default_clock_in: GOLDEN.EVENING_IN,
    default_clock_out: GOLDEN.EVENING_OUT,
    planned_hours: 3.67,
    color_hex: "#8B5CF6",
    sort_order: 2,
  },
  {
    code: "ANNUAL_LEAVE",
    name: "特休",
    category: "custom",
    default_clock_in: null,
    default_clock_out: null,
    planned_hours: 0,
    color_hex: "#10B981",
    sort_order: 12,
  },
];

const shiftIds = {};
for (const slot of shiftSlots) {
  shiftIds[slot.code] = await ensureShiftType(supabase, clinicId, slot);
}

const nurseA = await ensureEmployee(supabase, {
  id: NURSE_A_ID,
  clinic_id: clinicId,
  employee_no: "N001",
  name: "王護理師",
  role: "nurse",
  hire_date: "2024-01-01",
  hourly_wage: 220,
  labor_insurance_self_pay: 1100,
  health_insurance_self_pay: 450,
  status: "active",
});

const nurseB = await ensureEmployee(supabase, {
  id: NURSE_B_ID,
  clinic_id: clinicId,
  employee_no: "N002",
  name: "李護理師",
  role: "nurse",
  hire_date: "2024-06-01",
  hourly_wage: 200,
  labor_insurance_self_pay: 950,
  health_insurance_self_pay: 400,
  status: "active",
});

console.log(`Nurses: ${nurseA.name} (${nurseA.employee_no}), ${nurseB.name} (${nurseB.employee_no})`);
console.log(`Leave: Wang ${LEAVE_WANG.join(", ")}; Li ${LEAVE_LI.join(", ")}`);

const schedule = await ensureSchedule(supabase, clinicId);
console.log(`Schedule ${YEAR}-${MONTH}: ${schedule.id} (${schedule.status})`);

const weekdays = weekdayDates(YEAR, MONTH);
for (const date of weekdays) {
  if (LEAVE_WANG.includes(date)) {
    await upsertAssignment(supabase, {
      schedule_id: schedule.id,
      employee_id: nurseA.id,
      shift_type_id: shiftIds.ANNUAL_LEAVE,
      work_date: date,
      expected_clock_in: "00:00",
      expected_clock_out: "00:00",
      status: "scheduled",
      note: "特休（模擬）",
    });
  } else {
    await upsertAssignment(supabase, {
      schedule_id: schedule.id,
      employee_id: nurseA.id,
      shift_type_id: shiftIds.MORNING,
      work_date: date,
      expected_clock_in: GOLDEN.MORNING_IN,
      expected_clock_out: GOLDEN.MORNING_OUT,
      status: "scheduled",
    });
  }

  if (LEAVE_LI.includes(date)) {
    await upsertAssignment(supabase, {
      schedule_id: schedule.id,
      employee_id: nurseB.id,
      shift_type_id: shiftIds.ANNUAL_LEAVE,
      work_date: date,
      expected_clock_in: "00:00",
      expected_clock_out: "00:00",
      status: "scheduled",
      note: "特休（模擬）",
    });
  } else {
    await upsertAssignment(supabase, {
      schedule_id: schedule.id,
      employee_id: nurseB.id,
      shift_type_id: shiftIds.MORNING,
      work_date: date,
      expected_clock_in: GOLDEN.MORNING_IN,
      expected_clock_out: GOLDEN.MORNING_OUT,
      status: "scheduled",
    });
  }
}

console.log(`Weekday assignments: ${weekdays.length} days x 2 nurses`);

const assignmentWang714 = await findMorningAssignmentId(
  supabase,
  nurseA.id,
  "2026-07-14",
  shiftIds.MORNING
);
const assignmentWang707 = await findMorningAssignmentId(
  supabase,
  nurseA.id,
  "2026-07-07",
  shiftIds.MORNING
);
const assignmentLi714 = await findMorningAssignmentId(
  supabase,
  nurseB.id,
  "2026-07-14",
  shiftIds.MORNING
);

const expectedMorning714 = toTaipeiIso("2026-07-14", GOLDEN.MORNING_IN);
const clockedInWang714 = toTaipeiIso("2026-07-14", "07:40");

await upsertClock(supabase, {
  id: DEMO_CLOCK_IDS[2],
  employee_id: nurseA.id,
  assignment_id: assignmentWang714,
  clock_type: "clock_in",
  clocked_at: clockedInWang714,
  validation: "valid",
  source: "admin_manual",
  is_late: false,
  late_minutes: 0,
  expected_at: expectedMorning714,
  is_early: true,
  early_minutes: 40,
  payable_clocked_at: expectedMorning714,
  is_early_abnormal: true,
  early_work_approved: false,
  note: "【模擬】王護理師 07-14 異常提早 40 分",
});

await upsertClock(supabase, {
  id: DEMO_CLOCK_IDS[3],
  employee_id: nurseA.id,
  assignment_id: assignmentWang714,
  clock_type: "clock_out",
  clocked_at: toTaipeiIso("2026-07-14", "12:05"),
  validation: "valid",
  source: "admin_manual",
  is_late: false,
  late_minutes: 0,
  expected_at: toTaipeiIso("2026-07-14", GOLDEN.MORNING_OUT),
  is_early: false,
  early_minutes: 0,
  is_early_abnormal: false,
  early_work_approved: false,
  note: "【模擬】王護理師 07-14 下班",
});

await upsertClock(supabase, {
  id: DEMO_CLOCK_IDS[4],
  employee_id: nurseB.id,
  assignment_id: assignmentLi714,
  clock_type: "clock_in",
  clocked_at: toTaipeiIso("2026-07-14", "08:18"),
  validation: "valid",
  source: "admin_manual",
  is_late: false,
  late_minutes: 0,
  expected_at: expectedMorning714,
  is_early: true,
  early_minutes: 2,
  payable_clocked_at: expectedMorning714,
  is_early_abnormal: false,
  early_work_approved: false,
  note: "【模擬】李護理師 07-14 正常上班",
});

await upsertClock(supabase, {
  id: DEMO_CLOCK_IDS[5],
  employee_id: nurseB.id,
  assignment_id: assignmentLi714,
  clock_type: "clock_out",
  clocked_at: toTaipeiIso("2026-07-14", "12:00"),
  validation: "valid",
  source: "admin_manual",
  is_late: false,
  late_minutes: 0,
  expected_at: toTaipeiIso("2026-07-14", GOLDEN.MORNING_OUT),
  is_early: false,
  early_minutes: 0,
  is_early_abnormal: false,
  early_work_approved: false,
  note: "【模擬】李護理師 07-14 正常下班",
});

await upsertClock(supabase, {
  id: DEMO_CLOCK_IDS[0],
  employee_id: nurseA.id,
  assignment_id: assignmentWang707,
  clock_type: "clock_in",
  clocked_at: toTaipeiIso("2026-07-07", "08:18"),
  validation: "valid",
  source: "admin_manual",
  is_late: false,
  late_minutes: 0,
  expected_at: toTaipeiIso("2026-07-07", GOLDEN.MORNING_IN),
  is_early: true,
  early_minutes: 2,
  payable_clocked_at: toTaipeiIso("2026-07-07", GOLDEN.MORNING_IN),
  is_early_abnormal: false,
  early_work_approved: false,
  note: "【模擬】王護理師 07-07 請假前正常日",
});

await upsertClock(supabase, {
  id: DEMO_CLOCK_IDS[1],
  employee_id: nurseA.id,
  assignment_id: assignmentWang707,
  clock_type: "clock_out",
  clocked_at: toTaipeiIso("2026-07-07", "12:00"),
  validation: "valid",
  source: "admin_manual",
  is_late: false,
  late_minutes: 0,
  expected_at: toTaipeiIso("2026-07-07", GOLDEN.MORNING_OUT),
  is_early: false,
  early_minutes: 0,
  is_early_abnormal: false,
  early_work_approved: false,
  note: "【模擬】王護理師 07-07 下班",
});

console.log("Clock records: 6 (07-07 Wang, 07-14 Wang early + Li normal)");

await syncLeaveRecord(supabase, nurseA.id, "2024-01-01", asOf);
await syncLeaveRecord(supabase, nurseB.id, "2024-06-01", asOf);
console.log("Annual leave records synced");

const base = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
console.log("\nDone. Open:");
console.log(`  ${base}/leave`);
console.log(`  ${base}/schedules?year=${YEAR}&month=${MONTH}`);
console.log(`  ${base}/clock-records?date=2026-07-14`);
console.log(`  ${base}/payroll?year=${YEAR}&month=${MONTH}`);



