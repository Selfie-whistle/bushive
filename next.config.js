
/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'th.bing.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 's3-ap-southeast-1.amazonaws.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
  devIndicators: {
    allowedDevOrigins: [
      "https://*.cloudworkstations.dev",
      "https://*.firebase.app",
      "*.serveousercontent.com",
      "*.loca.lt",
      "e9ba0c2cbfc43242-157-51-228-230.serveousercontent.com",
      "*.trycloudflare.com"
    ],
  },
  // Also add at top level just in case depending on Next.js exact version
  allowedDevOrigins: [
    "*.serveousercontent.com",
    "*.loca.lt",
    "e9ba0c2cbfc43242-157-51-228-230.serveousercontent.com",
    "*.trycloudflare.com"
  ],
};

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

module.exports = withPWA(nextConfig);
