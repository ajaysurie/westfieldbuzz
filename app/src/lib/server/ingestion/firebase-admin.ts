// The crawler and public API must resolve credentials/database identity exactly
// the same way. Keeping this compatibility module avoids widening crawler imports.
export { getAdminDb as serverFirestore, currentDatabaseName } from "../firebase-admin";
