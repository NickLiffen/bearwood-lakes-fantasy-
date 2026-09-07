import { renderHook } from '@testing-library/react';
import { useNoIndex } from './useNoIndex';

const getRobotsMeta = () => document.head.querySelectorAll('meta[name="robots"]');

describe('useNoIndex', () => {
  afterEach(() => {
    document.head.querySelectorAll('meta[name="robots"]').forEach((meta) => meta.remove());
  });

  it('adds a noindex robots meta tag on mount', () => {
    renderHook(() => useNoIndex());

    const metas = getRobotsMeta();
    expect(metas).toHaveLength(1);
    expect(metas[0].getAttribute('content')).toBe('noindex,nofollow');
  });

  it('removes the tag on unmount', () => {
    const { unmount } = renderHook(() => useNoIndex());
    expect(getRobotsMeta()).toHaveLength(1);

    unmount();
    expect(getRobotsMeta()).toHaveLength(0);
  });

  it('does not duplicate the tag when nested guards both call it', () => {
    renderHook(() => useNoIndex());
    renderHook(() => useNoIndex());

    expect(getRobotsMeta()).toHaveLength(1);
  });

  it('keeps the tag while a second caller is still mounted', () => {
    const first = renderHook(() => useNoIndex());
    const second = renderHook(() => useNoIndex());

    first.unmount();
    expect(getRobotsMeta()).toHaveLength(1);

    second.unmount();
    expect(getRobotsMeta()).toHaveLength(0);
  });

  it('re-adds the tag after every caller has unmounted', () => {
    const { unmount } = renderHook(() => useNoIndex());
    unmount();
    expect(getRobotsMeta()).toHaveLength(0);

    renderHook(() => useNoIndex());
    expect(getRobotsMeta()).toHaveLength(1);
    expect(getRobotsMeta()[0].getAttribute('content')).toBe('noindex,nofollow');
  });
});
