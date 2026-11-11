/**
 * Procesele PM2 ale aplicației pe server: API-ul și worker-ul unui mediu (`stage`, `prod`).
 *
 * Fișierul este folosit doar de `deploy/deploy.sh`, prin `pm2 startOrReload`, care atinge numai
 * procesele definite aici – niciodată pe cele ale altor aplicații de pe aceeași mașină.
 *
 *   ALCONST_ENV        mediul (implicit `stage`)
 *   ALCONST_APP_DIR    clona repository-ului (implicit /srv/alconst/<mediu>)
 *   ALCONST_ENV_FILE   fișierul de mediu (implicit /etc/alconst/<mediu>.env)
 *   APP_VERSION        commit-ul instalat, raportat de /api/ready
 */
const environment = process.env.ALCONST_ENV || 'stage';
const appDir = process.env.ALCONST_APP_DIR || `/srv/alconst/${environment}`;
const envFile = process.env.ALCONST_ENV_FILE || `/etc/alconst/${environment}.env`;

const common = {
  // Variabilele de mediu sunt citite de Node direct din fișier, la fiecare pornire a procesului.
  node_args: `--env-file=${envFile}`,
  // Un singur proces, fără cluster: worker-ul are job-uri programate, iar două instanțe ar rula
  // amândouă la fiecare tick.
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  // Timp pentru închiderea ordonată (cereri în curs, job-uri în lucru).
  kill_timeout: 15000,
  env: {
    NODE_ENV: 'production',
    APP_VERSION: process.env.APP_VERSION || '',
  },
};

module.exports = {
  apps: [
    {
      ...common,
      name: `alconst-${environment}-api`,
      cwd: `${appDir}/apps/api`,
      script: 'dist/main.js',
      // Pe o mașină partajată și fără swap, o scurgere de memorie nu trebuie să ajungă la
      // celelalte aplicații: procesul este repornit înainte.
      max_memory_restart: '512M',
    },
    {
      ...common,
      name: `alconst-${environment}-worker`,
      cwd: `${appDir}/apps/worker`,
      script: 'dist/main.js',
      max_memory_restart: '384M',
    },
  ],
};
