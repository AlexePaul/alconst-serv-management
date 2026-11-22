// Identitatea vizuală a aplicației: bleumarinul din logo-ul Alconst Serv (definit în main.css).
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'brand',
      neutral: 'slate'
    },
    modal: {
      slots: {
        // Un titlu cu descriere lungă nu se mai suprapune cu primul câmp pe telefon.
        header: 'shrink-0'
      }
    }
  }
})
