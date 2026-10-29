import Link from "next/link";
export default function NotFound() {
  return (
    <main style={{ maxWidth: 520, margin: "12vh auto", padding: 32 }}>
      <p style={{ color: "#176B55", fontSize: 13, fontWeight: 700 }}>VERDANT POS</p>
      <h1 style={{ fontSize: 28 }}>This page isn’t here.</h1>
      <p style={{ color: "#6B746E", marginBlock: 20 }}>
        Return to your workspace to continue managing your shop.
      </p>
      <Link href="/" style={{ color: "#176B55", fontWeight: 600 }}>
        Back to dashboard →
      </Link>
    </main>
  );
}
