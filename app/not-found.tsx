import Link from "next/link";

export default function NotFound() {
  return (
    <main className="pify-not-found">
      <p>404</p>
      <h1>Page not found</h1>
      <p>The page may have moved or is not available in this language.</p>
      <Link href="/en">Back to documentation</Link>
    </main>
  );
}
