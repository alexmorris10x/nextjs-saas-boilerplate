/** Evaluate per request so removing an address removes its internal entitlement. */
export function internalAccountEmails(value = process.env.INTERNAL_ACCOUNT_EMAILS ?? "") {
  return [...new Set(value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function isInternalAccount(email, value = process.env.INTERNAL_ACCOUNT_EMAILS ?? "") {
  return Boolean(email?.trim() && internalAccountEmails(value).includes(email.trim().toLowerCase()));
}
