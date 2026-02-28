import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { usePageTracking } from './usePageTracking';

describe('usePageTracking', () => {
  it('calls window.gtag on mount', () => {
    const gtagMock = vi.fn();
    window.gtag = gtagMock;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: ['/dashboard'] }, children);

    renderHook(() => usePageTracking(), { wrapper });

    expect(gtagMock).toHaveBeenCalledWith(
      'event',
      'page_view',
      expect.objectContaining({
        page_path: '/dashboard',
      })
    );

    delete window.gtag;
  });

  it('does not throw when gtag is not defined', () => {
    delete window.gtag;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, null, children);

    expect(() => {
      renderHook(() => usePageTracking(), { wrapper });
    }).not.toThrow();
  });
});
