export function whatsappInviteUrl(name: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`Join my ${name} circle on CreditWithFriends: ${url}`)}`;
}
