// Wrap an async Express handler so a rejected promise (e.g. a failed DB query)
// is forwarded to the error middleware instead of becoming an unhandled
// rejection that crashes the whole process.
export const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
