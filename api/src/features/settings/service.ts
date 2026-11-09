import type { MerchantSettings, Tenant } from '../../domain'
import type { Repositories } from '../../ports'
import type { TimelineService } from '../timeline'

export function createSettingsService({ repos, timeline }: { repos: Repositories; timeline: TimelineService }) {
  return {
    async update(tenant: Tenant, patch: Partial<MerchantSettings>): Promise<MerchantSettings> {
      const settings = { ...tenant.settings, ...patch }
      await repos.tenants.update(tenant.id, { settings })
      await timeline.record({
        tenantIds: [tenant.id],
        subjectType: 'tenant',
        subjectId: tenant.id,
        kind: 'settings.updated',
        actor: 'merchant',
        message: `Settings: verifier ${settings.verifierMode}, auto-refund up to $${settings.autoRefundLimit}`,
      })
      return settings
    },
  }
}

export type SettingsService = ReturnType<typeof createSettingsService>
