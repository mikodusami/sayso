import { Hono } from 'hono'
import { z } from 'zod'
import { body, query, tenantOf, type AppEnv } from '../_kit'
import { presentProduct, type CatalogService } from './service'

const Money = z.string().regex(/^\d+\.\d{2}$/)

const ProductBody = z.object({
  title: z.string().min(1),
  category: z.string().min(1).default('general'),
  attributes: z.record(z.string(), z.string()).default({}),
  price: Money,
  shipping: Money.default('0.00'),
  tax: Money.default('0.00'),
  stock: z.number().int().min(0).default(0),
  ships_in_days: z.number().int().min(0).max(60).default(3),
})

const Search = z.object({ q: z.string().default(''), limit: z.coerce.number().int().min(1).max(50).default(20) })

export function createCatalogRoutes(catalog: CatalogService) {
  return new Hono<AppEnv>()
    .put('/v1/products/:sku', body(ProductBody), async (c) => {
      const merchant = tenantOf(c, 'merchant')
      const input = c.req.valid('json')
      const product = await catalog.upsert(merchant.id, c.req.param('sku'), {
        title: input.title,
        category: input.category,
        attributes: input.attributes,
        price: input.price,
        shipping: input.shipping,
        tax: input.tax,
        stock: input.stock,
        shipsInDays: input.ships_in_days,
      })
      return c.json(presentProduct(product))
    })
    .get('/v1/products', query(Search), async (c) => {
      const merchant = tenantOf(c, 'merchant')
      const { q, limit } = c.req.valid('query')
      const results = await catalog.search(q, { merchantIds: [merchant.id], limit })
      return c.json({ data: results.map((r) => presentProduct(r.product)) })
    })
    // Agents search one merchant, or every Sayso merchant with merchant=any.
    .get('/v1/merchants/:merchantId/products', query(Search), async (c) => {
      tenantOf(c)
      const { q, limit } = c.req.valid('query')
      const merchantId = c.req.param('merchantId')
      const results = await catalog.search(q, { merchantIds: merchantId === 'any' ? undefined : [merchantId], limit })
      return c.json({ data: results.map((r) => presentProduct(r.product, r.merchantName)) })
    })
}
