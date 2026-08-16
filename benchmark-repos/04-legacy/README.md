# Legacy App

> **DEPRECATED** - This application is no longer actively maintained.
> Use the v2 application instead.

## Overview

This is a legacy Node.js/TypeScript application that handles user management,
authentication, and payment processing.

## Architecture

The application follows a monolithic architecture with the following structure:

```
src/
├── auth.ts              # Old auth (DO NOT USE)
├── authV2.ts            # Current auth implementation
├── authenticateUser.ts  # Wrapper for old auth
├── users.ts             # Old user management
├── userService.ts       # Current user service
├── payments.ts          # Old payments
├── paymentService.ts    # Old payment service class
├── paymentServiceV2.ts  # Current payment implementation
├── ...
```

## Important Notes

1. **Multiple implementations exist** for most features. The "current" implementations
   are marked in comments at the top of each file.

2. **DO NOT** modify files marked as DEPRECATED without explicit approval.

3. **Migration status**: We're migrating from v1 to v3 APIs. Some old endpoints
   are still active for backward compatibility.

4. **Known issues**:
   - Circular dependencies between moduleA.ts and moduleB.ts
   - Duplicate type definitions across common.ts, types/, and interfaces/
   - Some files use CommonJS (require), others use ESM (import)

## Development

```bash
npm install
npm run dev
```

## Testing

```bash
npm test
npm run test:legacy
```

## TODO

- [ ] Migrate all callers from auth.ts to authV2.ts
- [ ] Remove circular dependencies
- [ ] Consolidate duplicate type definitions
- [ ] Convert all .js files to TypeScript
- [ ] Remove deprecated endpoints
