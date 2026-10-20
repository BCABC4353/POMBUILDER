import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  it('renders app name', () => {
    render(<Header />);
    expect(screen.getByText('POM Builder')).toBeTruthy();
  });

  it('renders version prop', () => {
    render(<Header version="2.5.0" />);
    expect(screen.getByText('v2.5.0')).toBeTruthy();
  });
});
