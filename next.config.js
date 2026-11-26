/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // argon2 carga su binario nativo desde node_modules/argon2/prebuilds de
    // forma dinámica. Sin esta inclusión explícita, el trazado de archivos de
    // Vercel no copia la carpeta y el módulo falla en producción con
    // "No native build was found for platform=linux arch=x64".
    outputFileTracingIncludes: {
      '/api/**/*': ['./node_modules/argon2/prebuilds/**/*'],
    },
  },
  // Headers de seguridad (CP-FA4-009). Vercel ya añade HSTS; aquí se declaran
  // explícitamente para que estén presentes también en despliegues locales.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co https://*.vercel.app; frame-ancestors 'none'" },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
