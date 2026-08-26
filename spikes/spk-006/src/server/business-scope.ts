import type { QueryResult, QueryResultRow } from "pg";

const businessScopeBrand: unique symbol = Symbol("BusinessScope");

export type BusinessScopeSource = "PUBLIC_SINGLETON" | "ADMIN_AUTH";

export type BusinessScope = Readonly<{
  businessId: string;
  source: BusinessScopeSource;
  [businessScopeBrand]: true;
}>;

export type Queryable = {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>;
};

export class BusinessScopeResolutionError extends Error {
  constructor(
    readonly code:
      | "BUSINESS_SCOPE_NOT_FOUND"
      | "BUSINESS_SCOPE_AMBIGUOUS"
      | "ADMIN_NOT_AUTHORIZED",
    readonly observedCount: number,
  ) {
    super(code);
    this.name = "BusinessScopeResolutionError";
  }
}

function businessScope(
  businessId: string,
  source: BusinessScopeSource,
): BusinessScope {
  return Object.freeze({
    businessId,
    source,
    [businessScopeBrand]: true as const,
  });
}

export async function resolvePublicBusiness(
  database: Queryable,
  _untrustedBrowserInput: Readonly<Record<string, unknown>> = {},
): Promise<BusinessScope> {
  const result = await database.query<{ id: string }>(`
    select id
    from app_private.business
    where operational_enabled = true
      and public_booking_enabled = true
    order by id
    limit 2
  `);
  if (result.rows.length === 0) {
    throw new BusinessScopeResolutionError("BUSINESS_SCOPE_NOT_FOUND", 0);
  }
  if (result.rows.length !== 1) {
    throw new BusinessScopeResolutionError(
      "BUSINESS_SCOPE_AMBIGUOUS",
      result.rows.length,
    );
  }
  return businessScope(result.rows[0]!.id, "PUBLIC_SINGLETON");
}

export async function resolveAdminBusiness(
  database: Queryable,
  authenticatedUserId: string,
): Promise<BusinessScope> {
  const result = await database.query<{ id: string }>(`
    select id
    from app_private.business
    where admin_auth_user_id = $1
      and operational_enabled = true
  `, [authenticatedUserId]);
  if (result.rows.length !== 1) {
    throw new BusinessScopeResolutionError(
      "ADMIN_NOT_AUTHORIZED",
      result.rows.length,
    );
  }
  return businessScope(result.rows[0]!.id, "ADMIN_AUTH");
}
