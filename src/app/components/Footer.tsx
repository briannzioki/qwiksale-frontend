import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-12 border-t bg-white/60 dark:bg-slate-900/60 backdrop-blur">
      <div className="container-page">
        <div className="py-8 grid md:grid-cols-4 gap-6 text-sm">
          <div className="space-y-1">
            <div className="font-bold text-[#161748] dark:text-white">QwikSale</div>
            <p className="text-gray-600 dark:text-slate-400">
              Buy & sell, faster. Made in Kenya.
            </p>
          </div>
          <div className="space-y-2">
            <div className="font-semibold">Company</div>
            <ul className="space-y-1">
              <li><Link className="hover:underline" href="/about">About</Link></li>
              <li><Link className="hover:underline" href="/contact">Contact</Link></li>
              <li><Link className="hover:underline" href="/help">Help Center</Link></li>
              <li><Link className="hover:underline" href="/report">Report a Problem</Link></li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-semibold">Legal</div>
            <ul className="space-y-1">
              <li><Link className="hover:underline" href="/terms">Terms</Link></li>
              <li><Link className="hover:underline" href="/privacy">Privacy</Link></li>
              <li><Link className="hover:underline" href="/safety">Safety</Link></li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-semibold">Social</div>
            <ul className="space-y-1">
              {/* Replace with your handles on your domain or social profiles */}
              <li><a className="hover:underline" href="https://qwiksale.sale/" target="_blank">Blog</a></li>
              <li><a className="hover:underline" href="https://qwiksale.sale/press" target="_blank">Press</a></li>
            </ul>
          </div>
        </div>
        <div className="py-4 text-xs text-gray-500 border-t">
          © {new Date().getFullYear()} QwikSale. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
