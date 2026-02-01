// src/utils/validation.utils.ts

/**
 * Utility functions for validation operations.
 */

/**
 * Validates that a value is a valid MongoDB ObjectId string.
 * 
 * @param id - The string to validate
 * @returns True if valid ObjectId format
 */
export function isValidMongoId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[a-f\d]{24}$/i.test(id);
}

/**
 * Validates that a value is a valid UUID (v4).
 * 
 * @param id - The string to validate
 * @returns True if valid UUID format
 */
export function isValidUuid(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Validates that a value is a positive integer.
 * 
 * @param value - The value to validate
 * @returns True if positive integer
 */
export function isPositiveInteger(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return !isNaN(parsed) && parsed > 0 && String(parsed) === value;
  }
  return false;
}

/**
 * Sanitizes a filter object by removing undefined and null values.
 * 
 * @param filter - The filter object to sanitize
 * @returns Sanitized filter object
 */
export function sanitizeFilter<T extends Record<string, unknown>>(
  filter: T,
): Partial<T> {
  const sanitized: Partial<T> = {};

  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null) {
      (sanitized as Record<string, unknown>)[key] = value;
    }
  }

  return sanitized;
}

/**
 * Validates that all required fields are present in an object.
 * 
 * @param obj - The object to validate
 * @param requiredFields - Array of required field names
 * @returns Object with isValid boolean and missing fields array
 */
export function validateRequiredFields(
  obj: Record<string, unknown>,
  requiredFields: string[],
): { isValid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      missing.push(field);
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
  };
}

/**
 * Extracts only allowed fields from an object.
 * Useful for preventing mass assignment vulnerabilities.
 * 
 * @param obj - The source object
 * @param allowedFields - Array of allowed field names
 * @returns New object with only allowed fields
 */
export function pickFields<T extends Record<string, unknown>>(
  obj: T,
  allowedFields: string[],
): Partial<T> {
  const result: Partial<T> = {};

  for (const field of allowedFields) {
    if (field in obj) {
      (result as Record<string, unknown>)[field] = obj[field];
    }
  }

  return result;
}

/**
 * Omits specified fields from an object.
 * 
 * @param obj - The source object
 * @param fieldsToOmit - Array of field names to omit
 * @returns New object without the omitted fields
 */
export function omitFields<T extends Record<string, unknown>>(
  obj: T,
  fieldsToOmit: string[],
): Partial<T> {
  const result = { ...obj };

  for (const field of fieldsToOmit) {
    delete (result as Record<string, unknown>)[field];
  }

  return result;
}
