/**
 * Verifică variabilele de mediu cu aceeași validare pe care o face worker-ul la pornire, fără a
 * porni nimic. Folosit la deploy înainte de repornirea procesului.
 *
 *   node --env-file=/etc/alconst/stage.env dist/cli/check-config.js
 */
import { loadWorkerConfig } from '../config/worker-config.js';

try {
  const config = loadWorkerConfig();
  console.log(
    `Configurarea worker-ului este validă (${config.nodeEnv}, email: ${config.smtp ? config.smtp.host : 'neconfigurat'}).`,
  );
} catch (error) {
  console.error(`Configurare invalidă: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
