/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["cheerio"],
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [...(config.externals ?? []), "child_process"];
    }
    return config;
  },
};

export default nextConfig;
