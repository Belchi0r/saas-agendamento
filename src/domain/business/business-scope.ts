declare const businessScopeBrand: unique symbol;

export type BusinessScope = Readonly<{
  businessId: string;
  resolvedBy: "public-singleton" | "admin-auth-user";
  [businessScopeBrand]: true;
}>;

/**
 * Server boundary factory. Browser input must never be passed to this function;
 * application resolvers construct scopes only from trusted repository results.
 */
export function businessScopeFromServer(
  businessId: string,
  resolvedBy: BusinessScope["resolvedBy"],
): BusinessScope {
  if (businessId.length === 0) {
    throw new Error("BusinessScope requires a business id resolved server-side.");
  }

  return { businessId, resolvedBy } as BusinessScope;
}
