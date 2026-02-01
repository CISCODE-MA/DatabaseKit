// src/utils/validation.utils.spec.ts

import {
    isValidMongoId,
    isValidUuid,
    isPositiveInteger,
    sanitizeFilter,
    validateRequiredFields,
    pickFields,
    omitFields,
} from './validation.utils';

describe('Validation Utils', () => {
    describe('isValidMongoId', () => {
        it('should return true for valid MongoDB ObjectId', () => {
            expect(isValidMongoId('507f1f77bcf86cd799439011')).toBe(true);
            expect(isValidMongoId('000000000000000000000000')).toBe(true);
            expect(isValidMongoId('ffffffffffffffffffffffff')).toBe(true);
        });

        it('should return false for invalid MongoDB ObjectId', () => {
            expect(isValidMongoId('')).toBe(false);
            expect(isValidMongoId('invalid')).toBe(false);
            expect(isValidMongoId('507f1f77bcf86cd79943901')).toBe(false); // 23 chars
            expect(isValidMongoId('507f1f77bcf86cd7994390111')).toBe(false); // 25 chars
            expect(isValidMongoId('507f1f77bcf86cd79943901g')).toBe(false); // invalid char
        });

        it('should return false for null/undefined', () => {
            expect(isValidMongoId(null as unknown as string)).toBe(false);
            expect(isValidMongoId(undefined as unknown as string)).toBe(false);
        });
    });

    describe('isValidUuid', () => {
        it('should return true for valid UUID v4', () => {
            expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
            expect(isValidUuid('6ba7b810-9dad-41d4-80b4-00c04fd430c8')).toBe(true);
        });

        it('should return false for invalid UUID', () => {
            expect(isValidUuid('')).toBe(false);
            expect(isValidUuid('invalid')).toBe(false);
            expect(isValidUuid('550e8400-e29b-11d4-a716-446655440000')).toBe(false); // v1
        });
    });

    describe('isPositiveInteger', () => {
        it('should return true for positive integers', () => {
            expect(isPositiveInteger(1)).toBe(true);
            expect(isPositiveInteger(100)).toBe(true);
            expect(isPositiveInteger('5')).toBe(true);
        });

        it('should return false for non-positive integers', () => {
            expect(isPositiveInteger(0)).toBe(false);
            expect(isPositiveInteger(-1)).toBe(false);
            expect(isPositiveInteger(1.5)).toBe(false);
            expect(isPositiveInteger('1.5')).toBe(false);
            expect(isPositiveInteger('abc')).toBe(false);
        });
    });

    describe('sanitizeFilter', () => {
        it('should remove undefined and null values', () => {
            const filter = { a: 1, b: undefined, c: null, d: 'test' };
            const result = sanitizeFilter(filter);
            expect(result).toEqual({ a: 1, d: 'test' });
        });

        it('should keep falsy values that are not null/undefined', () => {
            const filter = { a: 0, b: '', c: false };
            const result = sanitizeFilter(filter);
            expect(result).toEqual({ a: 0, b: '', c: false });
        });
    });

    describe('validateRequiredFields', () => {
        it('should return valid when all required fields are present', () => {
            const obj = { name: 'John', email: 'john@example.com' };
            const result = validateRequiredFields(obj, ['name', 'email']);
            expect(result.isValid).toBe(true);
            expect(result.missing).toEqual([]);
        });

        it('should return invalid with missing fields', () => {
            const obj = { name: 'John' };
            const result = validateRequiredFields(obj, ['name', 'email', 'age']);
            expect(result.isValid).toBe(false);
            expect(result.missing).toEqual(['email', 'age']);
        });

        it('should treat empty strings as missing', () => {
            const obj = { name: '' };
            const result = validateRequiredFields(obj, ['name']);
            expect(result.isValid).toBe(false);
            expect(result.missing).toEqual(['name']);
        });
    });

    describe('pickFields', () => {
        it('should pick only allowed fields', () => {
            const obj = { a: 1, b: 2, c: 3 };
            const result = pickFields(obj, ['a', 'c']);
            expect(result).toEqual({ a: 1, c: 3 });
        });

        it('should ignore non-existent fields', () => {
            const obj = { a: 1 };
            const result = pickFields(obj, ['a', 'b']);
            expect(result).toEqual({ a: 1 });
        });
    });

    describe('omitFields', () => {
        it('should omit specified fields', () => {
            const obj = { a: 1, b: 2, c: 3 };
            const result = omitFields(obj, ['b']);
            expect(result).toEqual({ a: 1, c: 3 });
        });

        it('should return same object if no fields to omit', () => {
            const obj = { a: 1, b: 2 };
            const result = omitFields(obj, []);
            expect(result).toEqual({ a: 1, b: 2 });
        });
    });
});
