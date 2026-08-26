import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import {
  canonicalFingerprint,
  FINGERPRINT_VERSION,
  type RawBookingCommand,
} from "./canonical.js";
import {
  decryptEnvelope,
  encryptEnvelope,
  generateToken,
  HASH_BYTES,
  secretHash,
  TOKEN_BITS,
  TOKEN_BYTES,
} from "./security.js";

const OPERATION = "CREATE_PUBLIC_APPOINTMENT";
const ENVELOPE_TTL_MS = 24 * 60 * 60 * 1_000;
const RECEIPT_TTL_MS = 72 * 60 * 60 * 1_000;

type SecretMaterial = {
  tokenPepper: Buffer;
  idempotencyPepper: Buffer;
  envelopeKeys: Map<string, Buffer>;
  activeEnvelopeKeyVersion: string;
};

type BookingResult = {
  disposition: "CREATED" | "REPLAYED";
  appointmentId: string;
  managementToken: string;
  managementLink: string;
  responseStatus: number;
};

type BookingHooks = {
  label?: string;
  afterEffect?: () => Promise<void>;
  failBeforeCommit?: boolean;
  failAfterCommit?: boolean;
};

type ReceiptRow = {
  id: string;
  business_id: string;
  operation: string;
  request_fingerprint: Buffer;
  fingerprint_version: string;
  appointment_id: string;
  response_status: number;
  response_envelope: Buffer | null;
  envelope_nonce: Buffer | null;
  envelope_auth_tag: Buffer | null;
  envelope_key_version: string | null;
  envelope_expires_at: Date | null;
  expires_at: Date;
};

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly appointmentId?: string,
  ) {
    super(code);
  }
}

export async function runDatabaseScenarios(pool: Pool) {
  const fixedNow = new Date("2026-08-23T12:00:00.000Z");
  const secrets: SecretMaterial = {
    tokenPepper: randomBytes(32),
    idempotencyPepper: randomBytes(32),
    envelopeKeys: new Map([
      ["env-v1", randomBytes(32)],
      ["env-v2", randomBytes(32)],
    ]),
    activeEnvelopeKeyVersion: "env-v1",
  };
  const businessA = "10000000-0000-4000-8000-000000000001";
  const businessB = "10000000-0000-4000-8000-000000000002";
  await pool.query(
    `insert into app_private.business (id, name) values ($1, 'A'), ($2, 'B')`,
    [businessA, businessB],
  );

  const generatedSecrets = new Set<string>();
  const tokenCrypto = await tokenCryptoScenario(secrets, generatedSecrets);
  const canonicalization = canonicalizationScenario();
  const basic = await basicTokenLifecycleScenario(
    pool,
    businessA,
    fixedNow,
    secrets,
    generatedSecrets,
  );
  const idempotency = await idempotencyScenario(
    pool,
    businessA,
    businessB,
    fixedNow,
    secrets,
    generatedSecrets,
  );
  const envelope = await envelopeScenario(
    pool,
    businessA,
    fixedNow,
    secrets,
    generatedSecrets,
  );
  const persistenceAudit = await persistenceLeakAudit(pool, generatedSecrets);
  const schema = await schemaEvidence(pool);

  return {
    result: "PASS",
    constants: {
      tokenBytes: TOKEN_BYTES,
      tokenEntropyBits: TOKEN_BITS,
      digestBytes: HASH_BYTES,
      fingerprintVersion: FINGERPRINT_VERSION,
      envelopeTtlHours: ENVELOPE_TTL_MS / 3_600_000,
      idempotencyReceiptTtlHours: RECEIPT_TTL_MS / 3_600_000,
    },
    tokenCrypto,
    canonicalization,
    basicTokenLifecycle: basic,
    idempotency,
    responseEnvelope: envelope,
    persistenceLeakAudit: persistenceAudit,
    schema,
  };
}

async function tokenCryptoScenario(
  secrets: SecretMaterial,
  generatedSecrets: Set<string>,
) {
  const tokens = Array.from({ length: 256 }, () => generateToken());
  tokens.forEach((token) => generatedSecrets.add(token));
  const uniqueCount = new Set(tokens).size;
  const lengths = [...new Set(tokens.map((token) => token.length))];
  assert.equal(uniqueCount, tokens.length);
  assert.deepEqual(lengths, [43]);
  const sample = tokens[0]!;
  const hashA = secretHash(sample, secrets.tokenPepper);
  const hashAgain = secretHash(sample, secrets.tokenPepper);
  const wrongPepperHash = secretHash(sample, randomBytes(32));
  assert.equal(hashA.equals(hashAgain), true);
  assert.equal(hashA.equals(wrongPepperHash), false);
  assert.equal(hashA.length, 32);
  return {
    generator: "node:crypto.randomBytes(32) encoded as base64url",
    generatedCount: tokens.length,
    uniqueCount,
    encodedLengths: lengths,
    entropyBits: TOKEN_BITS,
    hashConstruction: "HMAC-SHA-256(token, application pepper)",
    hashLengthBytes: hashA.length,
    sameTokenAndPepperStable: hashA.equals(hashAgain),
    differentPepperChangesHash: !hashA.equals(wrongPepperHash),
    rawTokenPersisted: false,
    pepperPersistedInDatabase: false,
  };
}

function canonicalizationScenario() {
  const a: RawBookingCommand = {
    serviceId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    startAt: "2026-09-10T10:00:00-03:00",
    customerName: "  Ana   María  ",
    whatsappE164: "+55 (61) 99999-0000",
    notes: "  perto   da janela ",
  };
  const b: RawBookingCommand = {
    notes: "perto da janela",
    whatsappE164: "+5561999990000",
    customerName: "Ana María",
    startAt: "2026-09-10T13:00:00.000Z",
    serviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const c: RawBookingCommand = { ...b, notes: "outro pedido" };
  const fa = canonicalFingerprint(a);
  const fb = canonicalFingerprint(b);
  const fc = canonicalFingerprint(c);
  const expectedSerialization = "{\"customer\":{\"name\":\"Ana María\",\"whatsappE164\":\"+5561999990000\"},\"notes\":\"perto da janela\",\"schedule\":{\"serviceId\":\"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\",\"startAt\":\"2026-09-10T13:00:00.000Z\"},\"version\":\"book-appointment/v1\"}";
  assert.equal(fa.serialized, expectedSerialization);
  assert.equal(fa.sha256.equals(fb.sha256), true);
  assert.equal(fa.sha256.equals(fc.sha256), false);
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
  return {
    pipeline: "validated/normalized command -> versioned canonical object -> recursively key-sorted serialization -> SHA-256",
    version: fa.version,
    knownVector: {
      serialization: expectedSerialization,
      sha256Hex: fa.sha256.toString("hex"),
    },
    equivalentRepresentationsSameFingerprint: fa.sha256.equals(fb.sha256),
    differentIntentDifferentFingerprint: !fa.sha256.equals(fc.sha256),
    arbitraryJsonSerializationRejectedAsContract: true,
    normalizedExample: fa.normalized,
  };
}

async function basicTokenLifecycleScenario(
  pool: Pool,
  businessId: string,
  now: Date,
  secrets: SecretMaterial,
  generatedSecrets: Set<string>,
) {
  const key = generateToken();
  generatedSecrets.add(key);
  const command = commandFor("BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB", "2026-09-11T13:00:00Z");
  const booking = await book(pool, businessId, key, command, now, secrets);
  generatedSecrets.add(booking.managementToken);
  const valid = await lookupToken(pool, booking.managementToken, secrets.tokenPepper);
  const randomInvalid = generateToken();
  generatedSecrets.add(randomInvalid);
  const invalid = await lookupToken(pool, randomInvalid, secrets.tokenPepper);
  const idAlone = await lookupToken(pool, booking.appointmentId, secrets.tokenPepper);
  assert.equal(valid.kind, "AUTHORIZED");
  assert.deepEqual(invalid, idAlone);

  const constraintClient = await pool.connect();
  let activeUniqueSqlstate: string | undefined;
  let connectionReusableAfterSqlError = false;
  try {
    await constraintClient.query("begin");
    await constraintClient.query(
      `insert into app_private.appointment_access_token
       (id, appointment_id, token_hash, token_version, issued_at)
       values ($1, $2, $3, 999, $4)`,
      [randomUUID(), booking.appointmentId, randomBytes(32), now],
    );
  } catch (error) {
    activeUniqueSqlstate = postgresCode(error);
    await constraintClient.query("rollback");
    const probe = await constraintClient.query<{ value: number }>("select 1 as value");
    connectionReusableAfterSqlError = probe.rows[0]?.value === 1;
  } finally {
    constraintClient.release();
  }
  assert.equal(activeUniqueSqlstate, "23505");
  assert.equal(connectionReusableAfterSqlError, true);

  const failedRotationToken = generateToken();
  generatedSecrets.add(failedRotationToken);
  await assert.rejects(
    rotateToken(
      pool,
      booking.appointmentId,
      now,
      secrets.tokenPepper,
      failedRotationToken,
      true,
    ),
    /SIMULATED_ROTATION_FAILURE/,
  );
  const oldAfterFailedRotation = await lookupToken(pool, booking.managementToken, secrets.tokenPepper);
  const failedNewAfterRollback = await lookupToken(pool, failedRotationToken, secrets.tokenPepper);
  assert.equal(oldAfterFailedRotation.kind, "AUTHORIZED");
  assert.equal(failedNewAfterRollback.kind, "INVALID");

  const rotated = await rotateToken(
    pool,
    booking.appointmentId,
    new Date(now.getTime() + 1_000),
    secrets.tokenPepper,
  );
  generatedSecrets.add(rotated.rawToken);
  const oldAfterRotation = await lookupToken(pool, booking.managementToken, secrets.tokenPepper);
  const newAfterRotation = await lookupToken(pool, rotated.rawToken, secrets.tokenPepper);
  assert.equal(oldAfterRotation.kind, "INVALID");
  assert.equal(newAfterRotation.kind, "AUTHORIZED");
  const activeCountAfterRotation = await activeTokenCount(pool, booking.appointmentId);
  assert.equal(activeCountAfterRotation, 1);

  await pool.query(
    `update app_private.appointment set status = 'COMPLETED' where id = $1`,
    [booking.appointmentId],
  );
  const terminalLookup = await lookupToken(pool, rotated.rawToken, secrets.tokenPepper);
  const terminalMutation = await authorizeMutation(pool, rotated.rawToken, secrets.tokenPepper);
  assert.equal(terminalLookup.kind, "AUTHORIZED");
  assert.equal(terminalLookup.access, "READ_ONLY");
  assert.deepEqual(terminalMutation, { status: 409, code: "APPOINTMENT_READ_ONLY" });

  await revokeToken(pool, booking.appointmentId, new Date(now.getTime() + 2_000));
  const revoked = await lookupToken(pool, rotated.rawToken, secrets.tokenPepper);
  assert.deepEqual(revoked, invalid);

  const activeAfterRevoke = await activeTokenCount(pool, booking.appointmentId);
  assert.equal(activeAfterRevoke, 0);
  return {
    validLookup: { authorized: valid.kind === "AUTHORIZED", access: valid.access },
    uniformInvalidLookup: {
      invalidToken: invalid,
      appointmentIdAlone: idAlone,
      identicalStatusAndBody: JSON.stringify(invalid) === JSON.stringify(idAlone),
      timingClaimedUniform: false,
    },
    oneActiveConstraint: {
      sqlstate: activeUniqueSqlstate,
      expectedSqlstate: "23505",
      connectionReusableAfterRollback: connectionReusableAfterSqlError,
    },
    failedRotation: {
      oldTokenRemainedValid: oldAfterFailedRotation.kind === "AUTHORIZED",
      uncommittedNewTokenInvalid: failedNewAfterRollback.kind === "INVALID",
      atomicRollback: true,
    },
    successfulRotation: {
      oldTokenInvalid: oldAfterRotation.kind === "INVALID",
      newTokenValid: newAfterRotation.kind === "AUTHORIZED",
      activeTokenRows: activeCountAfterRotation,
    },
    terminalState: {
      readAllowed: terminalLookup.kind === "AUTHORIZED",
      access: terminalLookup.kind === "AUTHORIZED" ? terminalLookup.access : undefined,
      mutation: terminalMutation,
    },
    revocation: {
      lookupMatchesUniformInvalidResponse: JSON.stringify(revoked) === JSON.stringify(invalid),
      activeTokenRows: activeAfterRevoke,
    },
  };
}

async function idempotencyScenario(
  pool: Pool,
  businessA: string,
  businessB: string,
  now: Date,
  secrets: SecretMaterial,
  generatedSecrets: Set<string>,
) {
  const sameKey = generateToken();
  generatedSecrets.add(sameKey);
  const command = commandFor("CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC", "2026-09-12T13:00:00Z");
  let releaseFirst!: () => void;
  const firstMayCommit = new Promise<void>((resolve) => (releaseFirst = resolve));
  let effectReached!: () => void;
  const effectWasWritten = new Promise<void>((resolve) => (effectReached = resolve));
  const firstPromise = book(pool, businessA, sameKey, command, now, secrets, {
    label: "same-key-a",
    afterEffect: async () => {
      effectReached();
      await firstMayCommit;
    },
  });
  await effectWasWritten;
  const secondPromise = book(pool, businessA, sameKey, command, now, secrets, {
    label: "same-key-b",
  });
  const waitEvidence = await observeAdvisoryWait(pool, "spk003:same-key-b");
  releaseFirst();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  generatedSecrets.add(first.managementToken);
  assert.equal(first.appointmentId, second.appointmentId);
  assert.equal(first.managementToken, second.managementToken);
  const sameKeyCounts = await pool.query<{
    appointment_count: string;
    token_count: string;
    receipt_count: string;
  }>(`
    select
      (select count(*) from app_private.appointment where id = $1)::text as appointment_count,
      (select count(*) from app_private.appointment_access_token where appointment_id = $1)::text as token_count,
      (select count(*) from app_private.idempotency_request where appointment_id = $1)::text as receipt_count
  `, [first.appointmentId]);

  let mismatch: DomainError | undefined;
  try {
    await book(pool, businessA, sameKey, { ...command, notes: "different" }, now, secrets);
  } catch (error) {
    if (error instanceof DomainError) mismatch = error;
    else throw error;
  }
  assert.equal(mismatch?.code, "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");

  const rollbackKey = generateToken();
  generatedSecrets.add(rollbackKey);
  const rollbackCommand = commandFor("DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD", "2026-09-13T13:00:00Z");
  const totalsBeforeFailure = await domainTotals(pool, businessA);
  await assert.rejects(
    book(pool, businessA, rollbackKey, rollbackCommand, now, secrets, { failBeforeCommit: true }),
    /SIMULATED_PRECOMMIT_FAILURE/,
  );
  const rollbackHash = secretHash(rollbackKey, secrets.idempotencyPepper);
  const totalsAfterFailure = await domainTotals(pool, businessA);
  const receiptAfterFailure = await pool.query<{ receipts: string }>(`
    select
      count(*)::text as receipts
    from app_private.idempotency_request
    where business_id = $1 and key_hash = $2
  `, [businessA, rollbackHash]);
  assert.deepEqual(totalsAfterFailure, totalsBeforeFailure);
  assert.equal(receiptAfterFailure.rows[0]?.receipts, "0");
  const recovered = await book(pool, businessA, rollbackKey, rollbackCommand, now, secrets);
  generatedSecrets.add(recovered.managementToken);

  const isolated = await book(pool, businessB, sameKey, command, now, secrets);
  generatedSecrets.add(isolated.managementToken);
  assert.notEqual(isolated.appointmentId, first.appointmentId);
  const scopedRows = await pool.query<{ business_id: string; count: string }>(`
    select business_id::text, count(*)::text
    from app_private.idempotency_request
    where operation = $1 and key_hash = $2
    group by business_id
    order by business_id
  `, [OPERATION, secretHash(sameKey, secrets.idempotencyPepper)]);
  assert.deepEqual(scopedRows.rows, [
    { business_id: businessA, count: "1" },
    { business_id: businessB, count: "1" },
  ]);

  return {
    concurrentSameKeyAndFingerprint: {
      synchronization: waitEvidence,
      dispositions: [first.disposition, second.disposition],
      sameAppointmentId: first.appointmentId === second.appointmentId,
      sameRawTokenRecoveredFromEnvelope: first.managementToken === second.managementToken,
      sideEffects: sameKeyCounts.rows[0],
    },
    sameKeyDifferentFingerprint: {
      status: mismatch?.status,
      code: mismatch?.code,
      sideEffectCountUnchanged: sameKeyCounts.rows[0]?.appointment_count === "1",
    },
    rollbackBeforeCommit: {
      totalsBeforeFailure,
      totalsAfterFailure,
      unchanged: JSON.stringify(totalsAfterFailure) === JSON.stringify(totalsBeforeFailure),
      receiptRowsForFailedKey: receiptAfterFailure.rows[0]?.receipts,
      retryDisposition: recovered.disposition,
      retryCreatedOneAppointment: true,
    },
    businessScope: {
      sameRawKeyAllowedAcrossBusinesses: true,
      distinctAppointmentIds: isolated.appointmentId !== first.appointmentId,
      scopedReceiptRows: scopedRows.rows,
      uniquenessKey: "(business_id, operation, key_hash)",
    },
  };
}

async function envelopeScenario(
  pool: Pool,
  businessId: string,
  now: Date,
  secrets: SecretMaterial,
  generatedSecrets: Set<string>,
) {
  const key = generateToken();
  generatedSecrets.add(key);
  const command = commandFor("EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE", "2026-09-14T13:00:00Z");
  let responseLoss: Error | undefined;
  try {
    await book(pool, businessId, key, command, now, secrets, { failAfterCommit: true });
  } catch (error) {
    responseLoss = error as Error;
  }
  assert.match(responseLoss?.message ?? "", /SIMULATED_RESPONSE_LOSS_AFTER_COMMIT/);
  const retry = await book(pool, businessId, key, command, now, secrets);
  generatedSecrets.add(retry.managementToken);
  assert.equal(retry.disposition, "REPLAYED");
  const effectRows = await pool.query<{ appointments: string; receipts: string; tokens: string }>(`
    select
      (select count(*) from app_private.appointment where id = $1)::text as appointments,
      (select count(*) from app_private.idempotency_request where appointment_id = $1)::text as receipts,
      (select count(*) from app_private.appointment_access_token where appointment_id = $1)::text as tokens
  `, [retry.appointmentId]);

  const directAad = "spk003:aad:v1";
  const directKey = secrets.envelopeKeys.get("env-v2")!;
  const directPlaintext = { managementToken: generateToken(), responseStatus: 201 };
  generatedSecrets.add(directPlaintext.managementToken);
  const firstEnvelope = encryptEnvelope(directPlaintext, directKey, "env-v2", directAad);
  const secondEnvelope = encryptEnvelope(directPlaintext, directKey, "env-v2", directAad);
  const roundTrip = decryptEnvelope<typeof directPlaintext>(firstEnvelope, directKey, directAad);
  assert.deepEqual(roundTrip, directPlaintext);
  assert.equal(firstEnvelope.nonce.equals(secondEnvelope.nonce), false);
  let tamperRejected = false;
  const tamperedCiphertext = Buffer.from(firstEnvelope.ciphertext);
  tamperedCiphertext[0] = tamperedCiphertext[0]! ^ 1;
  try {
    decryptEnvelope(
      { ...firstEnvelope, ciphertext: tamperedCiphertext },
      directKey,
      directAad,
    );
  } catch {
    tamperRejected = true;
  }
  assert.equal(tamperRejected, true);

  const afterEnvelopeExpiry = new Date(now.getTime() + ENVELOPE_TTL_MS + 1);
  const receiptBeforeCleanup = await pool.query<{
    envelope_key_version: string | null;
    encrypted: boolean;
    ciphertext_differs_from_hash: boolean;
  }>(`
    select envelope_key_version,
      response_envelope is not null as encrypted,
      response_envelope is distinct from request_fingerprint as ciphertext_differs_from_hash
    from app_private.idempotency_request
    where appointment_id = $1
  `, [retry.appointmentId]);
  assert.equal(receiptBeforeCleanup.rows[0]?.encrypted, true);
  let expired: DomainError | undefined;
  try {
    await book(pool, businessId, key, command, afterEnvelopeExpiry, secrets);
  } catch (error) {
    if (error instanceof DomainError) expired = error;
    else throw error;
  }
  assert.equal(expired?.code, "IDEMPOTENCY_RESPONSE_EXPIRED_ADMIN_REISSUE_REQUIRED");
  const cleanup = await pool.query<{ id: string }>(`
    update app_private.idempotency_request
    set response_envelope = null,
        envelope_nonce = null,
        envelope_auth_tag = null,
        envelope_key_version = null,
        envelope_expires_at = null
    where response_envelope is not null
      and envelope_expires_at <= $1
    returning id
  `, [afterEnvelopeExpiry]);
  const afterCleanupCounts = await pool.query<{ appointments: string; receipts: string }>(`
    select
      (select count(*) from app_private.appointment where id = $1)::text as appointments,
      (select count(*) from app_private.idempotency_request where appointment_id = $1)::text as receipts
  `, [retry.appointmentId]);
  assert.deepEqual(afterCleanupCounts.rows[0], { appointments: "1", receipts: "1" });

  return {
    uncertainCommitResponse: {
      simulatedFailure: responseLoss?.message,
      committedBeforeResponseLoss: true,
      retryDisposition: retry.disposition,
      exactTokenAndLinkRecoverable: true,
      sideEffectsAfterRetry: effectRows.rows[0],
    },
    construction: {
      algorithm: "AES-256-GCM",
      implementation: "node:crypto createCipheriv/createDecipheriv",
      keyBytes: directKey.length,
      nonceBytes: firstEnvelope.nonce.length,
      authTagBytes: firstEnvelope.authTag.length,
      additionalAuthenticatedData: "receipt id + business + operation + fingerprint version + envelope expiry",
      keyVersion: firstEnvelope.keyVersion,
      keyStoredInDatabase: false,
      keyRotationByVersionMap: true,
    },
    authenticatedEncryption: {
      roundTripExact: JSON.stringify(roundTrip) === JSON.stringify(directPlaintext),
      randomNonceProducesDistinctNonce: !firstEnvelope.nonce.equals(secondEnvelope.nonce),
      tamperedCiphertextRejected: tamperRejected,
    },
    ttlAndCleanup: {
      envelopeTtlHours: ENVELOPE_TTL_MS / 3_600_000,
      receiptTtlHours: RECEIPT_TTL_MS / 3_600_000,
      replayAfterEnvelopeExpiry: { status: expired?.status, code: expired?.code },
      expiredEnvelopeRowsCleared: cleanup.rowCount,
      receiptRetainedToPreventDuplicate: afterCleanupCounts.rows[0]?.receipts === "1",
      appointmentNotDuplicated: afterCleanupCounts.rows[0]?.appointments === "1",
    },
    persistedReceiptBeforeCleanup: receiptBeforeCleanup.rows[0],
    necessityFinding: {
      withoutRecoveryMaterial: "cannot reproduce the raw token from a one-way hash after a commit/response-loss window",
      rawTokenStorage: "rejected: database disclosure immediately grants capability",
      deterministicTokenFromIdempotencyKey: "rejected: couples two client/server secrets and makes client key compromise a management capability",
      encryptedShortTtlEnvelope: "smallest tested mechanism that preserves retry semantics without plaintext persistence",
    },
  };
}

async function persistenceLeakAudit(pool: Pool, secrets: Set<string>) {
  const dump = await pool.query<{ value: string }>(`
    select concat_ws('|',
      coalesce(id::text, ''),
      coalesce(appointment_id::text, ''),
      encode(token_hash, 'hex'),
      coalesce(rotation_reason, '')
    ) as value
    from app_private.appointment_access_token
    union all
    select concat_ws('|',
      id::text,
      business_id::text,
      operation,
      encode(key_hash, 'hex'),
      encode(request_fingerprint, 'hex'),
      coalesce(encode(response_envelope, 'hex'), '')
    )
    from app_private.idempotency_request
  `);
  const serialized = JSON.stringify(dump.rows);
  const leaked = [...secrets].filter((secret) => serialized.includes(secret));
  assert.deepEqual(leaked, []);
  const columns = await pool.query<{ table_name: string; column_name: string }>(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'app_private'
      and (column_name ilike '%pepper%' or column_name ilike '%raw_token%' or column_name ilike '%raw_key%')
    order by table_name, column_name
  `);
  assert.equal(columns.rowCount, 0);
  const safeLog = safeLogRecord({
    event: "token_lookup",
    result: "invalid",
    businessId: "10000000-0000-4000-8000-000000000001",
    appointmentId: "20000000-0000-4000-8000-000000000001",
    sqlstate: "23505",
    rawToken: [...secrets][0],
    requestBody: { token: [...secrets][1] },
  });
  assert.equal([...secrets].some((secret) => safeLog.includes(secret)), false);
  return {
    generatedSecretCountAudited: secrets.size,
    databaseProjectionContainsRawSecret: false,
    forbiddenSecretColumns: columns.rows,
    loggerPolicy: "allowlist only: event/result/businessId/appointmentId/sqlstate",
    safeLogSample: JSON.parse(safeLog) as unknown,
    safeLogContainsRawSecret: false,
  };
}

async function schemaEvidence(pool: Pool) {
  const version = await pool.query<{ postgres: string }>(
    `select current_setting('server_version') as postgres`,
  );
  const indexes = await pool.query<{ indexname: string; indexdef: string }>(`
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'app_private'
      and tablename in ('appointment_access_token', 'idempotency_request')
    order by indexname
  `);
  const constraints = await pool.query<{ constraint_name: string; definition: string }>(`
    select c.conname as constraint_name, pg_get_constraintdef(c.oid, true) as definition
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'app_private'
      and t.relname in ('appointment_access_token', 'idempotency_request')
    order by c.conname
  `);
  return {
    postgres: version.rows[0]!.postgres,
    indexes: indexes.rows,
    constraints: constraints.rows,
  };
}

async function book(
  pool: Pool,
  businessId: string,
  rawIdempotencyKey: string,
  command: RawBookingCommand,
  now: Date,
  secrets: SecretMaterial,
  hooks: BookingHooks = {},
): Promise<BookingResult> {
  const client = await pool.connect();
  const keyHash = secretHash(rawIdempotencyKey, secrets.idempotencyPepper);
  const fingerprint = canonicalFingerprint(command);
  const lockDigest = createHash("sha256")
    .update(businessId)
    .update(OPERATION)
    .update(keyHash)
    .digest();
  let committed = false;
  try {
    await client.query("begin");
    await client.query(`select set_config('application_name', $1, true)`, [
      `spk003:${hooks.label ?? "booking"}`,
    ]);
    await client.query(`select pg_advisory_xact_lock($1, $2)`, [
      lockDigest.readInt32BE(0),
      lockDigest.readInt32BE(4),
    ]);
    const existing = await client.query<ReceiptRow>(`
      select id, business_id, operation, request_fingerprint,
        fingerprint_version, appointment_id, response_status,
        response_envelope, envelope_nonce, envelope_auth_tag,
        envelope_key_version, envelope_expires_at, expires_at
      from app_private.idempotency_request
      where business_id = $1 and operation = $2 and key_hash = $3
      for update
    `, [businessId, OPERATION, keyHash]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (!row.request_fingerprint.equals(fingerprint.sha256)) {
        throw new DomainError("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST", 409);
      }
      if (
        !row.response_envelope
        || !row.envelope_nonce
        || !row.envelope_auth_tag
        || !row.envelope_key_version
        || !row.envelope_expires_at
        || row.envelope_expires_at.getTime() <= now.getTime()
      ) {
        throw new DomainError(
          "IDEMPOTENCY_RESPONSE_EXPIRED_ADMIN_REISSUE_REQUIRED",
          409,
          row.appointment_id,
        );
      }
      const key = secrets.envelopeKeys.get(row.envelope_key_version);
      if (!key) throw new Error("ENVELOPE_KEY_VERSION_UNAVAILABLE");
      const response = decryptEnvelope<Omit<BookingResult, "disposition">>(
        {
          ciphertext: row.response_envelope,
          nonce: row.envelope_nonce,
          authTag: row.envelope_auth_tag,
          keyVersion: row.envelope_key_version,
        },
        key,
        receiptAad(
          row.id,
          row.business_id,
          row.operation,
          row.fingerprint_version,
          row.envelope_expires_at,
        ),
      );
      await client.query("commit");
      committed = true;
      return { disposition: "REPLAYED", ...response };
    }

    const appointmentId = randomUUID();
    const tokenId = randomUUID();
    const managementToken = generateToken();
    const managementLink = `https://booking.invalid/manage#token=${encodeURIComponent(managementToken)}`;
    await client.query(`
      insert into app_private.appointment
        (id, business_id, status, version, effect_count, created_at)
      values ($1, $2, 'CONFIRMED', 1, 1, $3)
    `, [appointmentId, businessId, now]);
    await client.query(`
      insert into app_private.appointment_access_token
        (id, appointment_id, token_hash, token_version, issued_at)
      values ($1, $2, $3, 1, $4)
    `, [tokenId, appointmentId, secretHash(managementToken, secrets.tokenPepper), now]);
    await hooks.afterEffect?.();
    if (hooks.failBeforeCommit) throw new Error("SIMULATED_PRECOMMIT_FAILURE");

    const receiptId = randomUUID();
    const envelopeExpiresAt = new Date(now.getTime() + ENVELOPE_TTL_MS);
    const receiptExpiresAt = new Date(now.getTime() + RECEIPT_TTL_MS);
    const envelopeKey = secrets.envelopeKeys.get(secrets.activeEnvelopeKeyVersion)!;
    const response = {
      appointmentId,
      managementToken,
      managementLink,
      responseStatus: 201,
    };
    const encrypted = encryptEnvelope(
      response,
      envelopeKey,
      secrets.activeEnvelopeKeyVersion,
      receiptAad(
        receiptId,
        businessId,
        OPERATION,
        fingerprint.version,
        envelopeExpiresAt,
      ),
    );
    await client.query(`
      insert into app_private.idempotency_request (
        id, business_id, operation, key_hash, request_fingerprint,
        fingerprint_version, status, appointment_id, response_status,
        response_envelope, envelope_nonce, envelope_auth_tag,
        envelope_key_version, envelope_expires_at, created_at, expires_at
      ) values (
        $1, $2, $3, $4, $5,
        $6, 'SUCCEEDED', $7, 201,
        $8, $9, $10,
        $11, $12, $13, $14
      )
    `, [
      receiptId,
      businessId,
      OPERATION,
      keyHash,
      fingerprint.sha256,
      fingerprint.version,
      appointmentId,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.authTag,
      encrypted.keyVersion,
      envelopeExpiresAt,
      now,
      receiptExpiresAt,
    ]);
    await client.query("commit");
    committed = true;
    if (hooks.failAfterCommit) {
      throw new Error("SIMULATED_RESPONSE_LOSS_AFTER_COMMIT");
    }
    return { disposition: "CREATED", ...response };
  } catch (error) {
    if (!committed) await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function receiptAad(
  id: string,
  businessId: string,
  operation: string,
  fingerprintVersion: string,
  envelopeExpiresAt: Date,
) {
  return [
    "spk003-envelope/v1",
    id,
    businessId,
    operation,
    fingerprintVersion,
    envelopeExpiresAt.toISOString(),
  ].join("|");
}

async function lookupToken(pool: Pool, rawToken: string, pepper: Buffer) {
  const result = await pool.query<{
    appointment_id: string;
    token_id: string;
    token_version: number;
    status: string;
    appointment_version: number;
  }>(`
    select a.id as appointment_id, t.id as token_id, t.token_version,
      a.status, a.version as appointment_version
    from app_private.appointment_access_token t
    join app_private.appointment a on a.id = t.appointment_id
    where t.token_hash = $1 and t.revoked_at is null
  `, [secretHash(rawToken, pepper)]);
  const row = result.rows[0];
  if (!row) return { kind: "INVALID" as const, status: 404, code: "MANAGEMENT_LINK_INVALID" };
  const terminal = ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(row.status);
  return {
    kind: "AUTHORIZED" as const,
    appointmentId: row.appointment_id,
    tokenRef: row.token_id,
    tokenVersion: row.token_version,
    appointmentVersion: row.appointment_version,
    access: terminal ? "READ_ONLY" as const : "READ_WRITE" as const,
  };
}

async function authorizeMutation(pool: Pool, rawToken: string, pepper: Buffer) {
  const lookup = await lookupToken(pool, rawToken, pepper);
  if (lookup.kind === "INVALID") return { status: lookup.status, code: lookup.code };
  if (lookup.access === "READ_ONLY") return { status: 409, code: "APPOINTMENT_READ_ONLY" };
  return { status: 200, code: "AUTHORIZED" };
}

async function rotateToken(
  pool: Pool,
  appointmentId: string,
  now: Date,
  pepper: Buffer,
  suppliedRawToken = generateToken(),
  failAfterRevoke = false,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `select id from app_private.appointment where id = $1 for update`,
      [appointmentId],
    );
    const active = await client.query<{ token_version: number }>(`
      select token_version
      from app_private.appointment_access_token
      where appointment_id = $1 and revoked_at is null
      for update
    `, [appointmentId]);
    assert.equal(active.rowCount, 1);
    await client.query(`
      update app_private.appointment_access_token
      set revoked_at = $2, rotation_reason = 'ADMIN_REISSUE'
      where appointment_id = $1 and revoked_at is null
    `, [appointmentId, now]);
    if (failAfterRevoke) throw new Error("SIMULATED_ROTATION_FAILURE");
    await client.query(`
      insert into app_private.appointment_access_token
        (id, appointment_id, token_hash, token_version, issued_at)
      values ($1, $2, $3, $4, $5)
    `, [
      randomUUID(),
      appointmentId,
      secretHash(suppliedRawToken, pepper),
      active.rows[0]!.token_version + 1,
      now,
    ]);
    await client.query("commit");
    return { rawToken: suppliedRawToken };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function revokeToken(pool: Pool, appointmentId: string, now: Date) {
  await pool.query(`
    update app_private.appointment_access_token
    set revoked_at = $2, rotation_reason = 'REVOKED'
    where appointment_id = $1 and revoked_at is null
  `, [appointmentId, now]);
}

async function activeTokenCount(pool: Pool, appointmentId: string) {
  const result = await pool.query<{ count: string }>(`
    select count(*)::text as count
    from app_private.appointment_access_token
    where appointment_id = $1 and revoked_at is null
  `, [appointmentId]);
  return Number(result.rows[0]!.count);
}

async function observeAdvisoryWait(pool: Pool, applicationName: string) {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const result = await pool.query<{ wait_event_type: string; wait_event: string }>(`
      select wait_event_type, wait_event
      from pg_stat_activity
      where application_name = $1 and wait_event_type = 'Lock'
    `, [applicationName]);
    if (result.rows[0]) {
      return {
        method: "first transaction held the per-key advisory xact lock; observer waited for pg_stat_activity wait_event_type=Lock before release",
        arbitrarySleepControlsCorrectness: false,
        observedWaitEventType: result.rows[0].wait_event_type,
        observedWaitEvent: result.rows[0].wait_event,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Did not observe second idempotent request waiting on the advisory lock");
}

async function domainTotals(pool: Pool, businessId: string) {
  const result = await pool.query<{ appointments: string; receipts: string; tokens: string }>(`
    select
      (select count(*) from app_private.appointment where business_id = $1)::text as appointments,
      (select count(*) from app_private.idempotency_request where business_id = $1)::text as receipts,
      (select count(*)
       from app_private.appointment_access_token t
       join app_private.appointment a on a.id = t.appointment_id
       where a.business_id = $1)::text as tokens
  `, [businessId]);
  return result.rows[0]!;
}

function commandFor(serviceId: string, startAt: string): RawBookingCommand {
  return {
    serviceId,
    startAt,
    customerName: "Cliente Teste",
    whatsappE164: "+5561999990000",
    notes: null,
  };
}

function postgresCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function safeLogRecord(input: Record<string, unknown>) {
  const allowlist = ["event", "result", "businessId", "appointmentId", "sqlstate"];
  return JSON.stringify(Object.fromEntries(
    allowlist.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]),
  ));
}
