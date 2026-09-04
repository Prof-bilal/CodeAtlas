// Payment interfaces - OLD

export interface IPayment {
  id: string;
  amount: number;
  currency: string;
}

export interface IPaymentService {
  create(data: any): Promise<IPayment>;
  process(id: string): Promise<IPayment>;
  refund(id: string): Promise<boolean>;
}
