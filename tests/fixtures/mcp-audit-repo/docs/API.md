# Platform API

REST endpoints exposed by the fixture platform.

## Authentication

| Method | Path | Description |
| - | - | - |
| POST | `/api/auth/login` | Exchange email + password for a session token. |
| POST | `/api/auth/logout` | Revoke the current session. |
| POST | `/api/auth/refresh` | Refresh an expiring token. |
| POST | `/api/auth/password-reset` | Request a password-reset token. |
| POST | `/api/auth/password-reset/confirm` | Redeem a reset token with a new password. |

## Users

| Method | Path | Description |
| - | - | - |
| GET | `/api/users` | List users. |
| POST | `/api/users` | Create a user. |
| GET | `/api/users/:id` | Fetch one user. |
| DELETE | `/api/users/:id` | Delete a user. |

## Payments

| Method | Path | Description |
| - | - | - |
| POST | `/api/payments` | Process a payment. |
| POST | `/api/payments/:id/refund` | Refund a charge. |
| GET | `/api/invoices` | List invoices. |

## Errors

Errors are returned as `{ "error": "<message>" }` with the matching HTTP status
(400 validation, 401 auth, 404 missing, 429 rate limit, 500 internal).