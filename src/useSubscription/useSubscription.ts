import { getCurrentInstance, onUnmounted, reactive, unref, watch } from 'vue'
import Manager from '@/useSubscription/models/manager'
import { Action, ActionArguments } from '@/useSubscription/types/action'
import { SubscribeArguments, UseSubscription } from '@/useSubscription/types/subscription'
import { mapSubscription } from '@/useSubscription/utilities/subscriptions'
import { getValidWatchSource } from '@/utilities/getValidWatchSource'
import { uniqueValueWatcher } from '@/utilities/uniqueValueWatcher'

const defaultManager = new Manager()

export function useSubscription<T extends Action>(...[action, args, options = {}]: SubscribeArguments<T>): UseSubscription<T> {
  const manager = options.manager ?? defaultManager
  const argsWithDefault = args ?? [] as unknown as ActionArguments<T>
  const originalSubscription = manager.subscribe(action, argsWithDefault, options)
  const subscriptionResponse = reactive(mapSubscription(originalSubscription))

  const unwatch = uniqueValueWatcher(getValidWatchSource(args), () => {
    // checking if args are null to support useSubscriptionWithDependencies
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!subscriptionResponse.isSubscribed() || unref(argsWithDefault) === null) {
      unwatch!()
      return
    }

    subscriptionResponse.unsubscribe()

    const newSubscription = manager.subscribe(action, argsWithDefault, options)

    newSubscription.response.value ??= subscriptionResponse.response
    newSubscription.executed.value = newSubscription.executed.value || subscriptionResponse.executed

    Object.assign(subscriptionResponse, mapSubscription(newSubscription))
  }, { deep: true })

  if (getCurrentInstance()) {
    onUnmounted(() => {
      subscriptionResponse.unsubscribe()

      unwatch()
    })
  }

  return subscriptionResponse
}
