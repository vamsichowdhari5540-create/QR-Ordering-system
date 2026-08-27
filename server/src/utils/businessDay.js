// The restaurant's business day is its own local calendar day, but a managed
// Postgres (Supabase) runs in UTC. Left alone, at 1am IST the database's
// CURRENT_DATE still reads "yesterday" — the day book comes up empty while
// the night's orders file themselves under the previous date.
//
// These are written as explicit `AT TIME ZONE` expressions rather than a
// session `SET TIME ZONE`, deliberately: behind a connection pooler, session
// state can be reset or shared between borrowed connections, so a query that
// silently depends on it is a correctness bug waiting to happen. Being
// explicit makes each query correct on its own, whatever connection runs it.
const TIMEZONE = process.env.DB_TIMEZONE?.trim() || 'Asia/Kolkata';

// Interpolated into SQL (a time zone name can't be a bind parameter), so
// constrain it to the IANA name shape first.
if (!/^[A-Za-z][A-Za-z0-9+_-]*(\/[A-Za-z0-9+_-]+)*$/.test(TIMEZONE)) {
  throw new Error(`Invalid DB_TIMEZONE: ${TIMEZONE}`);
}

// Today's date in restaurant-local time.
const TODAY = `((NOW() AT TIME ZONE '${TIMEZONE}')::date)`;

// The local calendar date a TIMESTAMPTZ column falls on.
function localDate(column) {
  return `((${column} AT TIME ZONE '${TIMEZONE}')::date)`;
}

module.exports = { TIMEZONE, TODAY, localDate };
