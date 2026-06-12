import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock next/navigation etc if needed for components
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))
