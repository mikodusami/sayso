import type { TimelineEvent, WebhookEndpoint } from '../../domain'
import type { EventNotifier, Repositories } from '../../ports'
import { newId, newSecret, type Clock } from '../../shared'

export interface RecordInput {
  tenantIds: string[]
  subjectType: TimelineEvent['subjectType']
  subjectId: string
  kind: string
  actor: string
  message: string
  paypalRef?: string | null
  data?: Record<string, unknown>
  /** If set, also deliver this Sayso event type to the tenants' webhook endpoints. */
  notify?: string
}

export interface TimelineDeps {
  repos: Repositories
  notifier: EventNotifier
  clock: Clock
}

export function createTimelineService({ repos, notifier, clock }: TimelineDeps) {
  return {
    async record(input: RecordInput): Promise<TimelineEvent> {
      const event: TimelineEvent = {
        id: newId('event'),
        tenantIds: [...new Set(input.tenantIds)],
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        kind: input.kind,
        actor: input.actor,
        message: input.message,
        paypalRef: input.paypalRef ?? null,
        data: input.data ?? {},
        createdAt: clock.now(),
      }
      await repos.events.append(event)

      if (input.notify) {
        const endpoints = (await Promise.all(event.tenantIds.map((id) => repos.webhookEndpoints.listForTenant(id)))).flat()
        await Promise.allSettled(
          endpoints.map((endpoint) =>
            notifier.deliver(endpoint, {
              id: event.id,
              type: input.notify as string,
              createdAt: event.createdAt.toISOString(),
              data: { subject_type: event.subjectType, subject_id: event.subjectId, message: event.message, paypal_ref: event.paypalRef, ...event.data },
            }),
          ),
        )
      }
      return event
    },

    forSubjects: (ids: string[]) => repos.events.listForSubjects(ids),
    forTenant: (tenantId: string, limit = 50) => repos.events.listForTenant(tenantId, limit),

    async addEndpoint(tenantId: string, url: string): Promise<WebhookEndpoint> {
      return repos.webhookEndpoints.create({ id: newId('webhookEndpoint'), tenantId, url, secret: newSecret('whsec') })
    },
  }
}

export type TimelineService = ReturnType<typeof createTimelineService>

export function presentEvent(e: TimelineEvent) {
  return {
    id: e.id,
    at: e.createdAt.toISOString(),
    subject: { type: e.subjectType, id: e.subjectId },
    kind: e.kind,
    actor: e.actor,
    message: e.message,
    paypal_ref: e.paypalRef,
    data: e.data,
  }
}
