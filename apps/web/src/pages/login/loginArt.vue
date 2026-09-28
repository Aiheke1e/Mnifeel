<template>
  <section class="loginArt" aria-hidden="true">
    <div class="brand">
      <span class="brandLogo" v-html="logoSvg" />
      <span>Minifeel</span>
    </div>
    <div class="storyCard storyCardTop">
      <span class="cardNumber">01</span>
      <div class="cardLines"><i /><i /><i /></div>
    </div>
    <div class="storyCard storyCardMiddle">
      <span class="playButton"><icon-player-play-filled /></span>
      <div class="sceneGlow" />
    </div>
    <div class="storyCard storyCardBottom">
      <span class="cardNumber">03</span>
      <div class="cardLines"><i /><i /></div>
    </div>
    <p class="tagline">把一个想法，变成一部短剧</p>
  </section>
</template>

<script setup lang="ts">
import { IconPlayerPlayFilled } from "@tabler/icons-vue";
import logoSvg from "@minifeel/assets/logo.svg?raw";
</script>

<style lang="scss" scoped>
.loginArt {
  position: relative;
  min-height: 100%;
  overflow: hidden;
  border-radius: 28px;
  background:
    radial-gradient(circle at 72% 24%, rgb(255 214 138 / 78%), transparent 30%),
    radial-gradient(circle at 18% 84%, rgb(72 189 151 / 64%), transparent 34%),
    linear-gradient(145deg, #112d2a 0%, #205e54 48%, #8abf9b 100%);
  color: #fff;

  &::before {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(255 255 255 / 5%) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 5%) 1px, transparent 1px);
    background-size: 36px 36px;
    content: "";
    mask-image: linear-gradient(to bottom, #000, transparent 80%);
  }

  .brand {
    position: absolute;
    z-index: 2;
    top: 34px;
    left: 36px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 25px;
    font-weight: 700;
    letter-spacing: 0.3px;

    .brandLogo {
      width: 38px;
      height: 38px;

      :deep(svg) { width: 100%; height: 100%; }
      :deep(path) { fill: #fff; }
    }
  }

  .storyCard {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 18px;
    width: min(68%, 420px);
    height: 128px;
    padding: 22px;
    border: 1px solid rgb(255 255 255 / 25%);
    border-radius: 22px;
    background: rgb(255 255 255 / 12%);
    box-shadow: 0 24px 80px rgb(0 0 0 / 20%);
    backdrop-filter: blur(18px);

    &.storyCardTop { top: 22%; left: 10%; transform: rotate(-5deg); }
    &.storyCardMiddle { z-index: 2; top: 43%; right: 8%; transform: rotate(4deg); }
    &.storyCardBottom { top: 64%; left: 14%; transform: rotate(-2deg); }

    .cardNumber { font-size: 30px; font-weight: 750; opacity: 0.8; }
    .cardLines {
      display: grid;
      flex: 1;
      gap: 11px;
      i { height: 7px; border-radius: 9px; background: rgb(255 255 255 / 48%); }
      i:nth-child(2) { width: 76%; }
      i:nth-child(3) { width: 52%; }
    }
    .playButton {
      z-index: 1;
      display: grid;
      width: 58px;
      height: 58px;
      place-items: center;
      border-radius: 50%;
      background: #fff;
      color: #1f6658;
      font-size: 24px;
    }
    .sceneGlow {
      position: absolute;
      inset: 18px 22px 18px 98px;
      border-radius: 14px;
      background: linear-gradient(120deg, rgb(255 224 171 / 50%), rgb(255 255 255 / 8%));
    }
  }

  .tagline {
    position: absolute;
    right: 36px;
    bottom: 30px;
    left: 36px;
    margin: 0;
    font-size: clamp(24px, 2.6vw, 38px);
    font-weight: 650;
    line-height: 1.3;
    letter-spacing: -0.5px;
  }
}
</style>
