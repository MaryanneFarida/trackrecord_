/** Shows enough of an email to recognise it, without putting the full address on screen: ke***@gmail.com */
export function maskEmail(email: string | null | undefined) {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 2)}***@${domain}`;
}
