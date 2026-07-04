/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No eslint config shipped; TypeScript type-checking still runs on build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
