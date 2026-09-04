# Deployment Guide

## Prerequisites

- Node.js >= 20.19.0
- PostgreSQL >= 15
- Redis >= 7
- pnpm >= 8.0.0

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

## Build

```bash
pnpm install
pnpm build
```

## Deploy

```bash
pnpm deploy
```

## Health Checks

```bash
curl http://localhost:3000/health
```

## Monitoring

- Logs: `/var/log/codeatlas/`
- Metrics: Datadog APM
- Alerts: PagerDuty integration
