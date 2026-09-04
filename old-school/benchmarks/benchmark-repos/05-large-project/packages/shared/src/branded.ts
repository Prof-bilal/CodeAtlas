export type Brand<K, T> = T & { readonly __brand: K };
export type UserId = Brand<'UserId', string>;
export type OrganizationId = Brand<'OrganizationId', string>;
export type ProjectId = Brand<'ProjectId', string>;
export type TaskId = Brand<'TaskId', string>;
export type OrderId = Brand<'OrderId', string>;
export type PaymentId = Brand<'PaymentId', string>;
export type InvoiceId = Brand<'InvoiceId', string>;
export type SubscriptionId = Brand<'SubscriptionId', string>;
export type TokenId = Brand<'TokenId', string>;
export type SessionId = Brand<'SessionId', string>;
export type FileId = Brand<'FileId', string>;
export type WebhookId = Brand<'WebhookId', string>;
export type IntegrationId = Brand<'IntegrationId', string>;
export type NotificationId = Brand<'NotificationId', string>;
export type EmailAddress = Brand<'EmailAddress', string>;
export type PhoneNumber = Brand<'PhoneNumber', string>;
export type Currency = Brand<'Currency', string>;
export type UUID = Brand<'UUID', string>;
export type JWT = Brand<'JWT', string>;
export type Hash = Brand<'Hash', string>;
export type URL = Brand<'URL', string>;
export type PositiveInteger = Brand<'PositiveInteger', number>;
export type Percentage = Brand<'Percentage', number>;
export function UserId(v: string): UserId { return v as UserId; }
export function OrganizationId(v: string): OrganizationId { return v as OrganizationId; }
export function ProjectId(v: string): ProjectId { return v as ProjectId; }
export function TaskId(v: string): TaskId { return v as TaskId; }
export function OrderId(v: string): OrderId { return v as OrderId; }
export function PaymentId(v: string): PaymentId { return v as PaymentId; }
export function EmailAddress(v: string): EmailAddress { return v as EmailAddress; }
export function Currency(v: string): Currency { return v as Currency; }
export function UUID(v: string): UUID { return v as UUID; }
export function JWT(v: string): JWT { return v as JWT; }