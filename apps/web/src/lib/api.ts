import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

let unauthorizedHandler: (() => void) | undefined;

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

api.interceptors.response.use(
  response => response,
  error => {
    if (axios.isAxiosError(error) && error.response?.status === 401) unauthorizedHandler?.();
    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || error.message || fallback : error instanceof Error ? error.message : fallback;
}

export default api;
