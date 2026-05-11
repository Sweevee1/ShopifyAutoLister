/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["cheerio"],
    instrumentationHook: true,
  },
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [...(config.externals ?? []), "child_process"];
    }
    return config;
  },
};

export default nextConfig;
