import Link from "next/link";

export default function HelpCenterPage() {
  return (
    <div className="container-page py-8">
      <div className="prose dark:prose-invert max-w-3xl">
        <h1>Help Center</h1>
        <p>Find answers and get support.</p>
        <ul>
          <li><Link href="/contact">Contact Support</Link></li>
          <li><Link href="/report">Report a Problem</Link></li>
          <li><Link href="/safety">Safety guidelines</Link></li>
        </ul>
      </div>
    </div>
  );
}
