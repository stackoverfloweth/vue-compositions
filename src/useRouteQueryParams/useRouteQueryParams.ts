/* eslint-disable no-redeclare */
import { flatten, unflatten } from 'flat'
import { computed, Ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NoInfer } from '@/types/generics'
import { ObjectRouteParamSchema } from '@/useRouteQueryParams/formats'
import { isInvalidRouteParamValue } from '@/useRouteQueryParams/formats/InvalidRouteParamValue'
import { RouteParamClass } from '@/useRouteQueryParams/formats/RouteParam'
import { asArray } from '@/utilities/arrays'
import { isRecord } from '@/utilities/objects'

export function useRouteQueryParam<T>(key: string, formatter: RouteParamClass<T>, defaultValue: NoInfer<T>): Ref<T>
export function useRouteQueryParam<T>(key: string, formatter: [RouteParamClass<T>], defaultValue: NoInfer<T>[]): Ref<T[]>
export function useRouteQueryParam<T>(key: string, formatter: RouteParamClass<T> | [RouteParamClass<T>], defaultValue: NoInfer<T> | NoInfer<T>[]): Ref<T | T[]> {
  const route = useRoute()
  const router = useRouter()
  const [formatterClass] = asArray(formatter)
  const format = new formatterClass(key)

  if (isRecord(defaultValue)) {
    return computed({
      get() {
        const value = format.getSingleValue(route.query)

        if (isInvalidRouteParamValue(value)) {
          return defaultValue
        }

        if (isRecord(value) && isRecord(defaultValue)) {
          return mergeValueWithDefaultValue(value, defaultValue)
        }

        return value
      },
      set(value: T) {
        const query = format.setSingleValue(route.query, value)

        router.push({ query })
      },
    })
  }

  if (Array.isArray(defaultValue)) {
    let useDefaultValue = true

    const unwatch = watch(() => format.getArrayValue(route.query), () => {
      useDefaultValue = false
      unwatch()
    })

    return computed({
      get() {
        const value = format.getArrayValue(route.query)

        if (value.length === 0 && useDefaultValue) {
          return defaultValue
        }

        return value
      },
      set(values: T[]) {
        const query = format.setArrayValue(route.query, values)

        router.push({ query })
      },
    })
  }

  return computed({
    get() {
      const value = format.getSingleValue(route.query)

      if (isInvalidRouteParamValue(value)) {
        return defaultValue
      }

      return value
    },
    set(value: T) {
      const query = format.setSingleValue(route.query, value)

      router.push({ query })
    },
  })
}

function mergeValueWithDefaultValue<T extends Record<string, unknown>>(value: T, defaultValue: NoInfer<T>): T {
  const defaultValueFlattened: T = flatten(defaultValue)
  const valueFlattened: T = flatten(value)

  return unflatten({
    ...defaultValueFlattened,
    ...valueFlattened,
  })
}