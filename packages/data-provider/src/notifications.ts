export const notificationTypes = ['generic', 'system', 'announcement'] as const;

export type NotificationType = (typeof notificationTypes)[number];
