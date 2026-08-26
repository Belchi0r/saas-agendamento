import type { Service } from "@/domain/services/service";

export type ServiceView = Readonly<{
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currencyCode: string;
  durationMinutes: number;
  active: boolean;
  version: number;
}>;

/** Browser DTO intentionally omits businessId and persistence timestamps. */
export function toServiceView(service: Service): ServiceView {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    priceMinor: service.priceMinor,
    currencyCode: service.currencyCode,
    durationMinutes: service.durationMinutes,
    active: service.active,
    version: service.version,
  };
}
