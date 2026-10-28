declare module '#auth-utils' {
  interface User {
    id: number
    email: string
    name: string
    role: 'admin' | 'user'
  }

  interface SecureSessionData {
    sessionVersion: number
  }
}

export {}
