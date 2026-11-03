import type { RideChatMessageDto } from '@cabzone/contracts';

export function mergeChatMessages(
  previous: RideChatMessageDto[],
  incoming: RideChatMessageDto[],
  now = Date.now(),
) {
  const byId = new Map(previous.concat(incoming).map((m) => [m.id, m]));
  return [...byId.values()]
    .filter((m) => Date.parse(m.createdAt) > now - 86_400_000)
    .sort((a, b) => a.sequence - b.sequence);
}

export function newChatMessageId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function isChatAccessError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  if (code === 'SESSION_CHANGED' || message.startsWith('Session changed')) return false;
  const status = 'status' in error ? Number(error.status) : NaN;
  if ([401, 403, 404].includes(status)) return true;
  return (status === 409 || status === 503) && message.startsWith('COMMUNICATION_CLOSED');
}

/** Up to two letters for the avatar: first and last word of the name. */
export function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
}
