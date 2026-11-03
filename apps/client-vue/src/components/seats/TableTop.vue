<script setup lang="ts">
/**
 * 桌面本体：胡桃木台面 + 深绿绒布 + 黄铜嵌线 + 侧板厚度
 *
 * 全部由渐变与内阴影画成，不用位图、不用 filter、不用混合模式：
 * 静态元素只栅格化一次，换光时也不会重绘。
 * 依赖父级提供 --tw / --th（桌面宽高），与席位环共用同一套几何。
 */
</script>

<template>
  <div class="table" aria-hidden="true">
    <span class="cast"></span>
    <span class="edge"></span>
    <span class="top">
      <span class="grain"></span>
      <span class="sheen"></span>
      <span class="felt"></span>
      <span class="inlay"></span>
      <span class="rimlight"></span>
    </span>
  </div>
</template>

<style scoped>
.table {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--tw);
  height: var(--th);
  transform: translate(-50%, -50%);
  z-index: 1;
  pointer-events: none;
}

/* 落在地面的接触阴影：比 drop-shadow 便宜，也不会随内容重绘 */
.cast {
  position: absolute;
  left: 3%;
  right: 3%;
  bottom: -9%;
  height: 34%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0.28) 58%, transparent 78%);
}

/* 侧板：整块木头往下让出一段厚度，而不是描一圈亮边 */
.edge {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transform: translateY(var(--edge-h, 15px));
  background: linear-gradient(180deg, #46301d 0%, #2b1c0f 44%, #150d07 100%);
  box-shadow:
    0 20px 34px -12px rgba(0, 0, 0, 0.7),
    inset 0 0 0 1px rgba(0, 0, 0, 0.45);
}

.top {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  overflow: hidden;
  background:
    radial-gradient(64% 58% at 44% 34%, rgba(126, 88, 54, 0.44), transparent 72%),
    radial-gradient(96% 92% at 52% 46%, #3c2919 0%, #2b1c11 44%, #1c1109 74%, #100904 100%);
  box-shadow:
    inset 0 2px 0 rgba(255, 224, 188, 0.2),
    inset 0 -20px 28px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px rgba(0, 0, 0, 0.6);
}

/* 木纹：两组极淡的直纹，近乎垂直，避免同心圆变成唱片 */
.grain {
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      96deg,
      rgba(255, 226, 190, 0.055) 0 1px,
      rgba(0, 0, 0, 0.055) 1px 2px,
      transparent 2px 9px
    ),
    repeating-linear-gradient(5deg, rgba(0, 0, 0, 0.045) 0 1px, transparent 1px 15px);
  opacity: 0.85;
}

/* 台面受光：左上偏暖的一层薄光 */
.sheen {
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 96% at 28% 10%, rgba(255, 238, 210, 0.12), transparent 46%);
}

/* 绒布：比木色低饱和，把席位和主持词从桌面上托起来 */
.felt {
  position: absolute;
  inset: 12% 8%;
  border-radius: 50%;
  background:
    radial-gradient(58% 52% at 46% 36%, rgba(72, 104, 84, 0.12), transparent 72%),
    radial-gradient(closest-side, #16211b 0%, #101812 58%, #090f0c 100%);
  box-shadow:
    inset 0 3px 10px rgba(0, 0, 0, 0.7),
    inset 0 -2px 6px rgba(0, 0, 0, 0.45);
}

/* 绒布与木面之间的一圈黄铜嵌线 */
.inlay {
  position: absolute;
  inset: 12% 8%;
  border-radius: 50%;
  border: 1px solid rgba(226, 190, 138, 0.36);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.5),
    inset 0 0 16px rgba(226, 190, 138, 0.07);
}

.rimlight {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(110% 90% at 34% 6%, rgba(255, 240, 214, 0.14), transparent 40%);
}
</style>
