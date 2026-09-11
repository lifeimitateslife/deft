const { build } = require("./package.json");

// Public downloads must never silently fall back to an unsigned/ad-hoc app.
for (const name of [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
]) {
  if (!process.env[name]) throw new Error(`Mac release requires ${name}`);
}
const mac = {
  ...build.mac,
  type: "distribution",
  hardenedRuntime: true,
  notarize: true,
};
delete mac.identity; // Discover the Developer ID certificate imported by the builder.
module.exports = { ...build, mac, forceCodeSigning: true };
