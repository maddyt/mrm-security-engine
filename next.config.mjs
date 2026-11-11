/** @type {import('next').NextConfig} */
const nextConfig = {
  // The portal lives under /mrm; the site root goes straight to it.
  async redirects() {
    return [{ source: '/', destination: '/mrm', permanent: false }];
  },
};
export default nextConfig;
