export const WORKFLOW_STATUSES = [
  'KYC Pending',
  'KYC Verified',
  'Approved',
  'Installation Scheduled',
  'Installation Completed',
  'Suspended',
  'Terminated',
  'Under Review',
  'Draft',
];

export const WORKFLOW_ORDER = [
  'KYC Pending',
  'KYC Verified',
  'Approved',
  'Installation Scheduled',
  'Installation Completed',
  'Active',
] as const;

export function canTransitionTo(current: string, next: string): boolean {
  const idx = WORKFLOW_ORDER.indexOf(current as any);
  return idx !== -1 && WORKFLOW_ORDER[idx + 1] === next;
}

export type PlanStatus = 'Active' | 'Expiring7d' | 'Expiring3d' | 'Expiring1d' | 'Expired' | 'Suspended';

export function parseExpiry(expiry: string | Date | null | undefined): Date | null {
  if (!expiry || expiry === '-') return null;
  const date = expiry instanceof Date ? expiry : new Date(expiry);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function classifyPlanStatus(expiryDate: Date | null, now = new Date()): PlanStatus | null {
  if (!expiryDate) return null;
  const diffDays = Math.ceil(
    (startOfDay(expiryDate).getTime() - startOfDay(now).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return 'Suspended';
  if (diffDays === 0) return 'Expired';
  if (diffDays <= 1) return 'Expiring1d';
  if (diffDays <= 3) return 'Expiring3d';
  if (diffDays <= 7) return 'Expiring7d';
  return 'Active';
}

export function resolveSubscriberStatus(
  rawStatus: string,
  expiry: string | Date | null | undefined,
  now = new Date()
): string {
  if (WORKFLOW_STATUSES.includes(rawStatus)) return rawStatus;
  const expiryDate = parseExpiry(expiry);
  if (!expiryDate) return rawStatus;
  const computed = classifyPlanStatus(expiryDate, now);
  if (computed === 'Suspended') return 'Suspended';
  if (computed === 'Expired') return 'Expired';
  return computed || rawStatus;
}

export function shouldAutoExpire(
  rawStatus: string,
  expiry: string | Date | null | undefined,
  now = new Date()
): boolean {
  if (WORKFLOW_STATUSES.includes(rawStatus)) return false;
  const expiryDate = parseExpiry(expiry);
  if (!expiryDate) return false;
  return classifyPlanStatus(expiryDate, now) === 'Suspended';
}

export function expiryDaysRemaining(
  expiry: string | Date | null | undefined,
  now = new Date()
): number | null {
  const expiryDate = parseExpiry(expiry);
  if (!expiryDate) return null;
  return Math.ceil(
    (startOfDay(expiryDate).getTime() - startOfDay(now).getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function countSubscriberMetrics(subscribers: { status: string }[]) {
  return {
    totalUsers: subscribers.length,
    activeUsers: subscribers.filter((s) => s.status === 'Active').length,
    suspendedUsers: subscribers.filter((s) => s.status === 'Suspended').length,
    expiredUsers: subscribers.filter((s) => s.status === 'Expired').length,
    expiringWithin7Days: subscribers.filter((s) => ['Expiring7d', 'Expiring3d', 'Expiring1d'].includes(s.status)).length,
  };
}
