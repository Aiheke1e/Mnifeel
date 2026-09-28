<template>
  <main class="loginPage">
    <section class="loginPanel" aria-labelledby="loginTitle">
      <div class="loginContent">
        <div class="mobileBrand">
          <span class="mobileLogo" v-html="logoSvg" />
          <span>Minifeel</span>
        </div>
        <header>
          <p class="eyebrow">AI 短剧创作平台</p>
          <h1 id="loginTitle">{{ mode === "reset" ? "重设密码" : "欢迎回来" }}</h1>
          <p>{{ mode === "reset" ? "验证手机号后设置新密码" : "登录后，从一个想法开始创作" }}</p>
        </header>

        <template v-if="mode !== 'reset'">
          <div class="loginTabs" role="tablist" aria-label="登录方式">
            <button type="button" role="tab" :aria-selected="mode === 'code'" :class="{ active: mode === 'code' }" @click="mode = 'code'">验证码登录</button>
            <button type="button" role="tab" :aria-selected="mode === 'password'" :class="{ active: mode === 'password' }" @click="mode = 'password'">密码登录</button>
          </div>

          <el-form labelPosition="top" @submit.prevent="submitLogin">
            <el-form-item label="手机号">
              <div class="phoneField">
                <el-input v-model="form.countryCode" class="countryCode" aria-label="国家或地区代码" autocomplete="tel-country-code" />
                <el-input v-model="form.phone" aria-label="手机号" autocomplete="tel-national" placeholder="请输入手机号" @keyup.enter="submitLogin" />
              </div>
            </el-form-item>
            <el-form-item v-if="mode === 'code'" label="验证码">
              <div class="codeField">
                <el-input v-model="form.code" aria-label="验证码" autocomplete="one-time-code" placeholder="请输入验证码" @keyup.enter="submitLogin" />
                <el-button :disabled="cooldown > 0 || sending" :loading="sending" @click="sendCode('login')">
                  {{ cooldown > 0 ? `${cooldown} 秒` : "获取验证码" }}
                </el-button>
              </div>
            </el-form-item>
            <el-form-item v-else label="密码">
              <el-input v-model="form.password" type="password" showPassword autocomplete="current-password" placeholder="请输入密码" @keyup.enter="submitLogin" />
            </el-form-item>
            <p v-if="errorMessage" class="formError" role="alert" aria-live="polite">{{ errorMessage }}</p>
            <el-button class="submitButton" type="primary" nativeType="submit" :loading="submitting">登录</el-button>
          </el-form>

          <div class="formLinks">
            <button type="button" @click="openReset">忘记密码</button>
          </div>

          <template v-if="auth.mockGoogleEnabled">
            <div class="divider"><span>或</span></div>
            <el-input v-model="form.email" aria-label="Google 邮箱" autocomplete="email" placeholder="输入邮箱体验 Google 一键登录" @keyup.enter="submitGoogle" />
            <el-button class="googleButton" :icon="IconBrandGoogle" :loading="submitting" @click="submitGoogle">Google 一键登录</el-button>
          </template>
        </template>

        <el-form v-else labelPosition="top" @submit.prevent="submitReset">
          <el-form-item label="手机号">
            <div class="phoneField">
              <el-input v-model="form.countryCode" class="countryCode" aria-label="国家或地区代码" autocomplete="tel-country-code" />
              <el-input v-model="form.phone" aria-label="手机号" autocomplete="tel-national" placeholder="请输入手机号" />
            </div>
          </el-form-item>
          <el-form-item label="验证码">
            <div class="codeField">
              <el-input v-model="form.code" aria-label="验证码" autocomplete="one-time-code" placeholder="请输入验证码" />
              <el-button :disabled="cooldown > 0 || sending" :loading="sending" @click="sendCode('resetPassword')">
                {{ cooldown > 0 ? `${cooldown} 秒` : "获取验证码" }}
              </el-button>
            </div>
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="form.password" type="password" showPassword autocomplete="new-password" placeholder="至少 8 位，包含字母和数字" />
          </el-form-item>
          <p v-if="errorMessage" class="formError" role="alert" aria-live="polite">{{ errorMessage }}</p>
          <el-button class="submitButton" type="primary" nativeType="submit" :loading="submitting">重设密码</el-button>
          <div class="formLinks"><button type="button" @click="mode = 'password'; errorMessage = ''">返回登录</button></div>
        </el-form>
      </div>
      <footer>© {{ new Date().getFullYear() }} Minifeel</footer>
    </section>
    <loginArt class="artPanel" />
  </main>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { IconBrandGoogle } from "@tabler/icons-vue";
import logoSvg from "@minifeel/assets/logo.svg?raw";
import { apiErrorMessage } from "@/lib/api";
import { useAuthStore, type AuthUser } from "@/stores/auth";
import loginArt from "./loginArt.vue";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const mode = ref<"code" | "password" | "reset">("code");
const form = reactive({ countryCode: "+86", phone: "", code: "", password: "", email: "" });
const submitting = ref(false);
const sending = ref(false);
const cooldown = ref(0);
const errorMessage = ref("");
let cooldownTimer: ReturnType<typeof setInterval> | undefined;

function destination(user: AuthUser) {
  const requested = typeof route.query.redirect === "string" && route.query.redirect.startsWith("/") ? route.query.redirect : "";
  if (requested && (user.role === "admin" ? requested.startsWith("/admin") : requested.startsWith("/app"))) return requested;
  return user.role === "admin" ? "/admin/dashboard" : "/app";
}

function startCooldown() {
  cooldown.value = 60;
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    cooldown.value -= 1;
    if (cooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = undefined;
    }
  }, 1000);
}

async function sendCode(purpose: "login" | "resetPassword") {
  if (sending.value || cooldown.value > 0) return;
  errorMessage.value = "";
  sending.value = true;
  try {
    await auth.requestCode(form.countryCode, form.phone, purpose);
    startCooldown();
    ElMessage.success("验证码已生成，请查看服务端日志");
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "获取验证码失败");
  } finally {
    sending.value = false;
  }
}

async function submitLogin() {
  if (submitting.value) return;
  errorMessage.value = "";
  submitting.value = true;
  try {
    const user = mode.value === "code"
      ? await auth.loginWithCode(form.countryCode, form.phone, form.code)
      : await auth.loginWithPassword(form.countryCode, form.phone, form.password);
    await router.replace(destination(user));
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "登录失败");
  } finally {
    submitting.value = false;
  }
}

async function submitGoogle() {
  if (submitting.value) return;
  errorMessage.value = "";
  submitting.value = true;
  try {
    const user = await auth.loginWithGoogle(form.email);
    await router.replace(destination(user));
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "Google 登录失败");
  } finally {
    submitting.value = false;
  }
}

function openReset() {
  mode.value = "reset";
  form.code = "";
  form.password = "";
  errorMessage.value = "";
}

async function submitReset() {
  if (submitting.value) return;
  errorMessage.value = "";
  submitting.value = true;
  try {
    await auth.resetPassword(form.countryCode, form.phone, form.code, form.password);
    ElMessage.success("密码已重设，请使用新密码登录");
    mode.value = "password";
    form.code = "";
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "重设密码失败");
  } finally {
    submitting.value = false;
  }
}

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
});
</script>

<style lang="scss" scoped>
.loginPage {
  display: grid;
  grid-template-columns: minmax(420px, 0.9fr) minmax(520px, 1.1fr);
  min-height: 100svh;
  padding: 12px;
  background: #f5f7f4;
  color: #172522;

  .loginPanel {
    display: grid;
    grid-template-rows: 1fr auto;
    min-width: 0;
    padding: 40px clamp(28px, 6vw, 88px) 24px;

    .loginContent {
      align-self: center;
      width: min(100%, 430px);
      margin: 0 auto;

      .mobileBrand { display: none; }
      header {
        margin-bottom: 30px;
        .eyebrow { margin: 0 0 10px; color: #24816f; font-size: 13px; font-weight: 700; letter-spacing: 1.4px; }
        h1 { margin: 0; font-size: clamp(34px, 4vw, 46px); line-height: 1.18; letter-spacing: -1.5px; }
        > p:last-child { margin: 12px 0 0; color: #677570; line-height: 1.7; }
      }
      .loginTabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        margin-bottom: 24px;
        padding: 4px;
        border-radius: 12px;
        background: #e9eeeb;
        button {
          height: 40px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: #66736f;
          cursor: pointer;
          &.active { background: #fff; color: #183c35; box-shadow: 0 3px 14px rgb(26 72 61 / 9%); font-weight: 650; }
          &:focus-visible { outline: 3px solid rgb(36 129 111 / 28%); outline-offset: 2px; }
        }
      }
      .phoneField, .codeField { display: flex; width: 100%; gap: 10px; }
      .countryCode { width: 84px; flex: 0 0 84px; }
      .codeField .el-button { height: 40px; min-width: 112px; margin: 0; }
      .formError { margin: -4px 0 14px; color: var(--el-color-danger); font-size: 13px; line-height: 1.5; }
      .submitButton, .googleButton { width: 100%; height: 44px; margin: 0; border-radius: 12px; font-weight: 650; }
      .googleButton { margin-top: 12px; background: #fff; }
      .formLinks { display: flex; justify-content: flex-end; margin-top: 12px; }
      .formLinks button { border: 0; background: transparent; color: #24816f; cursor: pointer; }
      .divider { display: flex; align-items: center; gap: 12px; margin: 24px 0 14px; color: #89938f; font-size: 12px; }
      .divider::before, .divider::after { flex: 1; height: 1px; background: #dce2df; content: ""; }
      :deep(.el-input__wrapper) { min-height: 42px; border-radius: 11px; box-shadow: 0 0 0 1px #d8dfdc inset; }
    }
    footer { color: #8a9692; font-size: 12px; }
  }

  .artPanel { min-height: calc(100svh - 24px); }

  @media (max-width: 860px) {
    display: block;
    padding: 0;
    .artPanel { display: none; }
    .loginPanel {
      min-height: 100svh;
      padding: 28px 22px 20px;
      .loginContent .mobileBrand {
        display: flex;
        align-items: center;
        gap: 9px;
        margin-bottom: 52px;
        color: #1d574d;
        font-size: 21px;
        font-weight: 700;
        .mobileLogo { width: 32px; height: 32px; }
        :deep(svg) { width: 100%; height: 100%; }
      }
    }
  }
}
</style>
