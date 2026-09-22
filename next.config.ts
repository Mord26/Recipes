import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co').hostname;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: supabaseHostname,
        pathname: '/storage/v1/object/public/**',
      },
    ],
    // Storage paths are immutable UUIDs - cache optimized images for a full year.
    minimumCacheTTL: 31536000,
    qualities: [75, 85, 90],
  },
  experimental: {
    optimizePackageImports: ['radix-ui'],
  },
};

export default withNextIntl(nextConfig);
