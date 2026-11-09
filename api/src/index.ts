// Vercel entry point (zero-config Hono). The container is built once per
// function instance, on the first request.
import { Hono } from 'hono'
import { buildContainer, type Container } from './app/container'
import { loadConfig } from './shared'

let container: Promise<Container> | null = null
const ready = () => (container ??= buildContainer(loadConfig()))

const app = new Hono()
app.all('*', async (c) => (await ready()).app.fetch(c.req.raw))

export default app
