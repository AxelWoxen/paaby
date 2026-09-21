// server-entry.mjs — hvilken server denne prosessen faktisk starter.
//
// paaby.no (API) og admin.paaby.no (Påby Admin) er to forskjellige Heroku-
// apper, men deployer fra nøyaktig samme monorepo/commit — det finnes ingen
// egen gren eller egen Procfile per app. PAABY_APP-variabelen (satt som
// config var PÅ HVER HEROKU-APP, ikke i koden) avgjør hvilken av de to
// serverne som faktisk starter i den appens web-dyno.
//
// Ingen config var satt → 'api', dagens oppførsel. Dette betyr at
// paaby-api ikke trenger noen endring i det hele tatt for at dette skal
// fungere identisk med før.

const app = process.env.PAABY_APP ?? 'api';

if (app === 'admin') {
  await import('./collector/review/server.js');
} else if (app === 'api') {
  await import('./backend/server.mjs');
} else {
  throw new Error(`Ukjent PAABY_APP: "${app}" (forventet "api" eller "admin")`);
}
