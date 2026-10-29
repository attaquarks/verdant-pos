import type { NextConfig } from "next";

// Fail BEFORE Next can inline either public environment variable into a bundle.
// A runtime-only client guard would be too late to prevent key exposure.
for (const name of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  const value = process.env[name];
  if (!value || value === "your-publishable-key") continue;
  let publicOnly = value.startsWith("sb_publishable_") && !value.includes("sb_secret_");
  if (value.startsWith("eyJ")) {
    try {
      publicOnly =
        (
          JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8")) as {
            role?: string;
          }
        ).role === "anon";
    } catch {
      publicOnly = false;
    }
  }
  if (!publicOnly)
    throw new Error(
      `${name} must be a publishable or legacy anon key. Secret/service-role keys must never be placed in a public environment variable.`,
    );
}

const config: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};
export default config;
