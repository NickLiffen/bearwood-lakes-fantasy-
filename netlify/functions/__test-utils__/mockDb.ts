/**
 * Shared helpers for mocking MongoDB via connectToDatabase.
 *
 * Usage:
 *   const { collections, mockDb } = createMockDb({
 *     golfers: mockGolfersCollection,
 *     scores: mockScoresCollection,
 *   });
 *   vi.mocked(connectToDatabase).mockResolvedValue(mockDb);
 */

type MockCollection = Record<string, ReturnType<typeof vi.fn>>;

export function createMockDb(collectionMap: Record<string, MockCollection>) {
  const db = {
    collection: vi.fn().mockImplementation((name: string) => {
      return collectionMap[name] || {};
    }),
  };

  return {
    collections: collectionMap,
    mockDb: { db, client: {} } as any,
  };
}

/**
 * Creates a chainable mock cursor (find → sort → skip → limit → toArray).
 */
export function mockCursor(items: any[]) {
  const cursor: any = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    project: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(items),
  };
  return cursor;
}

/**
 * Creates a chainable mock aggregation cursor (aggregate → toArray).
 */
export function mockAggregateCursor(items: any[]) {
  return {
    toArray: vi.fn().mockResolvedValue(items),
  };
}
