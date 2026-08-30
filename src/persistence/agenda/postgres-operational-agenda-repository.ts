import "server-only";

import type { Pool } from "pg";
import type {
  AppointmentEventView,
  AppointmentStatus,
  CustomerDetail,
  CustomerSummary,
  OperationalAgendaRepository,
  OperationalAppointment,
} from "@/application/agenda/operational-agenda-repository";
import type { BusinessScope } from "@/domain/business/business-scope";
import { ApplicationError } from "@/shared/errors/application-error";

type AppointmentRow = {
  id: string; status: AppointmentStatus; origin: "PUBLIC" | "ADMIN"; version: number;
  service_name_snapshot: string; service_description_snapshot: string | null;
  service_duration_minutes_snapshot: number; service_price_minor_snapshot: number;
  currency_code_snapshot: string; customer_name_snapshot: string; customer_whatsapp_snapshot: string;
  scheduled_start_at: Date; scheduled_end_at: Date; timezone_snapshot: string;
  local_date_snapshot: string; local_time_snapshot: string; cancelled_at: Date | null;
  cancellation_actor: "CUSTOMER" | "ADMIN" | null;
};

const APPOINTMENT_COLUMNS = `a.id,a.status,a.origin,a.version,a.service_name_snapshot,
  a.service_description_snapshot,a.service_duration_minutes_snapshot,a.service_price_minor_snapshot,
  a.currency_code_snapshot,a.customer_name_snapshot,a.customer_whatsapp_snapshot,
  a.scheduled_start_at,a.scheduled_end_at,a.timezone_snapshot,
  a.local_date_snapshot::text,a.local_time_snapshot::text,a.cancelled_at,a.cancellation_actor`;

export class PostgresOperationalAgendaRepository implements OperationalAgendaRepository {
  constructor(private readonly pool: Pool, readonly scope: BusinessScope) {}

  async listAppointments(startAt: Date, endAt: Date) {
    const result = await this.pool.query<AppointmentRow>(
      `select ${APPOINTMENT_COLUMNS} from app_private.appointment a
       where a.business_id=$1 and a.scheduled_start_at >= $2 and a.scheduled_start_at < $3
       order by a.scheduled_start_at,a.id`,
      [this.scope.businessId, startAt, endAt],
    );
    return result.rows.map(mapAppointment);
  }

  async findAppointment(id: string) {
    const appointment = await this.pool.query<AppointmentRow>(
      `select ${APPOINTMENT_COLUMNS} from app_private.appointment a where a.business_id=$1 and a.id=$2`,
      [this.scope.businessId, id],
    );
    const row = appointment.rows[0];
    if (!row) return null;
    const events = await this.pool.query<{
      event_type: string; actor_type: string; occurred_at: Date;
      from_status: AppointmentStatus | null; to_status: AppointmentStatus | null;
    }>(`select e.event_type,e.actor_type,e.occurred_at,e.from_status,e.to_status
          from app_private.appointment_event e join app_private.appointment a on a.id=e.appointment_id
         where a.business_id=$1 and a.id=$2 order by e.occurred_at,e.id`, [this.scope.businessId, id]);
    return { ...mapAppointment(row), events: events.rows.map((event): AppointmentEventView => ({
      eventType: event.event_type, actorType: event.actor_type, occurredAt: event.occurred_at,
      fromStatus: event.from_status, toStatus: event.to_status,
    })) };
  }

  async transitionAppointment(input: Readonly<{ appointmentId: string; expectedVersion: number; toStatus: "COMPLETED" | "NO_SHOW" | "CANCELLED"; occurredAt: Date }>) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select id from app_private.business where id=$1 for share", [this.scope.businessId]);
      const current = await client.query<AppointmentRow>(
        `select ${APPOINTMENT_COLUMNS} from app_private.appointment a
          where a.business_id=$1 and a.id=$2 for update`,
        [this.scope.businessId, input.appointmentId],
      );
      const row = current.rows[0];
      if (!row) throw new ApplicationError("APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.", 404);
      if (row.status !== "CONFIRMED" || row.version !== input.expectedVersion) {
        throw new ApplicationError("APPOINTMENT_TRANSITION_CONFLICT", "O agendamento mudou. Atualize a página.", 409);
      }
      const version = row.version + 1;
      await client.query(
        `update app_private.appointment set status=$3::text,version=$4,updated_at=$5::timestamptz,
          cancelled_at=case when $3::text='CANCELLED' then $5::timestamptz else null::timestamptz end,
          cancellation_actor=case when $3::text='CANCELLED' then 'ADMIN'::text else null::text end
         where business_id=$1 and id=$2`,
        [this.scope.businessId, input.appointmentId, input.toStatus, version, input.occurredAt],
      );
      if (input.toStatus === "CANCELLED") {
        await client.query(
          `update app_private.schedule_occupancy set released_at=$3
            where business_id=$1 and appointment_id=$2 and released_at is null`,
          [this.scope.businessId, input.appointmentId, input.occurredAt],
        );
      }
      await client.query(
        `insert into app_private.appointment_event
          (appointment_id,appointment_version,event_type,actor_type,occurred_at,from_status,to_status,from_start_at,to_start_at,from_end_at,to_end_at,details)
         values ($1,$2,$3,'ADMIN',$4,'CONFIRMED',$3,$5,$5,$6,$6,$7::jsonb)`,
        [input.appointmentId, version, input.toStatus === "CANCELLED" ? "CANCELLED" : input.toStatus, input.occurredAt, row.scheduled_start_at, row.scheduled_end_at, JSON.stringify({ schemaVersion: 1 })],
      );
      await client.query("commit");
      const updated = await this.findAppointment(input.appointmentId);
      if (!updated) throw new Error("TRANSITIONED_APPOINTMENT_NOT_FOUND");
      return updated;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async listCustomers(query: string): Promise<CustomerSummary[]> {
    const term = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const result = await this.pool.query<{
      id: string; display_name: string; whatsapp_e164: string; appointment_id: string | null;
      service_name: string | null; scheduled_start_at: Date | null; status: AppointmentStatus | null;
    }>(`select c.id,c.display_name,c.whatsapp_e164,n.id appointment_id,
               n.service_name_snapshot service_name,n.scheduled_start_at,n.status
          from app_private.customer c
          left join lateral (select a.id,a.service_name_snapshot,a.scheduled_start_at,a.status
            from app_private.appointment a where a.business_id=c.business_id and a.customer_id=c.id
              and a.status='CONFIRMED' and a.scheduled_start_at >= clock_timestamp()
            order by a.scheduled_start_at limit 1) n on true
         where c.business_id=$1 and (c.display_name ilike $2 escape '\\' or c.whatsapp_e164 ilike $2 escape '\\')
         order by lower(c.display_name),c.created_at desc limit 100`, [this.scope.businessId, term]);
    return result.rows.map((row) => ({
      id: row.id, name: row.display_name, whatsapp: row.whatsapp_e164,
      nextAppointment: row.appointment_id && row.service_name && row.scheduled_start_at && row.status
        ? { id: row.appointment_id, serviceName: row.service_name, scheduledStartAt: row.scheduled_start_at, status: row.status }
        : null,
    }));
  }

  async findCustomer(id: string): Promise<CustomerDetail | null> {
    const customer = await this.pool.query<{ id: string; display_name: string; whatsapp_e164: string }>(
      `select id,display_name,whatsapp_e164 from app_private.customer where business_id=$1 and id=$2`,
      [this.scope.businessId, id],
    );
    const row = customer.rows[0];
    if (!row) return null;
    const appointments = await this.pool.query<AppointmentRow>(
      `select ${APPOINTMENT_COLUMNS} from app_private.appointment a
        where a.business_id=$1 and a.customer_id=$2 order by a.scheduled_start_at desc,a.id`,
      [this.scope.businessId, id],
    );
    return { id: row.id, name: row.display_name, whatsapp: row.whatsapp_e164, appointments: appointments.rows.map(mapAppointment) };
  }
}

function mapAppointment(row: AppointmentRow): OperationalAppointment {
  return {
    id: row.id, status: row.status, origin: row.origin, version: row.version,
    serviceName: row.service_name_snapshot, serviceDescription: row.service_description_snapshot,
    durationMinutes: row.service_duration_minutes_snapshot, priceMinor: row.service_price_minor_snapshot,
    currencyCode: row.currency_code_snapshot, customerName: row.customer_name_snapshot,
    customerWhatsapp: row.customer_whatsapp_snapshot, scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at, timezoneSnapshot: row.timezone_snapshot,
    localDateSnapshot: row.local_date_snapshot, localTimeSnapshot: row.local_time_snapshot.slice(0, 5),
    cancelledAt: row.cancelled_at, cancellationActor: row.cancellation_actor,
  };
}
