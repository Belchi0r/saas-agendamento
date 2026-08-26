export function currencyFractionDigits(currencyCode: string): number {
  const fractionDigits = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currencyCode,
  }).resolvedOptions().maximumFractionDigits;

  if (fractionDigits === undefined) {
    throw new RangeError("Currency fraction digits are unavailable.");
  }

  return fractionDigits;
}

export function formatMinorUnits(
  priceMinor: number,
  currencyCode: string,
): string {
  const fractionDigits = currencyFractionDigits(currencyCode);
  const divisor = 10 ** fractionDigits;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currencyCode,
  }).format(priceMinor / divisor);
}

export function minorUnitsToInput(
  priceMinor: number,
  currencyCode: string,
): string {
  const fractionDigits = currencyFractionDigits(currencyCode);
  const divisor = 10 ** fractionDigits;
  const major = Math.floor(priceMinor / divisor);

  if (fractionDigits === 0) {
    return String(major);
  }

  return `${major},${String(priceMinor % divisor).padStart(fractionDigits, "0")}`;
}

export function parseMinorUnits(
  input: string,
  currencyCode: string,
): number | null {
  const fractionDigits = currencyFractionDigits(currencyCode);
  const normalized = input.trim();
  const pattern =
    fractionDigits === 0
      ? /^\d+$/
      : new RegExp(`^\\d+(?:[,.]\\d{1,${fractionDigits}})?$`);

  if (!pattern.test(normalized)) {
    return null;
  }

  const [majorText, fractionText = ""] = normalized.replace(",", ".").split(".");
  const divisor = 10 ** fractionDigits;
  const value =
    Number(majorText) * divisor +
    Number(fractionText.padEnd(fractionDigits, "0") || "0");

  return Number.isSafeInteger(value) ? value : null;
}
