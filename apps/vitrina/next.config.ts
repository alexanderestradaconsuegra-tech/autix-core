import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Los negocios cargan sus propias fotos de producto (Storage de Supabase,
    // Drive, CDN propio, etc.) — el host no se conoce de antemano.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
