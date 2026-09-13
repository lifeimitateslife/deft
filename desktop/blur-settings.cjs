const DEFAULT_BLUR_STRENGTH = 40;
function blurSettings(current = {}, patch) {
  const value = { ...current, ...patch };
  const legacyChange =
    patch &&
    Object.hasOwn(patch, "backgroundBlur") &&
    !Object.hasOwn(patch, "backgroundBlurStrength");
  const numeric =
    !legacyChange &&
    typeof value.backgroundBlurStrength === "number" &&
    Number.isFinite(value.backgroundBlurStrength);
  const backgroundBlurStrength = numeric
    ? Math.round(Math.max(0, Math.min(100, value.backgroundBlurStrength)))
    : value.backgroundBlur === false
      ? 0
      : DEFAULT_BLUR_STRENGTH;
  return { backgroundBlurStrength, backgroundBlur: backgroundBlurStrength > 0 };
}
module.exports = { blurSettings, DEFAULT_BLUR_STRENGTH };
