/* eslint-disable max-classes-per-file */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createActions } from '@/subscribe'

describe('createActions', () => {

  it('does return properties that are functions', () => {
    class Alpha {
      public beta = (): string => 'beta'
    }

    const actions = createActions(new Alpha)

    expect(actions.beta).toBeDefined()
  })

  it('does not return properties that are not functions', () => {
    class Alpha {
      public beta = 'beta'
    }

    const actions = createActions(new Alpha) as any

    expect(actions.beta).toBeUndefined()
  })

  it('does return class methods', () => {
    class Alpha {
      public beta(): string {
        return 'beta'
      }
    }

    const actions = createActions(new Alpha)

    expect(actions.beta).toBeDefined()
  })

  it('does return inherited properties that are functions', () => {
    class Beta {
      public cappa = (): string => 'cappa'
    }

    class Alpha extends Beta {}

    const actions = createActions(new Alpha)

    expect(actions.cappa).toBeDefined()
  })

  it('does not return inherited properties that are not functions', () => {
    class Beta {
      public cappa = 'cappa'
    }

    class Alpha extends Beta {}

    const actions = createActions(new Alpha) as any

    expect(actions.cappa).toBeUndefined()
  })

  it('does return inherited class methods', () => {
    class Beta {
      public cappa(): string {
        return 'cappa'
      }
    }

    class Alpha extends Beta {}

    const actions = createActions(new Alpha)

    expect(actions.cappa).toBeDefined()
  })

  it('does not return inherited object prototype', () => {
    class Alpha {}

    const actions = createActions(new Alpha)

    expect(Object.keys(actions).length).toBe(0)
  })

})