import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  transpilePackages: [
    "@returnhypnosis/email-editor",
    "@returnhypnosis/email-editor-core",
    "@returnhypnosis/email-editor-ui",
    "@returnhypnosis/email-editor-blocks",
  ],
  serverExternalPackages: ['mjml', 'mjml-core', 'mjml-parser-xml', 'mjml-validator'],
};

export default nextConfig;
