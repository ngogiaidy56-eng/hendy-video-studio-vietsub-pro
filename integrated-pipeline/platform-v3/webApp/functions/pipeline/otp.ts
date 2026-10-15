interface Env { API_WORKER: { fetch(request: Request): Promise<Response> } }
export const onRequest = async (context: { request: Request; env: Env }) => context.env.API_WORKER.fetch(context.request);
