# API Documentation

## Base URL

```
/api/v1
```

## Authentication

All API requests require a Bearer token in the Authorization header.

```
Authorization: Bearer <token>
```

## Endpoints

### Users

- `GET /users` - List users
- `GET /users/:id` - Get user
- `POST /users` - Create user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

### Organizations

- `GET /organizations` - List organizations
- `GET /organizations/:id` - Get organization
- `POST /organizations` - Create organization
- `PUT /organizations/:id` - Update organization
- `DELETE /organizations/:id` - Delete organization

### Projects

- `GET /projects` - List projects
- `GET /projects/:id` - Get project
- `POST /projects` - Create project
- `PUT /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project

### Tasks

- `GET /tasks` - List tasks
- `GET /tasks/:id` - Get task
- `POST /tasks` - Create task
- `PUT /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task

## Rate Limiting

API requests are rate limited to 100 requests per minute per user.

## Error Codes

- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `429` - Rate Limited
- `500` - Internal Server Error
