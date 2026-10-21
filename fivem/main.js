/* SCSS sources, JavaScript and image assets are all available at https://github.com/BuycraftPlugin/webstore-templates */

/* global __, Tebex, __kTemplateConstants */

/**
 * @typedef {Object} TemplateConstants
 * @property {boolean} loginRequired
 * @property {boolean} isLoggedIn
 * @property {string} toast
 * @property {string} toastType
 * @property {string} checkoutTheme
 * @property {string} locale
 */

/**
 * @typedef {'left' | 'right' | 'up' | 'down'} SwipeDirection
 */

/**
 * @typedef {Object} BasketIdentResponse
 * @property {string} ident
 */

/**
 * @typedef {Object} HistoryState
 * @property {'page' | 'popup'} type
 * @property {string | URL} url
 * @property {?string} title
 */

/**
 * @typedef {Object} OpenURLPopupParams
 * @property {string} url URL to load the popup from
 * @property {string} className Class for the popup container
 * @property {string} contentClassName Class for the popup content element
 * @property {boolean} cache Whether to cache the popup
 * @property {boolean} pushHistory Whether to push a history state
 * @property {SwipeDirection | null} swipeDirection Whether to enable swipe to close
 */

/**
 * @typedef {Object} AddToBasketResult
 * @property {boolean} status Whether the request was successful
 * @property {?string} message Info/Error message from the response page
 * @property {?DocumentFragment} optionsForm HTML for the options form
 */

/**
 * @typedef {Object} OpenOptionsPopupParams
 * @property {string} packageId The ID of the package to be displayed in the popup.
 * @property {string} type The type of the package to be displayed in the popup.
 * @property {HTMLElement} options The options form to be displayed in the popup.
 * @property {?string} giftTo Username to send the gift to.
 */

/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} DrawerOptions
 * @property {number} distance
 * @property {SwipeDirection} direction
 * @property {(e: SwipeState) => void} onClose
 */

/**
 * @type {TemplateConstants}
 */
const kPresetConstants = __kTemplateConstants

const
  kOriginUrl = location.origin,
  kBasketUrl = kOriginUrl + '/checkout/basket',
  kCheckoutUrl = kOriginUrl + '/checkout/basket',
  kLoginUrl = kOriginUrl + '/login',
  kInitialUrl = location.origin + location.pathname + location.search, // skip the hash
  kInitialTitle = document.title,
  kAddPackageAfterLoginLCKey = 'add-after-login',
  kGiftPackageAfterLoginLCKey = 'gift-after-login',
  kToastTimeout = 7000,
  kGiftInvalidUsername = 'Please enter a valid username.'

const kLargeBreakpoint = window.matchMedia('(width > 960px)')

/** @type {HTMLElement | null} */
let navigationCont

/** @type {HTMLElement | null} */
let navigation

/** @type {Drawer | null} */
let navigationDrawer = null

const
  handleBasketQuantityChangeDebounced = debounce(handleBasketQuantityChange, 1000),
  handlePackageQuantityChangeDebounced = debounce(handlePackageQuantityChange, 1000)

/**
 * @type {Promise<string | null> | null}
 */
let basketIdentPromise = null

function init() {
  document.addEventListener('DOMContentLoaded', onDOMLoaded)
}

function onDOMLoaded() {
  navigationCont = document.querySelector('.site-navigation')

  if (navigationCont) {
    navigation = navigationCont.querySelector('.menu')
  }

  setCountdowns()
  initLaunchOffers()
  initCopyText()
  initNavigation()
  initTebexCheckout()
  setListeners()
  initPresetToast()
  initProductSearch()
  initProductGallery()
  initProductDescription()
  initBuyPanelSummary()
  initProductPurchaseDock()
  initCategoryNav()
  initHomeSlider()
  initHomeStats()
  initRecentMarquee()
  initScrollProgress()
  initHomeScrollCue()
  maybeAddPackageAfterLogin()
  maybeGiftPackageAfterLogin()
  maybeOpenOptionsPopupAfterLogin()
  initCheckoutPage()
  initBasketDropdown()
  window.addEventListener('popstate', handlePopState)
}

async function maybeOpenOptionsPopupAfterLogin() {
  if (!location.pathname.startsWith('/checkout/packages/add/')) {
    return
  }

  const
    splitPath = location.pathname.split('/'),
    packageId = splitPath[4],
    type = splitPath[5],
    giftTo = new URL(location.href).searchParams.get('username')

  if (!packageId || !type) {
    return
  }

  const optionsCont = document.body
    .querySelector('[data-popup].store-product-options')

  if (!optionsCont) {
    return
  }

  const options = document.createDocumentFragment()
  options.append(...optionsCont.children)

  optionsCont.remove()

  const success = await openOptionsFormPopup({
    packageId,
    type,
    options,
    giftTo
  })

  if (success) {
    location.href = kCheckoutUrl
  } else {
    setTimeout(() => location.href = `/package/${packageId}`, 3000)
  }
}

async function maybeAddPackageAfterLogin() {
  const packageStr = localStorage.getItem(kAddPackageAfterLoginLCKey)

  if (!kPresetConstants.isLoggedIn || packageStr === null) {
    return
  }

  localStorage.removeItem(kAddPackageAfterLoginLCKey)

  const [packageId, type] = packageStr.split('/')

  if (!packageId || !type) {
    return
  }

  const result = await addToBasket(packageId, type)

  if (result.message) {
    newToast(result.message, result.status ? 'info' : 'error')
  }

  if (result.optionsForm) {
    openOptionsFormPopup({
      packageId,
      type,
      options: result.optionsForm
    })
  } else if (result.status) {
    await onPackageStateChanged(packageId, 1)
  } else {
    location.href = `${kOriginUrl}/package/${packageId}`
  }
}

async function maybeGiftPackageAfterLogin() {
  const packageStr = localStorage.getItem(kGiftPackageAfterLoginLCKey)

  if (!kPresetConstants.isLoggedIn || packageStr === null) {
    return
  }

  localStorage.removeItem(kGiftPackageAfterLoginLCKey)

  const [packageId, type] = packageStr.split('/')

  if (packageId && type) {
    openGiftFormPopup(packageId, type)
  }
}

/**
 * Check if the current page can be opened as a popup
 * @param {string | URL} url
 */
function isPopupUrl(url) {
  try {
    url = (typeof url === 'string') ? new URL(url) : url
    return (isLoginUrl(url) || isQuoteUrl(url))
  } catch (e) {
    return false
  }
}

/**
 * Check if the current page can be opened as a login popup
 * @param {URL} url
 */
function isLoginUrl(url) {
  try {
    url = (typeof url === 'string') ? new URL(url) : url
    return (url.origin === location.origin && url.pathname === '/login')
  } catch (e) {
    return false
  }
}

/**
 * Check if the current page can be opened as a basket popup
 * @param {URL} url
 */
function isBasketUrl(url) {
  try {
    url = (typeof url === 'string') ? new URL(url) : url
    return (
      url.origin === location.origin &&
      (url.pathname === '/checkout' || url.pathname === '/checkout/basket')
    )
  } catch (e) {
    return false
  }
}

/**
 * Check if the current page can be opened as a package popup
 * @param {URL} url
 */
function isProductUrl(url) {
  try {
    url = (typeof url === 'string') ? new URL(url) : url
    return (url.origin === location.origin && /\/package\/\S+/gi.test(url.pathname))
  } catch (e) {
    return false
  }
}

/**
 * Check if the current page can be opened as a quote popup
 * @param {URL} url
 */
function isQuoteUrl(url) {
  try {
    url = (typeof url === 'string') ? new URL(url) : url
    return (url.origin === location.origin && /\/tier\/quote/gi.test(url.pathname))
  } catch (e) {
    return false
  }
}

function setListeners() {
  setPopupListeners()
  setPackageActionsListeners()
  setBasketOpenListeners()
  setCountdowns()
  setQuoteListeners()
}

function setQuoteListeners() {
  const
    popup = document.querySelector('.store-quote-popup'),
    form = document.querySelector('.store-quote form')

  if (!form || form.dataset.listenersSet) {
    return
  }

  form.dataset.listenersSet = true

  const formData = new FormData(form)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()

    const response = await fetch(form.action, {
      method: 'POST',
      body: formData
    })

    closePopup(popup, true, true)

    if (response.ok) {
      newToast(__('Subscribed successfully!'), 'success')
    } else {
      newToast(__('Failed to subscribe'), 'error')
    }
  })
}

/**
 * Set up a countdown
 * @param {HTMLElement} el
 */
function getCountdownEnd(el) {
  const secondsToEnd = parseInt(el.dataset.countdown, 10)

  if (Number.isFinite(secondsToEnd) && secondsToEnd > 0) {
    return Math.floor(Date.now() / 1000) + secondsToEnd
  }

  if (!el.dataset.launchEnd) {
    return null
  }

  const endsAt = Date.parse(el.dataset.launchEnd)

  if (!Number.isFinite(endsAt)) {
    return null
  }

  return Math.floor(endsAt / 1000)
}

function setCountdown(el) {
  const endsOn = getCountdownEnd(el)

  if (!endsOn) {
    return
  }

  const tick = () => {
    updateCountdown(el, endsOn)

    if (endsOn - Math.floor(Date.now() / 1000) <= 0) {
      clearInterval(interval)
    }
  }

  tick()
  const interval = setInterval(tick, 1000)
}

/**
 * Updates the countdown display for a given element until it reaches zero.
 * @param {HTMLElement} el
 * @param {number} endsOn
 */
function updateCountdown(el, endsOn) {
  const secondsLeft = Math.max(0, endsOn - Math.floor(Date.now() / 1000))
  const days = Math.floor(secondsLeft / (60 * 60 * 24))
  const hours = Math.floor((secondsLeft % (60 * 60 * 24)) / (60 * 60))
  const minutes = Math.floor((secondsLeft % (60 * 60)) / 60)
  const seconds = secondsLeft % 60
  const compactLabel = el.querySelector('[data-countdown-text]')
  const unitNodes = {
    days: el.querySelector('[data-unit="days"]'),
    hours: el.querySelector('[data-unit="hours"]'),
    minutes: el.querySelector('[data-unit="minutes"]'),
    seconds: el.querySelector('[data-unit="seconds"]')
  }

  if (secondsLeft <= 0) {
    el.classList.add('is-expired')
  }

  if (compactLabel) {
    const isProductLaunch = el.classList.contains('product-launch-countdown')

    if (secondsLeft <= 0) {
      compactLabel.textContent = isProductLaunch ? __('Launch offer ended') : __('Ended')
      return
    }

    if (isProductLaunch) {
      const compactTime = days > 0
        ? `${days}d ${padNumber(hours)}h`
        : hours > 0
          ? `${hours}h ${padNumber(minutes)}m`
          : `${minutes}m ${padNumber(seconds)}s`

      compactLabel.textContent = `Launch price ends in ${compactTime}`
      return
    }

    compactLabel.textContent = days > 0
      ? `Ends in ${padNumber(days)}d ${padNumber(hours)}h ${padNumber(minutes)}m`
      : `Ends in ${padNumber(hours)}h ${padNumber(minutes)}m ${padNumber(seconds)}s`
    return
  }

  if (unitNodes.days || unitNodes.hours || unitNodes.minutes || unitNodes.seconds) {
    if (unitNodes.days) unitNodes.days.textContent = padNumber(days)
    if (unitNodes.hours) unitNodes.hours.textContent = padNumber(hours)
    if (unitNodes.minutes) unitNodes.minutes.textContent = padNumber(minutes)
    if (unitNodes.seconds) unitNodes.seconds.textContent = padNumber(seconds)
    return
  }

  if (secondsLeft <= 0) {
    el.textContent = __("Time Expired")
    return
  }

  let textString = `${padNumber(hours)}:${padNumber(minutes)}:${padNumber(seconds)}`

  if (days > 0) {
    textString = `${days}d ${textString}`
  }

  el.textContent = textString
}

function initLaunchOffers() {
  const offers = document.querySelectorAll('[data-launch-original][data-launch-price]')

  for (const offer of offers) {
    const original = parseFloat(offer.dataset.launchOriginal)
    const price = parseFloat(offer.dataset.launchPrice)

    if (!(original > 0) || !(price >= 0) || price >= original) {
      continue
    }

    const percent = Math.round((1 - price / original) * 100)

    if (percent <= 0) {
      continue
    }

    const badge = offer.querySelector('.launch-badge-pct')

    if (!badge) {
      continue
    }

    badge.hidden = false
    badge.textContent = offer.classList.contains('launch-offer-card')
      ? `-${percent}%`
      : `${percent}% off`
  }
}

function setCountdowns() {
  const countdowns = document.querySelectorAll('[data-countdown], [data-launch-end]')

  for (let el of countdowns) {
    if (!el.dataset.countdownSet) {
      el.dataset.countdownSet = true
      setCountdown(el)
    }
  }
}

function initCopyText() {
  const elements = document.querySelectorAll('[data-copy]')

  for (let el of elements) {
    el.addEventListener('click', () => copyText(el))
  }
}

/**
 * Copy text to clipboard
 * @param {HTMLElement} el - Element to copy from
 */
function copyText(el) {
  const content = el.innerHTML

  copyToClipboard(el.dataset.copy)

  el.innerHTML = __('Copied!')

  setTimeout(() => el.innerHTML = content, 3000)
}

/**
 * Toggles open menu item
 * @param {HTMLElement} button - Toggle button
 */
function toggleMenuItem(button) {
  const
    menuItem = button.parentNode,
    otherMenuItems = [...menuItem.parentNode.children]
      .filter(item => item !== menuItem)

  const className = 'expanded'

  if (menuItem.classList.contains(className)) {
    menuItem.classList.remove(className)
    return
  }

  menuItem.classList.add(className)

  for (const otherMenuItem of otherMenuItems) {
    otherMenuItem.classList.remove(className)
  }
}

function updateNavigationDrawer() {
  if (!navigationCont || !navigation) {
    return
  }

  const isNavigationOpen = document.body.classList.contains('show-navigation')

  if (!kLargeBreakpoint.matches && isNavigationOpen) {
    if (navigationDrawer) {
      navigationDrawer.destroy()
    }

    navigationDrawer = new Drawer(navigationCont, navigation, {
      direction: 'left',
      onClose: closeNavigation
    })
  } else {
    if (navigationDrawer) {
      navigationDrawer.destroy()
      navigationDrawer = null
    }
  }
}

function openNavigation() {
  document.body.classList.add('show-navigation')

  updateNavigationDrawer()
}

function closeNavigation() {
  document.body.classList.remove('show-navigation')

  updateNavigationDrawer()
}

function initNavigation() {
  const toggleNavButton = document.querySelector('.toggle-navigation')

  if (!navigationCont || !toggleNavButton) {
    return
  }

  const
    closeNavButton = navigationCont.querySelector('.close-navigation'),
    toggleButtons = navigationCont.querySelectorAll('.toggle')

  toggleNavButton.addEventListener('click', () => {
    if (document.body.classList.contains('show-navigation')) {
      closeNavigation()
    } else {
      openNavigation()
    }
  })

  closeNavButton.addEventListener('click', closeNavigation)

  navigationCont.addEventListener('click', event => {
    if (event.target === navigationCont) {
      closeNavigation()
    }
  })

  for (const button of toggleButtons) {
    button.addEventListener('click', () => {
      toggleMenuItem(button)
    })
  }

  updateNavigationDrawer()

  kLargeBreakpoint.addEventListener('change', updateNavigationDrawer)
}

function setPopupListeners() {
  /**
   * @type {HTMLAnchorElement[]}
   */
  const links = document.querySelectorAll('a')

  for (const link of links) {
    if (
      link.dataset.clickSet ||
      !isPopupUrl(link.href) ||
      link.dataset.noPopup
    ) {
      continue
    }

    link.dataset.clickSet = true

    link.addEventListener('click', e => {
      e.preventDefault()

      const url = new URL(link.href)

      if (isBasketUrl(url)) {
        openBasket()
      } else if (isLoginUrl(url)) {
        openLoginPopup()
      } else if (isQuoteUrl(url)) {
        openQuotePopup(link.href)
      }
    })
  }
}

function setBasketOpenListeners() {
  document.querySelectorAll('.open-basket').forEach((el) => {
    if (el.dataset.clickSet) {
      return
    }

    if (el.tagName === 'A' && (el.getAttribute('href') === '/checkout/basket' || el.pathname === '/checkout/basket')) {
      return
    }

    el.dataset.clickSet = true
    el.addEventListener('click', (e) => {
      e.preventDefault()
      location.assign(kCheckoutUrl)
    })
  })
}

function setBasketCount(count) {
  const n = Math.max(0, parseInt(count, 10) || 0)

  document.querySelectorAll('.site-header .open-basket').forEach((button) => {
    button.dataset.count = String(n)
    button.classList.toggle('has-items', n > 0)

    let badge = button.querySelector('.basket-count')

    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'basket-count'
      button.appendChild(badge)
    }

    badge.textContent = String(n)
    badge.hidden = n === 0
  })

  document.querySelectorAll('.header-checkout').forEach((el) => {
    el.hidden = n === 0
  })

  document.querySelectorAll('.header-basket').forEach((wrap) => {
    wrap.classList.toggle('is-empty', n === 0)
    wrap.classList.toggle('has-items', n > 0)
  })
}

function formatBasketMoney(amount, currency) {
  const value = Number(amount || 0).toFixed(2)
  const code = currency || 'EUR'

  if (code === 'USD') {
    return `<strong>$${value}</strong>`
  }

  if (code === 'EUR') {
    return `<strong>€${value}</strong>`
  }

  if (code === 'GBP') {
    return `<strong>£${value}</strong>`
  }

  if (code === 'BRL') {
    return `<strong>R$${value}</strong>`
  }

  return `<strong>${value}</strong> ${code}`
}

function updateBasketDropdownState(wrap) {
  if (!wrap) {
    return
  }

  const items = [...wrap.querySelectorAll('.basket-dropdown-item')]
  const qty = items.reduce((sum, item) => {
    return sum + (parseInt(item.dataset.qty, 10) || 1)
  }, 0)
  const total = items.reduce((sum, item) => {
    const price = parseFloat(item.dataset.price)
    const count = parseInt(item.dataset.qty, 10) || 1
    return sum + (Number.isFinite(price) ? price * count : 0)
  }, 0)
  const currency = wrap.querySelector('.basket-dropdown')?.dataset.currency || 'EUR'
  const totalEl = wrap.querySelector('.basket-dropdown-total-value')

  if (totalEl) {
    totalEl.innerHTML = formatBasketMoney(total, currency)
  }

  setBasketCount(qty)

  const countLabel = wrap.querySelector('.basket-dropdown-count-label')
  if (countLabel) {
    countLabel.textContent = `${qty} ${qty === 1 ? 'item' : 'items'}`
  }
}

let basketAutoCloseTimer = null

function openBasketDropdownBriefly() {
  const wrap = document.querySelector('.site-header .header-basket')
  const trigger = wrap?.querySelector('.open-basket')
  const status = wrap?.querySelector('.basket-dropdown-status')

  if (!wrap || !trigger || wrap.classList.contains('is-empty')) {
    return
  }

  closeBasketDropdowns(wrap)
  wrap.classList.add('is-open')
  trigger.setAttribute('aria-expanded', 'true')

  if (status) {
    status.hidden = false
  }

  if (basketAutoCloseTimer) {
    clearTimeout(basketAutoCloseTimer)
  }

  basketAutoCloseTimer = window.setTimeout(() => {
    if (status) {
      status.hidden = true
    }

    if (wrap.matches(':hover') || wrap.contains(document.activeElement)) {
      return
    }

    wrap.classList.remove('is-open')
    trigger.setAttribute('aria-expanded', 'false')
  }, 2200)
}

function closeBasketDropdowns(exceptWrap) {
  document.querySelectorAll('.header-basket.is-open').forEach((wrap) => {
    if (wrap === exceptWrap) {
      return
    }

    wrap.classList.remove('is-open')
    wrap.querySelector('.open-basket')?.setAttribute('aria-expanded', 'false')
  })
}

async function removeBasketDropdownItem(button) {
  const item = button.closest('.basket-dropdown-item')
  const wrap = button.closest('.header-basket')
  const packageId = item?.dataset.package

  if (!packageId || !wrap || item.classList.contains('is-removing')) {
    return
  }

  item.classList.add('is-removing')
  button.setAttribute('aria-busy', 'true')

  const ok = await removeFromBasket(packageId)

  if (!ok) {
    item.classList.remove('is-removing')
    button.removeAttribute('aria-busy')
    return
  }

  item.remove()
  updateBasketDropdownState(wrap)
  await onPackageStateChanged(packageId, 0)
}

function bindBasketDropdown(wrap) {
  if (!wrap || wrap.dataset.dropdownBound) {
    return
  }

  const trigger = wrap.querySelector('.open-basket')
  const panel = wrap.querySelector('.basket-dropdown')

  if (!trigger || !panel) {
    return
  }

  wrap.dataset.dropdownBound = 'true'
  trigger.setAttribute('aria-haspopup', 'true')

  trigger.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()

    const open = wrap.classList.toggle('is-open')
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false')

    if (open) {
      closeBasketDropdowns(wrap)
    }
  })

  wrap.addEventListener('mouseleave', () => {
    wrap.classList.remove('is-open')
    trigger.setAttribute('aria-expanded', 'false')
  })

  panel.querySelectorAll('.basket-dropdown-remove').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      removeBasketDropdownItem(button)
    })
  })
}

function initBasketDropdown() {
  document.querySelectorAll('.header-basket').forEach(bindBasketDropdown)

  if (document.body.dataset.basketDropdownDoc) {
    return
  }

  document.body.dataset.basketDropdownDoc = 'true'

  document.addEventListener('click', (event) => {
    if (event.target.closest('.header-basket')) {
      return
    }

    closeBasketDropdowns()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeBasketDropdowns()
    }
  })
}

let basketDropdownRefreshing = false

async function refreshBasketDropdown() {
  if (basketDropdownRefreshing) {
    return
  }

  const current = document.querySelector('.header-basket')

  if (!current) {
    return
  }

  basketDropdownRefreshing = true

  try {
    const response = await fetch('/checkout/basket', { credentials: 'same-origin' })

    if (!response.ok) {
      return
    }

    const html = await response.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const next = doc.querySelector('.header-basket')

    if (next) {
      const wasOpen = current.classList.contains('is-open')
      current.replaceWith(next)
      bindBasketDropdown(next)

      if (wasOpen) {
        next.classList.add('is-open')
        next.querySelector('.open-basket')?.setAttribute('aria-expanded', 'true')
      }

      const count = parseInt(next.querySelector('.open-basket')?.dataset.count || '0', 10) || 0
      setBasketCount(count)
    }
  } catch (error) {
    // Keep the optimistic header count if the dropdown cannot refresh.
  } finally {
    basketDropdownRefreshing = false
  }
}

function syncBasketCountFromPopup() {
  const popup = document.querySelector('.basket-popup-content')

  if (!popup) {
    return
  }

  const inputs = popup.querySelectorAll('input.quantity')

  if (inputs.length) {
    const total = [...inputs].reduce((sum, input) => {
      const value = parseInt(input.value, 10)
      return sum + (Number.isFinite(value) ? value : 1)
    }, 0)

    setBasketCount(total)
    return
  }

  setBasketCount(popup.querySelectorAll('.basket-item').length)
}

/**
 * @param {HTMLElement} actions
 * @param {string | number} packageId
 * @param {'single' | 'subscribe'} type
 */
async function handleAddToBasketClick(actions, packageId, type = 'single') {
  if (kPresetConstants.loginRequired && !kPresetConstants.isLoggedIn) {
    localStorage.setItem(kAddPackageAfterLoginLCKey, `${packageId}/${type}`)
    openLoginPopup()
    return
  }

  actions.classList.add('updating')

  const result = await addToBasket(packageId, type)

  actions.classList.remove('updating')

  if (result.message) {
    newToast(result.message, result.status ? 'info' : 'error')
  }

  const parentPopup = actions.closest('.popup')

  if (result.optionsForm) {
    if (parentPopup) {
      closePopup(parentPopup, true)
    }

    openOptionsFormPopup({
      packageId,
      type,
      options: result.optionsForm
    })
  } else if (result.status) {
    if (parentPopup) {
      closePopup(parentPopup, true)
    }

    await onPackageStateChanged(packageId, 1)
  } else if (!result.message) {
    newToast(__('Failed to add to basket'), 'error')
  }
}

/**
 * Update the state of package .product-actions elements
 * @param {HTMLElement} actions
 * @param {number} quantity
 */
function updatePackageActionsState(actions, quantity = 0) {
  const
    addLink = actions.querySelector('.add'),
    subscribeLink = actions.querySelector('.subscribe'),
    quantityField = actions.querySelector('.quantity-field'),
    quantityFieldInput = quantityField?.querySelector('input.quantity'),
    openBasketCTA = actions.querySelector('.open-basket-cta'),
    isZero = quantity === 0

  if (addLink) {
    addLink.hidden = !isZero
  }

  if (subscribeLink) {
    subscribeLink.hidden = !isZero
  }

  if (quantityField) {
    quantityField.hidden = isZero

    if (quantityFieldInput) {
      quantityFieldInput.value = quantity
    }
  }

  if (openBasketCTA) {
    openBasketCTA.hidden = isZero
  }
}

/**
 * @param {MouseEvent} e
 */
function handleIncreaseQuantity(e) {
  e.preventDefault()

  const
    quantityEl = e.target.parentNode.querySelector('input.quantity'),
    max = (quantityEl.max) ? parseInt(quantityEl.max, 10) : Infinity

  let value = parseInt(quantityEl.value, 10)

  value = Math.min(value + 1, max)

  quantityEl.value = value
}

/**
 * @param {MouseEvent} e
 */
function handleDecreaseQuantity(e) {
  e.preventDefault()

  const
    quantityEl = e.target.parentNode.querySelector('input.quantity'),
    min = (quantityEl.min) ? parseInt(quantityEl.min, 10) : 0

  let value = parseInt(quantityEl.value, 10)

  value = Math.max(value - 1, min)

  quantityEl.value = value
}

/**
 * Handles store item quantity change events
 * @param {HTMLElement} actions - .product-actions container
 */
async function handlePackageQuantityChange(actions) {
  const
    packageId = actions.dataset.package,
    quantityInput = actions.querySelector('input.quantity'),
    min = (quantityInput.min) ? parseInt(quantityInput.min, 10) : 0,
    max = (quantityInput.max) ? parseInt(quantityInput.max, 10) : Infinity

  let value = parseInt(quantityInput.value, 10)

  const clampedValue = Math.max(Math.min(value, max), min)

  if (clampedValue !== value) {
    quantityInput.value = clampedValue
    value = clampedValue
  }

  actions.classList.add('updating')

  updatePackageActionsState(actions, value)

  const otherPackages = document
    .querySelectorAll(`.product-actions[data-package="${packageId}"]`)

  for (const instance of otherPackages) {
    if (instance !== actions) {
      updatePackageActionsState(instance, value)
    }
  }

  if (value <= 0) {
    await removeFromBasket(packageId)
  } else {
    await updateBasketQuantities({ [quantityInput.name]: value })
  }

  if (isBasketOpen()) {
    await updateBasketContent()
  }

  actions.classList.remove('updating')
}

/**
 * Handles basket item quantity change events
 * @param {HTMLElement} container - .basket-item
 */
async function handleBasketQuantityChange(container) {
  const
    basketItems = container.querySelectorAll('.basket-item'),
    quantities = {}

  for (const basketItem of basketItems) {
    const
      packageId = basketItem.dataset.package,
      quantityInput = basketItem.querySelector('input.quantity'),
      value = parseInt(quantityInput.value, 10)

    quantities[quantityInput.name] = value

    const storePackages = document
      .querySelectorAll(`.product-actions[data-package="${packageId}"]`)

    for (const instance of storePackages) {
      updatePackageActionsState(instance, value)
    }
  }

  container.classList.add('updating')

  await updateBasketQuantities(quantities)

  if (isBasketOpen()) {
    await updateBasketContent()
  }

  container.classList.remove('updating')
}

/**
 * Updates the package actions state and opens the basket after a package has been added.
 * @param {string | number} packageId - The ID of the added package.
 * @param {number} count - The updated package count.
 * @return {Promise<void>}
 */
async function onPackageStateChanged(packageId, count) {
  const instances = document.querySelectorAll(
    `.product-actions[data-package="${packageId}"]`
  )

  for (const instance of instances) {
    instance.classList.remove('updating')
    updatePackageActionsState(instance, count)
  }

  syncProductPurchaseDock(packageId, count)

  if (count > 0) {
    if (document.body.classList.contains('page-checkout')) {
      location.reload()
      return
    }

    const header = document.querySelector('.site-header .open-basket')
    const current = parseInt(header?.dataset.count || '0', 10) || 0
    setBasketCount(current + 1)
    await refreshBasketDropdown()
    openBasketDropdownBriefly()
  } else if (document.body.classList.contains('page-checkout')) {
    location.reload()
  }
}

/**
 * Opens a popup with options, returns the form data or null if the user cancels.
 * @param {OpenOptionsPopupParams} params
 * @returns {Promise<boolean>}
 */
function openOptionsFormPopup({
  packageId,
  type,
  options,
  giftTo
}) {
  return new Promise(resolve => {
    const container = document.createElement('div')
    container.classList.value = 'popup product-options-popup'

    const scrollContainer = document.createElement('div')
    scrollContainer.classList.value = 'popup-scroll-cont'
    scrollContainer.addEventListener('mousedown', e => {
      if (e.target === scrollContainer) {
        closePopup(container, false, true)
        resolve(false)
      }
    })

    container.appendChild(scrollContainer)

    const closeButton = document.createElement('button')
    closeButton.textContent = __('Close')
    closeButton.classList.value = 'popup-close'
    closeButton.addEventListener('click', () => {
      closePopup(container, false, true)
      resolve(false)
    })

    const contentEl = document.createElement('div')
    contentEl.classList.value = 'popup-content store-product-options'
    contentEl.appendChild(closeButton)

    scrollContainer.appendChild(contentEl)

    document.documentElement.classList.add('no-scroll')
    document.body.appendChild(container)

    contentEl.appendChild(options)

    const form = contentEl.querySelector('form')

    if (!form) {
      closePopup(container, false, true)
      return resolve(false)
    }

    form.addEventListener('submit', async e => {
      e.preventDefault()

      const isValid = form.reportValidity()

      if (!isValid) {
        newToast(__('Please fill in all fields'), 'error')
        return
      }

      const actions = form.querySelector('.actions')

      actions?.classList.add('updating')

      const options = [...new FormData(form).entries()]
        .reduce((obj, [key, value]) => {
          obj[key] = value
          return obj
        }, {})

      const result = await addToBasketWithOptions(
        packageId,
        type,
        options,
        giftTo
      )

      actions?.classList.remove('updating')

      if (result.message) {
        newToast(result.message, result.status ? 'info' : 'error')
      }

      if (result.status) {
        closePopup(container, false, true)
        await onPackageStateChanged(packageId, 1)
      } else if (!result.message) {
        newToast(__('Failed to add to basket'), 'error')
        await new Promise(r => setTimeout(r, 3000)) // wait to show toast
      }

      resolve(result.status)
    })
  })
}

/**
 * Open gift form
 * @param {number} packageId
 * @param {'single' | 'subscribe' | 'both'} type
 */
function openGiftFormPopup(packageId, type) {
  if (type === 'both') {
    type = 'single'
  }

  if (kPresetConstants.loginRequired && !kPresetConstants.isLoggedIn) {
    localStorage.setItem(kGiftPackageAfterLoginLCKey, `${packageId}/${type}`)
    openLoginPopup()
    return
  }

  const container = document.createElement('div')
  container.classList.add('popup', 'gift-form-popup')

  const scrollContainer = document.createElement('div')
  scrollContainer.classList.value = 'popup-scroll-cont'
  scrollContainer.addEventListener('mousedown', e => {
    if (e.target === scrollContainer) {
      closePopup(container, false, true)
    }
  })

  container.appendChild(scrollContainer)

  const content = document.createElement('form')
  content.classList.add('popup-content', 'text-content', 'store-form')
  content.innerHTML = `<h2>${__('Gift this package')}</h2>
<input
  type="text"
  name="username"
  placeholder="${__('Enter a username to gift this package to')}"
  required
  class="form-control"
/>
<div class="actions">
  <button class="btn-primary" type="submit">${__('Send gift')}</button>
</div>`
  scrollContainer.appendChild(content)

  const closeButton = document.createElement('button')
  closeButton.classList.value = 'popup-close'
  closeButton.textContent = __('Close')
  closeButton.addEventListener('click', () => {
    closePopup(container, false, true)
  })

  content.appendChild(closeButton)

  content.addEventListener('submit', async e => {
    e.preventDefault()

    const
      input = content.querySelector('input[name=username]'),
      actions = content.querySelector('.actions')

    if (!input) {
      return
    }

    const username = input.value.trim()

    if (!username) {
      newToast(__('Please enter a username'), 'error')
      return
    }

    actions?.classList.add('updating')

    const result = await addToBasket(packageId, type, username)

    actions?.classList.remove('updating')

    if (result.message) {
      newToast(result.message, result.status ? 'info' : 'error')
    }

    if (result.optionsForm) {
      closePopup(container, false, true)
      openOptionsFormPopup({
        packageId,
        type,
        options: result.optionsForm,
        giftTo: username
      })
    } else if (result.status) {
      closePopup(container, false, true)
      await onPackageStateChanged(packageId, 1)
    } else if (!result.message) {
      newToast(__('Failed to add to basket'), 'error')
    }
  })

  document.body.appendChild(container)

  content.querySelector('input').focus()

  return container
}

/**
 * @param {string} url
 * @param {boolean} pushHistory
 */
async function openProductPopup(url, pushHistory = true) {
  const popup = await openUrlPopup({
    url,
    className: 'store-product-popup',
    contentClassName: 'store-product-popup-content store-product store-product-full',
    pushHistory,
    swipeDirection: 'down'
  })

  if (popup) {
    setListeners()
  }
}

/**
 * @param {string} url
 */
async function openQuotePopup(url) {
  const popup = await openUrlPopup({
    url,
    className: 'store-quote-popup',
    contentClassName: 'store-quote store-form',
    cache: false,
    pushHistory: true,
    swipeDirection: 'down'
  })

  if (popup) {
    setListeners()
  }
}

async function openBasket() {
  location.assign(kCheckoutUrl)
}

async function openLoginPopup(pushHistory = true) {
  await openUrlPopup({
    url: kLoginUrl,
    className: 'login-popup',
    contentClassName: 'login-popup-content store-form text-content',
    pushHistory,
    swipeDirection: 'down'
  })
}

/**
 * @param {PopStateEvent} e
 */
function handlePopState(e) {
  /**
   * @type {HistoryState}
   */
  const state = e.state

  closeNavigation()

  if (state?.type !== 'popup') {
    document.querySelectorAll('.popup').forEach(el => el.hidden = true)
    document.documentElement.classList.remove('no-scroll')
  }

  if (!state || state.type === 'page') {
    document.title = state?.title ?? kInitialTitle
  } else if (state.type === 'popup') {
    const url = (typeof state.url === 'string')
      ? new URL(state.url)
      : state.url

    if (isBasketUrl(url)) {
      location.assign(url.href)
    } else if (isLoginUrl(url)) {
      openLoginPopup(false)
    } else if (isProductUrl(url)) {
      location.assign(url.href)
    }
  }
}

/**
 * Pushes a history state
 * @param {HistoryState} state
 */
function pushHistoryState(state) {
  history.pushState(state, null, state.url)

  if (state.title) {
    document.title = state.title
  }
}

/**
 * Gets an element by selector from HTML
 * @param {string} html
 * @param {string} selector
 * @returns { ?{ title: string; content: DocumentFragment } } - Returns null if not found
 */
function getBySelectorFromHTML(html, selector) {
  const tempEl = document.createElement('template')

  tempEl.innerHTML = html

  const result = tempEl.content.querySelector(selector)

  if (!result) {
    return null
  }

  const title = tempEl.content.querySelector('title')?.textContent ?? ''

  const documentFragment = document.createDocumentFragment()

  documentFragment.append(...result.children)

  return {
    title,
    content: documentFragment
  }
}

function makeEmptyBasketContent() {
  const empty = document.createElement('div')
  empty.classList.value = 'basket-empty'
  empty.textContent = __('Basket is empty')

  return empty
}

/**
 * Opens a popup
 * @param {OpenURLPopupParams}
 * @returns {Promise<HTMLElement | null>} - Returns null if popup could not be loaded
 */
async function openUrlPopup({
  url,
  className,
  contentClassName,
  cache = true,
  pushHistory = true,
  swipeDirection = null
}) {
  if (!isPopupUrl(url)) {
    console.warn('openUrlPopup(): url not supported:', url)
    return null
  }

  const existingContainer = document.querySelector(`.popup[data-url="${url}"]`)

  if (existingContainer) {
    if (cache) {
      if (pushHistory) {
        pushHistoryState({
          type: 'popup',
          url,
          title: existingContainer.dataset.title
        })
      }

      document.documentElement.classList.add('no-scroll')
      existingContainer.hidden = false

      if (swipeDirection !== null) {
        new Drawer(existingContainer, existingContainer.querySelector('.popup-content'), {
          direction: swipeDirection,
          onClose: () => closePopup(existingContainer, true, !cache)
        })
      }

      return existingContainer
    } else {
      existingContainer.remove()
    }
  }

  let cancelled = false

  const container = document.createElement('div')
  container.dataset.url = url
  container.classList.add('popup', 'popup-loading', ...className.split(' '))

  const handleKeydown = e => {
    if (e.key === 'Escape') {
      cancelled = true
      closePopup(container, true, !cache)

      if (!cache) {
        document.removeEventListener('keydown', handleKeydown)
      }
    }
  }

  document.addEventListener('keydown', handleKeydown)

  const scrollContainer = document.createElement('div')
  scrollContainer.classList.value = 'popup-scroll-cont'
  scrollContainer.addEventListener('mousedown', e => {
    if (e.target === scrollContainer) {
      cancelled = true
      closePopup(container, true, !cache)
    }
  })

  container.appendChild(scrollContainer)

  const closeButton = document.createElement('button')
  closeButton.textContent = __('Close')
  closeButton.classList.value = 'popup-close'
  closeButton.addEventListener('click', () => {
    cancelled = true
    closePopup(container, true, !cache)
  })

  const contentEl = document.createElement('div')
  contentEl.classList.add('popup-content', ...contentClassName.split(' '))
  contentEl.appendChild(closeButton)

  scrollContainer.appendChild(contentEl)

  document.documentElement.classList.add('no-scroll')
  document.body.appendChild(container)

  const response = await fetch(url)

  if (cancelled) {
    return null
  }

  if (!response.ok) {
    console.warn(
      'openUrlPopup(): could not find contents:',
      response.status,
      response.statusText
    )
    return null
  }

  const html = await response.text()

  if (cancelled) {
    return null
  }

  let results = getBySelectorFromHTML(html, '[data-popup]')

  if (!results) {
    if (url === kBasketUrl) {
      results = {
        title: kInitialTitle,
        content: makeEmptyBasketContent()
      }
    } else {
      console.warn('openUrlPopup(): could not find popup contents')
      return null
    }
  }

  if (pushHistory) {
    pushHistoryState({
      type: 'popup',
      url,
      title: results.title
    })
  }

  container.classList.remove('popup-loading')
  container.dataset.title = results.title

  contentEl.appendChild(results.content)

  if (swipeDirection !== null) {
    new Drawer(container, contentEl, {
      direction: swipeDirection,
      onClose: () => closePopup(container, true, !cache)
    })
  }

  return container
}

/**
 * Closes the popup pushes a history state
 * @param {HTMLElement} popupContainer
 * @param {boolean} pushHistory
 * @param {boolean} remove
 */
function closePopup(popupContainer, pushHistory = true, remove = true) {
  document.documentElement.classList.remove('no-scroll')

  if (popupContainer.hidden) {
    return
  }

  if (remove) {
    const
      bodyStyles = window.getComputedStyle(popupContainer),
      fadeDurationCSS = bodyStyles.getPropertyValue('--fade-duration') ?? '300ms', // in ms, string
      fadeDuration = parseFloat(fadeDurationCSS)

    setTimeout(() => {
      if (popupContainer.hidden) {
        popupContainer.remove()
      }
    }, fadeDuration + 20)
  }

  popupContainer.hidden = true

  if (pushHistory) {
    pushHistoryState({
      type: 'page',
      url: kInitialUrl,
      title: kInitialTitle
    })
  }
}

/**
 * Copies text to clipboard
 * @param {string} text
 */
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
  }
}

async function waitForTebex(timeout = 10000) {
  if (window.Tebex?.checkout) {
    return true
  }

  if (document.readyState !== 'complete') {
    await new Promise(resolve => window.addEventListener('load', resolve, { once: true }))
  }

  if (window.Tebex?.checkout) {
    return true
  }

  const startedAt = Date.now()

  while (!window.Tebex?.checkout && Date.now() - startedAt < timeout) {
    await delay(50)
  }

  return Boolean(window.Tebex?.checkout)
}

async function initTebexCheckout() {
  const ready = await waitForTebex()

  if (!ready) {
    console.warn('initTebexCheckout(): Tebex.js did not load')
    return
  }

  Tebex.checkout.on(Tebex.events.PAYMENT_COMPLETE, () => {
    location.href = kOriginUrl
  })
}

function setPackageActionsListeners() {
  const products = document.querySelectorAll('.product-actions[data-package]')

  for (const product of products) {
    setPackageActionsListener(product)
  }
}

/**
 * @param {HTMLElement} actions - .product-actions element
 */
function setPackageActionsListener(actions) {
  const
    packageId = actions.dataset.package,
    addLink = actions.querySelector('.add'),
    subscribeLink = actions.querySelector('.subscribe'),
    giftLink = actions.querySelector('.gift'),
    quantityField = actions.querySelector('.quantity-field'),
    decreaseButton = quantityField?.querySelector('button.decrease'),
    increaseButton = quantityField?.querySelector('button.increase'),
    quantityInput = quantityField?.querySelector('input.quantity')

  if (addLink && !addLink.dataset.clickSet) {
    addLink.dataset.clickSet = true
    addLink.addEventListener('click', e => {
      e.preventDefault()
      handleAddToBasketClick(actions, packageId)
    })
  }

  if (subscribeLink && !subscribeLink.dataset.clickSet) {
    subscribeLink.dataset.clickSet = true
    subscribeLink.addEventListener('click', e => {
      e.preventDefault()
      handleAddToBasketClick(actions, packageId, 'subscribe')
    })
  }

  if (decreaseButton && !decreaseButton.dataset.clickSet) {
    decreaseButton.dataset.clickSet = true
    decreaseButton.addEventListener('click', e => {
      handleDecreaseQuantity(e)
      handlePackageQuantityChangeDebounced(actions)
    })
  }

  if (increaseButton && !increaseButton.dataset.clickSet) {
    increaseButton.dataset.clickSet = true
    increaseButton.addEventListener('click', e => {
      handleIncreaseQuantity(e)
      handlePackageQuantityChangeDebounced(actions)
    })
  }

  if (quantityInput && !quantityInput.dataset.changeSet) {
    quantityInput.dataset.changeSet = true
    quantityInput.addEventListener('input', () => {
      handlePackageQuantityChangeDebounced(actions)
    })
  }

  if (giftLink && !giftLink.dataset.clickSet) {
    giftLink.dataset.clickSet = true
    giftLink.addEventListener('click', e => {
      e.preventDefault()
      openGiftFormPopup(packageId, actions.dataset.packageType)
    })
  }
}

/**
 * Add a package to basket. Returns document fragment with options form if they
 * are required
 * @param {number|string} packageId
 * @param {string} type
 * @param {?string} giftTo - username of the gift recipient
 * @returns {Promise<AddToBasketResult>}
 */
async function addToBasket(packageId, type = 'single', giftTo) {
  const typeAction = sanitizePurchaseType(type)

  let url = `/checkout/packages/add/${packageId}/${typeAction}`

  if (giftTo) {
    url += `/gift?username=${giftTo}`
  }

  const response = await fetch(url)

  const text = await response.text()

  const t = document.createElement('template')
  t.innerHTML = text

  const site = t.content.querySelector('.site')

  if (!site && !response.ok) {
    return {
      status: false,
      message: text
    }
  }

  const toast = site?.dataset?.toast

  const hasErrorHeader = response.headers.get('x-package-action-status')?.toLowerCase() === 'failed'

  const isError = (
    toast === kGiftInvalidUsername ||
    toast === __(kGiftInvalidUsername) ||
    hasErrorHeader
  )

  const options = t.content.querySelector('[data-popup].store-product-options')

  if (!options) {
    return {
      status: !isError,
      message: toast
    }
  }

  const documentFragment = document.createDocumentFragment()
  documentFragment.append(...options.children)

  return {
    status: true,
    optionsForm: documentFragment,
    message: toast
  }
}

/**
 * Add a package to basket with options/variables
 * @param {number|string} packageId
 * @param {string} type
 * @param {Record<string, string} options
 * @param {?string} giftTo - username of the gift recipient
 * @returns {Promise<AddToBasketResult>}
 */
async function addToBasketWithOptions(
  packageId,
  type = 'single',
  options,
  giftTo
) {
  const params = new URLSearchParams(options)

  params.append('username', giftTo)
  params.append('submit', '1')

  const typeAction = sanitizePurchaseType(type)

  let url = `/checkout/packages/add/${packageId}/${typeAction}`

  if (giftTo) {
    url += `/gift?username=${giftTo}`
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  })

  const text = await response.text()

  const t = document.createElement('template')
  t.innerHTML = text

  const site = t.content.querySelector('.site')

  if (!site && !response.ok) {
    return {
      status: false,
      message: text
    }
  }

  const toast = site?.dataset?.toast

  const hasErrorHeader = response.headers.get('x-package-action-status')?.toLowerCase() === 'failed'

  const isError = (
    toast === kGiftInvalidUsername ||
    toast === __(kGiftInvalidUsername) ||
    hasErrorHeader
  )

  return {
    status: !isError,
    message: toast
  }
}

/**
 * @param {Record<string, number>} basketData
 */
async function updateBasketQuantities(basketData) {
  const formData = new URLSearchParams(basketData)

  const response = await fetch('/checkout/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData
  })

  return response.ok
}

/**
 * @param {number | string} packageId
 */
async function removeFromBasket(packageId) {
  const response = await fetch(`/checkout/packages/remove/${packageId}`)

  return response.ok
}

function isBasketOpen() {
  return document.body.classList.contains('page-checkout')
}

function initCheckoutPage() {
  const form = document.querySelector('.page-checkout form.basket')

  if (!form) {
    return
  }

  const ident = form.querySelector('.basket-header')?.dataset.ident
  basketIdentPromise = ident ? Promise.resolve(ident) : getBasketIdent()
  setBasketEventListeners(form)
  initCheckoutCoupon()
}

async function updateBasketContent() {
  if (document.body.classList.contains('page-checkout')) {
    location.reload()
    return true
  }

  return false
}

/**
 * Adds event listeners to basket elements
 * @param {HTMLElement} basketEl - Basket .popup-content container
 */
function setBasketEventListeners(basketEl) {
  const
    decreaseButtons = basketEl.querySelectorAll('button.decrease'),
    increaseButtons = basketEl.querySelectorAll('button.increase'),
    quantityInputs = basketEl.querySelectorAll('input.quantity'),
    removeButtons = basketEl.querySelectorAll('a.remove'),
    checkoutButton = basketEl.querySelector('button.checkout')

  for (const button of decreaseButtons) {
    if (!button.dataset.clickSet) {
      button.dataset.clickSet = true
      button.addEventListener('click', e => {
        handleDecreaseQuantity(e)
        handleBasketQuantityChangeDebounced(basketEl)
      })
    }
  }

  for (const button of increaseButtons) {
    if (!button.dataset.clickSet) {
      button.dataset.clickSet = true
      button.addEventListener('click', e => {
        handleIncreaseQuantity(e)
        handleBasketQuantityChangeDebounced(basketEl)
      })
    }
  }

  for (const input of quantityInputs) {
    if (!input.dataset.changeSet) {
      input.dataset.changeSet = true
      input.addEventListener('input', () => {
        handleBasketQuantityChangeDebounced(basketEl)
      })
    }
  }

  for (const button of removeButtons) {
    if (!button.dataset.clickSet) {
      button.dataset.clickSet = true
      button.addEventListener('click', async e => {
        const packageId = e.target.closest('.basket-item')?.dataset.package

        if (packageId) {
          e.preventDefault()
          basketEl.classList.add('updating')
          await removeFromBasket(packageId)
          await onPackageStateChanged(packageId, 0)
          basketEl.classList.remove('updating')
        }
      })
    }
  }

  if (checkoutButton && !checkoutButton.dataset.clickSet) {
    checkoutButton.dataset.clickSet = true
    checkoutButton.addEventListener('click', e => {
      e.preventDefault()

      checkoutButton.disabled = true

      openCheckout().finally(() => {
        checkoutButton.disabled = false
      })
    })
  }

  if (checkoutButton && basketIdentPromise) {
    checkoutButton.disabled = true

    basketIdentPromise.then(() => {
      checkoutButton.disabled = false
    }).catch(() => {
      checkoutButton.disabled = false
    })
  }
}

/**
 * Fetches the basket ident string or null if not found
 */
async function getBasketIdent() {
  const response = await fetch('/checkout/ident')

  if (!response.ok) {
    console.warn(
      'getBasketIdent(): couldn\'t get basket ident:',
      response.status,
      response.statusText
    )
    return null
  }

  try {
    /**
     * @type {BasketIdentResponse}
     */
    const parsed = await response.json()

    if (!parsed || !parsed.ident) {
      console.warn('getBasketIdent(): no ident in response')
      return null
    }

    return parsed.ident
  } catch (e) {
    console.warn('getBasketIdent(): couldn\'t parse ident response:', e)
    return null
  }
}

/**
 * Open checkout
 */
async function openCheckout() {
  const ready = await waitForTebex()

  if (!ready) {
    newToast('Checkout is still loading. Please try again.', 'error')
    return
  }

  if (!basketIdentPromise) {
    basketIdentPromise = getBasketIdent()
  }

  const basketIdent = await basketIdentPromise

  if (!basketIdent) {
    newToast('Your basket could not be verified. Refresh the page and try again.', 'error')
    return
  }

  const
    bodyStyles = window.getComputedStyle(document.body),
    primaryColor = (bodyStyles.getPropertyValue('--color-primary') || '#b42318').trim(),
    secondaryColor = (bodyStyles.getPropertyValue('--color-secondary') || '#ccc').trim()

  const config = {
    ident: basketIdent,
    theme: kPresetConstants.checkoutTheme || 'dark',
    locale: kPresetConstants.locale || 'en',
    colors: [
      {
        name: 'primary',
        color: primaryColor
      },
      {
        name: 'secondary',
        color: secondaryColor
      }
    ]
  }

  try {
    Tebex.checkout.init(config)
    Tebex.checkout.launch()
    Tebex.checkout.on(Tebex.events.PAYMENT_COMPLETE, event => {
      console.log('Payment completed!', event)
      basketIdentPromise = null
    })
  } catch (error) {
    console.warn('openCheckout(): failed to launch Tebex checkout', error)
    newToast('We could not start checkout. Refresh the page and try again.', 'error')
  }
}

function couponToastType(message) {
  if (/invalid|expired|not found|cannot|unable|does not|doesn't|failed|error|minimum|already/i.test(message)) {
    return 'error'
  }

  return 'success'
}

function toastFromHtml(html) {
  const template = document.createElement('template')
  template.innerHTML = html

  const fromSite = template.content.querySelector('.site')?.dataset?.toast

  if (fromSite) {
    return fromSite
  }

  const constantsMatch = html.match(/toast:\s*"((?:\\.|[^"\\])*)"/)

  return constantsMatch ? constantsMatch[1].replace(/\\"/g, '"') : ''
}

async function postCoupon(code) {
  const endpoints = ['/checkout/coupons/add', '/checkout/coupon']
  const params = new URLSearchParams()
  params.append('coupon', code)

  for (const url of endpoints) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: params,
      credentials: 'same-origin',
      redirect: 'follow'
    })

    if (response.status === 404) {
      continue
    }

    return response
  }

  return null
}

function initCheckoutCoupon() {
  const form = document.querySelector('#checkout-coupon-form')

  if (!form || form.dataset.submitSet) {
    return
  }

  form.dataset.submitSet = true

  form.addEventListener('submit', async e => {
    e.preventDefault()

    const input = document.querySelector('.checkout-coupon input[name="coupon"]')
    const submitButton = document.querySelector('.checkout-coupon-apply')
    const code = (input?.value || '').replace(/^\s+|\s+$/g, '')

    if (!code) {
      newToast('Enter a coupon code.', 'warning')
      return
    }

    if (submitButton) {
      submitButton.disabled = true
    }

    try {
      const response = await postCoupon(code)

      if (!response) {
        newToast('That coupon could not be applied.', 'error')
        return
      }

      const html = await response.text()
      const message = toastFromHtml(html)
      const template = document.createElement('template')
      template.innerHTML = html
      const applied = [...template.content.querySelectorAll('.checkout-coupons-applied li span')]
        .some(el => (el.textContent || '').replace(/^\s+|\s+$/g, '').toLowerCase() === code.toLowerCase())
      const type = message
        ? couponToastType(message)
        : (applied ? 'success' : 'error')

      newToast(
        message || (type === 'success' ? 'Coupon applied.' : 'That coupon is invalid.'),
        type
      )

      if (type === 'success') {
        location.reload()
      }
    } catch (error) {
      console.warn('initCheckoutCoupon(): coupon request failed', error)
      newToast('That coupon could not be applied.', 'error')
    } finally {
      if (submitButton) {
        submitButton.disabled = false
      }
    }
  })
}

function padNumber(n) {
  return n.toString().padStart(2, '0')
}

/**
 * Debounces a function
 * @param {Function} func
 * @param {number} timeout
 */
function debounce(func, timeout) {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      func(...args)
    }, timeout)
  }
}

/**
 * Create new toast
 * @param {string} content - Toast content
 * @param {'info'|'success'|'warning'|'error'} type
 */
function newToast(content, type = 'info') {
  const toast = document.createElement('div')
  toast.classList.value = `toast toast-${type}`
  toast.role = 'alert'

  let closeTimeout = setTimeout(() => closeToast(toast), kToastTimeout)

  toast.addEventListener('mouseenter', () => {
    clearTimeout(closeTimeout)
  })

  toast.addEventListener('mouseleave', () => {
    clearTimeout(closeTimeout)
    closeTimeout = setTimeout(() => closeToast(toast), kToastTimeout)
  })

  const toastContent = document.createElement('p')
  toastContent.textContent = content
  toast.appendChild(toastContent)

  const closeButton = document.createElement('button')
  closeButton.classList.value = 'toast-close'
  closeButton.textContent = __('Close')
  closeButton.addEventListener('click', () => {
    clearTimeout(closeTimeout)
    closeToast(toast)
  })
  toast.appendChild(closeButton)

  let toaster = document.querySelector('.toaster')

  if (!toaster) {
    toaster = document.createElement('div')
    toaster.classList.value = 'toaster'
    document.body.appendChild(toaster)
  }

  toaster.appendChild(toast)

  return toast
}

/**
 * Close toast
 * @param {HTMLElement} toast
 */
function closeToast(toast) {
  toast.addEventListener('transitionend', e => {
    if (toast.hidden && e.propertyName === 'opacity') {
      toast.remove()
    }
  })

  toast.hidden = true
}

function initPresetToast() {
  const fromDom = document.querySelector('.site')?.dataset?.toast
  const message = kPresetConstants.toast || fromDom

  if (message) {
    newToast(message)
  }
}

/**
 * Sanitizes the purchase type to ensure consistency.
 *
 * @param {string} type - The type of purchase to sanitize.
 * @returns {'subscribe' | 'single'} - The sanitized purchase type.
 */
function sanitizePurchaseType(type) {
  if (type === 'subscribe' || type === 'subscription') {
    return 'subscribe'
  }

  return 'single'
}

/**
 * Returns a promise that resolves after a specified delay.
 * @param {number} t - The delay in milliseconds.
 * @returns {Promise<void>} A promise that resolves after the specified delay.
 */

function delay(t) {
  return new Promise(resolve => setTimeout(resolve, t))
}

class Drawer {
  #el
  #transformEl

  /** @type {Point | null} */
  #startPoint

  #mayClose = false
  #pulling = false

  #threshold
  #distance
  #direction
  #onClose

  #onTouchStartBound = this.#onTouchStart.bind(this)
  #onTouchMoveBound = this.#onTouchMove.bind(this)
  #onTouchEndBound = this.#onTouchEnd.bind(this)

  /**
   * @param {HTMLElement} el - Container element
   * @param {HTMLElement} transformEl - Element to transform/animate
   * @param {DrawerOptions} options
   */
  constructor(el, transformEl, options) {
    if (!Drawer.#isTouchDevice() || el.hidden) return

    this.#el = el
    this.#transformEl = transformEl

    this.#threshold = options.threshold ?? 5
    this.#distance = options.distance ?? 80
    this.#direction = options.direction ?? 'down'
    this.#onClose = options.onClose

    this.#el.addEventListener('touchstart', this.#onTouchStartBound, { passive: true })
    this.#el.addEventListener('touchmove', this.#onTouchMoveBound, { passive: true })
    this.#el.addEventListener('touchend', this.#onTouchEndBound, { passive: true })

    this.#el.classList.add('drawer', `drawer-${this.#direction}`)
  }

  get #closing() {
    return this.#el.hidden
  }

  #onTouchStart() {
    if (!this.#closing) {
      this.#el.classList.add('touching')
    }
  }

  /** @param {TouchEvent} e */
  #onTouchMove(e) {
    if (
      this.#closing ||
      !e?.touches ||
      e.touches.length === 0 ||
      !Drawer.#isAtScrollEnd(this.#el, this.#direction)
    ) {
      this.#resetPulling()
      return
    }

    if (!this.#startPoint) {
      this.#startPoint = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      }
      return
    }

    var
      x = -(this.#startPoint.x - e.touches[0].clientX),
      y = -(this.#startPoint.y - e.touches[0].clientY)

    var
      xAbs = Math.abs(x),
      yAbs = Math.abs(y)

    var
      isThresholdExceeded = Math.max(xAbs, yAbs) >= this.#threshold,
      direction = Drawer.#getDirection(x, y)

    var
      isHorizontal = direction === 'left' || direction === 'right',
      isVertical = direction === 'up' || direction === 'down'

    this.#pulling = direction === this.#direction && isThresholdExceeded

    this.#mayClose = this.#pulling && (
      (isHorizontal && xAbs > this.#distance) ||
      (isVertical && yAbs > this.#distance)
    )

    this.#el.classList.toggle('may-close', this.#mayClose)

    if (this.#pulling) {
      if (isHorizontal) {
        this.#transformEl.style.translate = `${x}px 0`
      } else if (isVertical) {
        this.#transformEl.style.translate = `0 ${y}px`
      }
    } else {
      this.#transformEl.style.translate = ''
    }
  }

  async #onTouchEnd() {
    if (this.#closing) return

    this.#startPoint = null

    this.#el.classList.remove('touching')
    this.#el.classList.remove('may-close')

    if (!this.#mayClose || !this.#pulling) {
      this.#transformEl.style.translate = ''
      return
    }

    const
      bodyStyles = window.getComputedStyle(this.#el),
      fadeDurationCSS = bodyStyles.getPropertyValue('--fade-duration') ?? '300ms', // in ms, string
      fadeDuration = parseFloat(fadeDurationCSS)

    this.#onClose.apply()

    this.#resetPulling()

    await delay(fadeDuration)

    this.destroy()
  }

  #resetPulling() {
    this.#startPoint = null
    this.#pulling = false
    this.#mayClose = false
    this.#transformEl.style.translate = ''
    this.#el.classList.remove('touching')
    this.#el.classList.remove('may-close')
  }

  destroy() {
    if (!this.#el) return

    this.#startPoint = null

    this.#el.classList.remove('drawer', `drawer-${this.#direction}`)
    this.#transformEl.style.translate = ''

    this.#el.removeEventListener('touchstart', this.#onTouchStartBound)
    this.#el.removeEventListener('touchmove', this.#onTouchMoveBound)
    this.#el.removeEventListener('touchend', this.#onTouchEndBound)
  }

  /**
   * @param {HTMLElement} el
   * @param {SwipeDirection} direction
   * @returns {boolean}
   */
  static #isAtScrollEnd(el, direction) {
    switch (direction) {
      case 'left':
        return el.scrollLeft >= el.scrollWidth - el.offsetWidth
      case 'right':
        return el.scrollLeft === 0
      case 'up':
        return el.scrollTop >= el.scrollHeight - el.offsetHeight
      case 'down':
      default:
        return el.scrollTop === 0
    }
  }

  static #isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {SwipeDirection}
   */
  static #getDirection(x, y) {
    if (Math.abs(x) > Math.abs(y)) {
      return x > 0 ? 'right' : 'left'
    } else {
      return y > 0 ? 'down' : 'up'
    }
  }
}

function parseCardPrice(card) {
  if (card.dataset.price) {
    const fromData = parseFloat(card.dataset.price)
    if (!Number.isNaN(fromData)) return fromData
  }

  const priceEl = card.querySelector('.media .price, .price')
  if (!priceEl) return 0

  const text = priceEl.textContent.trim()
  if (/free/i.test(text)) return 0

  return parseFloat(text.replace(/[^0-9.]/g, '')) || 0
}

function parseCardAge(card) {
  return Number(card.dataset.packageId) || 0
}

function sortProductGrid(grid, mode) {
  const sortMode = mode || grid.dataset.sort || 'recent'
  grid.dataset.sort = sortMode

  const cards = [...grid.querySelectorAll('.product-card')]
  cards
    .sort((a, b) => {
      const aFree = parseCardPrice(a) <= 0
      const bFree = parseCardPrice(b) <= 0
      if (aFree !== bFree) return aFree ? 1 : -1

      if (sortMode === 'price') {
        return parseCardPrice(a) - parseCardPrice(b)
      }

      return parseCardAge(b) - parseCardAge(a)
    })
    .forEach((card) => grid.appendChild(card))
}

function initBuyPanelSummary() {
  const copy = document.querySelector('.product-buy-panel .product-masthead-copy')
  const body = document.querySelector('.product-description-body')
  if (!copy || !body) return

  const summary = document.createElement('div')
  summary.className = 'product-buy-summary'

  const heading = [...body.querySelectorAll('h2, h3, h4')].find((h) => /^details$/i.test(h.textContent.trim()))
  const list = heading?.nextElementSibling?.matches('ul') ? heading.nextElementSibling : null

  if (list) {
    const facts = document.createElement('ul')
    facts.className = 'product-buy-facts'

    list.querySelectorAll(':scope > li').forEach((li) => {
      if (/documentation/i.test(li.textContent)) return

      const fact = li.cloneNode(true)
      const first = fact.firstChild
      const match = first?.nodeType === Node.TEXT_NODE && first.textContent.match(/^\s*([^:]{2,24}):\s*/)
      if (match) {
        first.textContent = first.textContent.slice(match[0].length)
        const value = document.createElement('span')
        value.className = 'product-buy-fact-value'
        value.append(...fact.childNodes)
        const label = document.createElement('span')
        label.className = 'product-buy-fact-label'
        label.textContent = match[1]
        fact.dataset.label = match[1].trim().toLowerCase()
        fact.append(label, value)
      }
      facts.appendChild(fact)
    })

    if (facts.children.length) summary.appendChild(facts)
  }

  if (summary.children.length) copy.after(summary)
}

const kEmptyCategoriesKey = 'rco-empty-categories'
const categoryCards = new Map()

// Product cards of a category page, or null when the page could not be loaded
function loadCategoryCards(url) {
  if (!categoryCards.has(url)) {
    categoryCards.set(url, fetch(url)
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((html) => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.product-card')])
      .catch(() => null))
  }
  return categoryCards.get(url)
}

// Hides category tabs with no packages and caches the result for the inline script in nav-categories.twig
async function initCategoryNav() {
  const links = [...document.querySelectorAll('.category-nav [data-category-nav]')]
  if (!links.length) return

  let cache = null
  try {
    cache = JSON.parse(localStorage.getItem(kEmptyCategoriesKey))
  } catch {}
  // The home slider loads every category page anyway, so the home page always refreshes the cache
  const isHome = !!document.querySelector('[data-home-slider]')
  if (!isHome && cache && Date.now() - cache.at < 10 * 60 * 1000) return

  const empty = []
  await Promise.all(links.map(async (link) => {
    const active = link.classList.contains('active')
    const cards = active ? null : await loadCategoryCards(link.href)
    if (!active && !cards) return

    const hasPackages = active ? !document.querySelector('.no-products-section') : cards.length > 0
    if (!hasPackages) empty.push(link.getAttribute('href'))
    link.classList.toggle('is-empty', !hasPackages && !active)
  }))

  try {
    localStorage.setItem(kEmptyCategoriesKey, JSON.stringify({ at: Date.now(), empty }))
  } catch {}
}

async function initHomeSlider() {
  const slider = document.querySelector('[data-home-slider]')
  const track = slider?.querySelector('[data-slider-track]')
  if (!track) return

  const pages = [await window.rcoHeadlessCards()]
  const seen = new Set()
  const slides = pages
    .flatMap((cards) => cards || [])
    .filter((card) => !seen.has(card.dataset.packageId) && seen.add(card.dataset.packageId))
    .sort((a, b) => Number(b.dataset.packageId) - Number(a.dataset.packageId))
    .map((card) => document.importNode(card, true))

  if (!slides.length) {
    slider.hidden = true
    return
  }

  track.replaceChildren(...slides)
  setCountdowns()

  const count = slider.querySelector('[data-slider-count]')
  let index = 0

  const show = (next) => {
    index = (next + slides.length) % slides.length
    slides.forEach((slide, i) => { slide.hidden = i !== index })
    if (count) count.textContent = `${index + 1} / ${slides.length}`
  }

  let timer = null
  const autoplay = () => {
    clearInterval(timer)
    timer = setInterval(() => show(index + 1), 6000)
  }
  const go = (next) => {
    show(next)
    autoplay()
  }

  slider.querySelector('[data-slider-prev]')?.addEventListener('click', () => go(index - 1))
  slider.querySelector('[data-slider-next]')?.addEventListener('click', () => go(index + 1))
  slider.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') go(index - 1)
    if (event.key === 'ArrowRight') go(index + 1)
  })
  slider.addEventListener('mouseenter', () => clearInterval(timer))
  slider.addEventListener('mouseleave', autoplay)

  show(0)
  autoplay()
  slider.classList.add('is-ready')
}

function initRecentMarquee() {
  const live = document.querySelector('.home-hero-live')
  const list = live?.querySelector('.purchases')
  if (!list || list.children.length < 2) return

  Array.from(list.children).forEach((item) => {
    const copy = item.cloneNode(true)
    copy.setAttribute('aria-hidden', 'true')
    list.appendChild(copy)
  })

  live.classList.add('is-marquee')
  const setWidth = list.scrollWidth / 2
  const speed = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 25 : 40
  list.style.setProperty('--marquee-duration', `${Math.max(20, Math.round(setWidth / speed))}s`)
}

function initHomeStats() {
  const stats = document.querySelectorAll('.home-stat-value[data-count]')

  if (!stats.length) {
    return
  }

  const formatValue = (el, value) => {
    return value.toLocaleString('en-US') + (el.dataset.suffix || '')
  }

  const animate = (el) => {
    const target = parseInt(el.dataset.count, 10) || 0

    const duration = 1400
    const start = performance.now()

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      el.textContent = formatValue(el, Math.round(target * eased))

      if (progress < 1) {
        requestAnimationFrame(tick)
      }
    }

    requestAnimationFrame(tick)
  }

  if (!('IntersectionObserver' in window)) {
    stats.forEach(animate)
    return
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return
      }

      animate(entry.target)
      observer.unobserve(entry.target)
    })
  }, { threshold: 0.4 })

  stats.forEach((stat) => observer.observe(stat))
}

function initScrollProgress() {
  const root = document.querySelector('.scroll-progress')

  if (!root) {
    return
  }

  const sections = [...document.querySelectorAll('.home-page > section')]

  if (sections.length < 2) {
    root.hidden = true
    return
  }

  root.replaceChildren()

  sections.forEach((section, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'scroll-progress-dot'
    button.setAttribute('aria-label', `Go to section ${index + 1}`)
    button.addEventListener('click', () => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    root.appendChild(button)
  })

  root.classList.add('is-ready')

  const dots = [...root.querySelectorAll('.scroll-progress-dot')]

  const update = () => {
    const marker = window.innerHeight * 0.38
    let active = 0

    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= marker) {
        active = index
      }
    })

    dots.forEach((dot, index) => {
      dot.classList.toggle('is-active', index === active)
    })
  }

  update()
  window.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)
}

function initHomeScrollCue() {
  const cue = document.querySelector('[data-home-scroll-cue]')
  const hero = document.querySelector('.home-hero')
  const target = document.querySelector('.home-featured')

  if (!cue || !hero || !target) {
    return
  }

  let dismissed = false

  const dismiss = () => {
    if (dismissed) return
    dismissed = true
    cue.classList.add('is-dismissed')
  }

  cue.addEventListener('click', () => {
    dismiss()
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  const onScroll = () => {
    if (window.scrollY > Math.min(72, Math.max(26, hero.offsetHeight * 0.045))) {
      dismiss()
      window.removeEventListener('scroll', onScroll)
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true })
}

function initProductSearch() {
  const searchInput = document.getElementById('product-search')
  const grid = document.getElementById('product-grid') || document.querySelector('.product-grid')
  const emptyState = document.getElementById('catalog-empty')
  const resultCount = document.getElementById('catalog-result-count')

  if (!grid) return

  sortProductGrid(grid, 'recent')

  const cards = [...grid.querySelectorAll('.product-card')]

  // Type tabs (category.html): the active one lives in the URL hash, e.g. /category/vehicles#car
  const filterLinks = [...document.querySelectorAll('[data-catalog-filter]')]
  const currentFilter = () => {
    const hash = decodeURIComponent(location.hash.slice(1))
    return filterLinks.some((link) => !link.hidden && link.dataset.catalogFilter === hash) ? hash : 'all'
  }

  const updateResultCount = (count) => {
    if (!resultCount) return
    resultCount.textContent = `${count} ${count === 1 ? 'resource' : 'resources'}`
  }

  const applyCatalog = () => {
    const term = (searchInput?.value || '').toLowerCase().trim()
    const filter = currentFilter()
    filterLinks.forEach((link) => link.classList.toggle('is-active', link.dataset.catalogFilter === filter))
    let visibleCount = 0

    cards.forEach((card) => {
      const haystack = [
        card.querySelector('.package-name')?.textContent,
        card.querySelector('.package-card-eyebrow')?.textContent,
        card.querySelector('.package-description')?.textContent,
        card.querySelector('.package-tags')?.textContent,
        card.dataset.resourceType
      ].join(' ').toLowerCase()

      const inFilter = filter === 'all'
        || (filter === 'free' ? card.classList.contains('is-free') : card.dataset.vehicleType === filter)
      const visible = inFilter && (!term || haystack.includes(term))
      card.hidden = !visible
      if (visible) visibleCount += 1
    })

    updateResultCount(visibleCount)

    if (emptyState) {
      emptyState.hidden = visibleCount !== 0
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyCatalog)
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = ''
        applyCatalog()
        searchInput.blur()
      }
    })
  }

  window.addEventListener('hashchange', applyCatalog)
  applyCatalog()
}

function youtubeIdFromUrl(url) {
  if (!url) return null
  const value = String(url).trim()
  if (/^[\w-]{11}$/.test(value)) return value

  try {
    const parsed = new URL(value, location.origin)
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.replace(/^\//, '').split('/')[0] || null
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.searchParams.get('v')) return parsed.searchParams.get('v')
      const parts = parsed.pathname.split('/').filter(Boolean)
      const embed = parts.indexOf('embed')
      if (embed !== -1) return parts[embed + 1] || null
      const shorts = parts.indexOf('shorts')
      if (shorts !== -1) return parts[shorts + 1] || null
    }
  } catch (e) {}
  return null
}

function vimeoIdFromUrl(url) {
  try {
    const parsed = new URL(url, location.origin)
    if (!parsed.hostname.includes('vimeo.com')) return null
    const id = parsed.pathname.split('/').filter(Boolean).pop()
    return /^\d+$/.test(id) ? id : null
  } catch (e) {}
  return null
}

function videoEmbedFromUrl(url) {
  const youtubeId = youtubeIdFromUrl(url)
  if (youtubeId) {
    return {
      type: 'youtube',
      id: youtubeId,
      thumb: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      embed: `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`
    }
  }

  const vimeoId = vimeoIdFromUrl(url)
  if (vimeoId) {
    return {
      type: 'vimeo',
      id: vimeoId,
      thumb: '',
      embed: `https://player.vimeo.com/video/${vimeoId}?autoplay=1`
    }
  }

  return null
}

function isDecorativeImage(img) {
  const src = img.currentSrc || img.src || ''
  if (!src) return true

  if (/cdn\.discordapp\.com\/emojis|media\.discordapp\.net\/emojis|\/emojis\/\d+|twemoji|emoji\.gg|openmoji|joypixels|jsdelivr\.net\/gh\/twitter\/twemoji|shields\.io|badge/i.test(src)) {
    return true
  }

  const attrW = Number(img.getAttribute('width')) || 0
  const attrH = Number(img.getAttribute('height')) || 0
  const w = img.naturalWidth || attrW
  const h = img.naturalHeight || attrH

  if (w && h && w <= 160 && h <= 160) return true
  return false
}

function initProductGallery() {
  const page = document.querySelector('.product-page')
  if (!page) return

  const stage = page.querySelector('[data-gallery-stage]')
  const thumbsWrap = page.querySelector('[data-gallery-thumbs]')
  const tabsWrap = page.querySelector('[data-gallery-tabs]')
  const playButton = page.querySelector('[data-gallery-play]')
  const backButton = page.querySelector('[data-gallery-back]')
  const descr = page.querySelector('.product-description-body')
  const hero = stage?.querySelector('.gallery-hero')
  if (!stage) return

  const images = []
  const seen = new Set()

  const addImage = (src, alt) => {
    if (!src) return
    const clean = String(src).trim()
    const key = clean.replace(/^https?:/, '').split('?')[0]
    const fileKey = key.split('/').pop()
    if (!key || seen.has(key) || (fileKey && seen.has(fileKey))) return
    seen.add(key)
    if (fileKey) seen.add(fileKey)
    images.push({ src: clean, alt: (alt || page.dataset.name || '').trim() })
  }

  addImage(page.dataset.cover || hero?.src, hero?.alt)

  const videos = []
  const videoSeen = new Set()

  const addVideo = (url, node) => {
    const video = videoEmbedFromUrl(url)
    if (!video) return

    const existing = videos.find((item) => item.embed === video.embed)
    const label = node?.textContent?.trim()
    if (existing) {
      if (label && !existing.label) existing.label = label
      if (node && !existing.node) existing.node = node
      return
    }

    videoSeen.add(video.embed)
    video.node = node
    if (label) video.label = label
    videos.push(video)
  }

  page.querySelectorAll('[data-media-item]').forEach((item) => {
    const type = item.dataset.type
    const url = item.dataset.url
    if (type === 'video') addVideo(url, item)
    else addImage(url, page.dataset.name)
  })

  if (descr) {
    descr.querySelectorAll('iframe').forEach((frame) => {
      addVideo(frame.src, frame)
    })

    descr.querySelectorAll('a[href]').forEach((link) => {
      addVideo(link.href, link)
    })
  }

  let mode = 'images'
  let activeImage = 0
  let activeVideo = 0
  let iframeEl = null

  const showImage = (index) => {
    activeImage = index
    const item = images[index]
    if (!item) return

    page.classList.remove('is-playing')
    if (backButton) backButton.hidden = true
    if (playButton) playButton.hidden = videos.length === 0

    if (iframeEl) {
      iframeEl.remove()
      iframeEl = null
    }

    let img = stage.querySelector('.gallery-hero')
    if (!img) {
      img = document.createElement('img')
      img.className = 'gallery-hero'
      stage.prepend(img)
    }
    img.hidden = false
    img.src = item.src
    img.alt = item.alt

    mode = 'images'
    syncThumbs()
  }

  const showVideo = (index = 0) => {
    const video = videos[index]
    if (!video) return

    activeVideo = index
    mode = 'video'
    page.classList.add('is-playing')
    const img = stage.querySelector('.gallery-hero')
    if (img) img.hidden = true
    if (playButton) playButton.hidden = true
    if (backButton) backButton.hidden = false

    if (!iframeEl) {
      iframeEl = document.createElement('iframe')
      iframeEl.className = 'gallery-frame'
      iframeEl.setAttribute('allowfullscreen', '')
      iframeEl.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture')
      iframeEl.title = video.label || page.dataset.name || 'Product video'
      stage.appendChild(iframeEl)
    }

    iframeEl.title = video.label || page.dataset.name || 'Product video'
    iframeEl.src = video.embed
    syncThumbs()
  }

  const setMode = (next, videoIndex) => {
    mode = next
    tabsWrap?.querySelectorAll('[data-gallery-tab]').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.galleryTab === next)
    })

    if (next === 'video') {
      showVideo(typeof videoIndex === 'number' ? videoIndex : activeVideo)
    } else {
      if (playButton) playButton.hidden = videos.length === 0
      showImage(activeImage)
    }
  }

  const syncThumbs = () => {
    thumbsWrap?.querySelectorAll('.gallery-thumb').forEach((thumb) => {
      const isVideo = thumb.classList.contains('is-video')
      const index = Number(thumb.dataset.index)
      const active = mode === 'video'
        ? isVideo && index === activeVideo
        : !isVideo && index === activeImage
      thumb.classList.toggle('is-active', active)
    })
  }

  const renderThumbs = () => {
    if (!thumbsWrap) return
    thumbsWrap.replaceChildren()

    if (images.length + videos.length <= 1) {
      thumbsWrap.hidden = true
      return
    }

    thumbsWrap.hidden = false

    images.forEach((item, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'gallery-thumb'
      button.dataset.index = String(index)
      button.setAttribute('aria-label', item.alt || 'Show image')
      const img = document.createElement('img')
      img.src = item.src
      img.alt = ''
      button.appendChild(img)
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        setMode('images')
        showImage(index)
      })
      thumbsWrap.appendChild(button)
    })

    videos.forEach((video, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'gallery-thumb is-video'
      button.dataset.index = String(index)
      button.setAttribute('aria-label', video.label || `Play video ${index + 1}`)
      const img = document.createElement('img')
      img.src = video.thumb || images[0]?.src || ''
      img.alt = ''
      button.appendChild(img)
      const badge = document.createElement('span')
      badge.className = 'gallery-thumb-play'
      badge.setAttribute('aria-hidden', 'true')
      button.appendChild(badge)
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        setMode('video', index)
      })
      thumbsWrap.appendChild(button)
    })

    syncThumbs()
  }

  if (descr) {
    descr.querySelectorAll('img').forEach((img) => {
      const classify = () => {
        if (isDecorativeImage(img)) {
          img.classList.add('is-emoji')
          img.classList.remove('is-in-gallery')
          return
        }

        addImage(img.currentSrc || img.src, img.alt)
        img.classList.add('is-in-gallery')
        renderThumbs()
      }

      if (img.complete && (img.naturalWidth || img.getAttribute('width'))) {
        classify()
      } else {
        img.addEventListener('load', classify, { once: true })
        img.addEventListener('error', () => img.classList.add('is-emoji'), { once: true })
      }
    })
  }

  renderThumbs()

  if (videos.length) {
    stage.classList.add('has-trailer')

    if (tabsWrap) {
      tabsWrap.hidden = false
      tabsWrap.querySelectorAll('[data-gallery-tab]').forEach((tab) => {
        tab.addEventListener('click', () => setMode(tab.dataset.galleryTab))
      })
    }

    if (playButton) {
      playButton.hidden = false
      playButton.addEventListener('click', (event) => {
        event.stopPropagation()
        setMode('video')
      })
    }

    if (backButton) {
      backButton.addEventListener('click', (event) => {
        event.stopPropagation()
        setMode('images')
      })
    }

    videos.forEach((video) => {
      if (video.node?.tagName === 'A') {
        video.node.classList.add('is-gallery-video-link')
        const block = video.node.closest('p, li')
        if (block && descr?.contains(block)) {
          const rest = block.cloneNode(true)
          rest.querySelectorAll('a').forEach((link) => {
            if (videoEmbedFromUrl(link.href)) link.remove()
          })
          if (/^(youtube|video|trailer)?\s*:?$/i.test(rest.textContent.replace(/\u00a0/g, ' ').trim())) {
            block.classList.add('is-gallery-video-link')
          }
        }
      }
    })
  }

  if (images[0] && hero && hero.src !== images[0].src) {
    showImage(0)
  }
}

function syncProductPurchaseDock(packageId, count) {
  const dock = document.querySelector('[data-purchase-dock]')
  const action = dock?.querySelector('[data-purchase-dock-action]')
  const pageActions = document.querySelector(`.product-panel-actions .product-actions[data-package="${packageId}"]`)

  if (!dock || !action || !pageActions) return

  if (!action.dataset.defaultLabel) {
    action.dataset.defaultLabel = action.textContent.trim()
  }

  const inBasket = count > 0
  action.dataset.inBasket = inBasket ? 'true' : 'false'
  action.textContent = inBasket ? 'View Basket' : action.dataset.defaultLabel
}

function initProductPurchaseDock() {
  const dock = document.querySelector('[data-purchase-dock]')
  const masthead = document.querySelector('.product-commerce-hero')
  const action = dock?.querySelector('[data-purchase-dock-action]')

  if (!dock || !masthead) return

  const footer = document.querySelector('.site-footer')

  const updateVisibility = () => {
    const rect = masthead.getBoundingClientRect()
    const footerNear = footer && footer.getBoundingClientRect().top < window.innerHeight + 18
    dock.classList.toggle('is-visible', rect.bottom < 76 && !footerNear)
  }

  updateVisibility()
  window.addEventListener('scroll', updateVisibility, { passive: true })
  window.addEventListener('resize', updateVisibility)

  if (!action) return

  action.dataset.defaultLabel = action.textContent.trim()

  action.addEventListener('click', () => {
    if (action.dataset.inBasket === 'true') {
      location.href = '/checkout/basket'
      return
    }

    const productActions = document.querySelector('.product-panel-actions .product-actions')
    const target = productActions?.querySelector(
      '.add:not([hidden]), .subscribe:not([hidden]), .open-basket-cta:not([hidden])'
    )

    if (target) {
      target.click()
      return
    }

    const openBasketLink = productActions?.querySelector('.quantity-field:not([hidden]) .open-basket')
    if (openBasketLink) {
      openBasketLink.click()
    }
  })
}

function initProductDescription() {
  const wrap = document.querySelector('[data-product-description]')
  if (!wrap) return

  wrap.classList.remove('is-collapsed', 'is-collapsible', 'is-expanded')
  wrap.querySelector('.product-description-toggle')?.remove()

  const docsLink = [...wrap.querySelectorAll('.product-description-body a[href]')].find((link) => /documentation/i.test(link.textContent))
  const ledgerDocs = document.querySelector('.product-ledger-docs')
  if (docsLink && ledgerDocs) ledgerDocs.href = docsLink.href
}

init()
