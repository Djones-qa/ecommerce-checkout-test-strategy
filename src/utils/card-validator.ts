/**
 * Card validation utilities.
 * Implements Luhn algorithm and card type detection.
 * Used for client-side pre-validation before tokenization.
 *
 * NOTE: These utilities validate format only.
 * Actual payment authorization is handled by the payment gateway.
 */

export type CardType = 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';

// ─── Luhn algorithm ───────────────────────────────────────────────────────────

/**
 * Validates a card number using the Luhn algorithm.
 * Strips spaces and dashes before checking.
 */
export function isValidLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/[\s-]/g, '');

  if (!/^\d+$/.test(digits)) return false;
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

// ─── Card type detection ──────────────────────────────────────────────────────

const CARD_PATTERNS: Array<{ type: CardType; pattern: RegExp }> = [
  { type: 'amex', pattern: /^3[47]/ },
  { type: 'visa', pattern: /^4/ },
  { type: 'mastercard', pattern: /^5[1-5]|^2(2[2-9][1-9]|[3-6]\d{2}|7[01]\d|720)/ },
  { type: 'discover', pattern: /^6(?:011|5\d{2})/ },
];

export function detectCardType(cardNumber: string): CardType {
  const digits = cardNumber.replace(/[\s-]/g, '');

  for (const { type, pattern } of CARD_PATTERNS) {
    if (pattern.test(digits)) return type;
  }

  return 'unknown';
}

// ─── CVV validation ───────────────────────────────────────────────────────────

/**
 * Validates CVV length based on card type.
 * Amex uses 4 digits; all others use 3.
 */
export function isValidCvv(cvv: string, cardType: CardType): boolean {
  if (!/^\d+$/.test(cvv)) return false;
  const expectedLength = cardType === 'amex' ? 4 : 3;
  return cvv.length === expectedLength;
}

// ─── Expiry validation ────────────────────────────────────────────────────────

/**
 * Validates expiry date in MM/YY or MM/YYYY format.
 * Returns false if the card is expired.
 */
export function isValidExpiry(expiry: string): boolean {
  const match = expiry.match(/^(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return false;

  const month = parseInt(match[1], 10);
  const yearRaw = match[2];
  const year = yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10);

  if (month < 1 || month > 12) return false;

  const now = new Date();
  const expiryDate = new Date(year, month); // First day of the month AFTER expiry

  return expiryDate > now;
}

// ─── Full card validation ─────────────────────────────────────────────────────

export interface CardValidationResult {
  isValid: boolean;
  cardType: CardType;
  errors: {
    number?: string;
    expiry?: string;
    cvv?: string;
  };
}

export function validateCard(
  cardNumber: string,
  expiry: string,
  cvv: string
): CardValidationResult {
  const errors: CardValidationResult['errors'] = {};
  const cardType = detectCardType(cardNumber);

  if (!isValidLuhn(cardNumber)) {
    errors.number = 'Invalid card number';
  }

  if (!isValidExpiry(expiry)) {
    errors.expiry = 'Invalid or expired date';
  }

  if (!isValidCvv(cvv, cardType)) {
    errors.cvv = cardType === 'amex' ? 'CVV must be 4 digits' : 'CVV must be 3 digits';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    cardType,
    errors,
  };
}

// ─── Card number formatting ───────────────────────────────────────────────────

/**
 * Formats a card number with spaces for display.
 * Amex: XXXX XXXXXX XXXXX
 * Others: XXXX XXXX XXXX XXXX
 */
export function formatCardNumber(cardNumber: string, cardType: CardType): string {
  const digits = cardNumber.replace(/\D/g, '');

  if (cardType === 'amex') {
    return digits.replace(/^(\d{4})(\d{6})(\d{5})$/, '$1 $2 $3');
  }

  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

/**
 * Masks a card number for display, showing only the last 4 digits.
 * e.g. "•••• •••• •••• 4242"
 */
export function maskCardNumber(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  return `•••• •••• •••• ${last4}`;
}
