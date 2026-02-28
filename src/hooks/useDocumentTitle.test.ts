import { renderHook } from '@testing-library/react';
import { useDocumentTitle } from './useDocumentTitle';

describe('useDocumentTitle', () => {
  it('sets document title on mount', () => {
    renderHook(() => useDocumentTitle('Leaderboard'));
    expect(document.title).toBe('Leaderboard | Bearwood Lakes Fantasy');
  });

  it('resets title on unmount', () => {
    const original = document.title;
    const { unmount } = renderHook(() => useDocumentTitle('Test'));
    expect(document.title).toBe('Test | Bearwood Lakes Fantasy');
    unmount();
    expect(document.title).toBe(original);
  });

  it('uses site name when title is empty', () => {
    renderHook(() => useDocumentTitle(''));
    expect(document.title).toBe('Bearwood Lakes Fantasy');
  });
});
