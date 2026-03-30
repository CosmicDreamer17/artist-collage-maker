import { describe, expect, it } from 'vitest';
import { getCandidateApiOrigins } from './backend-origin.js';

describe('getCandidateApiOrigins', () => {
  it('prefers configured origins and excludes the current web port from local fallback guesses', () => {
    process.env.INTERNAL_API_ORIGIN = 'http://127.0.0.1:4010';
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:4020';

    expect(getCandidateApiOrigins('3001')).toEqual([
      'http://127.0.0.1:4010',
      'http://127.0.0.1:4020',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:3000',
    ]);
  });
});
