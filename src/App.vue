<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, type ApiError, type Product, type User } from './services/api'

const savedSession = localStorage.getItem('stockroom-session')
let session: { accessToken: string; refreshToken: string; user: User } | null = null
try {
  session = savedSession ? JSON.parse(savedSession) : null
} catch {
  localStorage.removeItem('stockroom-session')
}

const accessToken = ref(session?.accessToken ?? '')
const refreshToken = ref(session?.refreshToken ?? '')
const user = ref<User | null>(session?.user ?? null)
const products = ref<Product[]>([])
const loginIdentifier = ref('')
const loginPassword = ref('')
const loginBusy = ref(false)
const authMode = ref<'login' | 'register'>('login')
const signupUsername = ref('')
const signupEmail = ref('')
const signupPassword = ref('')
const signupPasswordConfirmation = ref('')
const signupBusy = ref(false)
const authNotice = ref('')
const showLoginPassword = ref(false)
const showSignupPassword = ref(false)
const showSignupPasswordConfirmation = ref(false)
const productsBusy = ref(false)
const saving = ref(false)
const query = ref('')
const pageError = ref('')
const formError = ref('')
const modalOpen = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({ product_name: '', description: '', price: '', quantity: '' })

const filteredProducts = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return needle
    ? products.value.filter((product) =>
        `${product.product_name} ${product.description ?? ''}`.toLowerCase().includes(needle),
      )
    : products.value
})
const totalUnits = computed(() => products.value.reduce((sum, item) => sum + Number(item.quantity), 0))
const stockValue = computed(() =>
  products.value.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0),
)
const lowStockCount = computed(() => products.value.filter((item) => Number(item.quantity) <= 5).length)
const canWrite = computed(() => ['admin', 'moderator', 'editor'].includes(user.value?.role ?? ''))
const canDelete = computed(() => user.value?.role === 'admin')

function money(value: number | string) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value))
}

function dateLabel(value: string) {
  const date = new Date((value || '').replace(' ', 'T'))
  return !value || Number.isNaN(date.getTime())
    ? 'Recently added'
    : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function clearSession() {
  accessToken.value = ''
  refreshToken.value = ''
  user.value = null
  products.value = []
  localStorage.removeItem('stockroom-session')
}

function showRequestError(error: unknown) {
  if ((error as ApiError).status === 401) {
    clearSession()
    pageError.value = 'Your session expired. Sign in again to continue.'
  } else {
    pageError.value = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  }
}

async function signIn() {
  if (!loginIdentifier.value.trim() || !loginPassword.value) {
    pageError.value = 'Enter your username or email and password.'
    return
  }
  loginBusy.value = true
  pageError.value = ''
  authNotice.value = ''
  try {
    const result = await api.login(loginIdentifier.value.trim(), loginPassword.value)
    accessToken.value = result.tokens.access_token
    refreshToken.value = result.tokens.refresh_token
    user.value = result.user
    localStorage.setItem('stockroom-session', JSON.stringify({
      accessToken: accessToken.value,
      refreshToken: refreshToken.value,
      user: user.value,
    }))
    loginPassword.value = ''
    await loadProducts()
  } catch (error) {
    showRequestError(error)
  } finally {
    loginBusy.value = false
  }
}

function setAuthMode(mode: 'login' | 'register') {
  authMode.value = mode
  pageError.value = ''
  authNotice.value = ''
}

async function signUp() {
  pageError.value = ''
  authNotice.value = ''
  if (signupPassword.value !== signupPasswordConfirmation.value) {
    pageError.value = 'Passwords do not match.'
    return
  }

  signupBusy.value = true
  try {
    const result = await api.register(
      signupUsername.value.trim(),
      signupEmail.value.trim(),
      signupPassword.value,
      signupPasswordConfirmation.value,
    )
    loginIdentifier.value = result?.user?.email || signupEmail.value.trim()
    loginPassword.value = ''
    signupPassword.value = ''
    signupPasswordConfirmation.value = ''
    setAuthMode('login')
    authNotice.value = 'Account created. Sign in with your new credentials.'
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : 'Unable to create your account.'
  } finally {
    signupBusy.value = false
  }
}

async function loadProducts() {
  if (!accessToken.value) return
  productsBusy.value = true
  pageError.value = ''
  try {
    products.value = (await api.listProducts(accessToken.value)).products ?? []
  } catch (error) {
    showRequestError(error)
  } finally {
    productsBusy.value = false
  }
}

async function signOut() {
  try {
    if (accessToken.value) await api.logout(accessToken.value, refreshToken.value)
  } catch {
    // The local session can still be cleared if the API token has expired.
  }
  clearSession()
  pageError.value = ''
}

function openCreate() {
  editingId.value = null
  Object.assign(form, { product_name: '', description: '', price: '', quantity: '' })
  formError.value = ''
  modalOpen.value = true
}

function openEdit(product: Product) {
  editingId.value = Number(product.id)
  Object.assign(form, {
    product_name: product.product_name,
    description: product.description ?? '',
    price: String(product.price),
    quantity: String(product.quantity),
  })
  formError.value = ''
  modalOpen.value = true
}

async function saveProduct() {
  if (!accessToken.value) return
  saving.value = true
  formError.value = ''
  const product = {
    product_name: form.product_name.trim(),
    description: form.description.trim(),
    price: Number(form.price),
    quantity: Number(form.quantity),
  }
  try {
    if (editingId.value === null) {
      const result = await api.createProduct(accessToken.value, product)
      products.value = [...products.value, result.product].sort((a, b) => Number(a.id) - Number(b.id))
    } else {
      const result = await api.updateProduct(accessToken.value, editingId.value, product)
      products.value = products.value.map((item) =>
        Number(item.id) === editingId.value ? result.product : item,
      )
    }
    modalOpen.value = false
  } catch (error) {
    if ((error as ApiError).status === 401) {
      showRequestError(error)
      modalOpen.value = false
    } else {
      formError.value = error instanceof Error ? error.message : 'Unable to save product.'
    }
  } finally {
    saving.value = false
  }
}

async function removeProduct(product: Product) {
  if (!accessToken.value || !window.confirm(`Delete "${product.product_name}"? This cannot be undone.`)) return
  pageError.value = ''
  try {
    await api.deleteProduct(accessToken.value, Number(product.id))
    products.value = products.value.filter((item) => Number(item.id) !== Number(product.id))
  } catch (error) {
    showRequestError(error)
  }
}

onMounted(() => {
  if (accessToken.value) void loadProducts()
})
</script>

<template>
  <main v-if="!user" class="login-page">
    <section class="login-story">
      <div class="story-brand"><span class="brand-mark">S</span><span>STOCKER</span></div>
      <div class="story-copy">
        <p class="eyebrow">A CLEARER VIEW OF WHAT YOU HAVE</p>
        <h1>Good stock.<br /><em>Good business.</em></h1>
        <p></p>
      </div>
      <div class="story-footer"><span>PRODUCT INVENTORY</span><span>01 / 01</span></div>
      <span class="story-stamp" aria-hidden="true">S</span>
    </section>
    <section class="login-panel">
      <div class="login-form-wrap">
        <div class="mobile-brand"><span class="brand-mark">S</span><span>STOCKER</span></div>
        <template v-if="authMode === 'login'">
          <p class="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your<br />workspace.</h2>
          <p class="form-intro">Use your account credentials to manage your product inventory.</p>
          <p v-if="authNotice" class="auth-notice" role="status">{{ authNotice }}</p>
          <form class="login-form" @submit.prevent="signIn">
            <label for="login-identifier">Username or email</label>
            <input id="login-identifier" v-model="loginIdentifier" autocomplete="username" placeholder="name@company.com" required />
            <label class="password-label" for="login-password">Password</label>
            <div class="password-field">
              <input id="login-password" v-model="loginPassword" :type="showLoginPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="Enter your password" required />
              <button class="password-toggle" type="button" :aria-label="showLoginPassword ? 'Hide password' : 'Show password'" :aria-pressed="showLoginPassword" @click="showLoginPassword = !showLoginPassword">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="showLoginPassword" d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle v-if="showLoginPassword" cx="12" cy="12" r="3" /><path v-else d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a14.8 14.8 0 0 1-3.2 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1 0 1.9-.15 2.7-.42" /></svg>
              </button>
            </div>
            <p v-if="pageError" class="inline-error" role="alert">{{ pageError }}</p>
            <button class="button button-primary login-submit" type="submit" :disabled="loginBusy">
              <span>{{ loginBusy ? 'Signing in...' : 'Sign in' }}</span><span aria-hidden="true">-&gt;</span>
            </button>
          </form>
          <p class="login-footnote">New to Stocker? <button class="auth-switch" type="button" @click="setAuthMode('register')">Create an account</button></p>
        </template>
        <template v-else>
          <p class="eyebrow">GET STARTED</p>
          <h2>Create your<br />account.</h2>
          <p class="form-intro">Set up your Stocker login to view the product catalogue.</p>
          <form class="login-form signup-form" @submit.prevent="signUp">
            <label for="signup-username">Username</label>
            <input id="signup-username" v-model="signupUsername" autocomplete="username" minlength="3" maxlength="100" pattern="[A-Za-z0-9._\-]{3,100}" placeholder="Choose a username" required />
            <label for="signup-email">Email address</label>
            <input id="signup-email" v-model="signupEmail" type="email" autocomplete="email" maxlength="255" placeholder="name@company.com" required />
            <label for="signup-password">Password</label>
            <div class="password-field">
              <input id="signup-password" v-model="signupPassword" :type="showSignupPassword ? 'text' : 'password'" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" required />
              <button class="password-toggle" type="button" :aria-label="showSignupPassword ? 'Hide password' : 'Show password'" :aria-pressed="showSignupPassword" @click="showSignupPassword = !showSignupPassword">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="showSignupPassword" d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle v-if="showSignupPassword" cx="12" cy="12" r="3" /><path v-else d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a14.8 14.8 0 0 1-3.2 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1 0 1.9-.15 2.7-.42" /></svg>
              </button>
            </div>
            <label for="signup-password-confirmation">Confirm password</label>
              <div class="password-field">
                <input id="signup-password-confirmation" v-model="signupPasswordConfirmation" :type="showSignupPasswordConfirmation ? 'text' : 'password'" autocomplete="new-password" minlength="8" placeholder="Enter your password again" required />
                <button class="password-toggle" type="button" :aria-label="showSignupPasswordConfirmation ? 'Hide password' : 'Show password'" :aria-pressed="showSignupPasswordConfirmation" @click="showSignupPasswordConfirmation = !showSignupPasswordConfirmation">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="showSignupPasswordConfirmation" d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle v-if="showSignupPasswordConfirmation" cx="12" cy="12" r="3" /><path v-else d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a14.8 14.8 0 0 1-3.2 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1 0 1.9-.15 2.7-.42" /></svg>
                </button>
              </div>
            <p v-if="pageError" class="inline-error" role="alert">{{ pageError }}</p>
            <button class="button button-primary login-submit" type="submit" :disabled="signupBusy">
              <span>{{ signupBusy ? 'Creating account...' : 'Create account' }}</span><span aria-hidden="true">-&gt;</span>
            </button>
          </form>
          <p class="login-footnote">Already have an account? <button class="auth-switch" type="button" @click="setAuthMode('login')">Sign in</button></p>
        </template>
      </div>
      <span class="panel-index">LAVALUST API CONNECTED</span>
    </section>
  </main>

  <main v-else class="workspace">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Stocker home"><span class="brand-mark">S</span><span>Stocker</span></a>
      <div class="topbar-right">
        <span class="workspace-label">INVENTORY / OVERVIEW</span><span class="topbar-divider"></span>
        <div class="user-badge" :title="user.email || user.username">{{ user.username.slice(0, 1).toUpperCase() }}</div>
        <div class="user-info"><strong>{{ user.username }}</strong><span>{{ user.role }}</span></div>
        <button class="text-button signout-button" type="button" @click="signOut">Sign out</button>
      </div>
    </header>
    <section class="content-shell">
      <div class="page-heading">
        <div><p class="eyebrow">YOUR CATALOGUE</p><h1>Products <span class="heading-count">{{ products.length }}</span></h1></div>
        <button v-if="canWrite" class="button button-primary add-button" type="button" @click="openCreate"><span class="plus-sign">+</span> Add product</button>
      </div>
      <div class="summary-grid">
        <article class="summary-item"><span class="summary-label">PRODUCTS LISTED</span><strong>{{ products.length.toString().padStart(2, '0') }}</strong><span class="summary-note">Unique items in catalogue</span></article>
        <article class="summary-item summary-highlight"><span class="summary-label">TOTAL STOCK VALUE</span><strong>{{ money(stockValue) }}</strong><span class="summary-note">Across {{ totalUnits }} units on hand</span></article>
        <article class="summary-item"><span class="summary-label">NEEDS ATTENTION</span><strong>{{ lowStockCount.toString().padStart(2, '0') }}</strong><span class="summary-note">Items with 5 or fewer units</span></article>
      </div>
      <div v-if="pageError" class="notice-error" role="alert"><span>{{ pageError }}</span><button class="text-button" type="button" @click="pageError = ''">Dismiss</button></div>
      <section class="catalogue-section">
        <div class="catalogue-toolbar">
          <div><h2>All products</h2><p>Product details and current availability</p></div>
          <label class="search-field"><span class="search-icon" aria-hidden="true"></span><input v-model="query" type="search" placeholder="Search products" aria-label="Search products" /><kbd>/</kbd></label>
        </div>
        <div class="product-table-wrap">
          <table class="product-table">
            <thead><tr><th>PRODUCT</th><th>PRICE</th><th>QUANTITY</th><th>STATUS</th><th>ADDED</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody v-if="productsBusy"><tr><td colspan="6" class="table-message">Loading your products...</td></tr></tbody>
            <tbody v-else-if="filteredProducts.length">
              <tr v-for="product in filteredProducts" :key="product.id">
                <td class="product-cell"><span class="product-avatar">{{ product.product_name.slice(0, 1).toUpperCase() }}</span><span class="product-details"><strong>{{ product.product_name }}</strong><span>{{ product.description || 'No description' }}</span></span></td>
                <td class="price-cell">{{ money(product.price) }}</td>
                <td>{{ Number(product.quantity).toString().padStart(2, '0') }} <span class="unit-label">units</span></td>
                <td><span class="stock-status" :class="Number(product.quantity) === 0 ? 'status-empty' : Number(product.quantity) <= 5 ? 'status-low' : 'status-good'"><i></i>{{ Number(product.quantity) === 0 ? 'Out of stock' : Number(product.quantity) <= 5 ? 'Low stock' : 'In stock' }}</span></td>
                <td class="date-cell">{{ dateLabel(product.created_at) }}</td>
                <td class="row-actions"><button v-if="canWrite" class="text-button" type="button" :aria-label="`Edit ${product.product_name}`" @click="openEdit(product)">Edit</button><button v-if="canDelete" class="text-button delete-action" type="button" :aria-label="`Delete ${product.product_name}`" @click="removeProduct(product)">Delete</button></td>
              </tr>
            </tbody>
            <tbody v-else><tr><td colspan="6" class="empty-cell"><span class="empty-mark">S</span><strong>{{ query ? 'No matching products' : 'Your catalogue is ready' }}</strong><span>{{ query ? 'Try another search term.' : 'Add your first product to get started.' }}</span><button v-if="!query && canWrite" class="text-button empty-add" type="button" @click="openCreate">Add a product -&gt;</button></td></tr></tbody>
          </table>
        </div>
        <footer class="catalogue-footer"><span>SHOWING {{ filteredProducts.length }} OF {{ products.length }} PRODUCTS</span><button class="text-button refresh-button" type="button" :disabled="productsBusy" @click="loadProducts">Refresh list <span aria-hidden="true">&#8635;</span></button></footer>
      </section>
      <footer class="page-footer"><span>STOCKER INVENTORY</span><span>POWERED BY LAVALUST API</span></footer>
    </section>

    <div v-if="modalOpen" class="modal-backdrop" @click.self="modalOpen = false" @keydown.esc="modalOpen = false">
      <section class="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <div class="modal-heading"><div><p class="eyebrow">{{ editingId === null ? 'NEW CATALOGUE ITEM' : 'UPDATE CATALOGUE ITEM' }}</p><h2 id="product-modal-title">{{ editingId === null ? 'Add a product' : 'Edit product' }}</h2></div><button class="close-button" type="button" aria-label="Close dialog" @click="modalOpen = false">&times;</button></div>
        <form class="product-form" @submit.prevent="saveProduct">
          <label for="product-name">Product name</label><input id="product-name" v-model="form.product_name" maxlength="100" placeholder="e.g. Everyday Tote" required />
          <label for="product-description">Description <span class="optional-label">OPTIONAL</span></label><textarea id="product-description" v-model="form.description" rows="3" placeholder="A short description of this item"></textarea>
          <div class="form-row"><div><label for="product-price">Price <span class="field-suffix">PHP</span></label><input id="product-price" v-model="form.price" type="number" min="0.01" step="0.01" placeholder="0.00" required /></div><div><label for="product-quantity">Quantity</label><input id="product-quantity" v-model="form.quantity" type="number" min="0" step="1" placeholder="0" required /></div></div>
          <p v-if="formError" class="inline-error" role="alert">{{ formError }}</p>
          <div class="modal-actions"><button class="button button-quiet" type="button" @click="modalOpen = false">Cancel</button><button class="button button-primary" type="submit" :disabled="saving"><span>{{ saving ? 'Saving...' : editingId === null ? 'Create product' : 'Save changes' }}</span><span aria-hidden="true">-&gt;</span></button></div>
        </form>
      </section>
    </div>
  </main>
</template>
