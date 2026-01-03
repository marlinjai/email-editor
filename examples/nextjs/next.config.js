// examples/nextjs/next.config.js
// Next.js configuration

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@returnhypnosis/email-editor',
    '@returnhypnosis/email-editor-core',
    '@returnhypnosis/email-editor-ui',
    '@returnhypnosis/email-editor-blocks',
  ],
  experimental: {
    serverComponentsExternalPackages: ['mjml', 'mjml-core', 'mjml-parser-xml', 'mjml-validator'],
  },
  webpack: (config, { isServer }) => {
    // Handle workspace packages
    if (isServer) {
      config.externals = [...(config.externals || []), 'mjml', 'mjml-core', 'mjml-parser-xml', 'mjml-validator'];
    }

    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

module.exports = nextConfig;

