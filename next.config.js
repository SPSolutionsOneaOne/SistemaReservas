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
};

module.exports = nextConfig;
