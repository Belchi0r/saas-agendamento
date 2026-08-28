import "server-only";

import type { Pool, PoolClient } from "pg";
import type { BookingDateCalendarFacts, BookingDateDiscoveryRange, BookingFacts, BookingProfileFacts, IdempotencyReceipt, ManagementTokenAuthorization, PersistPublicBooking, PublicBookingRepository, PublicBookingTransaction } from "@/application/booking/public-booking-repository";
import type { DateAvailabilityException } from "@/domain/availability/date-availability";
import type { PublicAppointmentView } from "@/domain/booking/public-booking";
import type { BusinessScope } from "@/domain/business/business-scope";
import { ApplicationError } from "@/shared/errors/application-error";

export class PostgresPublicBookingRepository implements PublicBookingRepository {
  constructor(private readonly pool: Pool, readonly scope: BusinessScope) {}

  async loadBookingProfile(serviceId: string): Promise<BookingProfileFacts> {
    const client = await this.pool.connect();
    try { return await loadProfile(client, this.scope.businessId, serviceId, false); }
    finally { client.release(); }
  }
  async loadDateDiscoveryCalendar(range: BookingDateDiscoveryRange): Promise<BookingDateCalendarFacts> {
    const client = await this.pool.connect();
    try {
      const windows = await client.query<WindowRow>(
        `select id,business_id,weekday,start_local_time::text,end_local_time::text,created_at,updated_at
           from app_private.weekly_working_window
          where business_id=$1 order by weekday,start_local_time,id`,
        [this.scope.businessId],
      );
      const breaks = await client.query<BreakRow>(
        `select id,business_id,weekday,start_local_time::text,end_local_time::text
           from app_private.weekly_break
          where business_id=$1 order by weekday,start_local_time,id`,
        [this.scope.businessId],
      );
      const exceptions = await client.query<ExceptionRow>(
        `select id,business_id,local_date::text,mode,private_note,version,created_at,updated_at
           from app_private.date_availability_exception
          where business_id=$1 and local_date between $2::date and $3::date
          order by local_date,id`,
        [this.scope.businessId, range.startLocalDate, range.endLocalDate],
      );
      const exceptionWindows = await client.query<ExceptionWindowRow & { local_date: string }>(
        `select w.id,w.date_exception_id,w.start_local_time::text,w.end_local_time::text,
                e.local_date::text
           from app_private.exception_working_window w
           join app_private.date_availability_exception e on e.id=w.date_exception_id
          where e.business_id=$1 and e.local_date between $2::date and $3::date
          order by e.local_date,w.start_local_time,w.id`,
        [this.scope.businessId, range.startLocalDate, range.endLocalDate],
      );
      const occupancies = await client.query<{ start_at: string; end_at: string }>(
        `select lower(occupied_period)::text start_at,upper(occupied_period)::text end_at
           from app_private.schedule_occupancy
          where business_id=$1 and released_at is null
            and occupied_period && tstzrange($2::timestamptz,$3::timestamptz,'[)')
          order by lower(occupied_period),id`,
        [this.scope.businessId, range.startAtUtc, range.endAtUtc],
      );
      const windowsByException = new Map<string, ExceptionWindowRow[]>();
      for (const row of exceptionWindows.rows) {
        const current = windowsByException.get(row.date_exception_id) ?? [];
        current.push(row);
        windowsByException.set(row.date_exception_id, current);
      }
      return {
        weeklyWorkingWindows: windows.rows.map(mapWorkingWindow),
        weeklyBreaks: breaks.rows.map(mapWeeklyBreak),
        dateExceptions: exceptions.rows.map((row) => mapDateException(
          row,
          windowsByException.get(row.id) ?? [],
        )),
        scheduleOccupancies: occupancies.rows.map(mapOccupancy),
      };
    } finally { client.release(); }
  }
  async loadAvailabilityFacts(serviceId: string, localDate: string): Promise<BookingFacts> {
    const client = await this.pool.connect();
    try { return await loadFacts(client, this.scope.businessId, serviceId, localDate, false); }
    finally { client.release(); }
  }
  async transaction<T>(work: (transaction: PublicBookingTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(new BookingTransaction(client, this.scope.businessId));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
  async exchangeManagementToken(tokenHash: Buffer, usedAt: Date): Promise<ManagementTokenAuthorization | null> {
    const result = await this.pool.query<{ token_ref: string; token_version: number; appointment_version: number }>(
      `update app_private.appointment_access_token t set last_used_at = $3
         from app_private.appointment a
        where t.token_hash = $1 and t.revoked_at is null
          and (t.expires_at is null or t.expires_at > $3)
          and a.id = t.appointment_id and a.business_id = $2
      returning t.id as token_ref, t.token_version, a.version as appointment_version`,
      [tokenHash, this.scope.businessId, usedAt],
    );
    const row = result.rows[0];
    return row ? { tokenRef: row.token_ref, tokenVersion: row.token_version, appointmentVersion: row.appointment_version } : null;
  }
  async findManagedAppointment(tokenRef: string, tokenVersion: number, appointmentVersion: number): Promise<PublicAppointmentView | null> {
    const result = await this.pool.query<ManagedRow>(
      `select a.id as appointment_id, a.status, a.version, a.service_name_snapshot,
              a.service_duration_minutes_snapshot, a.service_price_minor_snapshot,
              a.currency_code_snapshot, a.customer_name_snapshot,
              a.scheduled_start_at, a.scheduled_end_at, a.timezone_snapshot,
              a.local_date_snapshot::text, a.local_time_snapshot::text,
              a.utc_offset_minutes_snapshot
         from app_private.appointment_access_token t
         join app_private.appointment a on a.id = t.appointment_id
        where t.id = $1 and t.token_version = $2 and t.revoked_at is null
          and (t.expires_at is null or t.expires_at > clock_timestamp())
          and a.version = $3 and a.business_id = $4`,
      [tokenRef, tokenVersion, appointmentVersion, this.scope.businessId],
    );
    return result.rows[0] ? managedView(result.rows[0]) : null;
  }
  async rotateManagementToken(input: Readonly<{ appointmentId: string; newTokenId: string; newTokenHash: Buffer; rotatedAt: Date; reason: string }>): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const owner = await client.query(`select id from app_private.appointment where business_id = $1 and id = $2`, [this.scope.businessId, input.appointmentId]);
      if (owner.rowCount !== 1) throw invalidLink();
      const active = await client.query<{ token_version: number }>(`select token_version from app_private.appointment_access_token where appointment_id = $1 and revoked_at is null for update`, [input.appointmentId]);
      if (!active.rows[0]) throw invalidLink();
      await client.query(`update app_private.appointment_access_token set revoked_at = $2, rotation_reason = $3 where appointment_id = $1 and revoked_at is null`, [input.appointmentId, input.rotatedAt, input.reason]);
      const version = active.rows[0].token_version + 1;
      await client.query(`insert into app_private.appointment_access_token (id, appointment_id, token_hash, token_version, issued_at) values ($1, $2, $3, $4, $5)`, [input.newTokenId, input.appointmentId, input.newTokenHash, version, input.rotatedAt]);
      await client.query("commit");
      return version;
    } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
  async revokeManagementToken(appointmentId: string, revokedAt: Date, reason: string): Promise<void> {
    await this.pool.query(
      `update app_private.appointment_access_token t set revoked_at = $3, rotation_reason = $4
         from app_private.appointment a where t.appointment_id = $1 and t.revoked_at is null
          and a.id = t.appointment_id and a.business_id = $2`,
      [appointmentId, this.scope.businessId, revokedAt, reason],
    );
  }
}

class BookingTransaction implements PublicBookingTransaction {
  constructor(private readonly client: PoolClient, private readonly businessId: string) {}
  async lockIdempotency(firstKey: number, secondKey: number): Promise<void> {
    await this.client.query("select pg_advisory_xact_lock($1, $2)", [firstKey, secondKey]);
  }
  async findIdempotencyReceipt(operation: string, keyHash: Buffer): Promise<IdempotencyReceipt | null> {
    const result = await this.client.query<ReceiptRow>(
      `select id, business_id, operation, request_fingerprint, fingerprint_version,
              appointment_id, response_status, response_envelope, envelope_nonce,
              envelope_auth_tag, envelope_key_version, envelope_expires_at
         from app_private.idempotency_request
        where business_id = $1 and operation = $2 and key_hash = $3`,
      [this.businessId, operation, keyHash],
    );
    const row = result.rows[0];
    return row?.appointment_id ? {
      id: row.id, businessId: row.business_id, operation: row.operation,
      requestFingerprint: row.request_fingerprint, fingerprintVersion: row.fingerprint_version,
      appointmentId: row.appointment_id, responseStatus: row.response_status,
      responseEnvelope: row.response_envelope, envelopeNonce: row.envelope_nonce,
      envelopeAuthTag: row.envelope_auth_tag, envelopeKeyVersion: row.envelope_key_version,
      envelopeExpiresAt: row.envelope_expires_at,
    } : null;
  }
  loadFactsForConfirmation(serviceId: string, localDate: string): Promise<BookingFacts> {
    return loadFacts(this.client, this.businessId, serviceId, localDate, true);
  }
  async insertBooking(e: PersistPublicBooking): Promise<void> {
    const a = e.appointment;
    await this.client.query(`insert into app_private.customer (id,business_id,display_name,whatsapp_e164,created_at,updated_at) values ($1,$2,$3,$4,$5,$5)`, [e.customer.id, this.businessId, e.customer.name, e.customer.whatsappE164, a.createdAt]);
    await this.client.query(
      `insert into app_private.appointment (
        id,business_id,service_id,customer_id,status,origin,version,
        service_name_snapshot,service_description_snapshot,service_duration_minutes_snapshot,
        service_price_minor_snapshot,currency_code_snapshot,customer_name_snapshot,
        customer_whatsapp_snapshot,scheduled_start_at,scheduled_end_at,
        occupied_start_at,occupied_end_at,timezone_snapshot,local_date_snapshot,
        local_time_snapshot,utc_offset_minutes_snapshot,created_at,updated_at
      ) values ($1,$2,$3,$4,'CONFIRMED','PUBLIC',1,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)`,
      [a.appointmentId,this.businessId,a.serviceId,a.customerId,a.serviceName,a.serviceDescription,a.durationMinutes,a.priceMinor,a.currencyCode,a.customerName,e.customer.whatsappE164,a.scheduledStartAt,a.scheduledEndAt,a.occupiedStartAt,a.occupiedEndAt,a.timezone,a.localDate,a.localTime,a.utcOffsetMinutes,a.createdAt],
    );
    await this.client.query(`insert into app_private.schedule_occupancy (id,business_id,appointment_id,occupied_period,created_at) values ($1,$2,$3,tstzrange($4::timestamptz,$5::timestamptz,'[)'),$6)`, [e.occupancyId,this.businessId,a.appointmentId,a.occupiedStartAt,a.occupiedEndAt,a.createdAt]);
    await this.client.query(`insert into app_private.appointment_event (id,appointment_id,appointment_version,event_type,actor_type,occurred_at,to_status,to_start_at,to_end_at,details) values ($1,$2,1,'CREATED','SYSTEM',$3,'CONFIRMED',$4,$5,$6::jsonb)`, [e.eventId,a.appointmentId,a.createdAt,a.scheduledStartAt,a.scheduledEndAt,JSON.stringify({ schemaVersion: 1, origin: "PUBLIC" })]);
    await this.client.query(`insert into app_private.appointment_access_token (id,appointment_id,token_hash,token_version,issued_at) values ($1,$2,$3,$4,$5)`, [e.token.id,a.appointmentId,e.token.hash,e.token.version,a.createdAt]);
    const r = e.receipt;
    await this.client.query(
      `insert into app_private.idempotency_request (id,business_id,operation,key_hash,request_fingerprint,fingerprint_version,status,appointment_id,response_status,response_envelope,envelope_nonce,envelope_auth_tag,envelope_key_version,envelope_expires_at,created_at,expires_at) values ($1,$2,$3,$4,$5,$6,'SUCCEEDED',$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [r.id,this.businessId,r.operation,r.keyHash,r.requestFingerprint,r.fingerprintVersion,a.appointmentId,r.responseStatus,r.responseEnvelope,r.envelopeNonce,r.envelopeAuthTag,r.envelopeKeyVersion,r.envelopeExpiresAt,r.createdAt,r.expiresAt],
    );
  }
}

async function loadFacts(client: PoolClient, businessId: string, serviceId: string, localDate: string, locked: boolean): Promise<BookingFacts> {
  const profile = await loadProfile(client, businessId, serviceId, locked);
  if (!profile.business) return emptyFacts();
  // A transaction-mode connection is intentionally used sequentially. Besides
  // keeping all reads on one transaction, this avoids concurrent client.query()
  // calls, which pg deprecates and Supavisor transaction mode must not rely on.
  const windows = await client.query<WindowRow>(`select id,business_id,weekday,start_local_time::text,end_local_time::text,created_at,updated_at from app_private.weekly_working_window where business_id=$1 and weekday=extract(isodow from $2::date) order by start_local_time,id`, [businessId,localDate]);
  const breaks = await client.query<BreakRow>(`select id,business_id,weekday,start_local_time::text,end_local_time::text from app_private.weekly_break where business_id=$1 and weekday=extract(isodow from $2::date) order by start_local_time,id`, [businessId,localDate]);
  const exceptions = await client.query<ExceptionRow>(`select id,business_id,local_date::text,mode,private_note,version,created_at,updated_at from app_private.date_availability_exception where business_id=$1 and local_date=$2::date`, [businessId,localDate]);
  const occupancies = await client.query<{start_at:string;end_at:string}>(`select lower(occupied_period)::text start_at,upper(occupied_period)::text end_at from app_private.schedule_occupancy where business_id=$1 and released_at is null order by lower(occupied_period),id`, [businessId]);
  let dateException: DateAvailabilityException | null = null;
  const exception = exceptions.rows[0];
  if (exception) {
    const exceptionWindows = await client.query<ExceptionWindowRow>(`select id,date_exception_id,start_local_time::text,end_local_time::text from app_private.exception_working_window where date_exception_id=$1 order by start_local_time,id`, [exception.id]);
    dateException = mapDateException(exception, exceptionWindows.rows);
  }
  return {
    ...profile,
    weeklyWorkingWindows: windows.rows.map(mapWorkingWindow),
    weeklyBreaks: breaks.rows.map(mapWeeklyBreak),
    dateException,
    scheduleOccupancies: occupancies.rows.map(mapOccupancy),
  };
}

async function loadProfile(
  client: PoolClient,
  businessId: string,
  serviceId: string,
  locked: boolean,
): Promise<BookingProfileFacts> {
  const business = await client.query<FactRow>(
    `select b.timezone,b.public_booking_enabled,b.availability_version,
            p.minimum_lead_minutes,p.booking_horizon_days,p.slot_step_minutes,
            p.buffer_minutes,p.configuration_confirmed_at,p.version as policy_version
       from app_private.business b left join app_private.business_scheduling_policy p on p.business_id=b.id
      where b.id=$1 ${locked ? "for share of b" : ""}`, [businessId]);
  const fact = business.rows[0];
  if (!fact) return { business: null, policy: null, service: null };
  const service = await client.query<ServiceRow>(`select id,name,description,duration_minutes,price_minor,currency_code,active,version from app_private.service where business_id=$1 and id=$2 ${locked ? "for share" : ""}`, [businessId,serviceId]);
  const s = service.rows[0];
  const policy = fact.minimum_lead_minutes === null || fact.booking_horizon_days === null || fact.slot_step_minutes === null || fact.configuration_confirmed_at === null || fact.policy_version === null ? null : { minimumLeadMinutes:fact.minimum_lead_minutes,bookingHorizonDays:fact.booking_horizon_days,slotStepMinutes:fact.slot_step_minutes,bufferMinutes:fact.buffer_minutes,configurationConfirmedAt:fact.configuration_confirmed_at,version:fact.policy_version };
  return {
    business:{ timezone:fact.timezone,publicBookingEnabled:fact.public_booking_enabled,availabilityVersion:fact.availability_version }, policy,
    service:s ? {id:s.id,name:s.name,description:s.description,durationMinutes:s.duration_minutes,priceMinor:s.price_minor,currencyCode:s.currency_code,active:s.active,version:s.version}:null,
  };
}

function emptyFacts(): BookingFacts { return {business:null,policy:null,service:null,weeklyWorkingWindows:[],weeklyBreaks:[],dateException:null,scheduleOccupancies:[]}; }
function mapWorkingWindow(row: WindowRow) { return {id:row.id,businessId:row.business_id,weekday:row.weekday as 1|2|3|4|5|6|7,startLocalTime:row.start_local_time.slice(0,5),endLocalTime:row.end_local_time.slice(0,5),createdAt:row.created_at,updatedAt:row.updated_at}; }
function mapWeeklyBreak(row: BreakRow) { return {id:row.id,businessId:row.business_id,weekday:row.weekday as 1|2|3|4|5|6|7,startLocalTime:row.start_local_time.slice(0,5),endLocalTime:row.end_local_time.slice(0,5)}; }
function mapExceptionWindow(row: ExceptionWindowRow) { return {id:row.id,dateExceptionId:row.date_exception_id,startLocalTime:row.start_local_time.slice(0,5),endLocalTime:row.end_local_time.slice(0,5)}; }
function mapDateException(row: ExceptionRow, windows: ExceptionWindowRow[]): DateAvailabilityException { return {id:row.id,businessId:row.business_id,localDate:row.local_date,mode:row.mode,privateNote:row.private_note,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,workingWindows:windows.map(mapExceptionWindow)}; }
function mapOccupancy(row: { start_at: string; end_at: string }) { return {startAtUtc:new Date(row.start_at).toISOString(),endAtUtc:new Date(row.end_at).toISOString()}; }
function invalidLink() { return new ApplicationError("MANAGEMENT_LINK_INVALID", "Este acesso não é válido.", 404); }
type FactRow={timezone:string|null;public_booking_enabled:boolean;availability_version:number;minimum_lead_minutes:number|null;booking_horizon_days:number|null;slot_step_minutes:number|null;buffer_minutes:number|null;configuration_confirmed_at:Date|null;policy_version:number|null};
type ServiceRow={id:string;name:string;description:string|null;duration_minutes:number;price_minor:number;currency_code:string;active:boolean;version:number};
type WindowRow={id:string;business_id:string;weekday:number;start_local_time:string;end_local_time:string;created_at:Date;updated_at:Date};
type BreakRow=Omit<WindowRow,"created_at"|"updated_at">;
type ExceptionRow={id:string;business_id:string;local_date:string;mode:"CLOSED"|"REPLACE";private_note:string|null;version:number;created_at:Date;updated_at:Date};
type ExceptionWindowRow={id:string;date_exception_id:string;start_local_time:string;end_local_time:string};
type ReceiptRow={id:string;business_id:string;operation:string;request_fingerprint:Buffer;fingerprint_version:string;appointment_id:string|null;response_status:number;response_envelope:Buffer|null;envelope_nonce:Buffer|null;envelope_auth_tag:Buffer|null;envelope_key_version:string|null;envelope_expires_at:Date|null};
type ManagedRow={appointment_id:string;status:PublicAppointmentView["status"];version:number;service_name_snapshot:string;service_duration_minutes_snapshot:number;service_price_minor_snapshot:number;currency_code_snapshot:string;customer_name_snapshot:string;scheduled_start_at:Date;scheduled_end_at:Date;timezone_snapshot:string;local_date_snapshot:string;local_time_snapshot:string;utc_offset_minutes_snapshot:number};
function managedView(r:ManagedRow):PublicAppointmentView{return{appointmentId:r.appointment_id,status:r.status,version:r.version,serviceName:r.service_name_snapshot,durationMinutes:r.service_duration_minutes_snapshot,priceMinor:r.service_price_minor_snapshot,currencyCode:r.currency_code_snapshot,customerName:r.customer_name_snapshot,scheduledStartAt:r.scheduled_start_at.toISOString(),scheduledEndAt:r.scheduled_end_at.toISOString(),timezone:r.timezone_snapshot,localDate:r.local_date_snapshot,localTime:r.local_time_snapshot.slice(0,5),utcOffsetMinutes:r.utc_offset_minutes_snapshot};}
