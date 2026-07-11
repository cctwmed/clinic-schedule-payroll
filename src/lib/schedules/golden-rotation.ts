import {
  GOLDEN_SCHEDULE,
  getDayOfWeekTaipei,
  getTrackForEmployeeA,
  getTrackForEmployeeB,
  isDualClinicDay,
  isHalfClinicDay,
  type RotationTrack,
} from "@/lib/shift-templates";
import { formatWorkDate } from "@/types/schedule";

export interface GoldenRotationConfig {
  employeeAId: string;
  employeeBId: string;
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

export function generateGoldenMonthSchedule(
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
      out.push(makeAssignment(workDate, employeeAId, morning, "週三半天值班（軌道一）"));
      if (statutory) {
        out.push(offDayAssignment(workDate, employeeBId, statutory, "週三例假（軌道二）"));
      }
    } else {
      if (statutory) {
        out.push(offDayAssignment(workDate, employeeAId, statutory, "週三例假（軌道二）"));
      }
      out.push(makeAssignment(workDate, employeeBId, morning, "週三半天值班（軌道一）"));
    }
    return out;
  }

  if (dow === 6 || dow === 0) {
    const dayLabel = dow === 6 ? "週六" : "週日";
    if (aTrack === 1) {
      if (rest) {
        out.push(offDayAssignment(workDate, employeeAId, rest, `${dayLabel}大休（軌道一）`));
      }
      out.push(
        makeAssignment(workDate, employeeBId, morning, `${dayLabel}早半班（軌道二）`)
      );
    } else {
      out.push(
        makeAssignment(workDate, employeeAId, morning, `${dayLabel}早半班（軌道二）`)
      );
      if (rest) {
        out.push(offDayAssignment(workDate, employeeBId, rest, `${dayLabel}大休（軌道一）`));
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

export function getRotationLegend(oddWeekTrackForA: RotationTrack = 1) {
  return {
    track1: {
      title: "軌道一",
      items: [
        "週一～二、四～五：雙人早晚診全勤",
        "週三：半天早診值班",
        "週六、日：大休",
        `每週約 ${GOLDEN_SCHEDULE.WEEKLY_HOURS_TRACK1} 小時`,
      ],
    },
    track2: {
      title: "軌道二",
      items: [
        "週一～二、四～五：雙人早晚診全勤",
        "週三：例假",
        "週六、日：早半班（搭配家屬支援）",
        `每週約 ${GOLDEN_SCHEDULE.WEEKLY_HOURS_TRACK2} 小時`,
      ],
    },
    swapNote: "隔週兩人的週三與六、日班表自動完全對調",
    oddWeekTrackForA,
  };
}
