import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // The editor packages ship compiled ESM and CommonJS, so they need no
  // transpilePackages entry. MJML is Node-only and resolves files at runtime:
  // keep it out of the server bundle.
  serverExternalPackages: ['mjml', 'mjml-core', 'mjml-parser-xml', 'mjml-validator'],
};

export default nextConfig;
