const safeString = (value: unknown) => value instanceof Error ? { name: value.name, message: value.message } : value;
export const logger = {
  info(message: string, context: Record<string, unknown> = {}) { console.log(JSON.stringify({ level: "info", time: new Date().toISOString(), message, ...context })); },
  warn(message: string, context: Record<string, unknown> = {}) { console.warn(JSON.stringify({ level: "warn", time: new Date().toISOString(), message, ...context })); },
  error(message: string, error?: unknown, context: Record<string, unknown> = {}) { console.error(JSON.stringify({ level: "error", time: new Date().toISOString(), message, error: safeString(error), ...context })); }
};
