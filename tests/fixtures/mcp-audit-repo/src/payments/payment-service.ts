import { AuditService } from "../services/audit-service";
import { createId } from "../utils/id";
import type { PaymentReceipt, PaymentRequest } from "./payment-model";
import { PaymentValidator } from "./payment-validator";

export class PaymentService {
  public constructor(
    private readonly validator: PaymentValidator,
    private readonly audit: AuditService,
  ) {}

  public charge(request: PaymentRequest): PaymentReceipt {
    const problems = this.validator.validatePayment(request);
    if (problems.length > 0) {
      return { id: createId("pay", request.userId), approved: false, reason: problems[0] };
    }

    const receipt = { id: createId("pay", request.userId), approved: true };
    this.audit.record({ actorId: request.userId, action: "payment.charge", subjectId: receipt.id });
    return receipt;
  }
}

export function authenticate(userId: string): boolean {
  return userId.startsWith("usr_");
}
