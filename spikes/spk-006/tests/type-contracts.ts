import type { Queryable, BusinessScope } from "../src/server/business-scope.js";
import { repositoriesFor } from "../src/server/repositories.js";

declare const database: Queryable;
declare const scope: BusinessScope;

repositoriesFor(database, scope);

// @ts-expect-error BusinessScope is mandatory.
repositoriesFor(database);

// @ts-expect-error A raw business id is not a branded BusinessScope.
repositoriesFor(database, "00000000-0000-4000-8000-000000000001");

// @ts-expect-error A lookalike object cannot forge the private brand.
repositoriesFor(database, {
  businessId: "00000000-0000-4000-8000-000000000001",
  source: "ADMIN_AUTH",
});

