// packages/ui/postcss.config.js
// PostCSS configuration for the prebuilt stylesheet (dist/styles.css)

module.exports = {
  plugins: [require('tailwindcss'), require('autoprefixer'), require('./postcss-scope.cjs')],
};
