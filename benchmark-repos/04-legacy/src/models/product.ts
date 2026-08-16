// Product model
// TODO: move to separate package

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  active: boolean;
  metadata: Record<string, any>;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  price: number;
  sku: string;
  inventory: number;
}
