// Where the room relay lives: the address of the Firebase Realtime Database (see docs/FIREBASE.md).
//
// This address is not a secret. Every phone that plays in a room talks to it directly, so anyone
// can see it in the browser's network tab anyway. What protects the data is the security rules
// (firebase/database.rules.json): only rooms/<code> can be read or written, with a strict shape,
// and the list of rooms cannot be read at all.
//
// Empty = rooms are not set up yet; the home card explains that, and the rest of the app works.
export const FIREBASE_DB_URL = '';

/** A Realtime Database address: https://<name>.firebaseio.com or https://<name>.<region>.firebasedatabase.app */
export const DB_URL_PATTERN = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebaseio\.com|firebasedatabase\.app)$/;
