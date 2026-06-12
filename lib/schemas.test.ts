import { describe, it, expect } from 'vitest'
import { OrchestrateInputSchema, parseToolArgs } from './schemas'

describe('schemas', () => {
  it('validates orchestrate input', () => {
    const result = OrchestrateInputSchema.safeParse({ task: 'hello world', autonomous: true })
    expect(result.success).toBe(true)
  })

  it('rejects short task', () => {
    const result = OrchestrateInputSchema.safeParse({ task: 'hi' })
    expect(result.success).toBe(false)
  })

  it('parses tool args correctly', () => {
    const res = parseToolArgs('web_search', { query: 'test' })
    expect(res.success).toBe(true)
  })

  it('rejects bad tool args', () => {
    const res = parseToolArgs('web_search', { query: '' })
    expect(res.success).toBe(false)
  })
})
