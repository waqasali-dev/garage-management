import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App, { RouteLoadingFallback } from './App';

test('renders RouteLoadingFallback correctly', () => {
  render(<RouteLoadingFallback />);
  const loadingElement = screen.getByText(/LOADING PRECISION GARAGE/i);
  expect(loadingElement).toBeInTheDocument();
});

test('renders App component within MemoryRouter without throwing', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  );
  expect(container).toBeInTheDocument();
});
