import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default () => ({
  input: 'src/module/pf2e-roll-manager.ts',
  output: {
    dir: 'dist/module',
    format: 'es',
    sourcemap: true,
  },
  plugins: [nodeResolve(), typescript()],
});
