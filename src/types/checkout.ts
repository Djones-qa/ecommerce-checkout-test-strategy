/**
 * TypeScript interfaces for the checkout domain.
 * Used across E2E tests, contract tests, and mock implementations.
 */

// ─── Address ──────────────────────────────────────────────────────────────────

export interface AddressFields {
  firstName: string;
  lastName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export interface CardFields {
  number: string;
  expiry: string;
  cvv: string;
  name: string;
}

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'cancelled';

export interface PaymentIntent {
  id: string;
  status: PaymentStatus;
  amount: number;       // in cents
  currency: string;     // ISO 4217, e.g. "usd"
  paymentMethodId: string;
  createdAt: string;    // ISO 8601
  metadata?: Record<string, string>;
}

export interface PaymentError {
  code: string;
  declineCode?: string;
  message: string;
}

export interface PaymentRequest {
  paymentMethodId: string;   // Stripe token — never raw card data
  amount: number;            // in cents
  currency: string;
  orderId: string;
  idempotencyKey: string;    // Prevents double-charge on retry
}

export interface PaymentResponse {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  timestamp: string;
  error?: PaymentError;
}

// ─── Shipping ─────────────────────────────────────────────────────────────────

export interface ShippingOption {
  id: string;
  label: string;
  price: number;           // in dollars
  estimatedDays: number;
  carrier?: string;
}

export interface ShippingEstimateRequest {
  destinationZip: string;
  destinationCountry: string;
  weightOz: number;
  items: Array<{ productId: string; qty: number }>;
}

// ─── Order ────────────────────────────────────────────────────────────────────

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  imageUrl?: string;
}

export interface OrderSummary {
  orderId: string;
  orderNumber: string;       // Human-readable, e.g. "ORD-20260520"
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  total: number;
  currency: string;
  shippingAddress: AddressFields;
  shippingOption: ShippingOption;
  paymentId: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
  estimatedDelivery?: string;
}

// ─── Checkout session ─────────────────────────────────────────────────────────

export type CheckoutStep = 'cart' | 'identity' | 'address' | 'shipping' | 'payment' | 'confirmation';

export interface CheckoutSession {
  sessionId: string;
  step: CheckoutStep;
  userId?: string;           // undefined for guest
  guestEmail?: string;
  cart: OrderItem[];
  shippingAddress?: AddressFields;
  selectedShipping?: ShippingOption;
  paymentMethodId?: string;
  createdAt: string;
  expiresAt: string;
}

// ─── API responses ────────────────────────────────────────────────────────────

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
