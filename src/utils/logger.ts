export function info(...args: any[]) {
  console.log('[INFO]', ...args);
}
export function error(...args: any[]) {
  console.error('[ERROR]', ...args);
}
export function debug(...args: any[]) {
  if (process.env.DEBUG) console.log('[DEBUG]', ...args);
}
