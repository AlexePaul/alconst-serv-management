/**
 * Verifică variabilele de mediu cu aceeași validare pe care o face API-ul la pornire, fără a
 * porni nimic. Folosit la deploy înainte de repornirea procesului: dacă configurarea este
 * greșită, deploy-ul se oprește aici, iar versiunea veche continuă să servească.
 *
 *   node --env-file=/etc/alconst/stage.env dist/cli/check-config.js
 */
import { loadAppConfig } from '../config/app-config.js';

try {
  const config = loadAppConfig();
  console.log(
    `Configurarea API-ului este validă (${config.nodeEnv}, ${config.apiHost}:${config.apiPort}, fișiere: ${config.files.driver}).`,
  );
} catch (error) {
  console.error(`Configurare invalidă: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
