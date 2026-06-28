const API_BASE = "https://ollama-models-api.devcomfort.workers.dev";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const apiUrl = API_BASE + url.pathname.replace(/^\/api/, "") + url.search;

  const response = await fetch(apiUrl, {
    method: context.request.method,
    headers: context.request.headers,
  });

  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  return newResponse;
}
