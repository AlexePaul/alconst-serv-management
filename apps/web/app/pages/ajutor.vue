<script setup lang="ts">
useHead({ title: 'Ajutor' })

/** Pașii de bază, în ordinea în care se folosesc. Fără termeni tehnici. */
const steps = [
  {
    icon: 'i-lucide-building-2',
    title: '1. Adaugă clienții',
    text: 'La „Clienți” apeși „Adaugă client”. Ajung numele și CUI-ul. Tot acolo spui cât de des mergi la el – lunar, la 3 luni – și în ce luni.',
    to: '/clienti?nou=1',
    action: 'Adaugă un client'
  },
  {
    icon: 'i-lucide-list-checks',
    title: '2. Vezi ce ai de făcut',
    text: 'Aplicația pune singură deplasările în lista „De făcut”, când le vine rândul. O deplasare lunară poate fi făcută în orice zi din luna ei; devine restanță doar dacă luna se încheie fără ea.',
    to: '/task-uri',
    action: 'Deschide „De făcut”'
  },
  {
    icon: 'i-lucide-circle-check-big',
    title: '3. Bifează când ai fost',
    text: 'Apeși cerculețul din stânga. Aplicația te întreabă câți angajați are acum clientul și dacă ai completat fișele. Dacă luna trecută a rămas nebifată, o poți bifa odată cu aceasta.'
  },
  {
    icon: 'i-lucide-calendar-days',
    title: '4. Mută ce nu se potrivește',
    text: 'Dacă într-o zi nu poți ajunge, deschizi activitatea și îi schimbi data. Tot acolo o poți da unui coleg, doar pentru acea dată. La „Calendar” vezi toată luna.',
    to: '/calendar',
    action: 'Deschide calendarul'
  },
  {
    icon: 'i-lucide-folder-open',
    title: '5. Păstrează documentele',
    text: 'La „Documente”, fiecare client are locul lui. Faci dosare și încarci fișiere – contracte, poze, PDF-uri. Nimic nu se șterge: ce nu mai trebuie se arhivează.',
    to: '/documente',
    action: 'Deschide documentele'
  }
]

const questions = [
  {
    q: 'Am greșit ceva. Pot strica datele?',
    a: 'Nu. Clienții și documentele nu se șterg, se arhivează și pot fi readuse. Orice modificare poate fi corectată.'
  },
  {
    q: 'Am bifat din greșeală o deplasare.',
    a: 'Apasă din nou pe bifă (o găsești la „De făcut”, cu filtrul „Finalizate”) și redevine de făcut.'
  },
  {
    q: 'Un client nu mai colaborează cu noi.',
    a: 'Deschide clientul, apasă cele trei puncte din dreapta sus și alege „Arhivează clientul”. Deplasările lui nu mai apar în listă.'
  },
  {
    q: 'Mi-am uitat parola.',
    a: 'Pe pagina de autentificare apasă „Ai uitat parola?” și primești un link pe email. Un administrator îți poate da și el o parolă nouă.'
  },
  {
    q: 'Cum pun aplicația pe telefon?',
    a: 'Pe iPhone, deschide adresa în Safari, apasă butonul de partajare și alege „Adaugă pe ecranul principal”. Apare ca o aplicație obișnuită.'
  }
]
</script>

<template>
  <UDashboardPanel id="help">
    <template #header>
      <UDashboardNavbar title="Ajutor">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-8">
        <header>
          <h1 class="text-2xl font-semibold text-highlighted">
            Cum se folosește aplicația
          </h1>
          <p class="mt-1 text-muted">
            Pe scurt: adaugi clienții o singură dată, iar aplicația îți amintește când trebuie să mergi la fiecare.
          </p>
        </header>

        <ol class="space-y-3">
          <li
            v-for="step in steps"
            :key="step.title"
            class="flex gap-4 rounded-lg border border-default bg-default p-4"
          >
            <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon :name="step.icon" class="size-5" />
            </span>
            <div class="min-w-0">
              <h2 class="font-semibold text-highlighted">
                {{ step.title }}
              </h2>
              <p class="mt-1 text-sm text-default">
                {{ step.text }}
              </p>
              <UButton
                v-if="step.to"
                :to="step.to"
                class="mt-2 -ml-2.5"
                variant="ghost"
                size="sm"
                trailing-icon="i-lucide-arrow-right"
                :label="step.action"
              />
            </div>
          </li>
        </ol>

        <section>
          <h2 class="mb-3 text-lg font-semibold text-highlighted">
            Întrebări frecvente
          </h2>
          <dl class="divide-y divide-default rounded-lg border border-default bg-default">
            <div v-for="item in questions" :key="item.q" class="p-4">
              <dt class="font-medium text-highlighted">
                {{ item.q }}
              </dt>
              <dd class="mt-1 text-sm text-default">
                {{ item.a }}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
