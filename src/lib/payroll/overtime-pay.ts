import { CLINIC_PAYROLL } from "@/lib/payroll/constants";

export type OvertimeDayType = "weekday" | "rest_day";

export interface OvertimePayBreakdown {
  dayType: OvertimeDayType;
  tier1Hours: number;
  tier2Hours: number;
  tier1Rate: number;
  tier2Rate: number;
  tier1Pay: number;
  tier2Pay: number;
  totalPay: number;
}

const OT = CLINIC_PAYROLL.OT_HOURLY_RATE;

/** 固定 142 元時薪基準之加班費試算 */
export function calculateOvertimePay(
  overtimeHours: number,
  dayType: OvertimeDayType = "weekday"
): OvertimePayBreakdown {
  const h = Math.max(0, overtimeHours);

  if (dayType === "rest_day") {
    const tier1Hours = Math.min(h, 2);
    const tier2Hours = Math.min(Math.max(0, h - 2), 6);
    const tier1Rate = OT * CLINIC_PAYROLL.OT_RATE_WEEKDAY_1;
    const tier2Rate = OT * CLINIC_PAYROLL.OT_RATE_WEEKDAY_2;
    const tier1Pay = Math.round(tier1Hours * tier1Rate);
    const tier2Pay = Math.round(tier2Hours * tier2Rate);
    return {
      dayType,
      tier1Hours,
      tier2Hours,
      tier1Rate,
      tier2Rate,
      tier1Pay,
      tier2Pay,
      totalPay: tier1Pay + tier2Pay,
    };
  }

  const tier1Hours = Math.min(h, 2);
  const tier2Hours = Math.max(0, h - 2);
  const tier1Rate = OT * CLINIC_PAYROLL.OT_RATE_WEEKDAY_1;
  const tier2Rate = OT * CLINIC_PAYROLL.OT_RATE_WEEKDAY_2;
  const tier1Pay = Math.round(tier1Hours * tier1Rate);
  const tier2Pay = Math.round(tier2Hours * tier2Rate);

  return {
    dayType,
    tier1Hours,
    tier2Hours,
    tier1Rate,
    tier2Rate,
    tier1Pay,
    tier2Pay,
    totalPay: tier1Pay + tier2Pay,
  };
}

/** 當月加班費（平日制；休息日加班可再擴充逐日判斷） */
export function calculateMonthlyOvertimePay(overtimeHours: number): number {
  return calculateOvertimePay(overtimeHours, "weekday").totalPay;
}
