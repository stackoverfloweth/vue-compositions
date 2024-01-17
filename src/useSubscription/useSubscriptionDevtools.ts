import type {
  DevtoolsPluginApi,
  CustomInspectorNode,
  CustomInspectorState,
  TimelineEvent,
  PluginSettingsItem,
  ExtractSettingsTypes} from '@vue/devtools-api'
import Channel from './models/channel'
import { ComponentInternalInstance, getCurrentInstance, nextTick } from 'vue'

function throttle(fn: Function, wait: number) {
  let isThrottled = false
  let invokedDuringThrottle = false

  function wrapper(this: unknown) {
    const context = this
    if (isThrottled) {
      invokedDuringThrottle = true
      return;
    }
    isThrottled = true;

    fn.apply(context, arguments)

    setTimeout(function() {
      isThrottled = false; // (3)
      if (invokedDuringThrottle) {
        wrapper.apply(context);
        invokedDuringThrottle = false
      }
    }, wait);
  }

  return wrapper;
}

const SUBSCRIPTIONS_INSPECTOR_ID = 'prefect-vue-compositions-subscriptions'
const SUBSCRIPTIONS_TIMELINE_LAYER_ID = 'prefect-vue-compositions-subscriptions'

export const SUBSCRIPTION_DEVTOOLS_SETTINGS = {
  // timelineColor: {
  //   label: 'Timeline Color',
  //   type: 'choice',
  //   defaultValue: 0xFF69B4,
  //   options: [
  //     { value: 0x4fc08d, label: 'Vue Green' },
  //     { value: 0x175cd3, label: 'Prefect Blue' },
  //     { value: 0xFF69B4, label: 'Hot' }
  //   ],
  //   component: 'button-group'
  // }
} satisfies Record<string, PluginSettingsItem>

export type SubscriptionDevtoolsSettings = ExtractSettingsTypes<typeof SUBSCRIPTION_DEVTOOLS_SETTINGS>

const channelNodes: Map<Channel['signature'], { node: CustomInspectorNode, channel: Channel }> = new Map()
const subscribedComponents: Map<Channel['signature'], Map<number, ComponentInternalInstance | null>> = new Map()
let API: DevtoolsPluginApi<Record<string, unknown>> | null = null

export function init(api: DevtoolsPluginApi<SubscriptionDevtoolsSettings>): void {
  API = api
  api.addInspector({
    id: SUBSCRIPTIONS_INSPECTOR_ID,
    label: 'Subscriptions',
    icon: 'subscriptions',
    treeFilterPlaceholder: 'Search subscriptions',
  })

  api.on.getInspectorTree((payload, context) => {
    if (payload.inspectorId === SUBSCRIPTIONS_INSPECTOR_ID) {
      payload.rootNodes = []
      const regex = new RegExp(payload.filter, 'i') // 'i' flag for case-insensitive search
      for (const { node } of channelNodes.values()) {
        if (payload.filter && !regex.test(node.label)) { continue }
        payload.rootNodes.push(node)
      }
    }
  })

  api.on.getInspectorState(async (payload, context) => {
    if (payload.inspectorId === SUBSCRIPTIONS_INSPECTOR_ID) {
      payload.state = getCustomInspectorState(payload.nodeId)

      // Experimenting with getting the component name from the devtools api. doesn't seem to get all names either but gets some
      // await Promise.all(payload.state["Subscribed Components"].map(async (subscription) => {
      //   if (!subscription.value) { return }
      //   const name = await api.getComponentName(subscription.value)
      //   subscription.value = name
      // }))
    }
  })

  // Timeline Layer
  api.addTimelineLayer({
    id: SUBSCRIPTIONS_TIMELINE_LAYER_ID,
    label: 'Subscriptions',
    color: 0x175cd3,
  })

  // api.on.setPluginSettings((payload, context) => {

  // })
}

const refresh: () => void = throttle(() => {
  setTimeout(async () => {
    await nextTick();
    API?.sendInspectorState(SUBSCRIPTIONS_INSPECTOR_ID);
    API?.sendInspectorTree(SUBSCRIPTIONS_INSPECTOR_ID);
  }, 100);
}, 200)

export function addChannel(channel: Channel): void {
  addTimelineEvent({title: `${channel.actionName} · Channel created`, data: {channel, action: channel.actionName}, groupId: channel.signature})

  channelNodes.set(channel.signature, { node: mapChannelToInspectorNode(channel), channel })
  refresh()
}

type UpdateChannelEventTypes = 'Loading' | 'Error' | 'Executed' | 'Response' | 'Refresh'
type UpdateChannelEvent = {
  [K in UpdateChannelEventTypes]: CreateSubscriptionDevtoolsTimelineEvent<K, EventTypeToDataMap[K]>
}[UpdateChannelEventTypes]
export function updateChannel(channel: Channel, event: UpdateChannelEvent): void {
  channelNodes.set(channel.signature, { node: mapChannelToInspectorNode(channel), channel })
  addTimelineEvent(event)
  refresh()
}

export function removeChannel(channel: Channel): void {
  addTimelineEvent({title: `${channel.actionName} · Channel removed`, data: {channel, action: channel.actionName}, groupId: channel.signature})

  channelNodes.delete(channel.signature)
  refresh()
}

export function registerChannelSubscription(channel: Channel, subscriptionId: number): void {
  addTimelineEvent({title: `${channel.actionName} · Subscription created`, data: {channel, action: channel.actionName, subscriptionId}, groupId: channel.signature})

  const channelSubscriptions = subscribedComponents.get(channel.signature) ?? new Map()
  const vm = getCurrentInstance()
  channelSubscriptions.set(subscriptionId, vm)
  subscribedComponents.set(channel.signature, channelSubscriptions)

  refresh()
}

export function removeChannelSubscription(channel: Channel, subscriptionId: number): void {
  addTimelineEvent({title: `${channel.actionName} · Subscription removed`, data: {channel, action: channel.actionName, subscriptionId}, groupId: channel.signature})

  const channelSubscriptions = subscribedComponents.get(channel.signature)
  if (!channelSubscriptions) { return }
  channelSubscriptions.delete(subscriptionId)
  refresh()
}

type SubscriptionsInspectorState = CustomInspectorState & {
  State: CustomInspectorState[keyof CustomInspectorState],
  "Subscribed Components": CustomInspectorState[keyof CustomInspectorState],
}

function getCustomInspectorState(nodeId: string): SubscriptionsInspectorState {
  const {channel} = channelNodes.get(nodeId as Channel['signature']) ?? {}
  if (!channel) {
    return {"Error": [{ key: 'message', value: 'Channel not found.'}], "State": [], "Subscribed Components": []}
  }
  const subscriptions = subscribedComponents.get(channel.signature) ?? new Map<number, ComponentInternalInstance | null>()
  
  return {
    "State": [
      {
        key: 'channel',
        value: channel,
      }
    ],
    "Subscribed Components": [...subscriptions.entries()].map(([id, vm]) => (
      {
        key: String(id),
        value: getComponentName(vm),
      })
    ),
  }
}

function getComponentName(vm: ComponentInternalInstance | null): string {
  // @ts-ignore __name is not in the types but works.
  return vm?.type.__name as string ?? vm?.type?.name ?? '🤷🏻‍♂️ Unknown component'
}

type CreateSubscriptionDevtoolsTimelineEvent<TEvent extends string, TData> = Omit<TimelineEvent<TData>, 'time'> & {
  title: `${string} · ${TEvent}`,
  groupId: string
}

type EventTypeToDataMap = {
  "Channel created": {channel: Channel, action: string},
  "Channel removed": {channel: Channel, action: string},
  "Subscription created": {channel: Channel, action: string, subscriptionId: number},
  "Subscription removed": {channel: Channel, action: string, subscriptionId: number},
  "Loading": {channel: Channel, action: string, loading: boolean},
  "Error": {channel: Channel, action: string, error: unknown},
  "Executed": {channel: Channel, action: string, executed: boolean},
  "Response": {channel: Channel, action: string, response: any},
  "Refresh": {channel: Channel, action: string },
}

type SubscriptionDevtoolsTimelineEvent = {
  [K in keyof EventTypeToDataMap]: CreateSubscriptionDevtoolsTimelineEvent<K, EventTypeToDataMap[K]>
}[keyof EventTypeToDataMap]

function addTimelineEvent(event: SubscriptionDevtoolsTimelineEvent): void {
  API?.addTimelineEvent({
    layerId: SUBSCRIPTIONS_TIMELINE_LAYER_ID,
    event: {
      ...event,
      time: API.now(),
    },
  })
}

function mapChannelToInspectorNode(channel: Channel): CustomInspectorNode {
  return {
    id: channel.signature,
    label: `${channel.actionName} ${channel.signature}`,
    tags: [
      {
        label: 'channel',
        textColor: 0xffffff,
        backgroundColor: 0x175cd3,
      },
    ],
  }
}
