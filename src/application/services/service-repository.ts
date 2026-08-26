import type { BusinessScope } from "@/domain/business/business-scope";
import type {
  Service,
  ServiceChanges,
  ServiceDraft,
  ServiceStatusChange,
} from "@/domain/services/service";

export interface ServiceRepository {
  readonly scope: BusinessScope;
  listAll(): Promise<Service[]>;
  listActive(): Promise<Service[]>;
  create(id: string, input: ServiceDraft): Promise<Service>;
  update(id: string, input: ServiceChanges): Promise<Service>;
  setActive(id: string, input: ServiceStatusChange): Promise<Service>;
}
