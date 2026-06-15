export const ENGINE_CLIENT_ID_STORAGE_KEY = "pixelated_engine_client_id";

export const getEngineClientId = () => {
  let clientId = window.localStorage.getItem(ENGINE_CLIENT_ID_STORAGE_KEY);
  if (clientId) return clientId;

  clientId = crypto.randomUUID();
  window.localStorage.setItem(ENGINE_CLIENT_ID_STORAGE_KEY, clientId);
  return clientId;
};

export const resetEngineClientId = () => {
  window.localStorage.removeItem(ENGINE_CLIENT_ID_STORAGE_KEY);
};
