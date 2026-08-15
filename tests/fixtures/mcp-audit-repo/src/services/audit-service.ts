import type { Logger } from "./logger";

export interface AuditEvent {
  actorId: string;
  action: string;
  subjectId: string;
}

export class AuditService {
  public constructor(private readonly logger: Logger) {}

  public record(event: AuditEvent): void {
    this.logger.info("audit.event", {
      actorId: event.actorId,
      action: event.action,
      subjectId: event.subjectId,
    });
  }
}
