function candidate(plainDateTime, disambiguation) {
  try {
    const zoned = plainDateTime.toZonedDateTime("America/New_York", {
      disambiguation,
    });
    return {
      instantUtc: zoned.toInstant().toString(),
      localRoundTrip: zoned.toPlainDateTime().toString(),
      offset: zoned.offset,
    };
  } catch (error) {
    return {
      error: error.name,
      message: error.message,
    };
  }
}

if (typeof globalThis.Temporal === "undefined") {
  process.stdout.write(JSON.stringify({
    availability: "UNAVAILABLE",
    globalType: "undefined",
  }));
} else {
  const gap = Temporal.PlainDateTime.from("2025-03-09T02:30");
  const fold = Temporal.PlainDateTime.from("2025-11-02T01:30");
  process.stdout.write(JSON.stringify({
    availability: "EXPERIMENTAL_FLAG",
    globalType: typeof globalThis.Temporal,
    namespaceKeys: Object.keys(Temporal),
    vectors: {
      gap: {
        earlier: candidate(gap, "earlier"),
        later: candidate(gap, "later"),
        compatible: candidate(gap, "compatible"),
        reject: candidate(gap, "reject"),
      },
      fold: {
        earlier: candidate(fold, "earlier"),
        later: candidate(fold, "later"),
        compatible: candidate(fold, "compatible"),
        reject: candidate(fold, "reject"),
      },
    },
  }));
}
