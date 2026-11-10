declare module '#app' {
  interface PageMeta {
    /** Pagina este accesibilă fără autentificare (login, resetare parolă). */
    public?: boolean
    /** Pagina este rezervată administratorilor. */
    adminOnly?: boolean
  }
}

export {}
