// src/utils/pagination.utils.spec.ts

import {
    normalizePaginationOptions,
    calculatePagination,
    createPageResult,
    parseSortString,
    calculateOffset,
} from './pagination.utils';

describe('Pagination Utils', () => {
    describe('normalizePaginationOptions', () => {
        it('should return defaults when no options provided', () => {
            const result = normalizePaginationOptions();
            expect(result.page).toBe(1);
            expect(result.limit).toBe(10);
            expect(result.filter).toEqual({});
            expect(result.sort).toEqual({});
        });

        it('should normalize negative page to 1', () => {
            const result = normalizePaginationOptions({ page: -5 });
            expect(result.page).toBe(1);
        });

        it('should cap limit at max', () => {
            const result = normalizePaginationOptions({ limit: 1000 });
            expect(result.limit).toBe(100);
        });

        it('should normalize zero limit to 1', () => {
            const result = normalizePaginationOptions({ limit: 0 });
            expect(result.limit).toBe(1);
        });

        it('should preserve valid options', () => {
            const result = normalizePaginationOptions({
                page: 5,
                limit: 25,
                filter: { status: 'active' },
                sort: { createdAt: -1 },
            });
            expect(result.page).toBe(5);
            expect(result.limit).toBe(25);
            expect(result.filter).toEqual({ status: 'active' });
            expect(result.sort).toEqual({ createdAt: -1 });
        });
    });

    describe('calculatePagination', () => {
        it('should calculate correct pagination metadata', () => {
            const result = calculatePagination(100, 3, 10);
            expect(result.pages).toBe(10);
            expect(result.hasNext).toBe(true);
            expect(result.hasPrev).toBe(true);
        });

        it('should handle first page', () => {
            const result = calculatePagination(50, 1, 10);
            expect(result.pages).toBe(5);
            expect(result.hasNext).toBe(true);
            expect(result.hasPrev).toBe(false);
        });

        it('should handle last page', () => {
            const result = calculatePagination(50, 5, 10);
            expect(result.pages).toBe(5);
            expect(result.hasNext).toBe(false);
            expect(result.hasPrev).toBe(true);
        });

        it('should handle single page', () => {
            const result = calculatePagination(5, 1, 10);
            expect(result.pages).toBe(1);
            expect(result.hasNext).toBe(false);
            expect(result.hasPrev).toBe(false);
        });

        it('should handle empty results', () => {
            const result = calculatePagination(0, 1, 10);
            expect(result.pages).toBe(1);
            expect(result.hasNext).toBe(false);
            expect(result.hasPrev).toBe(false);
        });
    });

    describe('createPageResult', () => {
        it('should create correct page result', () => {
            const data = [{ id: 1 }, { id: 2 }];
            const result = createPageResult(data, 2, 10, 25);

            expect(result.data).toEqual(data);
            expect(result.page).toBe(2);
            expect(result.limit).toBe(10);
            expect(result.total).toBe(25);
            expect(result.pages).toBe(3);
        });
    });

    describe('parseSortString', () => {
        it('should parse descending fields with minus', () => {
            const result = parseSortString('-createdAt');
            expect(result).toEqual({ createdAt: 'desc' });
        });

        it('should parse ascending fields with plus', () => {
            const result = parseSortString('+name');
            expect(result).toEqual({ name: 'asc' });
        });

        it('should default to ascending without prefix', () => {
            const result = parseSortString('email');
            expect(result).toEqual({ email: 'asc' });
        });

        it('should parse multiple fields', () => {
            const result = parseSortString('-createdAt,name,+updatedAt');
            expect(result).toEqual({
                createdAt: 'desc',
                name: 'asc',
                updatedAt: 'asc',
            });
        });

        it('should handle empty string', () => {
            const result = parseSortString('');
            expect(result).toEqual({});
        });
    });

    describe('calculateOffset', () => {
        it('should calculate correct offset', () => {
            expect(calculateOffset(1, 10)).toBe(0);
            expect(calculateOffset(2, 10)).toBe(10);
            expect(calculateOffset(3, 20)).toBe(40);
        });

        it('should handle page 0 or negative', () => {
            expect(calculateOffset(0, 10)).toBe(0);
            expect(calculateOffset(-1, 10)).toBe(0);
        });
    });
});
