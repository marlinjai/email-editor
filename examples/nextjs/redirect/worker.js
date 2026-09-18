// email-editor.lumitra.co was the public demo of the editor (this example, built
// with OpenNext). The product it demoed is Lumitra Mail now, so the host sends
// every request, whatever its path or method, permanently to the landing page.
// 308 keeps the method, so even a stray POST lands on a page, never on an error.
const TARGET = 'https://mail.lumitra.co/';

export default {
  async fetch() {
    return new Response(`Moved to ${TARGET}\n`, {
      status: 308,
      headers: {
        Location: TARGET,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  },
};
