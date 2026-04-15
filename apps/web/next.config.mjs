import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(dirname, '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@starter/domain"],
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
