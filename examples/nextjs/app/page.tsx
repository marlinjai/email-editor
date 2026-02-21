import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-muted)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>
            Email Editor
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://docs.email-editor.lumitra.co"
            className="text-sm transition-colors"
            style={{ color: 'var(--muted)' }}
          >
            Docs
          </a>
          <a
            href="https://github.com/marlinjai/email-editor"
            className="text-sm transition-colors"
            style={{ color: 'var(--muted)' }}
          >
            GitHub
          </a>
          <Link
            href="/editor"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              background: 'var(--accent)',
              color: 'var(--background)',
            }}
          >
            Open Editor
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pb-16 pt-8">
        <div className="text-center max-w-2xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium tracking-wide uppercase mb-8"
            style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            Visual Email Builder
          </div>

          <h1
            className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1] mb-6"
            style={{ color: 'var(--foreground)' }}
          >
            Build{' '}
            <span style={{ color: 'var(--accent)' }}>Beautiful</span>{' '}
            Emails
          </h1>

          <p
            className="text-lg leading-relaxed max-w-lg mx-auto mb-10"
            style={{ color: 'var(--muted)' }}
          >
            A standalone, pluggable email editor built with MJML, React, and TypeScript. Drag-and-drop blocks, live preview, and one-click export to email-safe HTML.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              href="/editor"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-200"
              style={{
                background: 'var(--accent)',
                color: 'var(--background)',
              }}
            >
              Try the Editor
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <a
              href="https://docs.email-editor.lumitra.co"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background: 'var(--surface)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
              }}
            >
              Read the Docs
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="w-full max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              title: 'MJML Compilation',
              description: 'Email-safe HTML that works across all clients. Compile your designs to bulletproof markup with one click.',
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              ),
            },
            {
              title: 'Drag & Drop',
              description: 'Intuitive block placement with visual drop zones. Build complex layouts without writing a single line of code.',
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="5 9 2 12 5 15" />
                  <polyline points="9 5 12 2 15 5" />
                  <polyline points="15 19 12 22 9 19" />
                  <polyline points="19 9 22 12 19 15" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <line x1="12" y1="2" x2="12" y2="22" />
                </svg>
              ),
            },
            {
              title: 'Rich Text Editing',
              description: 'TipTap-powered text editing with full formatting support. Bold, italic, links, lists, and more.',
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              ),
            },
            {
              title: 'Undo / Redo',
              description: 'Full history management with Immer patches. Navigate your entire edit history with confidence.',
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <polyline points="23 20 23 14 17 14" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                </svg>
              ),
            },
            {
              title: 'Device Preview',
              description: 'Desktop and mobile responsive views. See exactly how your email looks on every screen size.',
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              ),
            },
            {
              title: 'Themeable',
              description: 'Customize colors and fonts to match your brand. Full theme support with a simple configuration object.',
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              ),
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl p-6 transition-all duration-200"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
              >
                {feature.icon}
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="w-full max-w-5xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-bold text-center mb-12" style={{ color: 'var(--foreground)' }}>
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { step: '1', title: 'Drop Blocks', description: 'Drag text, images, buttons, and dividers into your email layout with visual drop zones.' },
            { step: '2', title: 'Customize', description: 'Edit content, colors, and fonts with the visual inspector. See changes live as you type.' },
            { step: '3', title: 'Export', description: 'Compile to email-safe HTML with MJML. Download and send through any email service.' },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 text-sm font-bold"
                style={{ background: 'var(--accent)', color: 'var(--background)' }}
              >
                {item.step}
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t py-8 px-6" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Built with{' '}
            <a
              href="https://mjml.io"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
              style={{ color: 'var(--muted)' }}
            >
              MJML
            </a>
            ,{' '}
            <a
              href="https://react.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
              style={{ color: 'var(--muted)' }}
            >
              React
            </a>
            , and{' '}
            <a
              href="https://www.typescriptlang.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
              style={{ color: 'var(--muted)' }}
            >
              TypeScript
            </a>
          </p>
          <div className="flex items-center gap-5">
            <a
              href="https://docs.email-editor.lumitra.co"
              className="text-xs transition-colors hover:text-[var(--accent)]"
              style={{ color: 'var(--muted)' }}
            >
              Docs
            </a>
            <a
              href="https://github.com/marlinjai/email-editor"
              className="text-xs transition-colors hover:text-[var(--accent)]"
              style={{ color: 'var(--muted)' }}
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
