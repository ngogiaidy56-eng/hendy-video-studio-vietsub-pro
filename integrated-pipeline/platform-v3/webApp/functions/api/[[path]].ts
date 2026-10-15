interface ApiWorkerFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  API_WORKER: ApiWorkerFetcher;
}

interface PagesRequestContext {
  request: Request;
  env: Env;
}

export const onRequest = async (context: PagesRequestContext): Promise<Response> => {
  return context.env.API_WORKER.fetch(context.request);
};
