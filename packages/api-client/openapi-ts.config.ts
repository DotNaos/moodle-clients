import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input:
    process.env.MOODLE_SERVICES_OPENAPI_URL ??
    "https://moodle-services.vercel.app/api/openapi.json",
  output: "src/generated",
  plugins: ["@hey-api/client-fetch"],
});
