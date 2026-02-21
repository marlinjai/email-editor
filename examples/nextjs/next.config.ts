import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  transpilePackages: [
    "@marlinjai/email-editor",
    "@marlinjai/email-editor-core",
    "@marlinjai/email-editor-ui",
    "@marlinjai/email-editor-blocks",
  ],
  serverExternalPackages: ['mjml', 'mjml-core', 'mjml-parser-xml', 'mjml-validator'],
};

export default nextConfig;
