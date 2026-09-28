import { ref } from "vue";
import { defineStore } from "pinia";
import api from "@/lib/api";

export type AuthUser = {
  id: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  isWhitelist: boolean;
  phone: string | null;
  email: string | null;
  hasPassword: boolean;
};

type ApiResponse<T> = { code: number; data: T; message: string };

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const mockGoogleEnabled = ref(false);
  const loaded = ref(false);
  let loading: Promise<void> | undefined;

  async function load() {
    if (loaded.value) return;
    return loading ??= Promise.all([
      api.get<ApiResponse<{ mockGoogleEnabled: boolean }>>("/auth/options"),
      api.get<ApiResponse<{ user: AuthUser; mockGoogleEnabled: boolean }>>("/auth/me").catch(error => {
        if (error?.response?.status === 401) return null;
        throw error;
      }),
    ]).then(([options, current]) => {
      mockGoogleEnabled.value = options.data.data.mockGoogleEnabled;
      user.value = current?.data.data.user ?? null;
      loaded.value = true;
    }).finally(() => { loading = undefined; });
  }

  function clear() {
    user.value = null;
    loaded.value = true;
  }

  async function requestCode(countryCode: string, phone: string, purpose: "login" | "resetPassword") {
    await api.post("/auth/requestCode", { countryCode, phone, purpose });
  }

  async function loginWithCode(countryCode: string, phone: string, code: string) {
    const { data } = await api.post<ApiResponse<AuthUser>>("/auth/phone", { countryCode, phone, code });
    user.value = data.data;
    loaded.value = true;
    return data.data;
  }

  async function loginWithPassword(countryCode: string, phone: string, password: string) {
    const { data } = await api.post<ApiResponse<AuthUser>>("/auth/password", { countryCode, phone, password });
    user.value = data.data;
    loaded.value = true;
    return data.data;
  }

  async function loginWithGoogle(email: string) {
    const { data } = await api.post<ApiResponse<AuthUser>>("/auth/google", { email });
    user.value = data.data;
    loaded.value = true;
    return data.data;
  }

  async function resetPassword(countryCode: string, phone: string, code: string, password: string) {
    await api.put("/auth/passwordReset", { countryCode, phone, code, password });
  }

  async function setPassword(password: string) {
    await api.put("/auth/passwordSet", { password });
    if (user.value) user.value = { ...user.value, hasPassword: true };
  }

  async function logout() {
    await api.post("/auth/logout");
    clear();
  }

  return {
    user,
    mockGoogleEnabled,
    loaded,
    load,
    clear,
    requestCode,
    loginWithCode,
    loginWithPassword,
    loginWithGoogle,
    resetPassword,
    setPassword,
    logout,
  };
});
