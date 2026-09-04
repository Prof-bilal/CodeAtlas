# Task Manager API

A simple task management API built with Express, TypeScript, and PostgreSQL.

## Features

- User authentication (register, login, logout)
- JWT-based authorization
- Task CRUD operations
- Task filtering and pagination
- Task statistics
- Role-based access control

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14.0.0
- npm or yarn

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=task_manager
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h
PORT=3000
NODE_ENV=development
```

## Database Setup

```bash
npm run migrate
```

## Running the Application

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Tasks

- `GET /api/tasks` - Get all tasks (with pagination and filters)
- `GET /api/tasks/stats` - Get task statistics
- `GET /api/tasks/overdue` - Get overdue tasks
- `GET /api/tasks/:id` - Get task by ID
- `POST /api/tasks` - Create a task
- `PUT /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task
- `PATCH /api/tasks/:id/complete` - Mark task as completed
- `PATCH /api/tasks/:id/start` - Mark task as in progress
- `PATCH /api/tasks/:id/cancel` - Cancel task
- `PATCH /api/tasks/:id/assign` - Assign task to user

## Testing

```bash
npm test
```

## License

MIT
