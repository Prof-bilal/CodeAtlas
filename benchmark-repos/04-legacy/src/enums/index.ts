// Enums - OLD
// DEPRECATED

export enum UserRole {
  Admin = 'admin',
  User = 'user',
  Viewer = 'viewer',
  Guest = 'guest', // No longer used
}

export enum PaymentStatus {
  Pending = 'pending',
  Completed = 'completed',
  Failed = 'failed',
  Refunded = 'refunded',
}

export enum OrderStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Shipped = 'shipped',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
}
