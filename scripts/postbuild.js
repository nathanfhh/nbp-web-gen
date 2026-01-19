/**
 * Post-build script to create static HTML files for SPA routes
 * Each route gets customized meta tags for SEO
 *
 * Meta tags are defined in src/router/seo-meta.js (Single Source of Truth)
 */

import { mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { routeSeoMeta } from '../src/router/seo-meta.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

const BASE_URL = 'https://nathanfhh.github.io/nbp-web-gen'

/**
 * Replace meta tags in HTML content
 */
function customizeHtml(html, route, meta) {
  const canonicalUrl = `${BASE_URL}${route === '/' ? '/' : route + '/'}`

  // Replace title
  html = html.replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`)

  // Replace meta description
  html = html.replace(
    /<meta name="description" content=".*?">/,
    `<meta name="description" content="${meta.description}">`
  )

  // Replace canonical URL
  html = html.replace(
    /<link rel="canonical" href=".*?">/,
    `<link rel="canonical" href="${canonicalUrl}">`
  )

  // Replace OG tags
  html = html.replace(
    /<meta property="og:url" content=".*?">/,
    `<meta property="og:url" content="${canonicalUrl}">`
  )
  html = html.replace(
    /<meta property="og:title" content=".*?">/,
    `<meta property="og:title" content="${meta.title}">`
  )
  html = html.replace(
    /<meta property="og:description" content=".*?">/,
    `<meta property="og:description" content="${meta.description}">`
  )

  // Replace Twitter tags
  html = html.replace(
    /<meta name="twitter:url" content=".*?">/,
    `<meta name="twitter:url" content="${canonicalUrl}">`
  )
  html = html.replace(
    /<meta name="twitter:title" content=".*?">/,
    `<meta name="twitter:title" content="${meta.title}">`
  )
  html = html.replace(
    /<meta name="twitter:description" content=".*?">/,
    `<meta name="twitter:description" content="${meta.description}">`
  )

  return html
}

// Main
const indexHtml = join(distDir, 'index.html')

if (!existsSync(indexHtml)) {
  console.error('Error: dist/index.html not found. Run vite build first.')
  process.exit(1)
}

const baseHtml = readFileSync(indexHtml, 'utf-8')

console.log('Creating static HTML files with custom meta tags...')

// Process each route from seo-meta.js
for (const [route, meta] of Object.entries(routeSeoMeta)) {
  if (route === '/') {
    // Update index.html in place
    const customizedHtml = customizeHtml(baseHtml, route, meta)
    writeFileSync(indexHtml, customizedHtml)
    console.log(`  Updated: index.html (${meta.title.split(' | ')[0]})`)
  } else {
    const routeDir = join(distDir, route)
    const routeIndex = join(routeDir, 'index.html')

    // Create directory if not exists
    if (!existsSync(routeDir)) {
      mkdirSync(routeDir, { recursive: true })
    }

    // Create customized HTML
    const customizedHtml = customizeHtml(baseHtml, route, meta)
    writeFileSync(routeIndex, customizedHtml)
    console.log(`  Created: ${route}/index.html (${meta.title.split(' | ')[0]})`)
  }
}

// Copy index.html to 404.html for fallback
copyFileSync(indexHtml, join(distDir, '404.html'))
console.log('  Created: 404.html')

console.log('Done!')
