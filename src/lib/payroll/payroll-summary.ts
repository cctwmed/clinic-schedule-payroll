import type { PayrollLineItem } from "@/lib/payroll/calculator";
import { roundMoney } from "@/lib/payroll/calculator";

export interface MonthlyPayrollSummary {
  /** 應發薪資合計 + 診所負擔規費 */
  totalBudgetOutlay: number;
  /** 所有員工 net 總和（匯給同仁） */
  totalNetToEmployees: number;
  /** 個人勞健保自付 + 在職雇主勞健保 + 勞退 */
  totalToState: number;
  /** 勞保費總額（個人 + 雇主） */
  laborInsuranceGrandTotal: number;
  /** 健保費總額（個人 + 雇主） */
  healthInsuranceGrandTotal: number;
  /** 勞退雇主提繳總額（僅在職） */
  laborPensionGrandTotal: number;
  /** 診所負擔規費合計（在職：雇主勞健保 + 勞退） */
  totalClinicBurden: number;
  /** 應發薪資合計 */
  totalGross: number;
}

/**
 * 總覽加總（以明細欄位重算）：
 * - 診所規費 = Σ 在職（雇主勞保 + 雇主健保 + 勞退 6%）
 * - 付給政府 = Σ（個人勞健保）+ 診所規費
 * - 預算總支出 = 應發薪資 + 診所規費
 */
export function summarizeMonthlyPayroll(lineItems: PayrollLineItem[]): MonthlyPayrollSummary {
  let totalGross = 0;
  let totalNetToEmployees = 0;
  let employeeSelfPayTotal = 0;
  let totalClinicBurden = 0;
  let laborInsuranceGrandTotal = 0;
  let healthInsuranceGrandTotal = 0;
  let laborPensionGrandTotal = 0;

  for (const item of lineItems) {
    totalGross += item.grossPay;
    totalNetToEmployees += item.netPay;

    const laborSelf = Number(item.laborInsurance) || 0;
    const healthSelf = Number(item.healthInsurance) || 0;
    const laborEmployer = Number(item.laborInsuranceEmployerPay) || 0;
    const healthEmployer = Number(item.healthInsuranceEmployerPay) || 0;
    const pension = Number(item.laborPensionEmployerPay) || 0;

    employeeSelfPayTotal += laborSelf + healthSelf;
    laborInsuranceGrandTotal += laborSelf + laborEmployer;
    healthInsuranceGrandTotal += healthSelf + healthEmployer;

    // 停職（育嬰／懷孕）不計入診所雇主負擔
    if (!item.parentalLeaveSuspend) {
      totalClinicBurden += laborEmployer + healthEmployer + pension;
      laborPensionGrandTotal += pension;
    }
  }

  const totalToState = employeeSelfPayTotal + totalClinicBurden;

  return {
    totalGross: roundMoney(totalGross),
    totalNetToEmployees: roundMoney(totalNetToEmployees),
    totalClinicBurden: roundMoney(totalClinicBurden),
    totalToState: roundMoney(totalToState),
    laborInsuranceGrandTotal: roundMoney(laborInsuranceGrandTotal),
    healthInsuranceGrandTotal: roundMoney(healthInsuranceGrandTotal),
    laborPensionGrandTotal: roundMoney(laborPensionGrandTotal),
    totalBudgetOutlay: roundMoney(totalGross + totalClinicBurden),
  };
}
