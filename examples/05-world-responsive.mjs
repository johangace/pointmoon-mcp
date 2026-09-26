#!/usr/bin/env node
import assert from 'node:assert/strict'
import { assertClaims } from './lib/pointmoon.mjs'
import { fetchContext, projectWeather, renderDisplay, selectCard } from './world-responsive/context.mjs'

const payload = await fetchContext({ lat: 42.36, lng: -71.06,
  baseUrl: process.env.POINTMOON_BASE_URL, apiKey: process.env.POINTMOON_API_KEY })
assertClaims(payload, '05-world-responsive')
const context = projectWeather(payload)
const selected = selectCard(context)
const html = renderDisplay(context)
assert.ok(html.startsWith('<!doctype html>'))
assert.ok(html.includes('Source notices'))
if (context.status === 'unavailable') assert.equal(selected.id, 'menu')
console.log(`Context: ${context.status}${context.reason ? ` (${context.reason})` : ''}`)
console.log(`Application-selected card: ${selected.id}`)
console.log(`Rendered ${html.length} characters of HTML; source notices retained.`)
console.log('Run node examples/world-responsive/server.mjs to view the display locally.')
