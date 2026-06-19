import { resolveSubscriberStatus } from '../../shared/subscriberStatus';

export { resolveSubscriberStatus };

export function getDisplayStatus(subscriber: { status: string; expiry?: string }) {
  return resolveSubscriberStatus(subscriber.status, subscriber.expiry);
}

export function buildAuthHeaders(role: string, currentUser: any): Record<string, string> {
  const headers: Record<string, string> = {
    'X-User-Role': role,
  };
  if (currentUser?.ispAdminId) headers['X-ISP-Admin-Id'] = currentUser.ispAdminId;
  if (currentUser?.franchiseAdminId) headers['X-Franchise-Admin-Id'] = currentUser.franchiseAdminId;
  return headers;
}

export function apiFetch(
  url: string,
  role: string,
  currentUser: any,
  options: RequestInit = {}
) {
  return fetch(url, {
    ...options,
    headers: {
      ...buildAuthHeaders(role, currentUser),
      ...(options.headers || {}),
    },
  });
}
