import { SubTabs } from '@/components/tabs';

/** The audience area: the contacts themselves and everything that groups, fills or describes them. */
export default async function ContactsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const base = `/w/${ws}/contacts`;
  const tabs = [
    { href: base, label: 'Contacts' },
    { href: `${base}/segments`, label: 'Segments' },
    { href: `${base}/tags`, label: 'Tags' },
    { href: `${base}/imports`, label: 'Imports' },
    { href: `${base}/forms`, label: 'Signup forms' },
    { href: `${base}/properties`, label: 'Properties' },
  ];
  return (
    <>
      <div className="mb-6">
        <SubTabs label="Contacts" tabs={tabs} />
      </div>
      {children}
    </>
  );
}
