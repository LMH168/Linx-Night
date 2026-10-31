<template>
  <div class="frame" aria-hidden="true">
    <span class="corner tl" />
    <span class="corner tr" />
    <span class="corner bl" />
    <span class="corner br" />
  </div>
</template>

<style scoped>
.frame {
  position: absolute;
  inset: 16px;
  border: 1px solid rgba(224, 210, 180, 0.08);
  pointer-events: none;
  z-index: 6;
}
.corner {
  position: absolute;
  width: 12px;
  height: 12px;
  border-color: rgba(224, 210, 180, 0.4);
  border-style: solid;
  border-width: 0;
}
.tl {
  left: -1px;
  top: -1px;
  border-left-width: 1px;
  border-top-width: 1px;
}
.tr {
  right: -1px;
  top: -1px;
  border-right-width: 1px;
  border-top-width: 1px;
}
.bl {
  left: -1px;
  bottom: -1px;
  border-left-width: 1px;
  border-bottom-width: 1px;
}
.br {
  right: -1px;
  bottom: -1px;
  border-right-width: 1px;
  border-bottom-width: 1px;
}
</style>
