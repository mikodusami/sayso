import type { Product, Tenant } from '../../domain'
import type { Repositories } from '../../ports'
import { newId, notFound } from '../../shared'

export interface ProductInput {
  title: string
  category: string
  attributes: Record<string, string>
  price: string
  shipping: string
  tax: string
  stock: number
  shipsInDays: number
}

export function createCatalogService({ repos }: { repos: Repositories }) {
  async function merchantNames(ids: string[]): Promise<Map<string, string>> {
    const tenants = await Promise.all([...new Set(ids)].map((id) => repos.tenants.get(id)))
    return new Map(tenants.filter((t): t is Tenant => t !== null).map((t) => [t.id, t.name]))
  }

  return {
    async upsert(merchantId: string, sku: string, input: ProductInput): Promise<Product> {
      const existing = await repos.products.getBySku(merchantId, sku)
      return repos.products.upsert({ id: existing?.id ?? newId('product'), merchantId, sku, ...input })
    },

    async get(merchantId: string, sku: string): Promise<Product> {
      const product = await repos.products.getBySku(merchantId, sku)
      if (!product) throw notFound('Product', sku)
      return product
    },

    /** Search across merchants (agents) or within one merchant. */
    async search(query: string, options: { merchantIds?: string[]; limit?: number } = {}) {
      const products = await repos.products.search({ query, merchantIds: options.merchantIds, limit: options.limit ?? 20 })
      const names = await merchantNames(products.map((p) => p.merchantId))
      return products.map((product) => ({ product, merchantName: names.get(product.merchantId) ?? product.merchantId }))
    },
  }
}

export type CatalogService = ReturnType<typeof createCatalogService>

export function presentProduct(p: Product, merchantName?: string) {
  return {
    id: p.id,
    merchant_id: p.merchantId,
    ...(merchantName ? { merchant_name: merchantName } : {}),
    sku: p.sku,
    title: p.title,
    category: p.category,
    attributes: p.attributes,
    price: p.price,
    shipping: p.shipping,
    tax: p.tax,
    stock: p.stock,
    ships_in_days: p.shipsInDays,
  }
}
