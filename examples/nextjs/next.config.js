// examples/nextjs/next.config.js
// Next.js 16 configuration

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@returnhypnosis/email-editor',
    '@returnhypnosis/email-editor-core',
    '@returnhypnosis/email-editor-ui',
    '@returnhypnosis/email-editor-blocks',
  ],
  // Next.js 16: moved from experimental.serverComponentsExternalPackages
  serverExternalPackages: ['mjml', 'mjml-core', 'mjml-parser-xml', 'mjml-validator'],
  // Next.js 16: Turbopack is default, add empty config to suppress warning
  turbopack: {},
};

module.exports = nextConfig;
