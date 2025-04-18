import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ];
  },
  // Custom webpack configuration for the proxy
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Increase timeouts for http requests
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000, // Check for changes every second
      };
    }
    return config;
  },
  // Add a longer timeout for the dev server
  serverRuntimeConfig: {
    // Will only be available on the server side
    timeoutMs: 60000, // 1 minute
  },
  // Available on both server and client
  publicRuntimeConfig: {
    apiTimeout: 60000, // 1 minute
  },
};

export default nextConfig;
