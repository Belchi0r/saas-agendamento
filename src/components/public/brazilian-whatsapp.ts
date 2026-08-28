export function maskBrazilianWhatsappInput(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  if (subscriber.length <= 5) return `(${ddd}) ${subscriber}`;
  return `(${ddd}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`;
}

export function formatBrazilianWhatsapp(value: string): string {
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 13 && digits.startsWith("55")
    ? digits.slice(2)
    : digits;
  return national.length === 11 ? maskBrazilianWhatsappInput(national) : value;
}
