import {
  GOLDEN_SCHEDULE,
  getDayOfWeekTaipei,
  getISOWeek,
  getTrackForEmployeeA,
  getTrackForEmployeeB,
  isDualClinicDay,
  isHalfClinicDay,
  type RotationTrack,
} from "@/lib/shift-templates";
import { formatWorkDate } from "@/types/schedule";
import type { ScheduleRotationMode } from "@/lib/schedules/golden-config";
import { normalizeScheduleMode } from "@/lib/schedules/golden-config";

export interface GoldenRotationConfig {
  mode?: ScheduleRotationMode;
  employeeAId: string;
  employeeBId: string;
  employeeCId?: string;
  oddWeekTrackForA?: RotationTrack;
}

export interface GeneratedAssignment {
  workDate: string;
  employeeId: string;
  shiftCode: string;
  expectedClockIn: string;
  expectedClockOut: string;
  plannedHours: number;
  label: string;
}

export interface ShiftTypeRef {
  id: string;
  code: string;
  default_clock_in: string | null;
  default_clock_out: string | null;
  planned_hours: number;
}

/** 三人制角色：1 完美週末／2 週三充電／3 全勤支援 */
export type TripleRole = 1 | 2 | 3;

export function generateGoldenMonthSchedule(
  year: number,
  month: number,
  daysInMonth: number,
  config: GoldenRotationConfig,
  shiftTypes: ShiftTypeRef[]
): GeneratedAssignment[] {
  const mode = normalizeScheduleMode(config.mode);
  if (mode === "triple") {
    if (!config.employeeCId) return [];
    return generateTripleMonthSchedule(year, month, daysInMonth, config, shiftTypes);
  }
  return generateDualMonthSchedule(year, month, daysInMonth, config, shiftTypes);
}

/** 模式 A：雙人制（isoWeek % 2 對調） */
function generateDualMonthSchedule(
  year: number,
  month: number,
  daysInMonth: number,
  config: GoldenRotationConfig,
  shiftTypes: ShiftTypeRef[]
): GeneratedAssignment[] {
  const { employeeAId, employeeBId, oddWeekTrackForA = 1 } = config;
  const byCode = Object.fromEntries(shiftTypes.map((s) => [s.code, s]));
  const results: GeneratedAssignment[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const workDate = formatWorkDate(year, month, day);
    const dow = getDayOfWeekTaipei(workDate);
    const aTrack = getTrackForEmployeeA(workDate, oddWeekTrackForA);
    const bTrack = getTrackForEmployeeB(workDate, oddWeekTrackForA);

    if (dow === 5) {
      results.push(
        ...fridayAssignmentsDual(workDate, employeeAId, employeeBId, aTrack, byCode)
      );
      continue;
    }

    if (isDualClinicDay(dow)) {
      results.push(...dualDayAssignments(workDate, employeeAId, employeeBId, byCode));
      continue;
    }

    if (isHalfClinicDay(dow)) {
      results.push(
        ...halfClinicDayAssignments(
          workDate,
          dow,
          employeeAId,
          employeeBId,
          aTrack,
          bTrack,
          byCode
        )
      );
    }
  }

  return results;
}

/**
 * 模式 B：三人三週輪替（isoWeek % 3）
 * - 週一／二／四／五：早午晚各 2 人
 * - 週三：僅早午診各 2 人（角色 2 全休）
 * - 六／日：僅早診 2 人（角色 1 全休）
 */
function generateTripleMonthSchedule(
  year: number,
  month: number,
  daysInMonth: number,
  config: GoldenRotationConfig,
  shiftTypes: ShiftTypeRef[]
): GeneratedAssignment[] {
  const { employeeAId, employeeBId, employeeCId } = config;
  if (!employeeCId) return [];

  const byCode = Object.fromEntries(shiftTypes.map((s) => [s.code, s]));
  const morning = byCode.MORNING;
  const afternoon = byCode.AFTERNOON;
  const evening = byCode.EVENING;
  const rest = byCode.REST;
  if (!morning || !afternoon || !evening) return [];

  const results: GeneratedAssignment[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const workDate = formatWorkDate(year, month, day);
    const dow = getDayOfWeekTaipei(workDate);
    const { role1, role2, role3 } = assignTripleRoles(
      workDate,
      employeeAId,
      employeeBId,
      employeeCId
    );

    // 週一、二、四、五：三人各 2 節，早午晚各剛好 2 人
    if (dow === 1 || dow === 2 || dow === 4 || dow === 5) {
      results.push(
        makeAssignment(workDate, role1, morning, "角色1 早診（完美週末）"),
        makeAssignment(workDate, role1, afternoon, "角色1 午診（完美週末）"),
        makeAssignment(workDate, role2, morning, "角色2 早診（週三充電）"),
        makeAssignment(workDate, role2, evening, "角色2 晚診（週三充電）"),
        makeAssignment(workDate, role3, afternoon, "角色3 午診（全勤支援）"),
        makeAssignment(workDate, role3, evening, "角色3 晚診（全勤支援）")
      );
      continue;
    }

    // 週三：開早午診；角色2 全休；角色1＋3 各早+午 → 每節 2 人
    if (dow === 3) {
      results.push(
        makeAssignment(workDate, role1, morning, "角色1 週三早診"),
        makeAssignment(workDate, role1, afternoon, "角色1 週三午診"),
        makeAssignment(workDate, role3, morning, "角色3 週三早診"),
        makeAssignment(workDate, role3, afternoon, "角色3 週三午診")
      );
      if (rest) {
        results.push(offDayAssignment(workDate, role2, rest, "角色2 週三充電全休"));
      }
      continue;
    }

    // 六、日：僅早診；角色2＋3 出勤；角色1 完美週末
    if (dow === 6 || dow === 0) {
      const dayLabel = dow === 6 ? "週六" : "週日";
      results.push(
        makeAssignment(workDate, role2, morning, `${dayLabel}早診（角色2）`),
        makeAssignment(workDate, role3, morning, `${dayLabel}早診（角色3）`)
      );
      if (rest) {
        results.push(
          offDayAssignment(workDate, role1, rest, `${dayLabel}完美週末（角色1）`)
        );
      }
    }
  }

  return results;
}

/** isoWeek % 3 決定本週 A/B/C 對應角色 1/2/3 */
export function assignTripleRoles(
  dateStr: string,
  employeeAId: string,
  employeeBId: string,
  employeeCId: string
): { role1: string; role2: string; role3: string; weekMod: number } {
  const weekMod = getISOWeek(dateStr) % 3;
  const ids = [employeeAId, employeeBId, employeeCId];
  return {
    weekMod,
    role1: ids[(0 - weekMod + 3) % 3],
    role2: ids[(1 - weekMod + 3) % 3],
    role3: ids[(2 - weekMod + 3) % 3],
  };
}

function dualDayAssignments(
  workDate: string,
  employeeAId: string,
  employeeBId: string,
  byCode: Record<string, ShiftTypeRef>
): GeneratedAssignment[] {
  const morning = byCode.MORNING;
  const evening = byCode.EVENING;
  if (!morning || !evening) return [];

  const out: GeneratedAssignment[] = [];
  for (const employeeId of [employeeAId, employeeBId]) {
    out.push(makeAssignment(workDate, employeeId, morning, "早診（雙人戰力）"));
    out.push(makeAssignment(workDate, employeeId, evening, "晚診（雙人戰力）"));
  }
  return out;
}

/**
 * 模式 A 週五：
 * - 軌道一（週三班／六日大休）：早午診
 * - 軌道二（週末班）：午晚診
 */
function fridayAssignmentsDual(
  workDate: string,
  employeeAId: string,
  employeeBId: string,
  aTrack: RotationTrack,
  byCode: Record<string, ShiftTypeRef>
): GeneratedAssignment[] {
  const morning = byCode.MORNING;
  const afternoon = byCode.AFTERNOON;
  const evening = byCode.EVENING;
  if (!morning || !evening) return [];

  const track1Id = aTrack === 1 ? employeeAId : employeeBId;
  const track2Id = aTrack === 1 ? employeeBId : employeeAId;

  const out: GeneratedAssignment[] = [
    makeAssignment(workDate, track1Id, morning, "週五早診（軌道一／週三班）"),
  ];

  if (afternoon) {
    out.push(
      makeAssignment(workDate, track1Id, afternoon, "週五午診（軌道一／週三班）"),
      makeAssignment(workDate, track2Id, afternoon, "週五午診（軌道二／週末班）")
    );
  } else {
    // 無午診時退回：軌道一僅早診、軌道二早晚
    out.push(
      makeAssignment(workDate, track2Id, morning, "週五早診（軌道二）"),
      makeAssignment(workDate, track2Id, evening, "週五晚診（軌道二）")
    );
    return out;
  }

  out.push(makeAssignment(workDate, track2Id, evening, "週五晚診（軌道二／週末班）"));
  return out;
}

function halfClinicDayAssignments(
  workDate: string,
  dow: number,
  employeeAId: string,
  employeeBId: string,
  aTrack: RotationTrack,
  _bTrack: RotationTrack,
  byCode: Record<string, ShiftTypeRef>
): GeneratedAssignment[] {
  const morning = byCode.MORNING;
  const statutory = byCode.STATUTORY;
  const rest = byCode.REST;
  if (!morning) return [];

  const out: GeneratedAssignment[] = [];

  if (dow === 3) {
    if (aTrack === 1) {
      out.push(makeAssignment(workDate, employeeAId, morning, "週三僅早診（軌道一／週三班）"));
      if (statutory) {
        out.push(offDayAssignment(workDate, employeeBId, statutory, "週三例假（軌道二／週末班）"));
      }
    } else {
      if (statutory) {
        out.push(offDayAssignment(workDate, employeeAId, statutory, "週三例假（軌道二／週末班）"));
      }
      out.push(makeAssignment(workDate, employeeBId, morning, "週三僅早診（軌道一／週三班）"));
    }
    return out;
  }

  if (dow === 6 || dow === 0) {
    const dayLabel = dow === 6 ? "週六" : "週日";
    if (aTrack === 1) {
      if (rest) {
        out.push(offDayAssignment(workDate, employeeAId, rest, `${dayLabel}大休（軌道一／週三班）`));
      }
      out.push(
        makeAssignment(workDate, employeeBId, morning, `${dayLabel}早診（軌道二／週末班）`)
      );
    } else {
      out.push(
        makeAssignment(workDate, employeeAId, morning, `${dayLabel}早診（軌道二／週末班）`)
      );
      if (rest) {
        out.push(offDayAssignment(workDate, employeeBId, rest, `${dayLabel}大休（軌道一／週三班）`));
      }
    }
  }

  return out;
}

function makeAssignment(
  workDate: string,
  employeeId: string,
  shift: ShiftTypeRef,
  label: string
): GeneratedAssignment {
  return {
    workDate,
    employeeId,
    shiftCode: shift.code,
    expectedClockIn: shift.default_clock_in ?? GOLDEN_SCHEDULE.MORNING_IN,
    expectedClockOut: shift.default_clock_out ?? GOLDEN_SCHEDULE.MORNING_OUT,
    plannedHours: Number(shift.planned_hours),
    label,
  };
}

function offDayAssignment(
  workDate: string,
  employeeId: string,
  shift: ShiftTypeRef,
  label: string
): GeneratedAssignment {
  return {
    workDate,
    employeeId,
    shiftCode: shift.code,
    expectedClockIn: "00:00",
    expectedClockOut: "00:00",
    plannedHours: 0,
    label,
  };
}

export function getRotationLegend(
  oddWeekTrackForA: RotationTrack = 1,
  mode: ScheduleRotationMode = "dual"
) {
  if (mode === "triple") {
    return {
      mode: "triple" as const,
      track1: {
        title: "角色 1（完美週末）",
        items: [
          "週一至週五：每天 2 節（早+午）",
          "週六、日：全天排休",
          "三週輪替一次（isoWeek % 3）",
        ],
      },
      track2: {
        title: "角色 2（週三充電）",
        items: [
          "週一、二、四、五：每天 2 節（早+晚）",
          "週三：全天排休",
          "週六、日：僅早診",
        ],
      },
      track3: {
        title: "角色 3（全勤支援）",
        items: [
          "週一至週五：每天 2 節（午+晚）；週三早+午",
          "週六、日：僅早診",
          "平日早／午／晚各剛好 2 人",
        ],
      },
      swapNote: "依 ISO 週次 % 3 輪替角色；週三僅開早午診",
      oddWeekTrackForA,
    };
  }

  return {
    mode: "dual" as const,
    track1: {
      title: "軌道一／週三班（六日大休）",
      items: [
        "週一、二、四：早晚診全天",
        "週三：僅早診",
        "週五：早午診",
        "週六、日：大休",
        `每週約 ${GOLDEN_SCHEDULE.WEEKLY_HOURS_TRACK1} 小時（含午診時略增）`,
      ],
    },
    track2: {
      title: "軌道二／週末班",
      items: [
        "週一、二、四：早晚診全天",
        "週三：例假",
        "週五：午晚診",
        "週六、日：早診",
        `每週約 ${GOLDEN_SCHEDULE.WEEKLY_HOURS_TRACK2} 小時（含午診時略增）`,
      ],
    },
    swapNote: "隔週兩人軌道對調（isoWeek % 2）",
    oddWeekTrackForA,
  };
}
