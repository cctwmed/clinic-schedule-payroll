import { supabase } from "@/lib/supabase";
import { DEFAULT_GEO_RADIUS_M } from "@/lib/geo/constants";
import { buildGoldenShiftSlots } from "@/lib/shift-templates";

export interface Clinic {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_radius_m: number;
}

export async function getDefaultClinicId(): Promise<string> {
  const clinic = await getDefaultClinic();
  return clinic.id;
}

export async function getDefaultClinic(): Promise<Clinic> {
  const { data, error } = await supabase
    .from("clinics")
    .select("id, name, address, latitude, longitude, geo_radius_m")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data) {
    return {
      ...data,
      latitude: data.latitude != null ? Number(data.latitude) : null,
      longitude: data.longitude != null ? Number(data.longitude) : null,
      geo_radius_m: data.geo_radius_m ?? DEFAULT_GEO_RADIUS_M,
    };
  }

  const { data: created, error: createError } = await supabase
    .from("clinics")
    .insert({
      name: "我的診所",
      latitude: 24.67873,
      longitude: 121.76421,
      geo_radius_m: DEFAULT_GEO_RADIUS_M,
    })
    .select("id, name, address, latitude, longitude, geo_radius_m")
    .single();

  if (createError) throw new Error(createError.message);

  return {
    ...created,
    latitude: created.latitude != null ? Number(created.latitude) : null,
    longitude: created.longitude != null ? Number(created.longitude) : null,
    geo_radius_m: created.geo_radius_m ?? DEFAULT_GEO_RADIUS_M,
  };
}

const DEFAULT_SHIFT_TYPES = buildGoldenShiftSlots().map((slot) => ({
  code: slot.code,
  name: slot.name,
  category: slot.category,
  default_clock_in: slot.default_clock_in,
  default_clock_out: slot.default_clock_out,
  planned_hours: slot.planned_hours,
  color_hex: slot.color_hex,
  sort_order: slot.sort_order,
}));

export async function ensureShiftTypes(clinicId: string) {
  const { count, error } = await supabase
    .from("shift_types")
    .select("*", { count: "exact", head: true })
    .eq("clinic_id", clinicId);

  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return;

  const { error: insertError } = await supabase.from("shift_types").insert(
    DEFAULT_SHIFT_TYPES.map((shift) => ({ ...shift, clinic_id: clinicId }))
  );

  if (insertError) throw new Error(insertError.message);
}

export function taipeiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function taipeiNow(): Date {
  return new Date();
}
