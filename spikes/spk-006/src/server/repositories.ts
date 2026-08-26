import type { Queryable, BusinessScope } from "./business-scope.js";

export type ServiceRow = {
  id: string;
  business_id: string;
  name: string;
  active: boolean;
};

export class BusinessRepositories {
  constructor(
    private readonly database: Queryable,
    private readonly scope: BusinessScope,
  ) {}

  async listServices(): Promise<ServiceRow[]> {
    const result = await this.database.query<ServiceRow>(`
      select id, business_id, name, active
      from app_private.service
      where business_id = $1
      order by name, id
    `, [this.scope.businessId]);
    return result.rows;
  }

  async findService(serviceId: string): Promise<ServiceRow | undefined> {
    const result = await this.database.query<ServiceRow>(`
      select id, business_id, name, active
      from app_private.service
      where business_id = $1 and id = $2
    `, [this.scope.businessId, serviceId]);
    return result.rows[0];
  }

  async updateServiceName(serviceId: string, name: string): Promise<number> {
    const result = await this.database.query(`
      update app_private.service
      set name = $3, version = version + 1
      where business_id = $1 and id = $2
    `, [this.scope.businessId, serviceId, name]);
    return result.rowCount ?? 0;
  }
}

export function repositoriesFor(
  database: Queryable,
  scope: BusinessScope,
): BusinessRepositories {
  return new BusinessRepositories(database, scope);
}

