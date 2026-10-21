// Rust Co. FiveM on Tebex Headless: products from the API, purchase via Cfx.re login + Tebex checkout.
// The public token is meant to be public (Tebex: "allowed to be shared publicly").
const TOKEN = '14z7w-3d99985b7a96b0db0a9ce9d991a6c61d1a886583'
const API = 'https://headless.tebex.io/api'
const HOME = location.origin + location.pathname
const PENDING = 'rco-fivem-pending'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const price = (p) => (p.total_price > 0 ? `$${p.total_price.toFixed(2)}` : 'Free')

async function api(path, options) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...options })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail || body.title || `HTTP ${res.status}`)
  return body
}

const packagesPromise = api(`/accounts/${TOKEN}/categories?includePackages=1`)
  .then((r) => r.data.flatMap((c) => c.packages.map((p) => ({ ...p, categoryName: c.name }))))

const CART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z"></path><circle cx="9" cy="20" r="1.4"></circle><circle cx="18" cy="20" r="1.4"></circle><path d="M6 6 5 3H2"></path></svg>'
const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6"></path></svg>'

// Same markup as the Tebex template's product card, so generic.css styles it unchanged
function card(p) {
  const el = document.createElement('article')
  el.className = 'product-card'
  el.dataset.packageId = p.id
  el.innerHTML = `
  <div class="media">
    <a class="package-image" href="#" data-details="${p.id}"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"></a>
    <div class="price"><strong>${price(p)}</strong></div>
  </div>
  <div class="package-content details">
    <div class="package-card-heading">
      <span class="package-card-eyebrow">${esc(p.categoryName)}</span>
      <h4 class="package-name"><a href="#" data-details="${p.id}">${esc(p.name)}</a></h4>
    </div>
    <div class="package-description">${p.description}</div>
    <div class="package-actions product-actions">
      <a href="#" class="add-to-basket add" data-buy="${p.id}">${CART} ${p.total_price > 0 ? 'Buy now' : 'Get it free'}</a>
      <a href="#" class="check-product" data-details="${p.id}">View Details ${CHEVRON}</a>
    </div>
  </div>`
  return el
}

// main.js's home slider calls this instead of scraping Tebex category pages
window.rcoHeadlessCards = async () => {
  try {
    const cards = (await packagesPromise).map(card)
    if (cards.length) document.querySelector('.home-empty')?.remove()
    return cards
  } catch (err) {
    console.error('Tebex packages:', err)
    return []
  }
}

function details(p) {
  const box = document.createElement('div')
  box.className = 'fm-details'
  box.innerHTML = `
  <div class="fm-details-panel" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
    <button type="button" class="fm-details-close" aria-label="Close">&times;</button>
    <img src="${esc(p.image)}" alt="">
    <div class="fm-details-body">
      <span class="package-card-eyebrow">${esc(p.categoryName)}</span>
      <h2>${esc(p.name)}</h2>
      <div class="fm-details-buy"><strong>${price(p)}</strong>
        <a href="#" class="home-btn home-btn-primary" data-buy="${p.id}">${p.total_price > 0 ? 'Buy now' : 'Get it free'}</a></div>
      <div class="fm-details-text">${p.description}</div>
    </div>
  </div>`
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey) }
  const onKey = (e) => { if (e.key === 'Escape') close() }
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('.fm-details-close')) close() })
  document.addEventListener('keydown', onKey)
  document.body.append(box)
}

function notice(text, isError) {
  const el = document.createElement('div')
  el.className = 'fm-notice' + (isError ? ' is-error' : '')
  el.textContent = text
  document.body.append(el)
  setTimeout(() => el.remove(), 6000)
}

// Step 1: new basket, then the Cfx.re login (Tebex won't take packages before it)
async function buy(packageId, button) {
  button?.classList.add('is-loading')
  try {
    const basket = (await api(`/accounts/${TOKEN}/baskets`, {
      method: 'POST',
      body: JSON.stringify({ complete_url: HOME + '?purchase=done', cancel_url: HOME, complete_auto_redirect: true }),
    })).data
    const links = await api(`/accounts/${TOKEN}/baskets/${basket.ident}/auth?returnUrl=${encodeURIComponent(HOME + '?purchase=continue')}`)
    const login = links.find((l) => /fivem/i.test(l.name)) || links[0]
    if (!login) throw new Error('No login option for this store')
    localStorage.setItem(PENDING, JSON.stringify({ basket: basket.ident, packageId, at: Date.now() }))
    location.href = login.url
  } catch (err) {
    button?.classList.remove('is-loading')
    notice(`Could not start checkout: ${err.message}`, true)
  }
}

// Step 2: back from the login, add the package and open the Tebex checkout
async function continuePurchase() {
  let pending = null
  try { pending = JSON.parse(localStorage.getItem(PENDING)) } catch {}
  localStorage.removeItem(PENDING)
  history.replaceState(null, '', HOME)
  if (!pending || Date.now() - pending.at > 30 * 60 * 1000) return

  try {
    const pkg = (await packagesPromise).find((p) => p.id === pending.packageId)
    await api(`/baskets/${pending.basket}/packages`, {
      method: 'POST',
      body: JSON.stringify({ package_id: pkg?.ident ?? String(pending.packageId), quantity: 1 }),
    })
    await new Promise((r) => (window.Tebex ? r() : addEventListener('load', r, { once: true })))
    Tebex.checkout.init({ ident: pending.basket, theme: 'dark', colors: [{ name: 'primary', color: '#ffb020' }] })
    Tebex.checkout.launch()
  } catch (err) {
    notice(`Checkout failed: ${err.message}`, true)
  }
}

document.addEventListener('click', async (e) => {
  const buyEl = e.target.closest('[data-buy]')
  const detailsEl = e.target.closest('[data-details]')
  if (!buyEl && !detailsEl) return
  e.preventDefault()
  e.stopImmediatePropagation()
  if (buyEl) return buy(Number(buyEl.dataset.buy), buyEl)
  const p = (await packagesPromise).find((x) => x.id === Number(detailsEl.dataset.details))
  if (p) details(p)
}, true)

const purchase = new URLSearchParams(location.search).get('purchase')
if (purchase === 'continue') continuePurchase()
if (purchase === 'done') {
  history.replaceState(null, '', HOME)
  addEventListener('DOMContentLoaded', () => notice('Purchase complete. Check your Cfx.re portal: the resource is in your Granted Assets.'))
}
