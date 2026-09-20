export type LeadIdentity = {
  domain?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
};

const norm = (v?: string | null) => v?.trim().toLowerCase() || null;
const normPhone = (v?: string | null) => v?.replace(/\D/g, "") || null;

export function buildDedupeKeys(input: LeadIdentity) {
  const domain = norm(input.domain)?.replace(/^www\./, "");
  const email = norm(input.email);
  const phone = normPhone(input.phone);
  const companyName = norm(input.companyName);

  return {
    domainKey: domain ? `domain:${domain}` : null,
    emailKey: email ? `email:${email}` : null,
    phoneKey: phone ? `phone:${phone}` : null,
    companyKey: companyName ? `company:${companyName}` : null
  };
}

export function hasStrongDuplicateSignal(a: LeadIdentity, b: LeadIdentity) {
  const ka = buildDedupeKeys(a);
  const kb = buildDedupeKeys(b);

  return Boolean(
    (ka.domainKey && ka.domainKey === kb.domainKey) ||
    (ka.emailKey && ka.emailKey === kb.emailKey) ||
    (ka.phoneKey && ka.phoneKey === kb.phoneKey)
  );
}
