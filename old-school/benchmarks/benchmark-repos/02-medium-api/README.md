# Medium API

A comprehensive production-ready API with authentication, payments, notifications, and more.

## Features

- **Authentication**: JWT-based auth with refresh tokens
- **User Management**: CRUD operations with role-based access
- **Task Management**: Create, assign, and track tasks
- **Payments**: Stripe integration for payment processing
- **Subscriptions**: Subscription management with billing
- **Notifications**: Email, push, and in-app notifications
- **File Storage**: File upload and management
- **Webhooks**: Event-driven webhook system
- **Search**: Full-text search capabilities
- **Audit Logging**: Comprehensive audit trail
- **API Keys**: API key management for external access
- **Rate Limiting**: Configurable rate limiting
- **Caching**: Redis-based caching layer

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.3+
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Cache**: Redis
- **Queue**: Bull (Redis-based)
- **Payments**: Stripe
- **Email**: Nodemailer
- **Validation**: Zod
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Database Setup

```bash
npm run migrate
npm run seed
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## Testing

```bash
npm test
npm run test:coverage
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Logout

### Users
- `GET /users/profile` - Get profile
- `PUT /users/profile` - Update profile
- `DELETE /users/profile` - Delete account

### Tasks
- `GET /tasks` - List tasks
- `POST /tasks` - Create task
- `GET /tasks/:id` - Get task
- `PUT /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task

### Payments
- `GET /payments` - List payments
- `POST /payments` - Create payment
- `POST /payments/:id/process` - Process payment
- `POST /payments/:id/refund` - Refund payment

### Subscriptions
- `GET /subscriptions` - Get subscription
- `POST /subscriptions` - Create subscription
- `POST /subscriptions/:id/cancel` - Cancel subscription

### Notifications
- `GET /notifications` - List notifications
- `POST /notifications/:id/read` - Mark as read
- `POST /notifications/read-all` - Mark all as read

### Files
- `GET /files` - List files
- `POST /files/upload` - Upload file
- `DELETE /files/:id` - Delete file

### Webhooks
- `GET /webhooks` - List webhooks
- `POST /webhooks` - Create webhook
- `PUT /webhooks/:id` - Update webhook
- `DELETE /webhooks/:id` - Delete webhook

### Search
- `GET /search?q=query` - Search
- `POST /search/reindex` - Reindex

### API Keys
- `GET /api-keys` - List API keys
- `POST /api-keys` - Create API key
- `DELETE /api-keys/:id` - Revoke API key

## Architecture

The project follows a clean architecture pattern:

- **Controllers**: Handle HTTP requests
- **Services**: Business logic
- **Repositories**: Data access
- **Models**: Data structures
- **Middleware**: Request processing
- **Utils**: Shared utilities

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT
