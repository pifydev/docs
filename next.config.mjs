import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

export default withMDX({
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
});
