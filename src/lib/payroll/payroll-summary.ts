import type { PayrollLineItem } from "@/lib/payroll/calculator";
import { roundMoney } from "@/lib/payroll/calculator";

export interface MonthlyPayrollSummary {
  /** 所有員工 gross + 診所負擔規費 */
  totalBudgetOutlay: number;
  /** 所有員工 net 總和（匯給同仁） */
  totalNetToEmployees: number;
  /** 所有員工應繳國家規費總和 */
  totalToState: number;
  /** 勞保費總額（個人 + 雇主） */
  laborInsuranceGrandTotal: number;
  /** 健保費總額（個人 + 雇主） */
  healthInsuranceGrandTotal: number;
  /** 勞退雇主提繳總額 */
  laborPensionGrandTotal: number;
  /** 診所負擔規費合計（雇主勞健保 + 勞退） */
  totalClinicBurden: number;
  /** 應發薪資合計 */
  totalGross: number;
}

export function summarizeMonthlyPayroll(lineItems: PayrollLineItem[]): MonthlyPayrollSummary {
  let totalGross = 0;
  let totalNetToEmployees = 0;
  let totalClinicBurden = 0;
  let totalToState = 0;
  let laborInsuranceGrandTotal = 0;
  let healthInsuranceGrandTotal = 0;
  let laborPensionGrandTotal = 0;

  for (const item of lineItems) {
    totalGross += item.grossPay;
    totalNetToEmployees += item.netPay;
    totalClinicBurden += item.clinicBurdenTotal;
    totalToState += item.totalToStatePerEmployee;
    laborInsuranceGrandTotal += item.laborInsurance + item.laborInsuranceEmployerPay;
    healthInsuranceGrandTotal += item.healthInsurance + item.healthInsuranceEmployerPay;
    laborPensionGrandTotal += item.laborPensionEmployerPay;
  }

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
