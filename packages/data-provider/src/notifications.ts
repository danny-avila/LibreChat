export const notificationTypes = ['generic', 'system'] as const;

export type NotificationType = (typeof notificationTypes)[number];
