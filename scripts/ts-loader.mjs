// Lets plain `node` import the mod's extensionless .ts files: `node --import ./scripts/ts-loader.mjs x.ts`.
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\\.[a-z]+$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + '.ts', context.parentURL)
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true }
  }
  return next(specifier, context)
}`),
)
