export interface User {
  id: number
  username: string
  email: string
  role: string
}

export interface Product {
  id: number
  product_name: string
  description: string | null
  price: number | string
  quantity: number | string
  created_at: string
}

interface RequestOptions extends RequestInit {
  token?: string
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...init } = options
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })
  let payload: Record<string, unknown>
  try {
    const body: unknown = await response.json()
    payload = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  } catch {
    throw new Error(`The API returned an invalid response (HTTP ${response.status}). Check the LavaLust server configuration.`)
  }
  if (!response.ok) {
    const error = new Error(String(payload.error || payload.message || 'Request failed.')) as Error & {
      status?: number
    }
    error.status = response.status
    throw error
  }
  return payload as T
}

export const api = {
  register: (username: string, email: string, password: string, passwordConfirmation: string) =>
    request<{ message: string; user: User }>('/register', {
      method: 'POST',
      body: JSON.stringify({
        username,
        email,
        password,
        password_confirmation: passwordConfirmation,
      }),
    }),
  login: (username: string, password: string) =>
    request<{ user: User; tokens: { access_token: string; refresh_token: string } }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: (token: string, refreshToken: string) =>
    request<{ message: string }>('/logout', {
      method: 'POST',
      token,
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),
  listProducts: (token: string) => request<{ products: Product[] }>('/list', { token }),
  createProduct: (token: string, product: Omit<Product, 'id' | 'created_at'>) =>
    request<{ product: Product }>('/create', {
      method: 'POST',
      token,
      body: JSON.stringify(product),
    }),
  updateProduct: (token: string, id: number, product: Omit<Product, 'id' | 'created_at'>) =>
    request<{ product: Product }>(`/edit/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(product),
    }),
  deleteProduct: (token: string, id: number) =>
    request<{ deleted_id: number }>(`/delete/${id}`, { method: 'DELETE', token }),
}

export type ApiError = Error & { status?: number }