import type { BusinessScope } from "@/domain/business/business-scope";

/** Base contract: every Business-owned repository is constructed with scope. */
export abstract class ScopedRepository {
  protected constructor(protected readonly scope: BusinessScope) {}
}
